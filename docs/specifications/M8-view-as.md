# M8-C – Admin "view as"

Refines roadmap requirements M8-13 – M8-18. Admins check what an event manager, head judge or
judge of an event sees, without a second account and without guessing from the UI.

## Switching (M8-13, M8-16)

Admins have a **View as** button in the header; **Alt+Shift+V** opens the same dialog. They choose:

| Field  | Values                                                                                     |
| ------ | ------------------------------------------------------------------------------------------ |
| Event  | Any event that is not archived (the current event is preselected)                          |
| Role   | Event manager, head judge, judge                                                           |
| Person | Optional: one activated person with that role in the event; default "anyone with the role" |

After switching, the app opens the role's start page (judges the judge dashboard, head judges the
review page of the event, managers the event) and behaves as for that role: navigation, pages and
buttons follow the effective roles.

## What the API applies (M8-14, M8-18)

The switch issues a real auth token for another account, so every rule and route check applies as
for that account; nothing in the API trusts a client flag.

| Mode                 | Account used                                                                | Writes                     |
| -------------------- | --------------------------------------------------------------------------- | -------------------------- |
| Anyone with the role | The admin's **stand-in** account, holding only the chosen role of the event | Allowed, as that role      |
| A person             | That person's account                                                       | Refused (403, `read_only`) |

- **Stand-in account**: one per admin, created on first use (`users.preview_of` = the admin, email
  `preview-<admin id>@preview.invalid`, named "<admin> (preview)"). It holds a role only while a
  session lasts. It cannot sign in with a password, and no one can create or claim such an account
  through the API: sign-up, email changes and invitations reject `@preview.invalid`, and
  `preview_of` can only be set by the server. Stand-ins do not appear in the user list or staff
  lists.
- **Person**: read-only, so nothing is ever written in a real judge's name. The person's own
  sign-ins keep working, and ending the switch does not sign them out.
- Tokens are not refreshable and last **4 hours**. Ending the session (or starting another one)
  refuses its token at once (401); a stand-in also loses its role and all its tokens.
- Only admins can switch, only with their own sign-in (a switched session cannot switch again),
  and only to event roles (not admin): the switch can only narrow what the admin may do.

## Visible state (M8-15)

While switched, a banner above the header shows the role, event, person (and "read-only") and
until when the session lasts, with **Back to admin**. Alt+Shift+V also returns. The admin's own
sign-in is kept in the browser and restored on exit; reloading the page keeps the switch while the
session is active, and returns to the admin once it ended.

## Audit (M8-17)

| Entry           | Recorded under | `view_as`                     |
| --------------- | -------------- | ----------------------------- |
| `view_as.start` | the admin      | e.g. `judge · Swiss Final`    |
| `view_as.end`   | the admin      | same                          |
| Any change      | the admin      | the role and event (stand-in) |

Changes made with the stand-in are recorded with the admin as actor and the effective role in the
`view_as` field, which the audit log shows below the actor. Person sessions cannot write.

## Data

| Collection          | Fields                                                                                                          | Rules                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `view_sessions`     | `admin`, `user` (the account used), `event`, `role`, `persona`, `token_hash` (hidden), `expires_at`, `ended_at` | none (routes only)     |
| `users.preview_of`  | hidden relation to the admin a stand-in belongs to                                                              | set by the server only |
| `audit_log.view_as` | text                                                                                                            | –                      |

Migration `1764600000_m8_view_as.js`.

## API

| Method | Path               | Auth                 | Description                                                    |
| ------ | ------------------ | -------------------- | -------------------------------------------------------------- |
| POST   | `/api/view-as`     | admins (own sign-in) | `{ event, role, user? }` → `{ token, record, session }`        |
| GET    | `/api/view-as`     | the switched token   | `{ session }` (role, event, persona, read_only, admin, expiry) |
| POST   | `/api/view-as/end` | the switched token   | Ends the session                                               |

A middleware (`hooks/view_as.pb.js`) checks every request made with a non-refreshable token
against `view_sessions`: ended or expired sessions get 401, and person sessions may only read
(plus realtime subscriptions, file tokens and ending the session).
