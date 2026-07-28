/** Closed string unions shared across entity interfaces. */

export type LoadStyle =
  | 'totalBarbell' | 'perDumbbell' | 'machineStack'
  | 'bodyWeight' | 'bodyWeightPlusLoad' | 'custom'

export type MeasurementType =
  | 'strengthSets' | 'reps' | 'duration' | 'distance'
  | 'pace' | 'timedStation' | 'carry' | 'mixedStation'

export type ExerciseCategory =
  | 'squat' | 'hinge' | 'lunge' | 'press' | 'pull' | 'core' | 'carry'
  | 'sled' | 'erg' | 'plyo' | 'run' | 'wallBall' | 'calf' | 'accessory'

export type Priority = 'essential' | 'important' | 'optional'

export type WorkoutStatus =
  | 'upcoming' | 'available' | 'inProgress' | 'completed'
  | 'partiallyCompleted' | 'deferred' | 'skipped' | 'autoDropped'

export type RecoveryTag =
  | 'hardRun' | 'easyRun' | 'longRun' | 'lowerBodyStrength' | 'upperBodyStrength'
  | 'hybrid' | 'highImpactStation' | 'lowImpactAerobic' | 'recovery' | 'raceSimulation'

export type WorkoutKind =
  | 'strength' | 'run' | 'zone2' | 'hybrid' | 'simulation' | 'race' | 'recovery'

export type Station =
  | 'skiErg' | 'sledPush' | 'sledPull' | 'burpeeBroadJump'
  | 'row' | 'farmerCarry' | 'sandbagLunge' | 'wallBalls'

export type RunType =
  | 'easy' | 'long' | 'tempo' | 'intervals' | 'compromised' | 'benchmark' | 'race'

export type Surface = 'track' | 'treadmill' | 'road' | 'other'

/** The floor a sled is pushed/pulled across (§ sled surface fix). Distinct
 * from `Surface`, which describes a RUN's terrain (track/treadmill/road) —
 * those values are meaningless for a sled (a sled is never run on a
 * treadmill) and this union is meaningless for a run in the other direction.
 * Sled friction varies enormously by floor, which is why the sled blocks
 * already warn that cross-venue times aren't comparable; these are the floor
 * types that actually drive that friction. */
export type SledSurface = 'turf' | 'rubber' | 'concrete' | 'other'

export type SplitKind = 'warmup' | 'work' | 'recovery' | 'cooldown'

export type SymptomLevel = 'green' | 'caution' | 'elevated'

export type SymptomStream = 'shin' | 'sciatic'

export type Trajectory = 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'

export type RecommendationMode =
  | 'default' | 'increase' | 'optionalIncrease' | 'repeat' | 'symptomHold'

/** 'goalRacePace' resolves its pace from the active RaceGoal; 'manual' means
 * the athlete hand-edited it and it no longer tracks the goal. */
export type PaceSource = 'goalRacePace' | 'manual'

export type EditScope = 'thisWorkout' | 'thisAndFuture' | 'exerciseDefaultOnly'

export type ScheduleEventType =
  | 'COMPLETE' | 'COMPLETE_EARLIER' | 'PARTIAL' | 'DEFER' | 'SKIP'
  | 'MOVE' | 'RESET_RECOMMENDATIONS' | 'PLAN_EDIT' | 'RACE_DATE_CHANGE'

export type MilestoneKey =
  | 'fourWorkoutWeeks' | 'weeklyRunDistance' | 'longestContinuousRun' | 'comfortable10k'
  | 'standalone5k' | 'compromisedKmSet' | 'raceLoadSled' | 'hundredWallBalls'
  | 'halfSimulation' | 'seventyFiveSimulation' | 'fullRehearsal' | 'symptomsManageable'

export type MilestoneStatus = 'notStarted' | 'inProgress' | 'achieved' | 'atRisk'
