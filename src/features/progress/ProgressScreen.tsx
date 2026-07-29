import type { FC } from 'react'
import { useState } from 'react'
import { SegmentedControl } from '@/components'
import { StrengthProgress } from './StrengthProgress'
import { RunningProgress } from './RunningProgress'

type ProgressView = 'strength' | 'running'

/**
 * Progress (Tasks 25/26, §17): the athlete's two named priority areas —
 * strength history and running progress — behind a segmented control.
 * Nothing else lives here on purpose: Plan is a later task, and shipping a
 * tab to a screen that doesn't exist yet is the placeholder pattern the
 * Global Constraints forbid (see `navItems.ts`'s own doc comment).
 */
export const ProgressScreen: FC = () => {
  const [view, setView] = useState<ProgressView>('strength')

  return (
    <div className="progress-screen">
      <h1 className="progress-screen__heading">Progress</h1>
      <SegmentedControl
        label="Progress view"
        value={view}
        onChange={setView}
        options={[
          { value: 'strength', label: 'Strength' },
          { value: 'running', label: 'Running' },
        ]}
      />
      {view === 'strength' ? <StrengthProgress /> : <RunningProgress />}
    </div>
  )
}
