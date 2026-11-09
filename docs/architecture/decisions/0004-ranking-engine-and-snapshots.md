# ADR 0004: Ranking engine, results model and snapshots

- **Status:** accepted
- **Date:** 2026-11-09

## Context

M3 aggregates game results into rounds and rankings with configurable operators, tie-breaks and
policies for missing results. Published rankings must be preserved, and the scoring engine (M2)
already establishes the pattern of a pure package bundled into PocketBase.

## Decisions

1. **Separate `packages/ranking-engine`** with the same properties as the scoring engine (pure,
   deterministic, fixed-point, explainable, bundled for hooks). It depends on the scoring engine
   only for arithmetic and fingerprints.
2. **Results are (points, time, status) triples.** Selection operators return whole results, so
   a selected round's time can never be mixed up with another round's (M3-11). `MAX`/`MIN`
   deliberately produce no time.
3. **Named calculations reference rounds and each other** instead of a nested expression
   syntax, so intermediate results can be shown and referenced by tie-breakers.
4. **Rounds and games are collections now**, with a minimal game model (status, points, time,
   optional ruleset + values). M4 adds scheduling and M5 the judging workflow to the same
   collection. Points from score sheets are always recomputed on the server.
5. **Snapshots are computed on the server** and are immutable (model-level hook), storing
   configuration, inputs, result and fingerprints, so a published ranking can be reproduced and
   audited (system invariant 5).
6. **API responses are not cacheable.** A browser reused a cached result list and hid a
   just-saved correction; live competition data must always be fresh.

## Consequences

- The live ranking preview and published snapshots use identical code and input mapping (the
  frontend mirrors the backend's game → input mapping, covered by tests on both sides).
- The ranking configuration is edited as JSON for now; a visual builder is roadmap item M3-18.
