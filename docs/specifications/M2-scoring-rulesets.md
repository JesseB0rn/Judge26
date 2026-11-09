# M2 – Scoring rulesets

Refines roadmap milestone M2 (configurable scoring engine). The engine lives in
`packages/scoring-engine` and is independent of Vue and PocketBase. The same code runs in the
browser (live score sheet) and in PocketBase hooks (validation on publish, evaluation API).

## Definition format (schema version 1)

A ruleset is JSON:

```json
{
  "schemaVersion": 1,
  "precision": 0,
  "root": {
    "id": "total",
    "label": "Total score",
    "type": "group",
    "aggregate": "sum",
    "children": []
  }
}
```

| Property        | Notes                                                 |
| --------------- | ----------------------------------------------------- |
| `schemaVersion` | Must be `1`                                           |
| `precision`     | Decimal places of all scores, 0–4 (default 2)         |
| `root`          | A group. It cannot have a condition or be a deduction |

Unknown properties are rejected so that typos do not go unnoticed.

### Common node properties

| Property      | Required | Notes                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------- |
| `id`          | yes      | Unique in the ruleset; starts with a letter; letters, digits, `_`, `-`; max. 64 |
| `label`       | yes      | Shown on the score sheet                                                        |
| `type`        | yes      | `boolean`, `number`, `select` or `group`                                        |
| `description` | no       | Instructions for judges (M2-01)                                                 |
| `condition`   | no       | The node is only active when the condition holds (M2-10)                        |
| `deduction`   | no       | `true`: the node's score is subtracted (M2-07). Its points must be ≥ 0          |

### Criteria (values entered by judges)

| Type      | Properties                                                   | Score                       |
| --------- | ------------------------------------------------------------ | --------------------------- |
| `boolean` | `points`, `required`                                         | `points` if yes, else 0     |
| `number`  | `pointsPerUnit`, `integer`, `min`, `max`, `unit`, `required` | value × `pointsPerUnit`     |
| `select`  | `options: [{ id, label, points }]`, `required`               | points of the chosen option |

Values on a score sheet are keyed by criterion id: `true`/`false`, a number, or an option id.
`null` means "no value".

### Groups

| Property    | Notes                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `aggregate` | `sum` (M2-06), `max` (M2-08) or `min` (M2-09) of the children's scores                                                            |
| `children`  | Criteria and nested groups (M2-11); at least one                                                                                  |
| `selection` | `{ min?, max? }` number of selected children (M2-05). `{ "max": 1 }` = mutually exclusive, `{ "min": 1, "max": 1 }` = exactly one |
| `clamp`     | `{ min?, max? }` bounds applied after aggregation, e.g. `{ "min": 0 }` (M2-T07)                                                   |
| `empty`     | Score when no child is answered (M2-T06). Default 0. A group with `empty` always provides a score to its parent                   |

### Conditions

```json
{ "ref": "tower", "op": "eq", "value": "three" }
{ "all": [ … ] }   { "any": [ … ] }   { "not": { … } }
```

| Referenced node | Operators                                                           |
| --------------- | ------------------------------------------------------------------- |
| boolean         | `eq`, `neq` with `true`/`false`; `set`, `unset`                     |
| number          | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` with a number; `set`, `unset` |
| select          | `eq`, `neq` with an option id; `in` with option ids; `set`, `unset` |
| group           | numeric operators on the group's score; `set`/`unset` = answered    |

A referenced criterion that is inactive, or has no valid value, counts as missing: every
comparison is then false (including `neq`); only `unset` is true.

## Semantics

**Activity.** A node is active if its parent is active and its condition (if any) holds.
Inactive nodes score 0, are ignored by aggregations and cannot receive values: a value for an
inactive criterion is reported as `not_eligible`.

**Answered.** A criterion is answered when it has a valid value (including `false` and `0`).
A group is answered when an active child is answered, or when it defines `empty`.

**Selected** (for `selection`): boolean `true`, a chosen option, a number ≠ 0, or a group with a
selected child.

**Group score.**

1. `sum`: sum of the active children's scores. `max`/`min`: the extreme of the answered active
   children; ties resolve to the first child in definition order.
2. No answered child: `empty` (default 0).
3. `clamp` is applied.
4. If the group is a deduction, the result is negated.

**Arithmetic and rounding.** Scores are integers scaled by 10^`precision`. Each criterion's score
is rounded once, half away from zero, after normalizing binary floating-point noise. Sums,
maxima and minima are then exact. Points, clamps and `empty` values with more decimals than
`precision` are rejected.

**Determinism.** Evaluation is a pure function of the ruleset and the values (M2-T12).

**Modes.** `final` (default) reports everything. `draft` (for incomplete sheets) does not report
missing required values or unmet `selection.min`.

## Validation (M2-12)

Ruleset issues have a `code`, a `message` and a JSON `path`. Codes include `invalid_type`,
`required`, `unknown_property`, `invalid_id`, `duplicate_id`, `invalid_range`, `not_integer`,
`negative_value`, `too_many_decimals`, `invalid_condition`, `unknown_reference` (M2-T08) and
`circular_reference` (M2-T09).

Circular dependencies are found on a graph where a node's activity depends on its parent's
activity and on the nodes its condition references, a group's score depends on its children and
its own activity, and a criterion's value depends on its activity. A condition on a group that
references one of its own descendants is therefore circular.

Score sheet issues use the criterion or group id as path: `invalid_type`, `not_integer`,
`below_minimum`, `above_maximum`, `unknown_option`, `unknown_criterion`, `not_a_criterion`,
`not_eligible`, `required`, `too_many_selected`, `too_few_selected`.

## Explanation (M2-13)

Every evaluation returns an explanation tree mirroring the ruleset: per node the label, whether
it was active (and why not), the entered value, its points (contribution after clamp and
deduction), a formula such as `3 × 5 = 15`, `MAX(7, 12) = 12` or
`SUM(50, -5, -10) = 35`, and for `max`/`min` groups the child that determined the score.

## Versioning (M2-14)

Rulesets are stored per category in the `rulesets` collection:

| Field                          | Notes                                             |
| ------------------------------ | ------------------------------------------------- |
| `category`                     | Owning category (event category or template)      |
| `version`                      | 1, 2, 3, … assigned by the server                 |
| `status`                       | `draft` or `published`                            |
| `definition`                   | The ruleset; drafts may be invalid                |
| `fingerprint`                  | Stable hash of the definition, set on publication |
| `published_at`, `published_by` | Set on publication                                |
| `source`                       | Version this one was derived or copied from       |

- Publishing validates the definition with the engine; invalid rulesets cannot be published.
- **Published versions are immutable** for everyone, including superusers, and cannot be
  deleted. Changes are made in a new draft version (M2-T10).
- The **active** ruleset of a category is its highest published version.
- Results (from M5) will reference the ruleset version they were scored with, so recalculation
  always uses the original ruleset (M2-T11). `POST /api/rulesets/{id}/evaluate` evaluates
  values with exactly that version.
- Copying a category (M1-09) copies its active ruleset as published version 1 of the copy.

Access follows the category: anyone who can see the category can read its rulesets; managers
of the event (admins for templates) create and edit drafts and publish; nothing changes in
archived events.

## Example

`EXAMPLE_RULESET` in `packages/scoring-engine/src/example.ts` uses every feature and is the
starting point for new rulesets in the editor. The roadmap fixtures M2-F01 to M2-F05 are encoded
in `packages/scoring-engine/tests/fixtures.test.ts`.
