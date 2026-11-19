import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { clientBootstrapSchema } from '@game-is-up/shared'
import {
  aliasesRouter,
  authRouter,
  debugRouter,
  discordEventsRouter,
  discordServersRouter,
  discoveryRouter,
  eventsRouter,
  friendsRouter,
  friendsListsRouter,
  healthRouter,
  libraryRouter,
  mediaRouter,
  playIntentRouter,
  profileRouter,
} from './routes/index.js'
import { getAllowedClientOrigins, getApiOrigin } from './lib/origin.js'
import { sendError } from './lib/http-error.js'
import { handleRequestError } from './lib/request-error-handler.js'
import { env } from './lib/env.js'
import { serveWebApp } from './lib/web-static.js'
import { requestContext } from './lib/request-context.js'

export const app = express()

// One proxy sits in front of the API: in production the server's nginx site, which restores the
// visitor's address from Cloudflare before forwarding (nginx.server.conf); in development, Vite's
// proxy (behind the devkit proxy, so local requests share one count, which is harmless). Trusting exactly one hop makes request.ip the real client for the rate limits, and a
// forged X-Forwarded-For from a direct caller is ignored.
app.set('trust proxy', 1)

const allowedClientOrigins = new Set(getAllowedClientOrigins())

// First, so every later middleware's log lines and failures carry the request id.
app.use(requestContext())

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      callback(null, allowedClientOrigins.has(origin))
    },
    credentials: true,
  }),
)
app.use(helmet())

// Discord Event Webhooks must be mounted before express.json(): signature
// verification needs the raw, unparsed request body.
app.use('/api/discord/events', discordEventsRouter)

app.use(express.json())

app.get('/api/bootstrap', (_request, response) => {
  response.json(
    clientBootstrapSchema.parse({
      appName: "Game's Up",
      apiBaseUrl: getApiOrigin(),
      features: {
        pushNotifications: true,
        multiGamePlayIntent: true,
      },
    }),
  )
})

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/aliases', aliasesRouter)
app.use('/api/debug', debugRouter)
app.use('/api/discord-servers', discordServersRouter)
app.use('/api/discovery', discoveryRouter)
app.use('/api/events', eventsRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/friends-lists', friendsListsRouter)
app.use('/api/library', libraryRouter)
app.use('/api/media', mediaRouter)
app.use('/api/play-intents', playIntentRouter)
app.use('/api/profile', profileRouter)

// An /api path no router answered: the error shape, not Express's HTML page.
app.use('/api', (_request, response) => {
  sendError(response, 404, 'There is nothing at this address.')
})

// The production image also serves the built web app (DIST-12); development uses Vite instead.
if (env.WEB_DIST_DIR) {
  serveWebApp(app, env.WEB_DIST_DIR)
}

app.use(handleRequestError)
