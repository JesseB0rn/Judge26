# M6 – Live competition and public interface

Refines roadmap milestone M6. During the competition the platform is the central source of
information: the public follows rankings, the schedule and progress on their phones and on TV
displays, while judges score and head judges approve. Nothing is public until a manager publishes
it.

## Publication (M6-03, M6-10)

Per category, event managers (and admins) decide what the public sees:

| Setting             | Field                           | Effect on the public pages                                                                       |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Live ranking public | `categories.public_live`        | The live ranking from **finalized** scores, marked provisional while games are open              |
| Official ranking    | `categories.published_snapshot` | One of the category's ranking snapshots (M3-17); immutable, so later corrections never change it |
| (set by the server) | `results_published_at/by`       | When and by whom the official ranking was published; clients cannot set these                    |

- Both are off by default (M6-T04). Unpublishing clears the official ranking from the public.
- The official snapshot must belong to the category (`400`, `published_snapshot: invalid_snapshot`).
- The live ranking needs a ranking configuration.
- The event must be `published` (or `archived`) for any public page; draft events return `404`.
- Managers control publication in the event's **Public results** tab: a live toggle, the official
  snapshot, and _Publish current ranking_ (creates a snapshot and publishes it in one step).

## Public pages (no sign-in)

| Route              | Content                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `/live`            | Public events                                                                           |
| `/live/{event}`    | Tabs **Rankings**, **Schedule**, **Progress**; category (M6-06) and day (M6-07) filters |
| `/live/{event}/tv` | TV mode (M6-05)                                                                         |

- **Rankings**: the official ranking if published, else the live one; a toggle when both exist. Live
  rankings show progress and a _provisional_ notice while games are not final; teams missing round
  results are marked _provisional_ (M6-02).
- **Schedule** (M6-04): _At the tables_ (now and next per table) and every round in playing order
  with table, sequence, team and state. States: _Upcoming_, _Playing_ (a draft sheet exists),
  _In review_ (submitted), _Done_ (finalized). Results are never shown here.
- **Progress** (M6-08): done / in review / remaining games, overall and per category, per day.
- The selection is kept in the URL (`tab`, `category`, `day`, `source`), so a refresh or a shared
  link shows the same view (M6-T09).

### TV mode (M6-05)

Full-screen layout without the application shell: no navigation, sign-in or administration controls,
even for signed-in staff (M6-T07); only a _Full screen_ button that hides itself in full screen.
It rotates through every page of every published ranking (rows per page follow the screen height),
the tables (now/next) and the progress. URL options:

| Option     | Values                                  | Default             |
| ---------- | --------------------------------------- | ------------------- |
| `view`     | `auto`, `ranking`, `tables`, `progress` | `auto` (all)        |
| `category` | comma-separated category ids            | all published       |
| `day`      | competition day id                      | current day         |
| `source`   | `official`, `live`                      | official if present |
| `rotate`   | seconds per slide, 5–300                | 15                  |

## Live updates (M6-01, exit criterion)

- Hooks increase the event's `live_revisions.revision` after every **committed** change to events,
  categories, teams, tables, days, rounds, games, snapshots, and to score sheets (creation and status
  changes; draft autosaves do not count). Hooks run after the transaction, so a client never reloads
  before the change is visible.
- Public pages, TV mode and the staff ranking page subscribe to that record (realtime) and reload.
  They also poll it every 20 s and when the device comes back online or the tab becomes visible.
  Each response carries the revision; if it is older than the latest known one the page reloads
  again. Reloads never overlap and only the newest response is applied.
- Clients compute nothing themselves for public results: the live ranking is computed on the
  server with the same engine and inputs as snapshots, so judges, managers and displays always agree.
- If the server cannot be reached the last data stays on screen with _Offline · data from …_; each
  response is cached on the device, so a display that reloads without a connection still shows the
  last data. A `404` (no longer public) removes it.

## Multi-day operation (M6-09)

All results are stored server-side; nothing depends on a running session, so the competition
resumes after a restart with all results, sheets, snapshots and publication settings (M6-T08). The
public pages and TV mode open on the **current day**: today if it is a competition day, otherwise the
first day that still has open games, otherwise the last day. Rounds left over from a day can be moved
to the next day by changing the round's day.

## API

| Method | Path                                  | Result                                                                                         |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/public/events`                  | Published and archived events with days                                                        |
| GET    | `/api/public/events/{id}`             | `revision`, event, days, categories (`live`, `official`), active tables, rounds, games + state |
| GET    | `/api/public/categories/{id}/ranking` | `revision`, `official` (snapshot result + config), `live`, `progress`, team organizations      |

The public payloads contain team names, organizations and countries only: no coach contacts, members,
score values, points of unpublished results or snapshot inputs. `live_revisions` is readable by
anyone for public events (and by signed-in users) and never writable through the API.
