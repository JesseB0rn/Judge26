# WRO Competition Management Platform --- Development Roadmap

**Document type:** Developer-ready implementation roadmap\
**Stack:** Vue 3, TypeScript, Vite, Tailwind CSS, PocketBase\
**Scope:** Multi-event, multi-category, multi-round World Robot Olympiad
competition management

## 1. Project organization

### Development principles

-   Every requirement receives a unique ID.
-   Every feature has explicit acceptance criteria.
-   Every acceptance criterion has at least one verifiable test.
-   Business logic has automated unit tests.
-   Critical workflows have integration and end-to-end tests.
-   Database changes include migration tests.
-   Completed features require documented evidence.
-   Scoring and ranking calculations are deterministic and explainable.
-   Historical results remain tied to the ruleset under which they were
    produced.

### Priority definitions

  Priority   Meaning
  ---------- ----------------------------------------
  P0         Essential for a functional competition
  P1         Required for production readiness
  P2         Important improvement
  P3         Optional future extension

### Milestones

  -----------------------------------------------------------------------
  Milestone         Name              Scope             Priority
  ----------------- ----------------- ----------------- -----------------
  M0                Project           Architecture,     P0
                    foundation        repository, CI    
                                      and development   
                                      environment       

  M1                Identity and      Users, roles,     P0
                    event management  events,           
                                      categories and    
                                      teams             

  M2                Configurable      Criteria, scoring P0
                    scoring engine    expressions and   
                                      calculation tests 

  M3                Rounds and        Aggregation,      P0
                    ranking engine    points/time       
                                      association and   
                                      tie-breaking      

  M4                Tables and        Time slots,       P0
                    scheduling        assignments and   
                                      conflict          
                                      detection         

  M5                Judge application Score entry,      P0
                                      stopwatch,        
                                      submission and    
                                      validation        

  M6                Live competition  Realtime results, P1
                                      public displays   
                                      and multi-day     
                                      operation         

  M7                Production        Emails, exports,  P1
                    readiness         security, backups 
                                      and deployment    

  M8                Prototype         Coach removal,    P1
                    feedback          judge invites,    
                                      role switch,      
                                      templates, board  
  -----------------------------------------------------------------------

Milestones are dependency-oriented, not fixed calendar commitments. A
milestone is complete only when its exit criteria are satisfied.

------------------------------------------------------------------------

## 2. M0 --- Project foundation

**Priority:** P0\
**Objective:** Establish a maintainable application architecture and
repeatable development workflow.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Task                    Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M0-01                   Initialize repository   Repository contains
                                                  frontend, backend
                                                  configuration and
                                                  documentation

  M0-02                   Configure Vue           Vue 3, TypeScript, Vite
                                                  and Tailwind compile
                                                  successfully

  M0-03                   Configure PocketBase    Backend starts
                                                  reproducibly and
                                                  database persists

  M0-04                   Configure environments  Development, test and
                                                  production
                                                  configurations are
                                                  separated

  M0-05                   Configure CI            Automated checks
                                                  execute on every pull
                                                  request

  M0-06                   Error handling          API and frontend errors
                                                  are handled
                                                  consistently

  M0-07                   Database migrations     Schema changes can be
                                                  applied to a fresh and
                                                  an existing database
  -----------------------------------------------------------------------

### Tests

  -----------------------------------------------------------------------
  Test ID                 Procedure               Expected result
  ----------------------- ----------------------- -----------------------
  M0-T01                  Clone repository and    Installation succeeds
                          install dependencies    

  M0-T02                  Start frontend and      Both services start
                          backend                 without errors

  M0-T03                  Build production        Build succeeds
                          frontend                

  M0-T04                  Apply migrations to an  All collections and
                          empty database          indexes exist

  M0-T05                  Restart backend         Previously stored data
                                                  remains

  M0-T06                  Introduce a TypeScript  CI fails
                          error                   

  M0-T07                  Run unit test suite     CI reports test results
  -----------------------------------------------------------------------

**Exit criteria:** All seven tests pass in CI. A new developer can start
the project using the documented instructions.

------------------------------------------------------------------------

## 3. M1 --- Identity, permissions and event management

**Priority:** P0\
**Objective:** Implement the core organizational structure of the
platform.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M1-01                   User registration       Users can register
                                                  using email and
                                                  password

  M1-02                   Email verification      Unverified accounts
                                                  cannot access protected
                                                  functionality

  M1-03                   Authentication          Users can log in and
                                                  log out

  M1-04                   Password reset          Password reset works
                                                  through email

  M1-05                   Role management         Users can have multiple
                                                  scoped roles

  M1-06                   Event management        Admin can create, edit
                                                  and archive events

  M1-07                   Competition days        Events support multiple
                                                  days

  M1-08                   Category management     Categories can be
                                                  created and assigned to
                                                  events

  M1-09                   Category templates      Existing category
                                                  configurations can be
                                                  copied

  M1-10                   Team registration       Coaches can create and
                                                  submit team
                                                  registrations

  M1-11                   Team approval           Admin can approve,
                                                  reject and edit
                                                  registrations

  M1-12                   Team import             Teams can be imported
                                                  using CSV

  M1-13                   Team documents          Event managers attach
                                                  files to a team; the
                                                  coach and event staff
                                                  can open them
  -----------------------------------------------------------------------

### Tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M1-T01                  Register with valid     Account is created
                          credentials             

  M1-T02                  Register with an        Duplicate is rejected
                          existing email          

  M1-T03                  Log in with an invalid  Access is denied
                          password                

  M1-T04                  Access an admin route   API authorization
                          as a judge              denies access

  M1-T05                  Judge accesses another  Access is denied
                          event                   

  M1-T06                  Create an event with    Both days are stored
                          two days                correctly

  M1-T07                  Duplicate a category    Independent
                          template                configuration is
                                                  created

  M1-T08                  Submit team             Status changes to
                          registration            submitted

  M1-T09                  Reject team             Status changes to
                          registration            rejected

  M1-T10                  Import CSV with invalid Invalid records are
                          rows                    reported; valid rows
                                                  follow the defined
                                                  import policy

  M1-T11                  Coach accesses another  Access is denied
                          coach's team            

  M1-T12                  Archive an event        Historical records
                                                  remain accessible to
                                                  authorized users
  -----------------------------------------------------------------------

  M1-T13                  Manager uploads a team  Coach, judges and head
                          document                judges can open it;
                                                  other coaches and other
                                                  events' staff cannot

**Exit criteria:** Users with different roles can access only their
authorized event resources. The complete registration-to-approval
workflow works.

------------------------------------------------------------------------

## 4. M2 --- Configurable scoring engine

