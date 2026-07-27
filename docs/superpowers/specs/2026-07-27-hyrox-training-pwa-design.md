# HYROX Training — Design Specification

**Date:** 2026-07-27
**Status:** Awaiting approval
**Author:** Design pass over the approved product brief

---

## 0. Preflight (complete)

| Tool | Detected | Verdict |
|---|---|---|
| Node.js | v24.18.0 (LTS) | ✅ |
| npm | 11.16.0 | ✅ |
| Git for Windows | 2.53.0.windows.3 | ✅ |
| Working directory | `...\Claude Cowork\HYROX` — was empty | ✅ no files to preserve |
| Git repo | initialized on `main` | ✅ |

No WSL, Docker, Visual Studio, or VS Code required.

**OneDrive mitigation (approved):** the repo lives in place. Before `npm install`, `node_modules` is created as a **directory junction** to `C:\dev\hyrox-node_modules`. OneDrive does not sync reparse points, so ~30k dependency files never enter the sync engine. `dist/`, `coverage/`, `playwright-report/`, and `test-results/` get the same treatment or are gitignored and small enough to ignore. A `scripts/setup-windows.ps1` performs this idempotently and is documented in the README.

---

## 1. Resolved ambiguities and deliberate decisions

The brief is near-complete. These are the points where it was silent, self-overlapping, or where a literal reading produced a worse product. Each is a decision, not a question.

| # | Issue in brief | Decision |
|---|---|---|
| D1 | Race date >24 weeks out had no rule (only <24 weeks warns) | **Approved:** Week 24 always anchors to race week. The gap before Week 1 is filled with generated, editable **Base** weeks (Easy run + Zone 2 + Strength maintenance + optional long run), capped at 8. Beyond 32 weeks total, plan start is simply deferred with a countdown. |
| D2 | "Symptoms elevated → repeat previous weight" applied globally would block bench press because of shin pain | Symptom gating is **symptom-specific**: `shinPain` gates high-impact, plyometric, and running-impact work; `sciaticPain` gates spinal-loading work (squat, deadlift, RDL, lunge, carry, sandbag). Upper-body pressing/pulling is never gated by shin pain. Reason strings name the gating symptom. |
| D3 | "No body-weight tracking" vs. the profile carrying a current weight | Profile weight is a **single editable scalar**, not a time series. It is used only as the load basis for `bodyWeight` and `bodyWeight+load` styles. No weight history table, no weight chart. |
| D4 | §19 anchors collide: "75% simulation in Week 18" and "near-full simulation ~6 weeks before race day" (also Week 18) | Treated as **one event**: Week 18 is a full-format simulation at 75% station volume, and it *is* the near-full simulation ~6 weeks out. The controlled full-format rehearsal is **Week 21** (3 weeks out). Weeks 19, 20, 22 contain no simulation, satisfying "do not schedule full simulations weekly". |
| D5 | Benchmark/taper weeks list fewer than 6 sessions | Session count is **per-week data**, not fixed at 6. Weeks 12, 16, 18, 21, 24 run 4–5 sessions by design. The four-session minimum still applies. |
| D6 | Units: profile in lb, HYROX standards in kg | Every load is stored as `{ value, unit }` — no hidden canonical conversion. Default unit is **lb for strength**, **kg for HYROX stations** (matching competition standards). Secondary equivalent is rendered in muted text (`152 kg · ~335 lb`). A per-exercise `defaultUnit` overrides; `custom` unit stores a free-text label and never converts. |
| D7 | Priority assignment for the 2 non-essential sessions of a 6-session week | Derived from §19's per-phase four-session lists: those four are `essential`. Of the remainder, **Zone 2 is always `optional`**; the sixth session is `important`. Stored explicitly in seed data, editable per workout. |
| D8 | 6 sessions + 1 rest day = zero slack, so any miss must displace something | Queue drops the lowest-priority *remaining* session of that week rather than pushing the week forward. Optional first, then important. Essential sessions never auto-drop; if an essential cannot fit the week it defers into the next week and that week's optional is dropped. |
| D9 | PWA update strategy vs. "never delete workout history" | `registerType: 'prompt'`. A new service worker never activates silently. An in-app card offers "Update now"; IndexedDB is never cleared by an update. Dexie migrations run on next open. |
| D10 | "Provide conservative training recommendations" vs. "do not automatically cancel workouts" | Recommendations are rendered as a dismissible/acceptable **substitution card** on the affected workout. Accepting mutates that instance's prescriptions only (never the template). Dismissing records the dismissal so it isn't re-offered for that instance. |
| D11 | Red-flag screening (bowel/bladder, saddle numbness, progressive weakness) shouldn't be asked after every workout | Asked **only** when sciatic ≥5 or the sciatic flag fires, as a three-checkbox screen. Any "yes" shows a persistent urgent card on Home until cleared by the user. Explicitly labelled not a diagnosis. |
| D12 | Estimated 1RM formula unspecified | **Epley** (`w × (1 + reps/30)`), computed only from sets with `reps ≤ 12` and at least 3 qualifying sessions. Labelled "estimated" everywhere. |
| D13 | Symptom "recent baseline" undefined | Baseline = mean of the 2nd-through-6th most recent symptom logs (up to 5 values, minimum 3 required). Flag when `latest − baseline ≥ 2`. Independent of the three-consecutive-≥3 rule. |
| D14 | Race prediction | No point prediction. A range appears **only** when a 5 km benchmark AND a compromised-km session AND a ≥75% simulation all exist. Rendered as `1:2X–1:3X (estimate)` with a plain-language basis line. Otherwise: "Not enough benchmark data yet." |
| D15 | §18's running milestones ("5 km under 27–28 min", "compromised km under 6:00/km") are constants calibrated to a sub-1:30 goal, but §2 requires changing the goal time to **recalculate milestones** | Running milestones are **derived from the active target time**, not hard-coded. §18's figures become the sub-1:30 instance of the formula. See §4.6. |
| D16 | Default race goal | **Approved change from the brief:** primary **1:35:00** (5700 s), stretch **1:30:00** (5400 s), replacing 1:30/1:25. Rationale in the note below. Both editable; milestones recalculate on change. |

