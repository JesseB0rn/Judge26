# ADR 0008: Transactional email through an outbox

- **Status:** accepted
- **Date:** 2026-11-11

## Context

M7 sends emails when registrations and schedules change. Mail servers are slow and fail now and
then; at an event, a coach not receiving a schedule change is worse than receiving it a minute
late. PocketBase hooks run synchronously, and a status change must not fail because the mail
server is down.

## Decisions

1. **Outbox collection** (`mail_outbox`). Notifications are rendered and stored in the same
   transaction as the change that caused them, then delivered separately. The outbox is also the
   delivery log admins and managers look at.
2. **Immediate send for single messages, a job for the rest.** Registration emails are sent right
   after commit (`onRecordAfterCreateSuccess`); bulk schedule emails and all retries are sent by a
   cron job every minute, so a request never waits for hundreds of SMTP round trips.
3. **Retry with backoff** (1, 5, 15, 60 minutes; failed after 5 attempts), with a manual retry.
   A conditional update leases a message before sending so the two senders never deliver it twice.
4. **Templates in a collection with fixed keys.** The server owns the list of notifications and
   their variables; admins only edit text. Unknown variables are rejected when saving.
5. **Schedule emails are sent on request**, with a per-team fingerprint of the last notified
   schedule to find the affected teams. Sending on every edit would flood coaches while a manager
   rearranges the plan.

## Consequences

- Delivery is at least once in rare cases (a crash after sending, before recording success).
- A message can wait up to a minute for the job; acceptable for schedule emails.
- Account emails (verification, reset) stay with PocketBase and are not in the outbox.