**Priority:** P0 --- critical business logic\
**Objective:** Implement a generic scoring engine that can represent
different WRO competition rules without changing application code.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M2-01                   Criterion definitions   Criteria have
                                                  configurable type,
                                                  limits and instructions

  M2-02                   Boolean criteria        Yes/no values calculate
                                                  correctly

  M2-03                   Numeric criteria        Integer and decimal
                                                  values are validated

  M2-04                   Selection criteria      Predefined options can
                                                  have individual point
                                                  values

  M2-05                   Exclusive groups        Only permitted
                                                  combinations can be
                                                  selected

  M2-06                   Additive groups         Values are summed
                                                  correctly

  M2-07                   Deduction criteria      Penalties reduce the
                                                  score correctly

  M2-08                   MAX groups              Highest eligible value
                                                  is selected

  M2-09                   MIN groups              Lowest eligible value
                                                  is selected

  M2-10                   Conditional criteria    Criteria activate only
                                                  when their conditions
                                                  are met

  M2-11                   Nested groups           Groups can contain
                                                  other groups

  M2-12                   Validation engine       Invalid scoring
                                                  configurations are
                                                  rejected

  M2-13                   Score explanation       Every result can be
                                                  traced to its source
                                                  criteria

  M2-14                   Configuration           Changes do not alter
                          versioning              finalized historical
                                                  results

  M2-15                   Visual rule builder     Administrators can
                                                  create and edit scoring
                                                  rulesets without
                                                  writing JSON
  -----------------------------------------------------------------------

M2-15 is **P2** and does not block the M2 exit criteria. The first
release edits rulesets as validated JSON with a live score sheet preview
(see ADR 0003). The visual builder edits the same ruleset format: adding,
removing, reordering and nesting criteria and groups, configuring
selection limits, clamps, deductions and conditions, with the same
validation messages and live preview. The JSON editor remains available.

### Mandatory scoring test fixtures

#### M2-F01 --- Additive scoring

Input:

-   Criterion A = 10
-   Criterion B = 15
-   Criterion C = 20

Expected result: **45 points**.

#### M2-F02 --- Mutually exclusive criteria

Options:

-   Option A = 10
-   Option B = 25

Expected results:

-   Selecting A produces 10.
-   Selecting B produces 25.
-   Selecting both is rejected.
-   A required group cannot be submitted empty.

#### M2-F03 --- Penalties

Input:

-   Base score = 50
-   Penalty A = 5
-   Penalty B = 10

Expected result: **35 points**.

#### M2-F04 --- Nested groups

``` text
Group A = ADD(10, 20) = 30
Group B = MAX(5, 15) = 15
Final   = ADD(Group A, Group B) = 45
```

Expected result: **45 points**.

#### M2-F05 --- Conditional bonus

``` text
Task completed = true
Bonus = 15
```

Expected result: 15 bonus points. When task completion is false, the
bonus is zero and the criterion is not eligible for selection.

### Additional tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M2-T01                  Submit negative value   Rejected
                          to positive-only        
                          criterion               

  M2-T02                  Submit value above      Rejected
                          maximum                 

  M2-T03                  Submit decimal to       Rejected
                          integer criterion       

  M2-T04                  Select two exclusive    Rejected
                          options                 

  M2-T05                  Evaluate nested         Correct result
                          expression              

  M2-T06                  Evaluate empty optional Configured default
                          group                   behaviour

  M2-T07                  Evaluate negative final Follows category
                          score                   configuration

  M2-T08                  Reference nonexistent   Configuration rejected
                          criterion               

  M2-T09                  Create circular         Configuration rejected
                          expression reference    

  M2-T10                  Modify active template  Existing version
                                                  remains unchanged

  M2-T11                  Recalculate historical  Original ruleset is
                          score                   used

  M2-T12                  Evaluate identical      Identical result
                          input twice             

  M2-T13                  Build the example       Definition equals the
                          ruleset in the visual   JSON-authored ruleset
                          builder                 

  M2-T14                  Open an existing JSON   Ruleset round-trips
                          ruleset in the builder  without changes
                          and save                

  M2-T15                  Create a circular       Error is shown and
                          condition in the        publishing is blocked
                          builder                 
  -----------------------------------------------------------------------

**Exit criteria:** All fixtures and automated tests pass. The scoring
engine operates independently of Vue and PocketBase.

------------------------------------------------------------------------

## 5. M3 --- Rounds and ranking engine

**Priority:** P0 --- critical business logic\
**Objective:** Aggregate game results into round results and calculate
overall category rankings.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M3-01                   Round configuration     Arbitrary number of
                                                  rounds can be created

  M3-02                   Game-to-round           Games belong to exactly
                          relationship            one round

  M3-03                   Round result            Round results are
                          calculation             derived from game
                                                  scores

  M3-04                   ADD aggregation         Values are summed

  M3-05                   MAX aggregation         Highest value is
                                                  selected

  M3-06                   MIN aggregation         Lowest value is
                                                  selected

  M3-07                   DIFFERENCE aggregation  Operand order is
                                                  configurable

  M3-08                   BEST_BY                 Entire result is
                                                  selected based on one
                                                  field

  M3-09                   WORST_BY                Entire result is
                                                  selected based on one
                                                  field

  M3-10                   SUM_BEST_N              Best N results are
                                                  summed

  M3-11                   Points/time association Selected result retains
                                                  its original time

  M3-12                   Nested aggregation      Aggregations can
                                                  reference other
                                                  calculations

  M3-13                   Ranking calculation     Teams are sorted by
                                                  configured rules

  M3-14                   Tie-breaking            Multiple tie-breaking
                                                  rules are evaluated in
                                                  order

  M3-15                   Shared rankings         Equal teams can receive
                                                  equal ranks

  M3-16                   Calculation preview     Administrators can
                                                  inspect intermediate
                                                  results

  M3-17                   Ranking snapshots       Published results can
                                                  be preserved

  M3-18                   Visual aggregation      Administrators can
                          builder                 configure round
                                                  aggregation, tie-breaks
                                                  and ranking rules
                                                  without writing JSON
  -----------------------------------------------------------------------

M3-18 is **P2** and does not block the M3 exit criteria. Like M2-15, it
edits the same configuration format as the text editor, with identical
validation and a live calculation preview (M3-16).

### Mandatory ranking test fixtures

#### M3-F01 --- Addition

``` text
Round 1: 50 points
Round 2: 30 points
Round 3: 20 points
Aggregation: ADD
Expected: 100 points
```

#### M3-F02 --- Maximum

``` text
Round 1: 50 points
Round 2: 80 points
Round 3: 30 points
Aggregation: MAX
Expected: 80 points
```

#### M3-F03 --- Difference

``` text
Round 1: 80 points
Round 2: 30 points
Aggregation: DIFFERENCE(R1, R2)
Expected: 50 points
```

#### M3-F04 --- Best result with associated time

``` text
Round 1: 100 points / 120 seconds
Round 2:  80 points /  90 seconds
Round 3: 100 points / 110 seconds

Aggregation: BEST_BY(points)
Tie-break: LOWEST_TIME

Expected: 100 points / 110 seconds
```

The time must come from the selected round, not from an independently
calculated minimum.

#### M3-F05 --- Sum of best two rounds

``` text
Round 1: 100 points
Round 2:  80 points
Round 3:  60 points
Aggregation: SUM_BEST_N(2)
Expected: 180 points
```

#### M3-F06 --- Nested aggregation

``` text
Group A = MAX(100, 80) = 100
Group B = ADD(20, 30) = 50
Overall = ADD(Group A, Group B)
Expected: 150 points
```

