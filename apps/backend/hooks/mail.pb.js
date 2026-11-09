/// <reference path="../pb_data/types.d.ts" />

// Mail configuration and local mail capture.
//
// Production: configure SMTP via SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
// SMTP_TLS and MAIL_SENDER_ADDRESS / MAIL_SENDER_NAME. APP_URL sets the frontend URL
// used in email links.
//
// Development/test without SMTP: emails are not sent. They are logged and kept in
// memory, available via GET /api/dev/mails (non-production only).

onBootstrap((e) => {
  e.next()
  const env = (name) => $os.getenv(name)
  const settings = e.app.settings()
  let changed = false
  const set = (obj, key, value) => {
    if (value !== undefined && value !== '' && obj[key] !== value) {
      obj[key] = value
      changed = true
    }
  }
  set(settings.meta, 'appURL', env('APP_URL'))
  set(settings.meta, 'senderAddress', env('MAIL_SENDER_ADDRESS'))
  set(settings.meta, 'senderName', env('MAIL_SENDER_NAME'))
  if (env('SMTP_HOST')) {
    set(settings.smtp, 'enabled', true)
    set(settings.smtp, 'host', env('SMTP_HOST'))
    set(settings.smtp, 'port', parseInt(env('SMTP_PORT') || '587', 10))
    set(settings.smtp, 'username', env('SMTP_USERNAME'))
    set(settings.smtp, 'password', env('SMTP_PASSWORD'))
    set(settings.smtp, 'tls', env('SMTP_TLS') === 'true')
  }
  if (changed) e.app.save(settings)
})

onMailerSend((e) => {
  const env = $os.getenv('PB_ENV')
  const capture = (env === 'development' || env === 'test') && !e.app.settings().smtp.enabled
  if (!capture) return e.next()

  const message = e.message
  const entry = {
    to: message.to.map((t) => t.address),
    subject: message.subject,
    html: message.html,
    sentAt: new Date().toISOString(),
  }
  const store = e.app.store()
  const mails = JSON.parse(store.get('dev_mails') || '[]')
  mails.push(entry)
  store.set('dev_mails', JSON.stringify(mails.slice(-200)))
  if (env === 'development') {
    console.log(`[dev mail] to=${entry.to.join(',')} subject="${entry.subject}"`)
    const link = /href="([^"]+)"/.exec(entry.html)
    if (link) console.log(`[dev mail] link: ${link[1]}`)
  }
  // Do not call e.next(): the message is not actually sent.
})

const mailEnv = $os.getenv('PB_ENV')
if (mailEnv === 'development' || mailEnv === 'test') {
  // GET /api/dev/mails?to=<address>  -> captured messages, newest last
  routerAdd('GET', '/api/dev/mails', (e) => {
    const to = e.request.url.query().get('to')
    const mails = JSON.parse(e.app.store().get('dev_mails') || '[]')
    return e.json(200, to ? mails.filter((m) => m.to.indexOf(to) !== -1) : mails)
  })
}
