import { ConfigError, loadConfig } from './config.ts'
import { createDeliver, createRelay, type Logger } from './relay.ts'
import { createTokenProvider } from './token.ts'

// Entry point of the mail relay container (M9-D). See docker/mail-relay.Dockerfile.

const logger: Logger = {
  info: (message) => console.log(`[mail-relay] ${message}`),
  error: (message) => console.error(`[mail-relay] ${message}`),
}

let config
try {
  config = loadConfig()
} catch (e) {
  if (!(e instanceof ConfigError)) throw e
  logger.error(e.message)
  process.exit(1)
}

const tokens = createTokenProvider(config.oauth)
const server = createRelay(createDeliver(config.upstream, tokens), logger)
server.on('error', (e) => logger.error(`SMTP server error: ${e.message}`))

server.listen(config.listen.port, config.listen.host, () => {
  logger.info(
    `Listening on ${config.listen.host}:${config.listen.port}; delivering as ${config.upstream.user} via ${config.upstream.host}:${config.upstream.port}.`,
  )
  // Check the OAuth settings right away, so a mistake shows in the logs before the first email.
  tokens.get().then(
    () => logger.info('OAuth token obtained.'),
    (e: Error) =>
      logger.error(`${e.message.replace(/\.?$/, '.')} Check the SMTP_OAUTH_* settings.`),
  )
})

const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
