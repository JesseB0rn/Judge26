# M3 – Rounds and ranking

Refines roadmap milestone M3. The engine lives in `packages/ranking-engine` (independent of Vue
and PocketBase; it reuses the fixed-point arithmetic and fingerprint of the scoring engine). It
runs in the browser (live ranking preview) and in PocketBase hooks (configuration validation and
snapshots). The configuration is edited in a visual builder (M3-18) or as JSON; see
[Visual builders](M2-scoring-rulesets.md#visual-builders-m2-15-m3-18).

## Data model

| Collection           | Purpose                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `rounds`             | Rounds of a category (M3-01): `key` (e.g. `R1`, unique per category), `name`, `position`                                                        |
| `games`              | One result of one team in one round (M3-02): `round`, `team`, `attempt` (1, 2, …), `status`, `points`, `time_ms`, optional `ruleset` + `values` |
| `categories.ranking` | The ranking configuration (JSON, validated on save)                                                                                             |
| `ranking_snapshots`  | Immutable published rankings (M3-17)                                                                                                            |

**Games.** A game belongs to exactly one round, and its team must be an approved team of the
round's category. `status` is `scheduled`, `completed`, `disqualified` or `absent`. Points of a
completed game are either entered directly (0 is a valid zero-point result) or, when a published
ruleset of the category is attached (by default the active version of the round's
[game rule](M2-scoring-rulesets.md#game-rules)), **computed on the server from the score sheet values**
(M3-03); invalid score sheets are rejected. Disqualified and absent games carry no points.
`time_ms = 0` means "no time recorded" (PocketBase stores empty numbers as 0).

Copying a category copies its rounds and ranking configuration (and, from M2, its game rules
with their active rulesets; rounds keep their game rule).

## Configuration format (schema version 1)

```json
{
  "schemaVersion": 1,
  "precision": 0,
  "timeResolutionMs": 10,
  "rounds": [{ "key": "R1", "label": "Round 1" }, { "key": "R2" }, { "key": "R3" }],
  "calculations": [
    {
      "id": "best",
      "label": "Best round",
      "op": "BEST_BY",
      "by": [
        { "field": "points", "order": "desc" },
        { "field": "time", "order": "asc" }
      ],
      "operands": [{ "round": "R1" }, { "round": "R2" }, { "round": "R3" }]
    },
    {
      "id": "total",
      "label": "Total",
      "op": "ADD",
      "operands": [{ "round": "R1" }, { "round": "R2" }, { "round": "R3" }]
    }
  ],
  "policies": { "missing": "zero", "disqualified": "zero", "absent": "zero" },
  "ranking": {
    "keys": [
      { "source": { "calc": "best" }, "field": "points", "order": "desc", "label": "Best" },
      { "source": { "calc": "best" }, "field": "time", "order": "asc", "label": "Time of best" },
      { "source": { "calc": "total" }, "field": "points", "order": "desc", "label": "Total" }
    ],
    "ties": "shared"
  }
}
```

| Property           | Notes                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `precision`        | Decimal places of points (0–4, default 2)                                                  |
| `timeResolutionMs` | Times are truncated to multiples of this value before use (default 1)                      |
| `rounds`           | Round keys used by games; optional `attempts` aggregation (see below)                      |
| `calculations`     | Named intermediate results; operands are `{ "round": key }` or `{ "calc": id }` (M3-12)    |
| `policies`         | Treatment of results without valid points                                                  |
| `ranking.keys`     | Primary key first, then tie-breakers in order (M3-13, M3-14)                               |
| `ranking.ties`     | `shared` (default): equal teams share a rank; `name`: ordered by team name (M3-15, M3-T10) |

Ids (round keys and calculation ids) share one namespace. Unknown properties, unknown references
and **circular calculations** are rejected.

### Results carry points and time together

Every round and calculation produces a result with `points`, `timeMs` and a `status`. Operators:

| `op`         | Result                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| `ADD`        | Sum of points; time = sum of times if every operand has one, else none (M3-04)       |
| `MAX`, `MIN` | Highest / lowest points; no time (M3-05, M3-06). Use `BEST_BY` to keep the time      |
| `DIFFERENCE` | `operands[0] − operands[1]`, exactly two operands; no time (M3-07)                   |
| `BEST_BY`    | The **entire** best operand result by `by` (default points ↓, time ↑) (M3-08, M3-11) |
| `WORST_BY`   | The entire worst operand result by the same order (M3-09)                            |
| `SUM_BEST_N` | Sum of the best `n` results by `by` (points and times) (M3-10)                       |

Ties inside `BEST_BY`/`WORST_BY`/`SUM_BEST_N` resolve to the first operand. Missing values
(e.g. no time) always sort last.

**Attempts.** A round with several games (attempts) combines them with its `attempts`
aggregation (any operator except `DIFFERENCE`); default `BEST_BY` points ↓, time ↑. A single
attempt is used as is. This answers roadmap question 15.1 configurably.

### Missing, disqualified, absent and zero results

Result statuses: `ok`, `missing` (no game), `disqualified`, `absent`, `excluded` (nothing left to
compute). A completed game with 0 points is `ok` with 0 points, so all cases stay
distinguishable in explanations and snapshots.

| Policy     | `missing` | `disqualified` | `absent` | Effect                                                    |
| ---------- | --------- | -------------- | -------- | --------------------------------------------------------- |
| `zero`     | default   | default        | default  | counts as 0 points, no time                               |
| `exclude`  | ✓         | ✓              | ✓        | ignored by aggregations (`DIFFERENCE` then has no result) |
| `unranked` | ✓         |                |          | as `zero`, but teams with a missing round get no rank     |

Teams with a missing round are marked **provisional** (groundwork for M6-02). Teams without a
value for the primary key are listed without a rank.

### Rounding

Points are converted once to the configured precision when read (scaled integers, half away
from zero) and then computed exactly. Times are integers in milliseconds, truncated to
`timeResolutionMs`.

## Ranking output

Ranks follow standard competition ranking (1, 2, 2, 4). Each entry contains the rank, whether it
is shared, the key values, `provisional`, `decidedBy` (index of the key that placed the team
below the previous one, `"name"` for the tie fallback) and an explanation of every round and
calculation for the team, e.g. `BEST_BY(points ↓, time ↑) → R3: 100 pts / 110.000 s`.

## Snapshots (M3-17)

`POST /api/categories/{id}/ranking/snapshots { title }` (event managers) computes the ranking on
the server from the stored rounds, approved teams and games and stores it together with the
configuration, the inputs and fingerprints. Snapshots cannot be created through the regular API
and can never be changed, not even by superusers; only admins can delete them. Later corrections
therefore never alter a published snapshot (M3-T13). Staff of the event can read snapshots;
public publication follows in M6.

## Caching

All `/api/` responses are sent with `Cache-Control: no-store`, and the frontend requests with
`cache: 'no-store'`, so live results are never served from a browser or proxy cache.
