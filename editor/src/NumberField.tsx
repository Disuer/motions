import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  id?: string
  /** undefined means unset: the placeholder shows instead, and the file has no such key. */
  value: number | undefined
  onCommit: (v: number | undefined) => void
  /** Shown when the value is unset. Usually the default the game would apply. */
  placeholder?: string | number
  step?: number
  min?: number
  /** Clearing the box commits undefined rather than leaving the value alone. */
  optional?: boolean
  /** The field is an int in the game's C#, so a fraction here makes it reject the whole file. */
  integer?: boolean
  className?: string
  title?: string
  'aria-label'?: string
}

/**
 * A number input that does not commit half-typed values.
 *
 * A plain controlled `<input type="number">` with `onChange={e => onChange(Number(e.target.value))}`
 * looks right and is wrong in three ways that all bite while someone is still typing:
 *   - `Number('')` is 0, so clearing the box to retype writes an explicit 0 over the value
 *   - typing "-" to start a negative number gives an empty value, so the minus is eaten and the
 *     field snaps back to 0 - negative offsets were very nearly untypeable
 *   - clamping per keystroke turns the "0" of "0.5" into the minimum, so the rest of what you
 *     type lands on a number you never saw
 *
 * So the text being typed is held locally and only complete, finite numbers are committed. The
 * box keeps showing exactly what was typed until focus leaves, at which point it goes back to
 * rendering the stored value.
 */
export default function NumberField({
  id, value, onCommit, placeholder, step = 0.01, min, optional, integer, className, title,
  'aria-label': ariaLabel,
}: Props) {
  // null means "not being edited": show the stored value. A string means show that string.
  const [typing, setTyping] = useState<string | null>(null)
  const shown = typing ?? (value === undefined ? '' : String(value))

  function commit(n: number) {
    // Rounded rather than refused: `steps`, `multiHit` and `vibrato` are int in the game's C#,
    // and a fractional one makes the whole file fail to deserialise and be ignored, motion and
    // all. Rounding is visible in the field the moment focus leaves, so it does not hide.
    const whole = integer ? Math.round(n) : n
    onCommit(min !== undefined ? Math.max(min, whole) : whole)
  }

  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      title={title}
      aria-label={ariaLabel}
      className={cn('h-8 text-right text-xs', className)}
      value={shown}
      placeholder={placeholder === undefined ? undefined : String(placeholder)}
      onChange={(e) => {
        const raw = e.target.value
        setTyping(raw)
        // "", "-", "1e" and "1." are all mid-typing states that Number() turns into 0 or NaN.
        // Committing any of them would overwrite the number being typed.
        const n = Number(raw)
        if (raw.trim() !== '' && Number.isFinite(n)) commit(n)
      }}
      onBlur={() => {
        // An empty box on the way out means "unset" for a field that has a default, and "no
        // change" for one that must always hold a number.
        if (typing !== null && typing.trim() === '' && optional) onCommit(undefined)
        setTyping(null)
      }}
    />
  )
}
