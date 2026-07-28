import type { ChangeEvent, FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '@/components'
import { readProfile, updateProfile } from '@/data/repositories'
import type { AthleteProfile } from '@/data/types'

function logAndIgnore(err: unknown): void {
  console.error('Profile update failed', err)
}

function patch(fields: Partial<AthleteProfile>): void {
  updateProfile(fields, new Date().toISOString()).catch(logAndIgnore)
}

/**
 * Athlete profile (Settings-lite, §Task 29 reduced scope): age, height,
 * weight, body fat, and recurring considerations. Numeric fields only write
 * back once a real number is entered — clearing a `NumberField` back to
 * empty leaves the stored value alone rather than attempting to write
 * `undefined`, which `exactOptionalPropertyTypes` forbids as an explicit
 * value anyway.
 */
export const ProfileSettings: FC = () => {
  const profile = useLiveQuery(() => readProfile())

  const age = profile?.age ?? null
  const heightIn = profile?.heightIn ?? null
  const weightLb = profile?.weightLb ?? null
  const bodyFatPct = profile?.bodyFatPct ?? null

  // A plain controlled `<textarea>` bound straight to the async live-query
  // value re-fights every keystroke (each `patch` call only lands after a
  // round trip through Dexie), which visibly dropped characters. Buffered
  // locally and resynced only while unfocused — the same pattern
  // `NumberField` already uses internally for exactly this reason.
  const [considerationsText, setConsiderationsText] = useState('')
  const isFocused = useRef(false)

  useEffect(() => {
    if (isFocused.current) return
    setConsiderationsText(profile?.considerations ?? '')
  }, [profile?.considerations])

  return (
    <section className="settings-screen__section">
      <h2>Profile</h2>
      <NumberField id="settings-age" label="Age" unit="years" inputMode="numeric" value={age} onChange={(v) => { if (v !== null) patch({ age: v }) }} />
      <NumberField id="settings-height" label="Height" unit="in" value={heightIn} onChange={(v) => { if (v !== null) patch({ heightIn: v }) }} />
      <NumberField id="settings-weight" label="Weight" unit="lb" value={weightLb} onChange={(v) => { if (v !== null) patch({ weightLb: v }) }} />
      <NumberField id="settings-body-fat" label="Body fat" unit="%" value={bodyFatPct} onChange={(v) => { if (v !== null) patch({ bodyFatPct: v }) }} />
      <div className="onboarding-field">
        <label htmlFor="settings-considerations" className="onboarding-field__label">Recurring considerations</label>
        <textarea
          id="settings-considerations"
          className="onboarding-field__textarea"
          value={considerationsText}
          onFocus={() => { isFocused.current = true }}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setConsiderationsText(event.target.value)
            patch({ considerations: event.target.value })
          }}
          onBlur={(event: ChangeEvent<HTMLTextAreaElement>) => {
            isFocused.current = false
            setConsiderationsText(event.target.value)
          }}
        />
      </div>
    </section>
  )
}
