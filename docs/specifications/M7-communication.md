# M7 – Communication

Refines roadmap tasks M7-01 – M7-04. The platform emails coaches when their registration changes
and when their team's schedule changes. Every notification is queued in an **outbox** first and
delivered with retries, so a mail-server problem never blocks a registration or loses a message.
See [ADR 0008](../architecture/decisions/0008-transactional-email-outbox.md).

## Email service (M7-01)

- SMTP is configured by environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`, `SMTP_TLS`, `MAIL_SENDER_ADDRESS`, `MAIL_SENDER_NAME`, `APP_URL`), see the
  [development guide](../development.md#emails). Without SMTP in development and test, messages
  are captured instead of sent (`GET /api/dev/mails`).
- Account emails (verification, password reset) are PocketBase's own and are sent directly, but
  rendered from the `auth_verification` / `auth_password_reset` templates in the user's language
  (`hooks/mail.pb.js`). The `users` collection's own templates (PocketBase dashboard) are only used
  if those templates are missing.
- Application notifications are records in `mail_outbox`:

| Field             | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `template`        | Template key the message was rendered from                                              |
| `to`, `subject`   | Recipient and rendered subject                                                          |
| `html`            | Rendered body                                                                           |
| `status`          | `pending` (queued or waiting for a retry), `sent`, `failed` (gave up)                   |
| `attempts`        | Delivery attempts so far                                                                |
| `next_attempt_at` | When the delivery job tries next                                                        |
| `last_error`      | Error of the last failed attempt                                                        |
| `sent_at`         | When it was handed to the mail server                                                   |
| `immediate`       | Sent right after the triggering change is committed (single messages); otherwise by job |
| `event`, `team`   | What the message is about (managers of the event can read it)                           |

### Delivery and retries (M7-T12)

- A message is queued in the **same transaction** as the change that caused it: it exists exactly
  when the change was committed.
- Single messages (registration) are sent immediately after commit; bulk messages (schedule) and
  every retry are sent by the delivery job, which runs **every minute** (up to 200 messages per run).
- A failed attempt records the error and schedules the next one after **1, 5, 15 and 60 minutes**.
  After the **5th** failed attempt the message is `failed` and no longer retried automatically.
- Admins (any message) and the event's managers (their event's messages) can **retry** a failed
  message: it is queued again with a fresh attempt count and sent right away.
- A message being delivered is leased (its `next_attempt_at` is moved two minutes ahead in one
  conditional update), so the immediate send and the job never deliver it twice.
- The outbox cannot be written through the API. Admins read all messages, event managers those of
  their events, nobody else any.

## Templates (M7-02)

Admins edit templates on **Emails** (`/admin/emails`): subject, HTML body and whether the email is
sent at all. The preview renders example values in a sandboxed frame. Templates cannot be created,
deleted or re-keyed; changes apply to messages queued afterwards (queued messages keep their text).

Every notification has one template per language (`de`, `fr`, `it`, `en`; `key` + `language`
unique, the language cannot be changed). A message uses the template in the recipient's language,
else the English one; see [languages](i18n.md#recipient-language-of-emails). Account emails cannot be
turned off.

Variables are written `{{name}}`. Values are HTML-escaped in the body (the subject is plain text and
kept on one line), except `schedule`, which the server renders as a list. A template may only use
its own variables (`400`, `unknown_variable`); `GET /api/mail/templates/variables` lists them.

| Key                      | Sent when                                  | Variables                                                                                       |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `registration_submitted` | A registration becomes `submitted`         | `coach_name`, `team_name`, `category_name`, `event_name`, `team_url`                            |
| `registration_approved`  | A registration becomes `approved`          | as above, and `review_note`                                                                     |
| `registration_rejected`  | A registration becomes `rejected`          | as above, and `review_note` (the required reason)                                               |
| `schedule_changed`       | A manager notifies teams of their schedule | `coach_name`, `team_name`, `event_name`, `schedule`, `schedule_text`, `message`, `schedule_url` |
| `auth_verification`      | A user asks to confirm their email address | `name`, `action_url`, `app_name`                                                                |
| `auth_password_reset`    | A user asks to reset their password        | `name`, `action_url`, `app_name`                                                                |

`team_url` is `{APP_URL}/teams/{id}`, `schedule_url` the public event page `{APP_URL}/live/{id}`.

## Registration notifications (M7-03)

- The coach (`coach_email`) is emailed whenever a team's status changes to `submitted`, `approved`
  or `rejected`, whoever made the change (coach, manager, import). Saves without a status change,
  drafts and withdrawals send nothing.
- A disabled template sends nothing. A failure to queue is logged and never blocks the change.

## Schedule notifications (M7-04)

Schedules change often while an event is planned, so emails are sent when a manager decides, not on
every edit. The event's **Messages** tab (event managers and admins) shows every approved team's
current schedule and which teams are **affected**.

- A team's schedule is the list of its scheduled games: round (and attempt), competition day and
  start of the round's scoring phase, table and position, and the round's robot check.
- When a team is notified, a fingerprint of that schedule is stored (`schedule_notices`, internal).
  A team is affected when its current schedule differs from the notified one, or, if it was never
  notified, once it has games. A team whose games were removed is affected and told so.
- **Notify affected teams** queues one `schedule_changed` email per affected team, with an optional
  message (e.g. the reason for the change). **Send to all teams** re-sends to every team with a
  schedule (or a previous notice).
- Archived events cannot send notifications.

## API

| Method | Path                                      | Auth                 | Description                                                                |
| ------ | ----------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/mail/templates/variables`           | admins               | `{ key: [variable] }`                                                      |
| POST   | `/api/mail/outbox/{id}/retry`             | admins, its managers | Queue a failed message again and try to send it                            |
| GET    | `/api/events/{id}/notifications/schedule` | event managers       | `{ teams: [{ team, coach_email, changed, notified_at, items }], changed }` |
| POST   | `/api/events/{id}/notifications/schedule` | event managers       | `{ scope: "changed" \| "all", message? }` → `{ queued }`                   |

Development and test only: `POST /api/dev/mail-outbox/process { now? }` runs the delivery job now
(`now`, in ms, makes messages due by then due immediately), `POST /api/dev/mail-failures { count }`
makes the next `count` sends fail.
