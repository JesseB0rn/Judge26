# M8-B – Judge invitations and the dev mailbox

Refines roadmap requirements M8-06 – M8-12. Event managers bring their judges in by name and
email, one by one or from a CSV, instead of asking everyone to register and then assigning roles
by email.

## Who can invite

| Actor                    | Can invite                          | Can remove                       |
| ------------------------ | ----------------------------------- | -------------------------------- |
| Event manager (of event) | judges, head judges                 | judges, head judges of the event |
| Admin                    | event managers, head judges, judges | any role of the event            |
| Others                   | –                                   | –                                |

The event's **Staff** tab (managers and admins) lists every role holder with a status, a form to
invite one person and **Import CSV**. Archived events are read-only.

## What an invitation does (M8-07, M8-08)

Each row (`name`, `email`, `role`; role defaults to `judge`) is classified and, on confirmation,
carried out in one transaction:

| Status      | When                                                    | Effect                                                         |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `invite`    | No account with the email, or one never activated       | Account created (or renamed), role granted, `invitation` email |
| `add`       | An activated account                                    | Role granted, `event_access` email                             |
| `already`   | An activated account that already has this role         | Nothing                                                        |
| `duplicate` | The email appeared in an earlier row                    | Merged into that row                                           |
| `invalid`   | Name or email missing or invalid, or a role not allowed | Skipped; `errors` lists the reasons                            |

Emails are compared case-insensitively. An account that was never activated (e.g. someone
registered but never confirmed the address) is treated like a new one: the invitation link sets
its password, so only the owner of the mailbox can take it over.

The role is granted right away, so an invited judge can already be assigned to a table.

## Invitation links (M8-08, M8-10)

- `{APP_URL}/auth/invitation?token=…`: a 48-character random token, stored only as a SHA-256
  hash (hidden field), valid for **14 days**, usable **once**. Resending creates a new token; the
  previous link stops working.
- The page shows the event and role, and asks for a password (twice, at least 8 characters).
  Accepting sets the password, marks the account verified (M1-02), marks every open invitation of
  the person accepted, signs them in and opens the page of their role: judges the judge dashboard,
  head judges the review page of the event, managers the event.
- Used, expired, revoked and unknown links show an explanation; the lookup reveals nothing about
  the person for those.
- Emails to new accounts are in the inviter's language, emails to existing accounts in the
  recipient's.

## Status in the staff list (M8-09)

| Status    | Meaning                                                  | Actions                |
| --------- | -------------------------------------------------------- | ---------------------- |
| `active`  | The account is activated                                 | Remove                 |
| `invited` | The link was sent and is valid (shows until when)        | Resend, revoke         |
| `expired` | The link expired before it was used                      | Resend, revoke         |
| `revoked` | The invitation was revoked; the role was removed with it | Resend (invites again) |

Removing an invited person's role also revokes the open invitation. Revoked or removed accounts
are kept (they may have roles in other events).

## CSV format (M8-06)

UTF-8, header row, column order and case free, at most 500 rows:

| Column  | Required | Notes                                                                       |
| ------- | -------- | --------------------------------------------------------------------------- |
| `name`  | yes      |                                                                             |
| `email` | yes      |                                                                             |
| `role`  | no       | `judge` (default), `head_judge` / `head judge`; admins also `event_manager` |

The browser only parses the file. The server's **preview** classifies every row (it knows the
accounts) and nothing is saved until the manager confirms.

## Data

| Collection    | Fields                                                                                                                                             | Rules                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `invitations` | `user`, `event` (both cascade; unique together), `role`, `token_hash` (hidden), `expires_at`, `sent_at`, `accepted_at`, `revoked_at`, `invited_by` | Read: admins and the event's managers; no API writes |

Migration `1764500000_m8_invitations.js` also adds the `invitation` and `event_access` templates in
every language (variables: `name`, `event_name`, `role_name`, `inviter_name`, `action_url`,
`expires_on` (invitation only), `app_name`).

## API

| Method | Path                                   | Auth              | Description                                                                    |
| ------ | -------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| GET    | `/api/events/{id}/staff`               | event managers    | `[{ id, role, status, user: { id, name, email, verified }, invitation }]`      |
| DELETE | `/api/events/{id}/staff/{assignment}`  | event managers    | Removes a role (managers: judges and head judges only)                         |
| POST   | `/api/events/{id}/invitations/preview` | event managers    | `{ rows }` → `{ rows: [{ line, name, email, role, status, errors }], counts }` |
| POST   | `/api/events/{id}/invitations`         | event managers    | Same body; invites and returns the outcome                                     |
| POST   | `/api/invitations/{id}/resend`         | event managers    | New link and email                                                             |
| POST   | `/api/invitations/{id}/revoke`         | event managers    | Invalidates the link and removes the role                                      |
| GET    | `/api/invitations/lookup?token=`       | public            | `{ status }`, plus name, email, role and event for a valid link                |
| POST   | `/api/invitations/accept`              | public (the link) | `{ token, password, passwordConfirm }` → `{ email, role, event }`              |

Inviting, resending, revoking, removing and accepting are recorded in the audit log (M7-08).

## Dev mailbox (M8-11, M8-12)

In development and test (`PB_ENV`), without SMTP, the backend captures emails instead of sending
them (`GET /api/dev/mails`, the last 200, kept in memory until a restart). The web app's
**Mailbox (dev)** page (`/dev/mailbox`, admins) lists them newest first with recipient, subject and
time, and shows the selected email in a sandboxed frame whose links open in a new tab, so an
invitation can be followed from there.

Production builds contain neither the page nor the link (the route depends on the build-time
`VITE_APP_ENV`), and a production backend has no `/api/dev/*` routes. E2E tests read the captured
emails through `linkFromMail` / `mailsTo` in `e2e/support/backend.ts`.