**Why the default goal is 1:35 (D16).** The station and roxzone budget is largely fixed (§4.6), so the goal is set almost entirely by the compromised kilometre pace it demands. Sub-1:30 requires roughly 6:00/km compromised; sub-1:35 roughly 6:38/km; sub-1:40 roughly 7:15/km. For an athlete with a strong lifting base but a low current running volume, the 1:35 band is the one that is genuinely reachable across 24 weeks while leaving sub-1:40 as a floor rather than a goal, and sub-1:30 as a stretch. Strength is rarely the limiter in Men's Open — the sleds and carries favour a strong athlete — while body mass and running durability are.

> The specific figures this was calibrated against are personal health data and are deliberately **not** committed. They live in `docs/private/athlete-calibration.md`, which is gitignored. The application seeds no personal values either: the athlete profile is entered during onboarding and stored only in IndexedDB on the device.

The plan remains built to be honest: trajectory status is milestone-evidence-driven, so if running lags, Home names the specific milestone rather than flattering the athlete. The stretch goal is stored but never drives prescriptions.

---

## 2. Architecture

Local-first, no network after install. Three strictly separated layers:

```
┌─────────────────────────────────────────────────────────┐
│  UI  (React 19 + TypeScript strict)                     │
│  screens/ · components/ · hooks/                        │
│  Reads via typed hooks. Never touches Dexie directly.   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  DOMAIN  (pure TypeScript, zero I/O, zero React)        │
│  queue/ · recommendations/ · symptoms/ · pace/ ·         │
│  milestones/ · planGeneration/ · backup/                 │
│  Every function pure. `today` is always a parameter.    │
│  No Date.now(), no Math.random(). Fully unit-testable.  │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  DATA  (Dexie 4 over IndexedDB)                         │
│  db.ts · schema.ts · migrations/ · repositories/         │
│  Repositories enforce history immutability.             │
└─────────────────────────────────────────────────────────┘
```

**Why this shape.** Every hard requirement in §15, §9, §16, §18 is a scheduling or arithmetic rule. Putting them in pure functions with injected `today` makes all 23 required test cases plain input→output assertions with no database, no mocks, and no time faking. It also makes the rules explainable: each returns its reason strings alongside its result, which is what the UI renders.

**State management.** No Redux/Zustand. `dexie-react-hooks`' `useLiveQuery` gives reactive IndexedDB reads; IndexedDB *is* the store. React holds only ephemeral UI state (open sheets, focus). This directly satisfies "never store important state only in React memory".

**Derived queue.** The scheduled queue is not stored as truth. Truth = immutable plan definition + append-only `scheduleEvents` journal + `scheduleOverrides`. `recomputeQueue()` derives the current schedule from those. This is what makes backdating, resets, and manual overrides non-destructive by construction — recomputation cannot corrupt history because it never writes to it. The derived result is cached in `workoutInstances` for fast reads and invalidated on any event.

### Project structure

```
/
├─ .github/workflows/deploy.yml
├─ docs/superpowers/specs/, docs/superpowers/plans/
├─ scripts/  setup-windows.ps1 · generate-icons.mjs
├─ public/   icons (generated) · favicon.svg
├─ e2e/      3 Playwright specs
├─ src/
│  ├─ main.tsx · App.tsx · router.tsx
│  ├─ data/
│  │   ├─ db.ts · schema.ts · types.ts
│  │   ├─ migrations/  v1.ts · index.ts
│  │   ├─ repositories/  profile · plan · workout · logs · schedule · settings · timer
│  │   └─ seed/  exercises.ts · hyroxStandards.ts · plan24Week.ts · phases.ts · templates.ts
│  ├─ domain/
│  │   ├─ queue/       recompute.ts · eligibility.ts · recoveryMatrix.ts · explain.ts
│  │   ├─ recommendations/  strengthTarget.ts · increments.ts
│  │   ├─ symptoms/    evaluate.ts · substitutions.ts · redFlags.ts
│  │   ├─ pace/        pace.ts · intervals.ts
│  │   ├─ milestones/  evaluate.ts · trajectory.ts
│  │   ├─ planGeneration/  generate.ts · baseWeeks.ts · anchor.ts
│  │   ├─ strength/    oneRepMax.ts · personalBests.ts
│  │   ├─ units/       convert.ts · format.ts
│  │   └─ backup/      export.ts · import.ts · validate.ts
│  ├─ features/
│  │   ├─ onboarding/ home/ workout/ progress/ plan/ settings/ library/ timer/
│  ├─ components/  (ui primitives: Card, Button, Stepper, NumberField, Sheet,
│  │                Chip, StatusPill, SegmentedControl, EmptyState, ErrorBoundary…)
│  ├─ hooks/       useToday · useRestTimer · useActiveWorkout · useQueue …
│  └─ styles/      tokens.css · global.css
├─ vite.config.ts · vitest.config.ts · playwright.config.ts
├─ tsconfig.json (strict) · eslint.config.js
└─ README.md
```

