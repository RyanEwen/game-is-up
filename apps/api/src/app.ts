import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { clientBootstrapSchema } from '@game-is-up/shared'
import { authRouter } from './routes/auth.js'
import { debugRouter } from './routes/debug.js'
import { discoveryRouter } from './routes/discovery.js'
import { discordEventsRouter } from './routes/discord-events.js'
import { discordFriendsRouter } from './routes/discord-friends.js'
import { discordServersRouter } from './routes/discord-servers.js'
import { friendsRouter } from './routes/friends.js'
import { healthRouter } from './routes/health.js'
import { getAllowedClientOrigins, getApiOrigin } from './lib/origin.js'
import { libraryRouter } from './routes/library.js'
import { mediaRouter } from './routes/media.js'
import { playIntentRouter } from './routes/play-intents.js'
import { profileRouter } from './routes/profile.js'

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
    credentials: true
  })
)
app.use(helmet())
app.use('/api/discord/events', express.raw({ type: '*/*' }), discordEventsRouter)
app.use(express.json())

app.get('/api/bootstrap', (_request, response) => {
  response.json(
    clientBootstrapSchema.parse({
      appName: 'Game Is Up',
      apiBaseUrl: getApiOrigin(),
      features: {
        pushNotifications: true,
        androidWrapper: true,
        multiGamePlayIntent: true
      }
    })
  )
})

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/debug', debugRouter)
app.use('/api/discord-friends', discordFriendsRouter)
app.use('/api/discord-servers', discordServersRouter)
app.use('/api/discovery', discoveryRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/library', libraryRouter)
app.use('/api/media', mediaRouter)
app.use('/api/play-intents', playIntentRouter)
app.use('/api/profile', profileRouter)

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next
  console.error(error)
  response.status(500).json({
    error: 'Internal server error'
  })
})