# Test plan: M7 – Communication (M7-01 – M7-04)

- **Integration** = `apps/backend/tests/m7-communication.test.ts` (real PocketBase, migrations, hooks,
  delivery job, captured mail)
- **Unit** = `apps/web/src/modules/communication/__tests__/*` (rendering, template editor, emails page,
  delivery log, schedule notifications, Messages tab)
- **E2E** = `e2e/communication/notifications.spec.ts` (desktop)

## Features

| ID    | Feature                    | Covered by                                                                                         |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| M7-01 | Email service              | Integration (outbox states, immediate send, job, backoff, give up, retry, leases), Unit, E2E       |
| M7-02 | Email templates            | Integration (admin-only, fixed keys, unknown variables, edits used, disabled), Unit (preview)      |
| M7-03 | Registration notifications | Integration (submitted/approved/rejected, no mail without status change, escaping), E2E            |
| M7-04 | Schedule notifications     | Integration (affected teams, fingerprints, removed games, scope, permissions, archived), Unit, E2E |

## Tests

| Test ID | Scenario                        | Expected                                  | Covered by                                                                                     |
| ------- | ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M7-T01  | Submit registration             | Confirmation email delivered              | Integration (mail content, link, outbox `sent`)                                                |
| M7-T02  | Reset password                  | Reset email delivered                     | Integration (here and M1-T05 in `m1-identity.test.ts`)                                         |
| M7-T03  | Change schedule                 | Affected participants notified            | Integration (only the moved team), Unit (card), E2E (manager notifies coach)                   |
| M7-T12  | Simulate email provider failure | Failure recorded and retry policy applied | Integration (error, 1-minute backoff, sent on retry; failed after 5; manual retry), Unit (log) |

## Not covered yet

- Delivery through a real SMTP server (covered by PocketBase's mailer; verified manually on deployment).