Hard rule: **no file over ~250 lines**. Each screen composes small focused components. Seed plan data lives in `src/data/seed/`, never in a component (§19).

---

## 3. Data model

Dexie 4, database `hyrox-training`, schema version 1. `schemaVersion` is also written into `settings` and into every backup file for validation and forward migration.

### Separation of concerns (§21)

| Category | Tables | Mutability |
|---|---|---|
| Editable templates | `plans`, `planPhases`, `planWeeks`, `workoutTemplates`, `prescriptions`, `exercises`, `hyroxStandards` | freely editable |
| Future scheduled instances | `workoutInstances`, `instancePrescriptions` | editable while status ∈ {upcoming, available, inProgress} |
| Immutable completed history | `strengthSets`, `runLogs`, `intervalSplits`, `stationLogs`, `symptomLogs`, terminal `workoutInstances` | write-guarded; only an explicit history edit passes |
| User schedule intent | `scheduleEvents` (append-only), `scheduleOverrides` | events never mutated |
| Derived / transient | `queueExplanations`, `restTimerState`, `milestoneState` | recomputable, safe to discard |

### Tables

```ts
settings          id:'app' · schemaVersion · activePlanId · strengthUnit · stationUnit
                  · restSoundEnabled(false) · restVibrationEnabled(false)
                  · lastBackupAt · onboardingCompletedAt · dismissedSubstitutions[]
athleteProfile    id:'me' · age · heightIn · weightLb · bodyFatPct
                  · trainingBackground · considerations · updatedAt
raceGoal          id · raceDate · targetSeconds(5700 = 1:35) · stretchSeconds(5400 = 1:30)
                  · division('mens-open-singles') · isActive · createdAt
exercises         id · name · category · measurementType · loadStyle · defaultUnit
                  · defaultRestSec · progressionIncrement · incrementUnit
                  · defaultSets · repMin · repMax · defaultDistanceM · defaultDurationSec
                  · techniqueNotes · isArchived · isSeeded · createdAt · updatedAt
hyroxStandards    id · station · order · distanceM? · reps? · loadKg? · loadPerHandKg?
                  · targetHeightM? · ballKg? · notes · isSeeded          ← editable config
plans             id · name · weeksCount · status('active'|'archived') · sourcePlanId?
                  · startDate · raceGoalId · createdAt
planPhases        id · planId · name · weekStart · weekEnd · focus
planWeeks         id · planId · weekNumber · phaseId · label · isDeload · notes
workoutTemplates  id · planId · planWeekId · sessionSlot(1..6) · sequenceInWeek · name
                  · kind('strength'|'run'|'zone2'|'hybrid'|'simulation'|'race'|'recovery')
                  · priority('essential'|'important'|'optional')
                  · recoveryTags[] · estMinutes · notes · stationVolumePct?
prescriptions     id · templateId · exerciseId · order · sets? · repMin? · repMax?
                  · targetLoad? · loadUnit? · loadStyle? · distanceM? · durationSec?
                  · targetPaceSecPerKm? · restSec · intervalSpec? · notes?
workoutInstances  id · planId · templateId · weekNumber · sessionSlot · plannedDate
                  · scheduledDate · sequence · priority · recoveryTags[]
                  · status(upcoming|available|inProgress|completed|partiallyCompleted
                  ·         |deferred|skipped|autoDropped) · adjustmentReason? · isManualOverride
                  · startedAt? · completedAt? · completedForDate? · droppedAt?
                  · frozen(bool)
instancePrescriptions   snapshot of `prescriptions` + instanceId + sourcePrescriptionId
strengthSets      id · instanceId · instancePrescriptionId · exerciseId · setIndex
                  · weight? · unit? · reps? · rir? · isCompleted · completedAt · isWarmup
runLogs           id · instanceId · instancePrescriptionId? · distanceKm · durationSec
                  · paceSecPerKm? · surface · runType · notes · loggedAt
intervalSplits    id · runLogId · index · kind('warmup'|'work'|'recovery'|'cooldown')
                  · distanceM? · durationSec? · paceSecPerKm?
stationLogs       id · instanceId · instancePrescriptionId? · station · distanceM? · reps?
                  · load? · loadUnit? · sledWeightKg? · totalLoadKg? · surface?
                  · timeSec? · breaks? · setStructure? · rpe? · notes
symptomLogs       id · instanceId? · forDate · sessionRpe · shinPain · sciaticPain
                  · notes · loggedAt
scheduleEvents    id · at · type · instanceId? · payload(json)      ← APPEND-ONLY
                  type ∈ COMPLETE | COMPLETE_EARLIER | PARTIAL | DEFER | SKIP
                        | MOVE | RESET_RECOMMENDATIONS | PLAN_EDIT | RACE_DATE_CHANGE
scheduleOverrides id · instanceId · date · isPinned · createdAt
queueExplanations id · instanceId? · weekNumber? · at · kind · text
restTimerState    id:'active' · exerciseId? · label · endsAt? · pausedRemainingSec?
                  · isPaused · totalSec · startedAt
milestoneState    id · key · label · status · achievedAt? · evidence(json) · targetWeek
safetyBackups     id:'pre-import' · at · json(string)               ← keeps exactly one
```

