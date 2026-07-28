import type { Exercise } from '@/data/types'
import { SEED_TIMESTAMP } from './shared'

/**
 * Lower-leg rehab/prehab work. Category is `calf` (not `accessory`) because
 * the symptom engine deliberately does not gate calf/tibialis work on shin
 * symptoms -- this is the treatment for shin pain, not a driver of it.
 */
export const CALF_EXERCISES = [
  {
    id: 'ex_calf_raise_straight_knee',
    name: 'Straight-knee calf raise',
    category: 'calf',
    measurementType: 'strengthSets',
    loadStyle: 'bodyWeightPlusLoad',
    defaultUnit: 'lb',
    defaultRestSec: 45,
    progressionIncrement: 5,
    incrementUnit: 'lb',
    defaultSets: 3,
    repMin: 12,
    repMax: 15,
    techniqueNotes: 'Full stretch at the bottom, full extension at the top; pause briefly at both ends.',
    isArchived: false,
    isSeeded: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'ex_calf_raise_bent_knee',
    name: 'Bent-knee calf raise',
    category: 'calf',
    measurementType: 'strengthSets',
    loadStyle: 'bodyWeightPlusLoad',
    defaultUnit: 'lb',
    defaultRestSec: 45,
    progressionIncrement: 5,
    incrementUnit: 'lb',
    defaultSets: 3,
    repMin: 12,
    repMax: 15,
    techniqueNotes: 'Knee bent throughout to bias the soleus; full range of motion each rep.',
    isArchived: false,
    isSeeded: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: 'ex_tibialis_raise',
    name: 'Tibialis raise',
    category: 'calf',
    measurementType: 'strengthSets',
    loadStyle: 'bodyWeight',
    defaultUnit: 'lb',
    defaultRestSec: 45,
    progressionIncrement: 0,
    incrementUnit: 'lb',
    defaultSets: 3,
    repMin: 15,
    repMax: 20,
    techniqueNotes: 'Heels stay planted; lift the forefoot as high as possible against the wall or a band.',
    isArchived: false,
    isSeeded: true,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
] as const satisfies readonly Exercise[]
