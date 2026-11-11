# M1 – Roles and permissions

Refines roadmap requirements M1-02, M1-05 and the system invariant "an unauthorized user
cannot read or modify restricted competition data". Enforcement lives in the PocketBase API
rules defined in `apps/backend/migrations/1762800000_m1_identity_events.js`; the frontend only
mirrors them for usability.

## Principles

- **Verified accounts only.** Every rule except user registration and the user's own record
  requires `@request.auth.verified = true` (M1-02). Unverified users can sign in, but see no
  events and can perform no actions until they confirm their email address.
- **Roles are scoped.** A user can hold any number of role assignments (M1-05). `admin` is
  global; all other roles are scoped to exactly one event.
- **Coach is not a role.** Any verified user can register teams and becomes their coach.
  Ownership (`teams.coach`) grants access to those teams only.
- **Archived events are read-only** for everyone except admins, and stay readable for staff
  and coaches with teams in them (M1-T12).

## Roles

| Role             | Scope  | Purpose                                                      |
| ---------------- | ------ | ------------------------------------------------------------ |
| `admin`          | global | Manages everything, including users' roles and templates     |
| `event_manager`  | event  | Manages one event: details, days, categories, teams          |
| `head_judge`     | event  | Reads event data; approves, returns and corrects scores (M5) |
| `judge`          | event  | Reads event data; scores the games on their table (M5)       |
| coach (implicit) | teams  | Owner of team registrations                                  |

## Access matrix

"Staff" = any role in the event. "Manager" = admin or `event_manager` of the event.

| Collection              | List / view                                                                      | Create                                           | Update                                                            | Delete                      |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | --------------------------- |
| `users`                 | own record; admins: all (incl. email)                                            | anyone (registration)                            | own record                                                        | own record                  |
| `role_assignments`      | own assignments; admins: all                                                     | admin                                            | admin                                                             | admin                       |
| `events`                | admin, staff, any verified user if `published`, coaches with teams if `archived` | admin                                            | manager                                                           | admin                       |
| `competition_days`      | same as event                                                                    | manager, event not archived                      | manager, event not archived                                       | manager, event not archived |
| `categories` (event)    | same as event                                                                    | manager, event not archived                      | manager, event not archived                                       | manager, event not archived |
| `categories` (template) | admins and users with any `event_manager` role                                   | admin                                            | admin                                                             | admin                       |
| `teams`                 | coach (own), staff of the event, admin                                           | manager; coach for self while registration open¹ | manager; coach while registration open and status draft/rejected² | admin; coach for own drafts |
| `team_documents`        | coach of the team, staff of the event, admin; files need a file token            | manager, event not archived                      | manager, event not archived; team and uploader fixed              | manager, event not archived |

¹ Coaches can only create teams with `coach` = themselves, status `draft` or `submitted`, and
without review fields. Registration is open when the event is `published` and the current time
is within the optional `registration_opens_at` / `registration_closes_at` window.

² Coaches cannot change `event`, `coach` or review fields, and can only set status `draft` or
`submitted`.

## Custom endpoints

| Endpoint                              | Who                             | Purpose                                   |
| ------------------------------------- | ------------------------------- | ----------------------------------------- |
| `POST /api/categories/{id}/copy`      | admin; manager (into own event) | Independent copy of a category (M1-09)    |
| `POST /api/role-assignments/by-email` | admin                           | Assign a role to the user with that email |
| `GET /api/admin/users?q=`             | admin                           | Search users by name or email             |

These endpoints re-check permissions in `apps/backend/hooks/lib/access.js`.

## Notes

- PocketBase hides `email` from non-owners. Admins see emails through an `onRecordEnrich`
  hook, and search by email through `/api/admin/users` because PocketBase does not allow
  non-superusers to filter on hidden fields.
- Denied requests return 404 (view/update/delete of invisible records), 400 (create rule
  failure) or 403 (custom endpoints). Lists silently exclude invisible records.