Indexes: every foreign key, plus compound `[planId+weekNumber]`, `[status+scheduledDate]`, `[exerciseId+completedAt]`, `[instanceId+setIndex]`.

### Immutability guard

`repositories/guard.ts` wraps every write to a history table:

```ts
assertMutable(instance, { allowHistoryEdit?: boolean })
```

Throws `HistoryImmutableError` when `instance.frozen === true` unless the caller passes `allowHistoryEdit: true` — which only the explicit "Edit this past record" UI path does. Every set/run/station/symptom write goes through it. Directly enforces §8, §13, §14, §15.

### Migrations

`migrations/index.ts` holds an ordered array of `{ version, upgrade }`. v1 is the initial schema plus seeding. Adding v2 later means appending an entry; Dexie replays only the needed upgrades. Tested by constructing a v1 database with real rows, then opening it through the current migration chain and asserting rows survive with expected shape.

### IndexedDB failure handling

`db.open()` is wrapped. On `QuotaExceededError`, blocked upgrade, or Safari private-mode denial, the app renders a full-screen recoverable error with the actual reason, an "Export what we can" button, and a retry — never a blank screen. An `ErrorBoundary` wraps each route.

---

## 4. Domain logic

### 4.1 Queue engine (§15)

```ts
recomputeQueue(input: {
  plan: PlanDefinition            // immutable definition
  templates: WorkoutTemplate[]
  events: ScheduleEvent[]         // chronological, append-only
  overrides: ScheduleOverride[]
  symptomState: SymptomState
  today: ISODate                  // injected — never read from the clock
  raceDate: ISODate
}): { instances: ScheduledInstance[]; explanations: Explanation[]; dropped: Dropped[] }
```

Pure, deterministic, no I/O. Algorithm:

1. **Materialize** every planned instance from `plan × planWeeks × workoutTemplates`, computing `plannedDate` from `plan.startDate + (week−1)·7 + slotDayOffset`.
2. **Replay events** in `at` order to derive each instance's status, `completedForDate`, manual override, and drop state. Terminal statuses (`completed`, `partiallyCompleted`, `skipped`, `autoDropped`) freeze that instance.
3. **Pin overrides.** Any `isPinned` override fixes `scheduledDate` and the day is consumed.
4. **Collect the open set**: statuses `upcoming | available | deferred`, sorted by `(weekNumber, sequenceInWeek)`.
5. **Place forward.** Walk days from `max(today, latestTerminalDate + 1)` to `raceDate`. For each open instance in order, find the earliest eligible day (§4.2). Never place two instances on one day. Never place past `raceDate`.
6. **Resolve shortfall per week.** If a week's remaining instances exceed its eligible days: drop `optional` first (status `autoDropped`), then `important`. `essential` instances defer into the following week, which then sheds its own optional.
7. **Race-date anchoring.** Nothing schedules after `raceDate`. Anything that would is dropped, not pushed — a missed optional disappears rather than turning 24 weeks into 30 (§15).
8. **Explain.** Any instance whose `scheduledDate ≠ plannedDate`, or whose status auto-changed, gets a plain-language `Explanation`: *"Intervals moved to Thursday because Tuesday was missed."* / *"Optional Zone 2 session dropped to preserve recovery."* / *"Strength A moved after your backdated Tuesday run was recorded."*

