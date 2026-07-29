import type { ChangeEvent, FC } from 'react'
import { useRef } from 'react'
import { Button } from '@/components'

interface ImportBackupButtonProps {
  triggerLabel: string
  ariaLabel: string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/**
 * The file-picker half of "import a backup": a visible trigger button plus
 * the visually-hidden `<input type=file>` it forwards clicks to. Shared by
 * Settings' "Import backup" control and onboarding's pre-onboarding restore
 * escape hatch so this markup/wiring exists in exactly one place — the
 * actual read-and-validate logic lives in `useImportBackup`, which each
 * caller wires to `onFileChange`.
 */
export const ImportBackupButton: FC<ImportBackupButtonProps> = ({ triggerLabel, ariaLabel, onFileChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>{triggerLabel}</Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        aria-label={ariaLabel}
        className="visually-hidden"
        onChange={onFileChange}
      />
    </>
  )
}
