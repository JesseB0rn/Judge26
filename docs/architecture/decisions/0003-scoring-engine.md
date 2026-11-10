# ADR 0003: Scoring engine design

- **Status:** accepted
- **Date:** 2026-11-09

## Context

M2 requires a generic, deterministic and explainable scoring engine that represents different
WRO rules without code changes and operates independently of Vue and PocketBase. Historical
results must stay tied to the ruleset that produced them.

## Decisions

1. **Declarative JSON tree** of criteria (boolean, number, select) and groups (sum, max, min)
   with selection limits, clamps, deductions and conditions — instead of a free-form
   expression language. Trees cover the roadmap's scoring patterns, are easy to validate,
   render directly as a score sheet and produce readable explanations. Cycles can only arise
   through conditions and are detected on a dependency graph.
2. **Fixed-point arithmetic** (integers scaled by 10^precision, rounding once per criterion)
   so totals are exact and reproducible across platforms.
3. **Zero runtime dependencies**, plain TypeScript. The package is consumed as source by the
   frontend and bundled with esbuild (ES2017, CommonJS) into
   `apps/backend/hooks/lib/scoring-engine.js` for PocketBase's JS VM. The bundle is generated
   by the backend scripts and the Docker build, and is not committed. This follows up on
   ADR 0001: server-side domain logic runs in the JSVM as a bundle.
4. **Immutable published versions** in a `rulesets` collection, enforced by a model-level hook
   (applies to superusers too), plus a fingerprint of the canonical definition. Compiled
   rulesets are frozen deep copies, so the engine itself cannot be affected by later changes.
5. **JSON editor with live validation and a generated score sheet preview** as the first
   configuration UI. The visual rule builder (M2-15) and the aggregation builder (M3-18) edit
   the same format as a LabVIEW-style block diagram; they store nothing of their own (see
   `docs/specifications/M2-scoring-rulesets.md`, Visual builders).

## Consequences

- One implementation of the scoring rules serves the judge UI (M5), server-side recalculation
  and the ranking engine (M3).
- The JSVM supports the ES2017 bundle; the engine avoids APIs unavailable there (e.g.
  `TextEncoder`, `BigInt`). Integration tests exercise the bundle in PocketBase.
- Editing rulesets as JSON requires care; the editor reports errors with JSON paths, and
  invalid rulesets cannot be published.