**Backdating.** `COMPLETE_EARLIER` appends an event with the prior date. Recomputation re-derives everything from the definition + journal, so future recommendations snap back to their correct positions, manual overrides survive (they're separate rows), and no history row is touched or duplicated.

**Reset schedule recommendations.** Appends `RESET_RECOMMENDATIONS`. Recomputation ignores all `MOVE`/`DEFER` events dated before that marker but keeps every completion. Automated recommendations reset; history is untouched.

### 4.2 Eligibility and recovery matrix

A candidate day is eligible when **all** hold:

- No instance already scheduled or completed that day (**never two workouts in one day**).
- After placing, the rolling 7-day window containing that day still has ≥1 workout-free day (**one rest day per rolling week**).
- No **hard** recovery conflict against the 1–2 preceding and following days.
- Day ≤ `raceDate`.

Conflict matrix (`hard` blocks auto-scheduling; `soft` warns but places):

| Previous day | Candidate | Severity |
|---|---|---|
| hardRun | hardRun | hard |
| longRun | hardRun | hard |
| hardRun | longRun | hard |
| lowerBodyStrength | hardRun | hard |
| raceSimulation | hardRun / longRun / lowerBodyStrength | hard (needs 2 clear days) |
| highImpactStation | hardRun | soft |
| lowerBodyStrength | lowerBodyStrength | soft |
| easyRun / lowImpactAerobic / recovery | anything | none |

**Manual moves bypass hard conflicts** but surface a warning sheet naming the specific conflict, with Proceed / Pick another day (§15).

### 4.3 Strength target recommendation (§9)

```ts
recommendStrengthTarget(ctx: {
  exercise: Exercise
  prescription: Prescription
  history: SessionSummary[]      // most recent first
  symptomState: SymptomState
  profileWeightLb: number
}): StrengthRecommendation
```

Deterministic rules, evaluated in order:

| Condition | Result | `mode` |
|---|---|---|
| No history | `prescription.targetLoad ?? exercise default` | `default` |
| Relevant symptom elevated or flagged (per D2 gating) | repeat previous weight | `symptomHold` |
| All prescribed reps hit **and** mean RIR ≥ 1 | previous + increment | `increase` |
| All prescribed reps hit, **no** RIR recorded | previous + increment, presented as *optional aim*; the prefilled value stays at previous | `optionalIncrease` |
| Reps missed, or mean RIR = 0 | repeat previous weight | `repeat` |

Returns `{ previous: {weight, unit, reps, date}, lastWeek?, target, unit, mode, reason }`. `reason` is a single sentence, e.g. *"You completed all prescribed reps last time."* / *"Repeating last weight — shin symptoms elevated this week."* **Never auto-overwrites a user-chosen weight** — the recommendation is a display value plus a one-tap "use target" action; once the user edits a set, their value wins for that instance.

"Previous relevant" = most recent session containing that exercise, regardless of how long ago. Last-week's weight is shown separately when a session exists in the previous calendar week; when it doesn't, the UI shows the most recent performance and its date (§8).

Increments: barbell 5 lb; dumbbell per-hand (editable, default 5 lb); machine (editable, default 10 lb); HYROX station loads default `0` (no auto-increase) (§9).

Load styles: `totalBarbell | perDumbbell | machineStack | bodyWeight | bodyWeightPlusLoad | kg | lb | custom`.

### 4.4 Pace and intervals (§10)

`paceSecPerKm(distanceKm, durationSec)` returns `null` for `distanceKm ≤ 0`, non-finite, or `durationSec ≤ 0` — never `Infinity`, never `NaN`. Formatting renders `—` for null. Interval splits compute per-rep pace the same way, plus work-only mean pace, total work distance, and total session distance. Split logging is entirely optional; a run logs with distance + duration alone.

### 4.5 Symptom engine (§16)

```ts
evaluateSymptoms(logs: SymptomLog[], today: ISODate): SymptomState
```

Per stream (`shin`, `sciatic`): `level` = green (0–2) / caution (3–4) / elevated (≥5); `spikeFlag` when `latest − baseline ≥ 2` (baseline per D13); `persistenceFlag` when the last 3 logs are all ≥3. Returns a 90-day series for charting, plus `recommendations: Substitution[]`:

- Reduce next run's impact volume 20–30%
- Replace hard run with easy SkiErg or row
- Add/maintain calf and tibialis strengthening
- Hold load progression while symptoms are elevated
- Recommend professional assessment for persistent, worsening, or focal pain
- For worsening radiating sciatic pain, weakness, or numbness: stop the aggravating exercise, seek clinical assessment

Every recommendation card carries: *"Training-load suggestion, not a medical diagnosis."* Nothing is auto-cancelled; Accept / Modify / Dismiss are one tap each. Red-flag screening per D11.

### 4.6 Milestones and trajectory (§18)

Twelve milestone evaluators, each pure, each returning `{ status, evidence, targetWeek }`:

consistent four-workout weeks · weekly running distance · longest continuous run · comfortable 10 km · standalone 5 km benchmark · six compromised 1 km efforts · race-load sled confidence · 100 wall balls in manageable sets · half simulation · 75% simulation · controlled full-format rehearsal · symptoms manageable.

**Goal-derived running targets (D15).** The two running milestones are computed from the active target time, so changing the goal recalculates them (§2). Two named, documented, Settings-editable constants — no magic numbers:

```ts
STATION_AND_ROXZONE_BUDGET_SEC = 2520   // 42 min: 8 stations ≈ 32–36 min + roxzone ≈ 7–8 min
COMPROMISED_PENALTY_SEC_PER_KM = 45     // race km pace vs. fresh 5 km pace, first-race realistic

compromisedKmTargetSec = (targetSeconds − STATION_AND_ROXZONE_BUDGET_SEC) / 8
standalone5kTargetSec  = 5 × (compromisedKmTargetSec − COMPROMISED_PENALTY_SEC_PER_KM)
```

| Goal | Compromised km | Standalone 5 km |
|---|---|---|
| 1:30 | 6:00/km | ~26:15 |
| **1:35 (default)** | **6:38/km** | **~29:22** |
| 1:40 | 7:15/km | ~32:30 |

The sub-1:30 row reproduces §18's stated "under 6:00/km" exactly, which validates the 42 min station budget. Its 5 km figure lands at ~26:15 against §18's "approximately 27–28 minutes" — the brief's pairing implies a 30 s/km compromised penalty, which is optimistic for a first race, so the default of 45 s/km is deliberately the stricter direction for a goal-setting tool. A unit test asserts the sub-1:30 case stays within 26:00–28:00 so the constants can't drift into nonsense.

Milestones for `longestContinuousRun`, `weeklyRunningDistance`, and `comfortable10k` remain absolute (12 km, phase-scaled weekly volume, 10 km) — they are durability requirements, not pace requirements, and do not scale with goal time.

Trajectory = `ahead | onTrack | slightlyBehind | needsAttention`, computed from the count of milestones met vs. expected-by-current-week, with any elevated symptom flag capping the status at `slightlyBehind` at best. Home always shows the **named evidence** behind the status, never a bare label. No race-time point prediction (D14).

---

## 5. Information architecture and screens

Bottom tab bar (44px+ targets, safe-area padded): **Home · Progress · Plan · Settings**. The active-workout bar and the rest-timer bar sit above it on every screen. No hamburger menus.

### Home (§7)

Three sections in the required order.

**1. Today's workout** — name, phase + week, priority chip, approx duration, the full exercise/run structure inline, "why today", any schedule-adjustment explanation, any symptom caution. Actions: Start / Continue / Completed earlier / Defer / Skip / Edit, shown only when applicable.

**2. This week** — essential completed *n/m*, total completed, four-session minimum status, partial sessions, skipped and dropped sessions, current recommended schedule (with original dates where they differ), current phase, and exactly one next-best action. Neutral language throughout; no streaks, no guilt.

**3. Goal snapshot** — race date + countdown, target time, plan week, running milestone status, strength-maintenance status, recent symptom status, trajectory pill with its evidence sentence.

### Workout logging (§8)

One vertically scrolling screen. **All exercises expanded by default.** Per strength exercise, visible without any tap:

```
┌────────────────────────────────────────────────┐
│ Back squat                        4 × 4–6      │
│ Last: 175 lb × 5  ·  Jul 20                    │
│ Last week: 175 lb                              │
│ Today's target: 180 lb × 5      [Use target]   │
│ You completed all prescribed reps last time.   │
│ ───────────────────────────────────────────    │
│  #  Weight      Reps    RIR                    │
│  1  [ 180 ] lb  [ 5 ]   [ 2 ]        ( ✓ )     │
│  2  [ 180 ] lb  [ 5 ]   [   ]        ( ✓ )     │
│  3  [ 180 ] lb  [ 5 ]   [   ]        ( ✓ )     │
│  4  [ 180 ] lb  [ 5 ]   [   ]        ( ✓ )     │
│  [ + Add set ]                                 │
│  Notes: keep knees tracking out                │
└────────────────────────────────────────────────┘
```

Sets prefilled with target values. One tap on ✓ completes a set, writes to IndexedDB, and starts the rest timer. Inline edits, no modals. The ✓ disables during its write and is idempotent by `(instanceId, prescriptionId, setIndex)` — double-taps cannot double-submit. Run and station blocks follow the same inline pattern with their own fields.

Workout footer: session RPE / shin / sciatic — three horizontal 0–10 one-tap scales with sensible defaults — then completion state: Completed / Partially completed / Completed earlier (date picker) / Deferred / Skipped. A partial workout is never recorded as complete.

### Progress (§17)

Segmented control: **Strength | Running**.

*Strength* — exercise picker; working-weight line chart; estimated 1RM trend when ≥3 qualifying sessions; recent sessions with sets/reps/RIR; personal bests; actual vs. recommended target; previous weight and current target.

*Running* — weekly distance bars distinguishing planned / completed / missed / dropped by fill and legend; run distance over time; average pace by run type; easy-pace trend; 5 km benchmark history; longest continuous run; compromised-km pace; current vs. target milestone; trajectory to race date.

Charts: Recharts, ≤4 series, direct labels over legends where possible, 200–220px tall, horizontal scroll only inside the chart container, and a tabular fallback under each chart for accessibility.

### Plan (§14)

Week list → week detail → workout editor. Full CRUD on upcoming workouts, exercises, sets/reps/loads/distances/paces/rests/priorities/notes; reorder by move-up/move-down buttons (no drag — reliable on touch and keyboard-accessible); duplicate/delete/add workout; substitute exercise. Edit scope prompt every time it matters: **This workout only / This and all future instances / Update the exercise default without changing scheduled workouts**. Plan manager: duplicate plan, new plan, archive/restore, set active, change duration, change race date, change target time. Completed history stays immutable.

### Settings (§20)

Profile · race goal & date · units · exercise library · HYROX standards editor · rest-timer defaults · sound/vibration toggles (off by default) · export backup · import backup · last backup date · restore original 24-week plan (history preserved) · reset all data (type-to-confirm).

### Rest timer (§12)

Compact persistent bar above the bottom nav: exercise label, `MM:SS` counting down, and Pause/Resume · −30s · +30s · Skip. Remaining time is always computed as `endsAt − now`, and `endsAt` is persisted in IndexedDB — so navigation, screen lock, and refresh all resume accurately. Pausing stores `pausedRemainingSec` and clears `endsAt`. Sound and vibration default off, enableable in Settings, and `navigator.vibrate` is feature-detected (absent on iOS — the toggle is disabled with an explanatory note). No notification dependency.

Seeded rest defaults: back squat 150s · RDL 120s · bench 120s · split squat 90s · walking lunge 90s · sled push 90s · sled pull 90s · farmer carry 90s · wall balls 60s · burpee broad jumps 60s · core 45s · accessories 60s. Every exercise's default is editable and persists for reuse.

---

## 6. Visual design

Apple-like, light, restrained.

```css
--bg:#FFFFFF        --surface:#F7F8FA     --surface-2:#F0F2F5
--border:#E4E7EC    --text:#111827        --text-muted:#667085
--accent:#2563EB    --accent-soft:#EFF5FF
--green:#15803D     --caution:#B45309     --elevated:#B42318
--radius-card:12px  --radius-control:10px
--shadow:0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.04);
font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif
```

No gradients. No decorative animation — only 150ms opacity/transform on sheet present/dismiss, and `prefers-reduced-motion` disables it. Status colours always pair with text or an icon, never colour alone.

Mobile rules: all interactive targets ≥44×44px; every input `font-size:16px` (prevents Safari zoom); `env(safe-area-inset-*)` on the header and bottom nav; `overflow-x:hidden` on `body` with wide content scrolling inside its own container; iPhone SE (375px) through desktop. Semantic HTML, real `<label>`s, `aria-live` for timer and save state, visible focus rings, full keyboard operability of set completion and navigation. Target WCAG AA contrast.

**Icon** (original, no HYROX branding): a rounded-square blue tile containing an abstract barbell — a horizontal bar with two plate blocks — whose vertical negative space reads as an implied "H". Authored as SVG, rasterized by `scripts/generate-icons.mjs` (sharp, devDependency only) to 180 (apple-touch), 192, 512, and a 512 maskable variant with correct safe-zone padding.

---

## 7. PWA, persistence, and deployment

- `vite-plugin-pwa` with `registerType:'prompt'`, Workbox precaching of the entire built shell. Zero network requirement after first load.
- Base path from `import.meta.env.BASE_URL`, set by `VITE_BASE` (default `/`). Manifest `start_url`, `scope`, icon paths, service-worker scope, and the router basename all derive from it — so a GitHub Pages subpath works without hand-editing.
- SPA routing on GitHub Pages: a `404.html` copy of `index.html` plus the precache fallback, so refreshing any route works.
- Updates never clear IndexedDB. The prompt card explains that data is preserved.
- **Active-workout durability:** every set/run/station field writes through on change (250ms debounce for typing, immediate flush on blur, tap, and `visibilitychange`). Partially entered data survives a refresh, a lock, and a crash.
- `navigator.storage.persist()` requested once after onboarding to reduce eviction risk; the result is reported in Settings.

### Backup and restore (§20)

Versioned, human-readable JSON:

```json
{ "format": "hyrox-training-backup", "schemaVersion": 1, "appVersion": "1.0.0",
  "exportedAt": "2026-07-27T...", "counts": { "...": 0 }, "data": { "<table>": [ ... ] } }
```

Import pipeline: parse → validate format/version/shape and referential integrity → **write a safety backup of current data** → clear and repopulate in a single Dexie transaction → report counts. Any validation failure aborts before the safety backup is even needed and **leaves existing data untouched**, with a specific reason. Incompatible future `schemaVersion` is rejected with a clear message. Last successful backup date shown in Settings, with a short note that browser/PWA site data can be deleted by the OS or the user, so periodic export matters.

"Restore original 24-week plan" re-seeds plan templates and creates fresh future instances without touching a single completed record.

---

## 8. Preloaded 24-week plan (seed data)

Stored as structured, editable seed data generated from phase → week → template configuration (§19). Six session slots; per-week data overrides count and content.

| Slot | Session | Recovery tags | Typical priority |
|---|---|---|---|
| 1 | Strength A + sled | lowerBodyStrength, highImpactStation | essential |
| 2 | Easy run + lower-leg durability | easyRun | essential/important |
| 3 | Zone 2 SkiErg/Row | lowImpactAerobic | **optional** |
| 4 | Quality run + wall-ball technique | hardRun, highImpactStation | essential |
| 5 | Strength B + HYROX stations | upperBodyStrength, hybrid | essential |
| 6 | Long run → hybrid → compromised | longRun / hybrid / raceSimulation | essential/important |

Phases: **Base** 1–6 · **Build** 7–12 · **Race-specific** 13–18 · **Specific prep** 19–22 · **Taper** 23–24. Essential sets per phase follow §19 exactly (D7).

**Strength A:** back squat 4×4–6 (W1: 175 lb) · RDL 3×6–8 (135 lb) · split squat 3×8/leg (2×25 lb DB) · sled push 6–8×12.5 m · sled pull 4–6×12.5 m · Pallof press or side plank 3 sets.
**Strength B:** bench press 3×5–8 (W1: 140 lb) · pull-ups or lat pulldown 3×6–10 · walking lunges 3×15–20 m (bodyweight initially) · farmer carry 4×50 m (building to 2×24 kg) · burpee broad jumps 4×10–15 m · SkiErg/row 4×500 m controlled.
Sled work records total load, distance, surface, time, RPE — with a note that sled friction makes cross-venue comparison imperfect. Wall-ball prescriptions carry an overhead-clearance safety note.

**Running, weeks 1–12:** exactly as specified in the brief (W1–W6 easy/quality/long; W7–W12 including the W8 deload and the W12 benchmark week: easy recovery run, standalone 5 km test, half-HYROX simulation of 4×1 km with ~half-volume stations).

**Weeks 13–22 (concrete, editable — resolving D4):**

| Wk | Quality (slot 4) | Slot 6 | Station volume | Note |
|---|---|---|---|---|
| 13 | 6×1 km @ goal pace, 90s | hybrid 5×(1 km + 1 station) | 50% | strength → maintenance dosing |
| 14 | compromised 5×(1 km + station) | hybrid 6 rounds | 60% | |
| 15 | 7×1 km @ goal pace | hybrid 6 rounds | 70% | race-load sled exposure, no failure attempts |
| 16 | 4×1 km | long run 55 min | 40% | **consolidation**, 5 sessions |
| 17 | compromised 6×(1 km + station) | hybrid 7 rounds | 75% | wall-ball technique under fatigue |
| 18 | easy quality only | **full-format simulation @ 75% stations** | 75% | 4 sessions; the near-full sim, ~6 wks out |
| 19 | 8×1 km @ goal pace | hybrid 7 rounds | 80% | transitions practice |
| 20 | compromised 6×(1 km + station) | hybrid 7 rounds + wall-ball fatigue block | 80% | no simulation |
| 21 | short race-pace reminders | **controlled full-format rehearsal** (8×1 km + all 8 stations, controlled — not all-out) | 100% | 4 sessions, ~3 wks out |
| 22 | 5×1 km @ goal pace | transitions + wall-ball fatigue | 60% | 5 sessions, reduced heavy strength, intensity preserved |

**Taper.** W23 ≈60–70% of peak: easy 35 min · Zone 2 35 min · 4×1 km race pace · light station technique · short strength — no exhausting simulation. W24 ≈35–45%: easy 25 min · 3×600 m race-pace reminders · light technique/mobility · **race day** (or a benchmark simulation if no race is scheduled) · race-day checklist.

**Race-pace prescriptions derive from the goal.** Any prescription marked `paceSource: 'goalRacePace'` resolves its `targetPaceSecPerKm` from the active goal via `compromisedKmTargetSec` (§4.6) — so at the 1:35 default, "8×1 km @ goal pace" prescribes 6:38/km, and changing the goal updates every future race-pace session without editing seed data. A user who hand-edits a pace switches that prescription to `paceSource: 'manual'` and it stops tracking the goal.

**Zone 2** progresses 40 → 50 min across the plan, alternating SkiErg and rower, effort kept conversational. **Lower-leg durability** after every easy run: straight-knee calf raise 3×12–15 · bent-knee calf raise 3×12–15 · tibialis raise 3×15–20. Running impact volume never auto-increases while shin symptoms are flagged (§19).

**HYROX Men's Open standards** (seeded, editable — §11): 8×1 km runs · SkiErg 1,000 m · sled push 152 kg total / 50 m (~335 lb) · sled pull 103 kg total / 50 m (~227 lb) · burpee broad jumps 80 m · row 1,000 m · farmer carry 2×24 kg / 200 m (~53 lb each) · sandbag lunges 20 kg / 100 m (~44 lb) · wall balls 100 reps, 6 kg (~13 lb) to 3.0 m.

---

## 9. Testing strategy

**Vitest + jsdom + React Testing Library + fake-indexeddb** for units, components, and full-app integration. **Playwright (Chromium only)** for three real-browser flows.

Domain unit tests (pure, no mocks) covering every §23 item:

- strength targets: increase / repeat / optional-increase / initial fallback / RIR-driven / symptom hold / never-overwrite
- pace: valid, zero distance, zero duration, non-finite, negative
- interval splits: per-rep pace, work-only mean, totals, missing fields
- symptom trends: level thresholds, +2 spike vs. baseline, three-consecutive-≥3, insufficient data
- queue: missed essential; missed optional; optional dropping; hard and soft recovery conflicts; backdated completion; partial completion; race-date anchoring; manual overrides preserved across recompute; no double-workout catch-up; one-rest-day-per-rolling-7 invariant; reset recommendations preserving history
- plan anchoring: <24 weeks warning, exactly 24, >24 with generated Base weeks
- milestones and trajectory mapping; goal-derived running targets recalculate on goal change; sub-1:30 sanity bound (5 km target within 26:00–28:00); `goalRacePace` prescriptions resolve from the active goal and stop tracking once manually edited
- 1RM estimation and personal bests
- unit conversion and formatting

Data-layer tests: template edit does not alter completed records · exercise-default change respects the three edit scopes · rest-timer state persists and resumes accurately across a simulated reload · backup export→import round trip preserves every row · invalid/incompatible backups rejected with existing data verifiably unchanged · v1→current migration preserves rows · immutability guard throws on frozen writes.

Component/integration tests: Home renders all three sections with real seeded data · logging a set requires one tap, writes through, and starts the timer · double-tap cannot double-submit · partial completion is not recorded as complete · workout state survives an unmount/remount cycle.

Playwright (Chromium, iPhone-sized viewport): (1) onboarding → start today's workout → log sets → reload mid-workout → data intact → complete with symptoms; (2) export backup → reset → import → data restored; (3) build is installable and the app loads with the network offline.

Gates before any completion claim: `eslint` clean · `tsc --noEmit` clean · all Vitest suites pass · Playwright specs pass · `vite build` succeeds. Every failure and material warning fixed, with real command output reported.

---

## 10. Documentation (§24)

`README.md`: what the app does · architecture and key decisions · project structure · exact PowerShell install commands (including the OneDrive junction step) · dev server command · testing from an iPhone on the same Wi-Fi (`--host`, LAN IP, and the note that service workers need `localhost` or HTTPS, so full PWA behaviour is verified on the deployed GitHub Pages URL) · test commands · production build · GitHub Pages setup with exact steps · the Actions workflow · Add to Home Screen walkthrough · how local data works · how backups work · updating the deployment without losing history · known iOS PWA limitations (no background timers, no push, ~50 MB storage guidance, data lost if site data is cleared, no Apple Health) · troubleshooting.

---

## 11. Explicit non-goals

No backend, accounts, auth, cloud sync, Apple Health, push notifications, nutrition tracking, body-weight time series, paid services, proprietary APIs, or HYROX branding.

---

## 12. Known limitations (to be restated at delivery)

1. iOS suspends JavaScript when Safari is backgrounded or the screen locks. The rest timer stays *accurate* (it recomputes from a persisted timestamp) but cannot *alert* you while backgrounded — no notifications by design.
2. iOS PWA storage is evictable. `navigator.storage.persist()` reduces the risk but does not eliminate it. Periodic JSON export is the real backup.
3. Sled comparisons across venues are unreliable regardless of logging fidelity; surface is recorded to make that visible.
4. Race-time estimates appear only as a labelled range once real benchmark data exists.
5. Symptom guidance is training-load management, not medical advice.
