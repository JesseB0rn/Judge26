// The English messages define the keys (and so the types) of every language. Add new message
// files here; src/i18n/__tests__/messages.spec.ts checks that each language has the same keys.
import type auth from './locales/en/auth.json'
import type common from './locales/en/common.json'
import type errors from './locales/en/errors.json'
import type exportMessages from './locales/en/export.json'
import type server from './locales/en/server.json'
import type shell from './locales/en/shell.json'
import type system from './locales/en/system.json'
import type events from './locales/en/events.json'
import type categories from './locales/en/categories.json'
import type teams from './locales/en/teams.json'
import type administration from './locales/en/administration.json'
import type communication from './locales/en/communication.json'
import type scheduling from './locales/en/scheduling.json'
import type judging from './locales/en/judging.json'
import type live from './locales/en/live.json'
import type rankings from './locales/en/rankings.json'
import type scoring from './locales/en/scoring.json'
import type diagram from './locales/en/diagram.json'
import type planner from './locales/en/planner.json'
import type board from './locales/en/board.json'
import type templates from './locales/en/templates.json'

export interface MessageSchema {
  auth: typeof auth
  common: typeof common
  errors: typeof errors
  export: typeof exportMessages
  server: typeof server
  shell: typeof shell
  system: typeof system
  events: typeof events
  categories: typeof categories
  teams: typeof teams
  administration: typeof administration
  communication: typeof communication
  scheduling: typeof scheduling
  judging: typeof judging
  live: typeof live
  rankings: typeof rankings
  scoring: typeof scoring
  diagram: typeof diagram
  planner: typeof planner
  board: typeof board
  templates: typeof templates
}
