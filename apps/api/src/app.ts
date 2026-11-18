import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
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
import { HttpError } from './lib/http-error.js'

export const app = express()

const allowedClientOrigins = new Set(getAllowedClientOrigins())

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

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    void _next
    console.error(error)

    if (error instanceof HttpError) {
      response.status(error.statusCode).json({
        error: error.message,
      })
      return
    }

    response.status(500).json({
      error: 'Internal server error',
    })
  },
)
