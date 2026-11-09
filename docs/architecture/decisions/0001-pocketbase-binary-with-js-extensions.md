# ADR 0001: PocketBase as a prebuilt binary with JavaScript migrations and hooks

- **Status:** accepted
- **Date:** 2026-11-09

## Context

PocketBase can be used either as a prebuilt binary extended with JavaScript (migrations and
hooks run in an embedded JS VM) or as a Go framework compiled into a custom binary.

## Decision

Use the prebuilt binary, pinned via `apps/backend/pocketbase.version` and downloaded with
checksum verification. Schema changes are JavaScript migrations in `apps/backend/migrations/`;
server-side logic is JavaScript hooks in `apps/backend/hooks/`.

## Consequences

- No Go toolchain is required; the whole team works in JavaScript/TypeScript.
- PocketBase upgrades are a one-line change, verified by the integration test suite in CI.
- Hooks run in an embedded JS VM (no npm packages, no TypeScript). Complex domain logic must
  therefore live in `packages/` and be executed in the frontend or, if server-side execution is
  required, in a bundled form. Revisit this decision if server-side score/ranking computation
  becomes necessary (M2/M3) and the JSVM proves insufficient; switching to Go is possible
  without changing the database schema.
