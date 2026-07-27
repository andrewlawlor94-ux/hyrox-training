// Compile-time completeness gate. This file emits nothing and runs no tests
// (no .test. suffix, so Vitest's default glob ignores it) — its only job is
// that `npm run typecheck` fails if a required field is missing or misnamed
// on any entity interface. One fully populated literal per entity.
import type {
  AppSettings,
  AthleteProfile,
  Exercise,
  HyroxStandard,
  InstancePrescription,
  IntervalSplit,
  MilestoneRecord,
  Plan,
  PlanPhase,
  PlanWeek,
  Prescription,
  QueueExplanation,
  RaceGoal,
  RestTimerState,
  RunLog,
  SafetyBackup,
  ScheduleEvent,
  ScheduleOverride,
  StationLog,
  StrengthSet,
  SymptomLog,
  WorkoutInstance,
  WorkoutTemplate,
} from '@/data/types'

export const exercise: Exercise = {
  id: 'ex_back_squat', name: 'Back squat', category: 'squat',
  measurementType: 'strengthSets', loadStyle: 'totalBarbell', defaultUnit: 'lb',
  defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '',
  isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}

export const prescription: Prescription = {
  id: 'rx_1', templateId: 'tpl_1', exerciseId: 'ex_back_squat', order: 0,
  sets: 4, repMin: 4, repMax: 6, targetLoad: 175, loadUnit: 'lb',
  loadStyle: 'totalBarbell', restSec: 150,
}

export const set: StrengthSet = {
  id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'irx_1',
  exerciseId: 'ex_back_squat', setIndex: 0, weight: 175, unit: 'lb', reps: 5,
  rir: 2, isCompleted: true, completedAt: '2026-07-27T10:00:00.000Z', isWarmup: false,
}

export const instance: WorkoutInstance = {
  id: 'wi_1', planId: 'plan_1', templateId: 'tpl_1', weekNumber: 1, sessionSlot: 1,
  plannedDate: '2026-08-03', scheduledDate: '2026-08-03', sequence: 0,
  priority: 'essential', recoveryTags: ['lowerBodyStrength'], status: 'upcoming',
  isManualOverride: false, frozen: false,
}

export const settings: AppSettings = {
  id: 'app', schemaVersion: 1, activePlanId: 'plan_1',
  strengthUnit: 'lb', stationUnit: 'lb',
  restSoundEnabled: false, restVibrationEnabled: false,
  dismissedSubstitutions: [],
}

export const profile: AthleteProfile = {
  id: 'me', age: 34, heightIn: 70, weightLb: 185, bodyFatPct: 18,
  trainingBackground: 'Recreational runner, 3 yrs strength training',
  considerations: 'Mild shin soreness during high-volume weeks',
  updatedAt: '2026-07-27T00:00:00.000Z',
}

export const raceGoal: RaceGoal = {
  id: 'goal_1', raceDate: '2027-01-10', targetSeconds: 5700, stretchSeconds: 5400,
  division: 'mens-open-singles', isActive: true, createdAt: '2026-07-27T00:00:00.000Z',
}

export const hyroxStandard: HyroxStandard = {
  id: 'std_ski', station: 'skiErg', order: 1, distanceM: 1000,
  notes: 'Men\'s open standard', isSeeded: true,
}

export const plan: Plan = {
  id: 'plan_1', name: '24-week HYROX plan', weeksCount: 24, status: 'active',
  startDate: '2026-08-03', raceGoalId: 'goal_1', createdAt: '2026-07-27T00:00:00.000Z',
}

export const planPhase: PlanPhase = {
  id: 'phase_1', planId: 'plan_1', name: 'Base', weekStart: 1, weekEnd: 6,
  focus: 'Aerobic base and movement quality',
}

export const planWeek: PlanWeek = {
  id: 'week_1', planId: 'plan_1', weekNumber: 1, phaseId: 'phase_1',
  label: 'Week 1', isDeload: false, notes: '',
}

export const workoutTemplate: WorkoutTemplate = {
  id: 'tpl_1', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 1,
  sequenceInWeek: 1, name: 'Strength A + sled', kind: 'strength',
  priority: 'essential', recoveryTags: ['lowerBodyStrength', 'highImpactStation'],
  estMinutes: 60, notes: '',
}

export const instancePrescription: InstancePrescription = {
  id: 'irx_1', templateId: 'tpl_1', exerciseId: 'ex_back_squat', order: 0,
  sets: 4, repMin: 4, repMax: 6, targetLoad: 175, loadUnit: 'lb',
  loadStyle: 'totalBarbell', restSec: 150,
  instanceId: 'wi_1', sourcePrescriptionId: 'rx_1',
}

export const runLog: RunLog = {
  id: 'run_1', instanceId: 'wi_2', instancePrescriptionId: 'irx_2',
  distanceKm: 8, durationSec: 2700, paceSecPerKm: 338,
  surface: 'road', runType: 'easy', notes: '', loggedAt: '2026-08-03T07:00:00.000Z',
}

export const intervalSplit: IntervalSplit = {
  id: 'split_1', runLogId: 'run_1', index: 0, kind: 'work',
  distanceM: 1000, durationSec: 240, paceSecPerKm: 240,
}

export const stationLog: StationLog = {
  id: 'station_1', instanceId: 'wi_3', instancePrescriptionId: 'irx_3',
  station: 'sledPush', distanceM: 50, load: 152, loadUnit: 'kg',
  sledWeightKg: 152, totalLoadKg: 152, surface: 'other', timeSec: 90,
  breaks: 1, setStructure: '2x25m', rpe: 8, notes: 'Turf, slight incline',
}

export const symptomLog: SymptomLog = {
  id: 'symptom_1', instanceId: 'wi_1', forDate: '2026-08-03',
  sessionRpe: 6, shinPain: 1, sciaticPain: 0, notes: '',
  loggedAt: '2026-08-03T08:00:00.000Z',
}

export const scheduleEvent: ScheduleEvent = {
  id: 'evt_1', at: '2026-08-04T09:00:00.000Z', type: 'COMPLETE',
  instanceId: 'wi_1', payload: { setsCompleted: 4, notes: null },
}

export const scheduleOverride: ScheduleOverride = {
  id: 'override_1', instanceId: 'wi_4', date: '2026-08-10',
  isPinned: true, createdAt: '2026-08-04T09:00:00.000Z',
}

export const queueExplanation: QueueExplanation = {
  id: 'explain_1', instanceId: 'wi_4', weekNumber: 2,
  at: '2026-08-04T09:00:00.000Z', kind: 'moved',
  text: 'Intervals moved to Thursday because Tuesday was missed.',
}

export const restTimerState: RestTimerState = {
  id: 'active', exerciseId: 'ex_back_squat', label: 'Back squat',
  endsAt: '2026-08-04T09:03:00.000Z', isPaused: false, totalSec: 150,
  startedAt: '2026-08-04T09:00:30.000Z',
}

export const milestoneRecord: MilestoneRecord = {
  id: 'milestone_1', key: 'comfortable10k', label: 'Comfortable 10k',
  status: 'inProgress', evidence: { bestDistanceKm: 8 }, targetWeek: 12,
}

export const safetyBackup: SafetyBackup = {
  id: 'pre-import', at: '2026-08-04T09:00:00.000Z', json: '{"data":{}}',
}