### Ranking test matrix

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M3-T01                  Aggregate three rounds  100
                          using ADD               

  M3-T02                  Aggregate using MAX     80

  M3-T03                  Aggregate using MIN     30

  M3-T04                  Calculate ordered       50
                          difference              

  M3-T05                  Select best result by   Correct round selected
                          points                  

  M3-T06                  Two rounds have equal   Correct time-based
                          points                  selection

  M3-T07                  Select best two of      180
                          three                   

  M3-T08                  Aggregate nested        150
                          expressions             

  M3-T09                  Apply two tie-breaking  Correct ordering
                          rules                   

  M3-T10                  All tie-breakers        Shared rank or
                          exhausted               configured fallback

  M3-T11                  Missing round result    Configured
                                                  missing-result policy
                                                  applied

  M3-T12                  Round result changes    Overall ranking
                                                  recalculated

  M3-T13                  Recalculate published   Historical snapshot
                          ranking                 remains unchanged

  M3-T14                  Two teams have          Correct shared ranking
                          identical results       behaviour

  M3-T15                  Build fixtures M3-F01   Configurations equal the
                          to M3-F06 in the        text-authored ones
                          visual builder          

  M3-T16                  Open an existing        Configuration
                          configuration in the    round-trips without
                          builder and save        changes

  M3-T17                  Create a circular       Error is shown and
                          aggregation reference   saving is blocked
                          in the builder          
  -----------------------------------------------------------------------

### Additional correctness requirements

-   Points and time have explicit units and types.
-   Time comparisons use consistent precision.
-   Difference operations have defined operand order.
-   Missing, incomplete, disqualified and zero-point results are
    distinguishable.
-   Rounding happens at explicitly defined calculation boundaries.
-   Circular calculation dependencies are prevented.

**Exit criteria:** Every mandatory fixture passes, including points/time
association tests. Calculation explanations are available for every
ranking result.

------------------------------------------------------------------------

## 6. M4 --- Tables and scheduling

**Priority:** P0\
**Objective:** Enable administrators to organize all games across
physical tables and time slots.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M4-01                   Table management        Admin can create, edit
                                                  and deactivate tables

  M4-02                   Table compatibility     Tables can be
                                                  restricted to
                                                  categories

  M4-03                   Time slot management    Admin can define
                                                  availability periods

  M4-04                   Break management        Breaks and unavailable
                                                  periods are respected

  M4-05                   Manual scheduling       Admin can assign games
                                                  manually

  M4-06                   Automatic scheduling    Scheduler generates
                                                  valid assignments

  M4-07                   Team conflict detection Teams cannot have
                                                  overlapping games

  M4-08                   Table conflict          Tables cannot host
                          detection               overlapping games

  M4-09                   Judge conflict          Judges cannot be
                          detection               assigned simultaneously

  M4-10                   Rest intervals          Minimum team rest time
                                                  is respected

  M4-11                   Schedule editing        Assignments can be
                                                  moved

  M4-12                   Locked assignments      Locked games remain
                                                  unchanged during
                                                  regeneration

  M4-13                   Schedule validation     Invalid configurations
                                                  produce actionable
                                                  errors

  M4-14                   Multi-day scheduling    Games can be
                                                  distributed across
                                                  multiple days and are
                                                  planned in the
                                                  multi-day schedule
                                                  planner (M4-14 detail
                                                  below)
  -----------------------------------------------------------------------

### Mandatory scheduling tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M4-T01                  Assign one game to an   Assignment succeeds
                          available table         

  M4-T02                  Assign two simultaneous Second assignment
                          games to one table      rejected

  M4-T03                  Assign one team to      Conflict detected
                          simultaneous games      

  M4-T04                  Assign judge to         Conflict detected
                          overlapping games       

  M4-T05                  Schedule game during    Rejected
                          lunch break             

  M4-T06                  Schedule incompatible   Rejected
                          category on table       

  M4-T07                  Apply minimum rest      Constraint respected
                          interval                

  M4-T08                  Generate schedule with  Clear infeasibility
                          insufficient capacity   report

  M4-T09                  Regenerate schedule     Locked games remain
                          with locked games       unchanged

  M4-T10                  Schedule games across   All assignments retain
                          two days                correct dates

  M4-T11                  Move game to another    Conflicts re-evaluated
                          table                   

  M4-T12                  Two administrators edit Concurrent change
                          same schedule           detected
  -----------------------------------------------------------------------

### Scheduler fairness fixture

Input:

``` text
Teams: 12
Tables: 3
Rounds: 2
Games per team per round: 1
Duration per game: 15 minutes
Available time: 120 minutes
```

Expected:

-   24 total games.
-   8 slots of 15 minutes.
-   3 simultaneous games per slot.
-   Every team appears exactly twice.
-   No team is assigned simultaneously.
-   No table is double-booked.

The scheduler must produce a valid solution, but does not need to
produce one specific team ordering.

**Exit criteria:** All conflict tests pass and the scheduling engine
generates a complete valid schedule for the test fixture.

### M4-14 --- Multi-day schedule planner

**Status:** Implemented (P0–P3; see `docs/specifications/M4-tables-and-scheduling.md`)\
**Objective:** Give managers one overview of every competition day, in
which they can plan and rearrange the competition and everything around
it, and give staff, coaches and the public a read-only view of the same
schedule.

The planner shows **all competition days next to one another**. Each
day is a group of columns, **one column per category**, followed by the
event's **custom columns** (e.g. visitors, coaches); **rows are time of
day** on an axis shared by all days. It holds two kinds of blocks:

-   **Competition blocks** are the phases of a round:
    maintenance/practice, an optional robot check, and the scoring run.
    Each phase is its own block in the round's category column with its
    own day, start time and duration, so other blocks (e.g. lunch) can
    sit between them and they can be on different days. Only their order
    is checked. Rounds are never created or deleted in the planner.
-   **Custom blocks** are anything else (registration, opening ceremony,
    lunch, judges' briefing, award ceremony). They have a custom title,
    place, color and responsibility (free text), can cover one, several
    or all columns (categories and custom columns), and can be moved,
    resized and inserted freely.

Times are local times of day on a competition day, like
`competition_days.date`: no time zone conversion. Game order within a
scoring phase stays table + sequence (M4); the planner does not assign
times to individual games.

#### Data model (proposed)

  ------------------------------------------------------------------------------
  Collection / field              Purpose
  ------------------------------  ----------------------------------------------
  competition_days.starts_at,     Local time of day (HH:MM) bounding the
  competition_days.ends_at        planner's time axis for that day. Defaults
                                  08:00 and 18:00; ends_at is after starts_at.

  round_phases                    One phase of a round: round, phase
                                  (maintenance, check, scoring), day, starts_at
                                  (HH:MM), duration_minutes. A scoring record
                                  exists for every round, a maintenance record
                                  while testing_minutes > 0, a check record only
                                  if the round has a robot check. Empty day or
                                  starts_at means the phase is unplaced. At most
                                  one record per round and phase.

  rounds.testing_minutes,         Kept (M4) as the default durations of new
  rounds.scoring_minutes          phase records and mirrored from the placed
                                  phases, so existing consumers keep working.

  rounds.day                      Follows the day of the round's scoring phase,
                                  so judging (M5) and the public day logic (M6)
                                  keep working.

  schedule_blocks                 Custom blocks: event, day, starts_at,
                                  duration_minutes, title (required), place,
                                  color, responsibility (free text), categories
                                  and custom columns covered (both empty = all
                                  columns), public (bool).

  schedule_columns                Custom columns of an event next to the
                                  categories (e.g. visitors, coaches): name
                                  (unique per event), position, public (bool).
  ------------------------------------------------------------------------------

#### Requirements

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M4-14-01   Day time window       P0    Each competition day has a start and
                                         end time; the planner's time axis
                                         covers exactly that window.

  M4-14-02   Independent phases    P0    Maintenance/practice, robot check and
                                         scoring of a round are separate blocks,
                                         each with its own day, start time and
                                         duration. Other blocks (e.g. lunch) can
                                         sit between them, and they can be on
                                         different days.

  M4-14-03   Custom blocks         P0    Managers can create blocks with title,
                                         day, start, duration, place, color,
                                         responsibility and the category columns
                                         it covers.

  M4-14-04   Block visibility      P1    Each custom block is internal (staff
                                         only) or public; competition blocks
                                         follow the event's publication state.

  M4-14-05   Planner grid          P0    All competition days are shown next to
                                         one another in date order. Each day is
                                         a group of columns, one per event
                                         category in category order; rows are
                                         time of day at 15-minute gridlines,
                                         covering the earliest start to the
                                         latest end of all day windows. Times
                                         outside a day's own window are shaded.

  M4-14-06   Competition blocks    P0    Every placed phase appears in its
                                         round's category column on its day,
                                         labelled with round name, phase and
                                         times. Phases of one round share a
                                         visual marker, and hovering or
                                         selecting one highlights its siblings.

  M4-14-07   Multi-column blocks   P0    A custom block covering all or several
                                         adjacent categories spans those
                                         columns; non-adjacent selections render
                                         one segment per column.

  M4-14-08   Overlap layout        P1    Overlapping blocks in one column are
                                         shown side by side; no block is hidden
                                         behind another.

  M4-14-09   Unplanned tray        P0    Rounds with unplaced phases are listed
                                         beside the grid, grouped by category,
                                         showing each unplaced phase; each can
                                         be dragged into its column.

  M4-14-10   Now indicator         P2    On the current day a line marks the
                                         current local time.

  M4-14-11   Move by drag          P0    Dragging a block changes its start
                                         time, snapping to 5 minutes, and moves
                                         only that block. Holding a modifier (or
                                         choosing 'move with later phases') also
                                         moves the round's later phases, keeping
                                         their gaps. Phases stay in their
                                         category column; custom blocks can
                                         change columns.

  M4-14-12   Resize by drag        P0    Dragging a block's lower edge changes
                                         only that block's duration; no other
                                         block moves. Minimums are enforced.

  M4-14-13   Robot check           P0    A robot check can be added to a round
                                         (default 10 minutes; it appears in the
                                         unplanned tray to be placed) or
                                         removed; removing it leaves the other
                                         phases where they are.

  M4-14-14   Move across days      P0    Any block can be dragged into the
                                         matching column of another day (or
                                         moved via the form); a round's phases
                                         may end up on different days. A round's
                                         games keep their tables and sequences.

  M4-14-15   Create in place       P0    Clicking or dragging over empty grid
                                         space opens a new custom block
                                         prefilled with that column, start and
                                         duration.

  M4-14-16   Deep links            P0    Every block has a stable URL that opens
                                         the planner scrolled to the block with
                                         its edit form; it survives reload and
                                         can be shared. Round links reach the
                                         round settings and back.

  M4-14-17   Accessible editing    P1    Every drag operation is also possible
                                         through form fields and the keyboard;
                                         dragging works with touch on tablets.

  M4-14-18   Delete, duplicate,    P1    Custom blocks can be deleted (with
             unplan                      confirmation) and duplicated to the
                                         same or another day. Rounds are never
                                         deleted from the planner; they can be
                                         unplanned.

  M4-14-19   Concurrent edits      P0    Every write carries the loaded version;
                                         a stale write returns 409, the planner
                                         reloads and says why. Other open
                                         planners update through the live
                                         revision.

  M4-14-20   Phase order           P0    A round whose phases are not in the
                                         order maintenance/practice, robot
                                         check, scoring, or that overlap one
                                         another, produces a phase_order issue.
                                         Gaps between phases are always allowed.

  M4-14-21   Category overlap      P0    Overlapping phases of different rounds
                                         of the same category produce a
                                         round_overlap issue on both blocks and
                                         in schedule validation.

  M4-14-22   Table overlap         P0    Overlapping scoring phases or robot
                                         checks of rounds whose games use the
                                         same table produce a table_overlap
                                         issue.

  M4-14-23   Judge overlap         P1    Overlapping scoring phases on different
                                         tables with the same fixed judge
                                         produce a judge_overlap issue.

  M4-14-24   Outside day window    P1    A block that extends beyond its day's
                                         window produces an outside_day issue;
                                         no block crosses midnight.

  M4-14-25   Free custom blocks    P0    Custom blocks never cause conflicts and
                                         may overlap anything.

  M4-14-26   Read-only schedule    P0    Event staff and coaches of published
                                         events see the same grid without
                                         editing controls; deep links open a
                                         read-only detail panel.

  M4-14-27   Public schedule       P1    Public pages show the same all-days
                                         grid with public blocks only, scrolled
                                         to the current day (M6-09 rule); TV
                                         mode shows the current day only.
                                         Extends M6-04 and M6-07.

  M4-14-28   Column filter         P1    Viewers can hide category columns and
                                         days; coaches start with their own
                                         teams' categories.

  M4-14-29   Live updates          P0    Planner changes increase the event's
                                         live revision; every open view reloads
                                         as in M6.

  M4-14-30   Times elsewhere       P1    The judge dashboard and coaches' My
                                         teams show round start times where set.

  M4-14-31   Print                 P2    A day prints legibly on one A4
                                         landscape page per day.

  M4-14-32   Undo                  P3    The last planner change can be undone.

  M4-14-33   Custom columns        P0    Managers can add, rename, reorder and
                                         delete custom columns (e.g. visitors,
                                         coaches) shown after the categories on
                                         every day; custom blocks can be placed
                                         in and dragged into them. Internal
                                         columns are staff only; a column with
                                         blocks cannot be deleted.
  ------------------------------------------------------------------------------

Minimum durations: 1 minute for every phase (a round without
maintenance has no maintenance block), custom blocks 5 minutes. Issues from
M4-14-20 to M4-14-24 are warnings shown on the blocks and returned by
schedule validation; they do not block saving, so managers can rearrange
through intermediate states.

#### Access

  Role                                    Planner
  --------------------------------------- ------------------------------
  Admin, event manager                    Edit
  Event staff (judges, head judges)       Read, internal blocks included
  Coach (published event)                 Read, public blocks only
  Public (published event)                Read, public blocks only

#### Tests

  ------------------------------------------------------------------------------
  Test ID      Scenario                        Expected result
  -----------  ------------------------------  ---------------------------------
  M4-14-T01    Place maintenance at 09:00 (30  Maintenance 09:00-09:30, scoring
               min) and scoring at 09:30 (60   09:30-10:30; no issue
               min)

  M4-14-T02    Drag that scoring block to      Scoring 10:00-11:00; maintenance
               10:00                           unchanged

  M4-14-T03    Extend the scoring block by 15  Scoring duration 75; nothing else
               min                             moves

  M4-14-T04    Extend the T01 maintenance      Maintenance 09:00-09:45; scoring
               block by 15 min                 unchanged; phase_order issue

  M4-14-T05    Resize scoring below 1 min or   Rejected; block keeps its
               a custom block below 5 min      previous size

  M4-14-T06    Create Lunch block covering     Spans all columns; title, place,
               all categories                  color and responsibility stored

  M4-14-T07    Move custom block to another    Categories, day and time stored
               column and day                  as dropped

  M4-14-T08    Move a round's scoring block    Scoring on day 2, maintenance on
               to the next day                 day 1, rounds.day is day 2, games
                                               unchanged

  M4-14-T09    Open a block deep link in a     Planner opens on that day with
               fresh session                   the block's form

  M4-14-T10    Open a deep link to a deleted   Not-found notice; planner still
               block                           opens

  M4-14-T11    Overlap two rounds of one       round_overlap issue on both
               category

  M4-14-T12    Overlap scoring phases sharing  table_overlap issue
               a table

  M4-14-T13    Extend a block past the day's   outside_day issue
               end

  M4-14-T14    Shrink a day window below       Blocks kept and flagged
               existing blocks                 outside_day

  M4-14-T15    Two managers move the same      Second write gets 409; planner
               block                           reloads

  M4-14-T16    Overlap two custom blocks       Both visible side by side; no
                                               issue

  M4-14-T17    Unplan a round's scoring block  Scoring in the tray; other phases
                                               and games unchanged

  M4-14-T18    Coach or judge opens planner    No editing controls; direct API
                                               writes rejected

  M4-14-T19    Public schedule with an         Internal block absent from the
               internal block                  public payload

  M4-14-T20    Edit a block while a TV         Display shows the change after
               display is open                 the live revision

  M4-14-T21    Add a robot check to the T01    10 min check in the tray; other
               round                           phases unchanged

  M4-14-T22    Place the check at 12:30 after  All stored as placed; no issue
               a 11:30-12:30 lunch block and
               scoring at 12:45

  M4-14-T23    Remove the robot check          Check record gone; maintenance
                                               and scoring unchanged

  M4-14-T24    Open the planner for a three-   All three days shown side by side
               day event                       in date order

  M4-14-T25    Days with different windows     Shared axis 08:00-18:00; second
               (08:00-18:00, 09:00-15:00)      day shaded outside its window

  M4-14-T26    Place scoring before            phase_order issue on the round
               maintenance

  M4-14-T27    Drag maintenance 30 min later   All phases move 30 min; gaps
               with 'move with later phases'   unchanged

  M4-14-T28    Add a Visitors column and       Column after the categories;
               create a block in it            block stored with that column

  M4-14-T29    Delete a column that still has  Refused until the block is moved
               a block                         or deleted

  M4-14-T30    Coach opens a planner with an   Judges column and its blocks not
               internal Judges column          shown
  ------------------------------------------------------------------------------

#### Out of scope

-   Clock times for individual games inside a scoring phase.
-   Automatic placement of rounds in time by the schedule generator.
-   Calendar (iCal) export.

#### Decisions

The proposed answers to the review questions were adopted:

1.  **Category overlap** is a warning, not a rejection.
2.  **Event-wide blocks** (no category selected) span all columns.
3.  **Colors** come from a fixed palette that works in light and dark
    mode.
4.  **Devices:** editing on tablets and desktops; phones are read-only
    and the days scroll horizontally.
5.  **Split phases:** one block per phase; a split phase is a possible
    later extension.

**Exit criteria:** All P0 requirements and M4-14 tests pass; a manager
can plan a two-day event with three categories entirely in the planner,
and coaches and TV mode show the result.

------------------------------------------------------------------------

## 7. M5 --- Judge interface and scoring workflow

**Priority:** P0\
**Objective:** Deliver a functional interface for judges to conduct and
score games.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M5-01                   Judge dashboard         Displays assigned games

  M5-02                   Assignment filtering    Games can be filtered
                                                  by day and table

  M5-03                   Game identification     Correct team, round and
                                                  table are displayed

  M5-04                   Dynamic score sheet     UI is generated from
                                                  category configuration

  M5-05                   Score entry             Judges can enter all
                                                  supported criterion
                                                  types

  M5-06                   Live score calculation  Score updates
                                                  immediately

  M5-07                   Stopwatch               Start, pause and stop
                                                  are supported

  M5-08                   Manual time entry       Judges can correct
                                                  recorded times

  M5-09                   Autosave                Draft scores survive
                                                  page reload

  M5-10                   Submission              Scores can be submitted

  M5-11                   Validation              Authorized users can
                                                  approve or reject

  M5-12                   Score correction        Corrections require
                                                  authorization and
                                                  reason

  M5-13                   Audit history           All score changes are
                                                  traceable

  M5-14                   Offline support         Draft scores
                                                  synchronize when online

  M5-15                   Guided robot check      Rounds with a robot
                                                  check appear on the
                                                  judge dashboard; the
                                                  check steps through the
                                                  table's teams with
                                                  their documents
  -----------------------------------------------------------------------

### Mandatory workflow tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M5-T01                  Judge logs in           Judge dashboard shown

  M5-T02                  Judge opens assigned    Correct game displayed
                          game                    

  M5-T03                  Judge opens unassigned  Access denied
                          game                    

  M5-T04                  Enter additive score    Correct live total

  M5-T05                  Change exclusive option Previous option
                                                  deselected

  M5-T06                  Start and stop          Correct duration
                          stopwatch               recorded

  M5-T07                  Reload page with        Draft restored
                          unsaved draft           

  M5-T08                  Submit valid score      Status changes to
                          sheet                   submitted

  M5-T09                  Submit incomplete       Submission rejected
                          required criteria       

  M5-T10                  Head judge approves     Status changes to
                          score                   finalized

  M5-T11                  Judge changes finalized Change denied
                          score                   

  M5-T12                  Authorized correction   Old and new values
                                                  recorded

  M5-T13                  Disconnect during       Draft remains available
                          scoring                 

  M5-T14                  Reconnect               Draft synchronizes

  M5-T15                  Round has a robot check Check block on the
                                                  dashboard; guided check
                                                  shows each team's
                                                  documents in order

  M5-T15                  Synchronize outdated    Finalized score is not
                          draft                   overwritten
  -----------------------------------------------------------------------

### Usability acceptance criteria

-   A judge can access an assigned game within two interactions after
    login.
-   Score changes require no page reload.
-   The current total is always visible.
-   Submission status is clearly displayed.
-   The interface is usable at a tablet viewport of 768 × 1024 pixels.
-   No critical scoring action depends on hover.

**Exit criteria:** A complete game can be scored, submitted, approved
and reflected in the ranking.

------------------------------------------------------------------------

## 8. M6 --- Live competition and public interface

**Priority:** P1\
**Objective:** Enable the platform to operate as the central information
source during an actual competition.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M6-01                   Live rankings           Rankings update after
                                                  finalized score changes

  M6-02                   Provisional rankings    Incomplete results can
                                                  be identified

  M6-03                   Public leaderboard      Published rankings are
                                                  publicly accessible

  M6-04                   Schedule display        Upcoming games and
                                                  tables are displayed

  M6-05                   TV mode                 Full-screen display is
                                                  supported

  M6-06                   Category filtering      Public can switch
                                                  categories

  M6-07                   Day filtering           Public can view
                                                  individual competition
                                                  days

  M6-08                   Competition progress    Completed and remaining
                                                  games are shown

  M6-09                   Multi-day continuation  Competition can resume
                                                  on another day

  M6-10                   Result publication      Admin controls when
                                                  official rankings are
                                                  published
  -----------------------------------------------------------------------

### Tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M6-T01                  Finalize score          Ranking updates

  M6-T02                  Change authorized score Ranking recalculated

  M6-T03                  Publish results         Public can access them

  M6-T04                  Unpublished results     Hidden from public

  M6-T05                  Filter category         Only selected category
                                                  displayed

  M6-T06                  Switch competition day  Correct games displayed

  M6-T07                  Open TV mode            No administration
                                                  controls visible

  M6-T08                  Restart event after     All existing results
                          overnight break         preserved

  M6-T09                  Refresh public          Current published data
                          leaderboard             retained
  -----------------------------------------------------------------------

**Exit criteria:** Judges, administrators and public displays can
operate simultaneously without inconsistent result states.

------------------------------------------------------------------------

## 9. M7 --- Communication, security and production readiness

**Priority:** P1\
**Objective:** Make the application suitable for deployment at an actual
WRO event.

### Tasks and acceptance criteria

  -----------------------------------------------------------------------
  ID                      Feature                 Acceptance criteria
  ----------------------- ----------------------- -----------------------
  M7-01                   Email service           Transactional emails
                                                  can be sent

  M7-02                   Email templates         Templates can be
                                                  configured

  M7-03                   Registration            Registration events
                          notifications           trigger emails

  M7-04                   Schedule notifications  Schedule changes can
                                                  trigger notifications

  M7-05                   CSV export              Teams, games and
                                                  results export
                                                  correctly

  M7-06                   XLSX export             Structured spreadsheets
                                                  are generated

  M7-07                   PDF results             Printable ranking
                                                  reports are generated

  M7-08                   Audit log               Important
                                                  administrative actions
                                                  are recorded

  M7-09                   Backup                  Database backup can be
                                                  created

  M7-10                   Recovery                Backup can be restored

  M7-11                   Security testing        Permission boundaries
                                                  are verified

  M7-12                   Load testing            Target concurrent users
                                                  are supported

  M7-13                   Monitoring              Errors and backend
                                                  availability are
                                                  observable

  M7-14                   Deployment              Production deployment
                                                  is reproducible
  -----------------------------------------------------------------------

**Status notes:** M7-12 (load testing with k6) is **deferred**: it is
not part of the first production release and does not block the M7 exit
criteria until it is scheduled again. M7-13 is specified in
`docs/specifications/M7-monitoring.md`.

### Tests

  -----------------------------------------------------------------------
  Test ID                 Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  M7-T01                  Submit registration     Confirmation email
                                                  delivered

  M7-T02                  Reset password          Reset email delivered

  M7-T03                  Change schedule         Affected participants
                                                  notified

  M7-T04                  Export ranking to CSV   Correct data and values

  M7-T05                  Export ranking to XLSX  Correct columns and
                                                  formatting

  M7-T06                  Generate PDF ranking    Correct category and
                                                  ranking

  M7-T07                  Create backup           Backup file is valid

  M7-T08                  Restore backup          Records and
                                                  relationships preserved

  M7-T09                  Unauthorized API        Access denied
                          request                 

  M7-T10                  Concurrent score        No lost or silently
                          submissions             overwritten updates

  M7-T11                  Simulate server restart Application recovers

  M7-T12                  Simulate email provider Failure recorded and
                          failure                 retry policy applied
  -----------------------------------------------------------------------

**Exit criteria:** Production deployment, backup restoration, security
and operational tests all pass. Load testing (M7-12) is deferred.

------------------------------------------------------------------------

## 10. M8 --- Prototype feedback (P1 user tests)

**Priority:** P1\
**Objective:** Act on the findings of the first user tests with the p1
prototype: simplify roles and onboarding, make event setup repeatable,
and give managers one direct board for table, team and judge assignment.

### Tracking

-   [x] **M8-A** Remove the coach role from the product (M8-01 to M8-04; M8-05 is P3, not
    scheduled)
-   [x] **M8-B** Judge onboarding by CSV invitation, with a development
    email outbox (M8-06 to M8-12)
-   [x] **M8-C** Admin "view as" role switch (M8-13 to M8-18)
-   [x] **M8-D** Event setup flow and event templates (M8-19 to M8-24)
-   [x] **M8-E** Kanban board for tables, teams and judges (M8-25 to
    M8-33)

### M8-A --- Removal of the coach role

**Status:** M8-01 to M8-04 implemented (see `docs/specifications/M1-teams.md`). Decisions: the
team keeps an optional **contact** (stored in `coach_name` / `coach_email`) that receives schedule
emails when set; registration-status emails are retired; teams are **Active** or **Withdrawn**;
public sign-up stays. Open question 1 is settled: former coach accounts are kept, but grant
nothing.

Teams are created only by CSV import (M1-12). Coaches no longer have
accounts. The `coach` role stays in the data model, dormant, so existing
records and migrations remain valid; it is removed from everything users
see. Pulling teams from an external registration system over an API is a
later extension (M8-05).

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M8-01      No coach in the UI    P1    No page, menu, role picker, email
                                         template, translation string or help
                                         text mentions coaches. Admins cannot
                                         grant the coach role.

  M8-02      No self registration  P1    Team registration and submission pages
                                         (M1-10) and the approval queue (M1-11)
                                         are removed. Imported teams are active
                                         right away.

  M8-03      CSV is the team       P1    The team list leads with CSV import;
             source                      teams can still be edited and deleted
                                         one by one. Import reports invalid
                                         rows as in M1-T10.

  M8-04      Coach access paths    P1    Coach-only routes and views (My teams,
             retired                     coach schedule view, coach access to
                                         team documents) are removed. Rules that
                                         grant coach access are removed or
                                         disabled, and API tests confirm a
                                         leftover coach account sees nothing
                                         beyond public data.

  M8-05      Team API import       P3    Teams are pulled from an external
                                         source over an API, mapped to the CSV
                                         import's fields and validation. Not
                                         scheduled; the CSV import's field
                                         mapping is kept reusable for it.
  ------------------------------------------------------------------------------

**Affected earlier requirements:** M1-10, M1-11 and tests M1-T08,
M1-T09 and M1-T11 are retired. The coach parts of M1-13, M4-14-26,
M4-14-28, M4-14-30 and the M4-14 access table no longer apply; public
read access is unchanged.

### M8-B --- Judge invitations

**Status:** Implemented (see `docs/specifications/M8-invitations.md`). Event managers invite
judges and head judges from the event's Staff tab; admins also event managers. Links are valid
for 14 days and single-use.

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M8-06      Judge CSV upload      P1    An event manager uploads a CSV with
                                         name and email (optional: role judge
                                         or head judge). A preview lists new,
                                         existing and invalid rows before
                                         anything is saved.

  M8-07      Account and role      P1    Confirming creates an account for each
                                         new email and grants the judge role for
                                         this event. Existing users only get the
                                         role; duplicate emails in the file are
                                         merged.

  M8-08      Invitation email      P1    Every new judge gets an invitation
                                         email with a single-use, expiring link
                                         to set a password. Existing users get a
                                         "you were added to event X" email.

  M8-09      Invitation status     P1    The judge list shows invited, accepted
                                         and expired; managers can resend an
                                         invitation or revoke it.

  M8-10      Accept invitation     P1    Opening the link, setting a password
                                         and logging in takes the judge
                                         straight to their dashboard; the email
                                         counts as verified (M1-02).

  M8-11      Mock email outbox     P1    In development and test, emails are
                                         not delivered but stored. An outbox
                                         page (admins only, absent in
                                         production builds) lists every sent
                                         email with recipient, subject, time
                                         and rendered body, and links in it
                                         work.

  M8-12      Outbox in tests       P2    E2E tests can read the outbox (API or
                                         fixture) to follow invitation and
                                         password reset links.
  ------------------------------------------------------------------------------

Production delivery uses the email service of M7-01; the outbox is a
transport that replaces it, selected by configuration.

### M8-C --- Admin "view as" role switch

**Status:** M8-13 to M8-18 implemented (see `docs/specifications/M8-view-as.md`). The switch
issues a real token for the admin's stand-in account (holding only the chosen role) or, for a
specific person, that person's account read-only; the hotkey is Alt+Shift+V and sessions last
4 hours.

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M8-13      Role switch           P1    An admin can view the app as an event
                                         manager, head judge or judge of a
                                         chosen event, from a button in the
                                         header or a hotkey.

  M8-14      Effective permissions P1    While switched, the API applies the
                                         permissions of the chosen role, not the
                                         admin's: what is hidden in the UI is
                                         also denied by the API.

  M8-15      Visible state         P1    A persistent banner shows the active
                                         role and event with an exit button; the
                                         same hotkey returns to admin.

  M8-16      Optional persona      P2    The admin can view as a specific judge
                                         to see exactly that judge's
                                         assignments.

  M8-17      Audit                 P1    Starting and ending a switch, and every
                                         write made while switched, are recorded
                                         in the audit log (M7-08) under the
                                         admin's own account.

  M8-18      Admins only           P1    Only admins can switch; the switch
                                         cannot be used to gain rights the admin
                                         does not already have.
  ------------------------------------------------------------------------------

### M8-D --- Event setup flow and templates

**Status:** M8-19 to M8-24 implemented (see `docs/specifications/M8-event-setup.md`). Open
question 4 is settled: rulesets are copied into the template, not referenced by version.

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M8-19      Setup user stories    P1    The admin and event manager stories for
                                         setting up a new event are written down
                                         (spec in docs/specifications), from
                                         creating the event to a published
                                         schedule, based on the user test notes.

  M8-20      Guided setup          P1    A new event opens a setup checklist
                                         (days, categories and rulesets, tables,
                                         rounds, teams, judges, schedule) that
                                         shows what is done and links to each
                                         step. Steps can be done in any order
                                         where the data allows it.

  M8-21      Save as template      P1    An event can be saved as a template:
                                         days pattern, categories with
                                         rulesets, rounds, tables, planner
                                         custom columns and blocks. Teams,
                                         judges, games and scores are never
                                         included.

  M8-22      Template file         P1    A template downloads as a versioned
                                         file (JSON) and can be uploaded again,
                                         on the same or another installation.
                                         Invalid or newer-version files are
                                         rejected with a clear reason.

  M8-23      New event from        P1    Creating an event from a template asks
             template                    for name and first day; all dates shift
                                         relative to it. The new event is
                                         independent of the template.

  M8-24      Template library      P2    Uploaded templates are kept in a list
                                         admins can rename and delete.
  ------------------------------------------------------------------------------

### M8-E --- Kanban board for tables, teams and judges

**Status:** M8-25 to M8-33 implemented (see `docs/specifications/M8-board.md`). Decisions: the
number of judge slots is set **per category** (default 2) and every judge of a table scores its
games; the board gives each table **one category** (others appear as unsorted); started games stay
locked in place.

The board becomes the master view for creating tables and assigning
teams and judges to them. It complements the multi-day planner (M4-14),
which stays responsible for time.

Layout:

-   **Columns** are tables, grouped by category. Each group starts with
    a category divider.
-   **Judge rows** come first: two rows by default, up to the number of
    judges configured per table.
-   **Team rows** follow, in table order 1 (sequence), each consecutive round rotates by one slot. -> The board adjusts all rounds of all categories at once by default; a toggle allows editing one round only.

  ------------------------------------------------------------------------------
  ID         Feature               Pri   Acceptance criteria
  ---------  --------------------  ----  ---------------------------------------
  M8-25      Board view            P1    The board shows all tables of an event
                                         as columns grouped by category, each
                                         with its judges and its teams in
                                         sequence order.

  M8-26      Create tables         P1    A column can be added at the end of any
                                         category group, renamed and
                                         deactivated from the board (M4-01).

  M8-27      Category dividers     P1    Dragging a category divider across
                                         tables moves those tables into the
                                         neighbouring category (M4-02). Moving a
                                         table that already has teams of the
                                         old category asks for confirmation.

  M8-28      Move teams            P1    Teams can be dragged between tables and
                                         reordered within one. Moving a team to
                                         a table of another category is not
                                         allowed.

  M8-29      Move judges           P1    Judges can be dragged from an
                                         unassigned tray onto a judge slot and
                                         between tables; a judge assigned to
                                         two tables at once produces a conflict
                                         warning (M4-09).

  M8-30      Unassigned trays      P1    Teams and judges without a table are
                                         listed beside the board, filterable by
                                         category.

  M8-31      Round scope           P1    The board edits the assignments of all rounds
                                         at once by default; a toggle allows
                                         editing one round only.

  M8-32      Concurrent edits      P1    Writes carry the loaded version as in
                                         M4-14-19; stale writes reload the
                                         board, and other open boards update
                                         live.

  M8-33      Accessible editing    P2    Every drag action is also possible by
                                         keyboard and menu; dragging works with
                                         touch on tablets.
  ------------------------------------------------------------------------------

### Tests

  ------------------------------------------------------------------------------
  Test ID    Scenario                         Expected result
  ---------  -------------------------------  ----------------------------------
  M8-T01     Search the UI and translations   No user-facing mention found
             for "coach"

  M8-T02     Leftover coach account calls     Only public data returned
             team and document APIs

  M8-T03     Import teams from CSV            Teams are active without approval

  M8-T04     Upload a judge CSV with one      Preview shows 1 new, 1 existing,
             new, one existing and one        1 invalid; confirm creates one
             invalid row                      account and two roles

  M8-T05     Follow the invitation link from  Password set; judge dashboard
             the outbox                       shown

  M8-T06     Open an expired or used          Rejected with a resend hint
             invitation link

  M8-T07     Open the outbox in a production  Route and API absent
             build

  M8-T08     Admin switches to judge with     Judge dashboard shown; banner
             the hotkey                       visible

  M8-T09     While switched to judge, call    Denied by the API
             an event manager API

  M8-T10     Write while switched             Audit entry under the admin with
                                              the effective role

  M8-T11     Non-admin tries to switch        Denied

  M8-T12     Save an event as template and    Template has no teams, judges,
             download it                      games or scores

  M8-T13     Create an event from the         Same categories, rulesets, rounds,
             uploaded template with a new     tables and blocks; dates shifted
             start date

  M8-T14     Upload a malformed or            Rejected with a reason
             newer-version template

  M8-T15     Drag a team to another table of  Assignment and sequence stored
             the same category

  M8-T16     Drag a team to a table of        Drop refused
             another category

  M8-T17     Drag a category divider over a   Table moves category after
             table with teams                 confirmation

  M8-T18     Assign one judge to two tables   Conflict warning shown
             in the same round

  M8-T19     Two managers move the same team  Second write gets 409; board
                                              reloads
  ------------------------------------------------------------------------------

### Open questions

1.  **Coach data:** Are existing coach accounts deleted, or kept dormant
    until the API import (M8-05) defines who owns teams?
2.  **Judges per table:** Is the maximum number of judge slots per table
    set per event or per category? *Settled: per category (M8-E).*
3.  **Board and rounds:** Do most events keep the same table
    assignment for every round, so the board should edit all rounds at
    once by default? *Settled: yes, with a one-slot rotation per round
    and a toggle for one round (M8-E).*
4.  **Templates:** Should rulesets in a template be referenced by
    version or copied, when the template is used on another
    installation? *Settled: copied (M8-D).*

**Exit criteria:** All P1 requirements and M8 tests pass. A tester can
set up an event from a template, import teams and invite judges by CSV,
assign everything on the board, and check each role's view through the
admin role switch, with no mention of coaches.

------------------------------------------------------------------------

## 11. Cross-project quality requirements

These requirements apply to every milestone.

### Test coverage targets

Coverage is a supporting metric, not a substitute for meaningful test
cases.

  Area                                          Minimum target
  ------------------------- ----------------------------------
  Scoring engine                             95% line coverage
  Ranking engine                             95% line coverage
  Scheduling engine                          90% line coverage
  Backend services                           80% line coverage
  Frontend components                        70% line coverage
  Critical user workflows     100% of defined workflows tested

Critical calculations should also have branch coverage and
property-based tests.

### Required test layers

  Layer             Suggested tool                      Purpose
  ----------------- ----------------------------------- -------------------------------
  Unit              Vitest                              Pure business logic
  Integration       Vitest + PocketBase test instance   Database and API
  E2E               Playwright                          Complete user workflows
  API security      Automated API tests                 Permission enforcement
  Load              k6                                  Concurrent users and requests
  Static analysis   TypeScript / ESLint                 Code quality

### System invariants

The following properties must be continuously checked:

1.  A finalized score cannot change without an authorized correction.
2.  A game cannot have more than one active team assignment.
3.  A table cannot host overlapping games.
4.  A judge cannot have overlapping assignments.
5.  A ranking result must be reproducible from its source scores and
    ruleset.
6.  A selected points result retains its associated time.
7.  Changing a template does not mutate historical competition results.
8.  An unauthorized user cannot read or modify restricted competition
    data.

------------------------------------------------------------------------

## 12. Definition of Done

A task may only be marked complete when all applicable conditions are
satisfied.

-   [ ] Implementation merged into the main branch.
-   [ ] Acceptance criteria fulfilled.
-   [ ] Unit tests pass.
-   [ ] Integration tests pass where applicable.
-   [ ] E2E tests pass where applicable.
-   [ ] No unresolved critical or high-severity bugs.
-   [ ] Permissions verified.
-   [ ] Documentation updated.
-   [ ] Manual verification completed.
-   [ ] Test evidence linked to the task.

A task is not complete merely because its code has been merged. Its
acceptance tests must also pass.

------------------------------------------------------------------------

## 13. Project tracking model

Track progress at three levels:

-   **Milestone:** Overall delivery stage.
-   **Task:** Individual development unit.
-   **Acceptance criterion:** Independently verifiable requirement.

### Task statuses

  Status        Meaning
  ------------- -------------------------------
  Backlog       Not yet started
  Ready         Requirements clarified
  In progress   Currently being implemented
  In review     Awaiting code review
  Testing       Acceptance tests underway
  Blocked       Cannot proceed
  Done          All completion conditions met

### Recommended task fields

  Field                 Example
  --------------------- -----------------------
  ID                    M3-08
  Title                 Implement BEST_BY
  Milestone             M3
  Priority              P0
  Status                Testing
  Assignee              Developer
  Acceptance criteria   AC-M3-08-01
  Test cases            M3-T05, M3-T06
  Dependencies          M2 complete
  Evidence              CI run / pull request
  Estimated effort      Developer estimate

### Project KPIs

  KPI                                   Target
  ----------------------------------- --------
  P0 acceptance criteria passed           100%
  Critical calculation tests passed       100%
  Critical workflow tests passed          100%
  Unauthorized access tests passed        100%
  Open critical bugs                         0
  Historical score integrity              100%
  Automated test execution in CI          100%

------------------------------------------------------------------------

## 14. Suggested repository structure

Keep business logic independent of the user interface.

``` text
wro-platform/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── events/
│   │   │   │   ├── teams/
│   │   │   │   ├── categories/
│   │   │   │   ├── scoring/
│   │   │   │   ├── rankings/
│   │   │   │   ├── scheduling/
│   │   │   │   ├── judging/
│   │   │   │   └── administration/
│   │   │   └── shared/
│   │   └── tests/
│   └── backend/
│       ├── migrations/
│       ├── hooks/
│       └── tests/
├── packages/
│   ├── scoring-engine/
│   ├── ranking-engine/
│   ├── scheduling-engine/
│   ├── domain-types/
│   └── validation/
├── e2e/
│   ├── registration/
│   ├── scoring/
│   ├── scheduling/
│   └── rankings/
├── docs/
│   ├── architecture/
│   ├── specifications/
│   ├── api/
│   └── test-plans/
└── docker-compose.yml
```

------------------------------------------------------------------------

## 15. Recommended implementation order

Do not begin by building the full dashboard or registration experience.
First validate the three riskiest parts of the application with vertical
slices.

### Vertical slice 1 --- Scoring prototype

-   Configure a category.
-   Create scoring criteria.
-   Evaluate a game score.
-   Verify additive, exclusive, deduction and conditional criteria.
-   Test invalid configurations.

### Vertical slice 2 --- Ranking prototype

-   Create three rounds.
-   Enter sample scores and times.
-   Verify ADD, MAX, MIN and DIFFERENCE.
-   Verify BEST_BY and points/time association.
-   Verify tie-breaking and calculation explanations.

### Vertical slice 3 --- Competition prototype

-   Create teams and tables.
-   Generate or manually create a schedule.
-   Assign a judge.
-   Execute and score a game.
-   Submit and finalize the result.
-   Verify the ranking updates correctly.

These prototypes validate the core domain model before significant
investment in the complete user interface.

------------------------------------------------------------------------

## 16. Key architectural decisions to resolve

The following questions should be settled before or during the relevant
implementation milestone:

1.  **Multiple games per round:** Can a team play multiple attempts in
    one round, with the round selecting the best, worst or sum of those
    attempts?
2.  **Team registration:** Can coaches register multiple teams under one
    account? *Superseded by M8-A: teams are imported, coaches have no
    accounts.*
3.  **Schedule generation:** Should the system support randomized
    assignments, balanced table distribution and predefined matchups?
4.  **Score approval:** Must every score require head-judge approval, or
    is approval configurable per category?
5.  **Ranking visibility:** Are provisional rankings publicly visible
    during competition?
6.  **Ruleset versioning:** Are categories versioned per competition
    year, with the ability to copy and modify a previous year's
    configuration?

Make these behaviours configurable where practical, while keeping the
initial implementation straightforward.

## 17. Primary implementation recommendation

Build and thoroughly test the scoring and ranking engines before
implementing the complete administration interface. They contain the
most complex business logic, and the rest of the application depends on
their correctness.

The first production milestone should be a complete vertical workflow:

**Register team → Schedule game → Assign judge → Score game → Validate
result → Calculate ranking.**

Once this works reliably, expand the platform with multi-day scheduling,
public displays, email communication and operational tooling.
