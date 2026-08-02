import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import NumberField from './NumberField'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Marker } from './SkillTimeline'
import {
  Coin, DAMAGE_DEFAULTS, DEFAULT_DAMAGE_RATIO, EASE_TYPES, HIT_CHECKER_DEFAULTS, PHASE_TYPES,
  Phase, ROTATE_DEFAULTS, SHAKE_DEFAULTS, STURN_DEFAULTS, STURN_DIRS, STURN_TIMINGS, STURN_TYPES,
  Vec3, ZOOM_DEFAULTS,
} from './skill'

/**
 * A number field showing the schema default as placeholder text when the author has not set one.
 * The distinction is the point: an empty box means "the game decides", and typing in it is what
 * makes the value explicit in the file. Writing the default in on load would rewrite everyone's
 * file with keys they never chose.
 */
function Num({ label, value, fallback, step = 0.1, min, integer, hint, onChange }: {
  label: string
  value: number | undefined
  fallback: number
  step?: number
  min?: number
  integer?: boolean
  hint?: string
  onChange: (v: number | undefined) => void
}) {
  const id = `sk-${label.replace(/\W+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground" title={hint}>
        {label}
      </Label>
      <NumberField id={id} value={value} step={step} min={min} integer={integer} optional
                   placeholder={fallback} className="h-7 w-24" title={hint} onCommit={onChange} />
    </div>
  )
}

function Bool({ label, value, fallback, onChange }: {
  label: string
  value: boolean | undefined
  fallback: boolean
  onChange: (v: boolean) => void
}) {
  const id = `sk-${label.replace(/\W+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <Checkbox id={id} checked={value ?? fallback} onCheckedChange={(v) => onChange(v === true)} />
    </div>
  )
}

function Choice({ label, value, fallback, options, onChange }: {
  label: string
  value: string | undefined
  fallback: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  const id = `sk-${label.replace(/\W+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      {/* The component can report null when a selection is cleared; there is no "unset" option
          here, so that is treated as no change rather than writing null into the file. */}
      <Select value={value ?? fallback} onValueChange={(v) => { if (v !== null) onChange(v) }}>
        <SelectTrigger id={id} size="sm" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function Vector({ label, value, onChange }: {
  label: string
  value: Vec3 | undefined
  onChange: (v: Vec3) => void
}) {
  const v = value ?? {}
  return (
    <div className="py-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberField
            key={axis}
            value={v[axis]}
            step={0.1}
            optional
            aria-label={`${label} ${axis}`}
            placeholder={axis}
            className="h-7"
            onCommit={(n) => onChange({ ...v, [axis]: n })}
          />
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Separator className="my-2" />
      <div className="text-xs font-medium">{title}</div>
      {children}
    </>
  )
}

interface Props {
  coin: Coin
  selected: Marker | null
  onPatch: (patch: Record<string, unknown>) => void
  onRemove: () => void
}

export default function SkillInspector({ coin, selected, onPatch, onRemove }: Props) {
  if (!selected) {
    return (
      <div className="w-72 shrink-0 border-l p-3">
        <div className="text-xs text-muted-foreground">
          Nothing selected. Click a marker on the timeline, or double-click a track to add one.
        </div>
      </div>
    )
  }

  const list = selected.track === 'phases' ? coin.phases : coin[selected.track]
  const item = list?.[selected.index] as Record<string, any> | undefined
  if (!item) {
    return (
      <div className="w-72 shrink-0 border-l p-3">
        <div className="text-xs text-muted-foreground">That marker is gone.</div>
      </div>
    )
  }

  const heading = selected.track === 'phases'
    ? `${item.type} phase`
    : `${selected.track.replace(/e?s$/, '')} ${selected.index + 1}`

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l p-3">
      <div className="flex items-center justify-between">
        <div className="truncate text-xs font-medium" title={heading}>{heading}</div>
        <Button variant="ghost" size="sm" onClick={onRemove}
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive">
          <Trash2 className="size-3" />
          Remove
        </Button>
      </div>

      {selected.track === 'phases' && <PhaseFields phase={item as Phase} onPatch={onPatch} />}

      {selected.track === 'hitCheckers' && (
        <>
          <Num label="time" value={item.time} fallback={HIT_CHECKER_DEFAULTS.time} step={0.05}
               hint="A fraction of totalDuration. 1.0 is the very end."
               onChange={(v) => onPatch({ time: v })} />
          <Num label="next coin delay" value={item.isNextMotionCoinDelay}
               fallback={HIT_CHECKER_DEFAULTS.isNextMotionCoinDelay} step={0.05}
               onChange={(v) => onPatch({ isNextMotionCoinDelay: v })} />
          <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
            Where the coin may hand off to the next. With none at all the game uses 15% of the
            coin, which cuts the animation short.
          </p>
        </>
      )}

      {selected.track === 'zooms' && (
        <>
          <Num label="start" value={item.start} fallback={ZOOM_DEFAULTS.start} step={0.05}
               hint="Fraction of totalDuration" onChange={(v) => onPatch({ start: v })} />
          <Num label="duration (s)" value={item.duration} fallback={ZOOM_DEFAULTS.duration} step={0.1}
               hint="Seconds, not a fraction" onChange={(v) => onPatch({ duration: v })} />
          <Num label="size" value={item.size} fallback={ZOOM_DEFAULTS.size} step={0.5}
               hint="Negative zooms in when isRelative" onChange={(v) => onPatch({ size: v })} />
          <Choice label="ease" value={item.easeType} fallback={ZOOM_DEFAULTS.easeType}
                  options={EASE_TYPES} onChange={(v) => onPatch({ easeType: v })} />
          <Section title="framing">
            <Bool label="attacker" value={item.attacker} fallback={ZOOM_DEFAULTS.attacker}
                  onChange={(v) => onPatch({ attacker: v })} />
            <Bool label="targets" value={item.targets} fallback={ZOOM_DEFAULTS.targets}
                  onChange={(v) => onPatch({ targets: v })} />
            <Num label="between" value={item.between} fallback={ZOOM_DEFAULTS.between}
                 onChange={(v) => onPatch({ between: v })} />
            <Num label="axis Y" value={item.axisY} fallback={ZOOM_DEFAULTS.axisY}
                 onChange={(v) => onPatch({ axisY: v })} />
            <Num label="focus speed" value={item.focusSpeed} fallback={ZOOM_DEFAULTS.focusSpeed}
                 onChange={(v) => onPatch({ focusSpeed: v })} />
            <Num label="zoom duration" value={item.zoomDuration} fallback={ZOOM_DEFAULTS.zoomDuration}
                 hint="Travel time. -1 uses the clip duration."
                 onChange={(v) => onPatch({ zoomDuration: v })} />
            <Bool label="relative" value={item.isRelative} fallback={ZOOM_DEFAULTS.isRelative}
                  onChange={(v) => onPatch({ isRelative: v })} />
          </Section>
        </>
      )}

      {selected.track === 'rotates' && (
        <>
          <Num label="start" value={item.start} fallback={ROTATE_DEFAULTS.start} step={0.05}
               hint="Fraction of totalDuration" onChange={(v) => onPatch({ start: v })} />
          <Num label="duration (s)" value={item.duration} fallback={ROTATE_DEFAULTS.duration}
               hint="Seconds, not a fraction" onChange={(v) => onPatch({ duration: v })} />
          <Vector label="target angle" value={item.targetAngle}
                  onChange={(v) => onPatch({ targetAngle: v })} />
          <Num label="rotate speed" value={item.focusRotateSpeed}
               fallback={ROTATE_DEFAULTS.focusRotateSpeed}
               onChange={(v) => onPatch({ focusRotateSpeed: v })} />
          <Choice label="ease" value={item.easeType} fallback={ROTATE_DEFAULTS.easeType}
                  options={EASE_TYPES} onChange={(v) => onPatch({ easeType: v })} />
        </>
      )}

      {selected.track === 'shakes' && (
        <>
          <Num label="start" value={item.start} fallback={SHAKE_DEFAULTS.start} step={0.05}
               hint="Fraction of totalDuration" onChange={(v) => onPatch({ start: v })} />
          <Num label="duration (s)" value={item.duration} fallback={SHAKE_DEFAULTS.duration}
               hint="Seconds, not a fraction" onChange={(v) => onPatch({ duration: v })} />
          <Num label="strength" value={item.strength} fallback={SHAKE_DEFAULTS.strength} step={0.05}
               onChange={(v) => onPatch({ strength: v })} />
          <Num label="vibrato" value={item.vibrato} fallback={SHAKE_DEFAULTS.vibrato} step={10}
               integer min={0}
               onChange={(v) => onPatch({ vibrato: v })} />
          <Num label="randomness" value={item.randomness} fallback={SHAKE_DEFAULTS.randomness} step={10}
               onChange={(v) => onPatch({ randomness: v })} />
          <Bool label="fade out" value={item.fadeOut} fallback={SHAKE_DEFAULTS.fadeOut}
                onChange={(v) => onPatch({ fadeOut: v })} />
        </>
      )}
    </div>
  )
}

/** The four phase types share start/end/steps and diverge after that. */
function PhaseFields({ phase, onPatch }: { phase: Phase; onPatch: (p: Record<string, unknown>) => void }) {
  const unknownType = !PHASE_TYPES.includes(phase.type as never)
  const moves = phase.type === 'Relative' || phase.type === 'ToTargetWide' || phase.type === 'MoveEnemy'
  const damage = phase.type === 'GiveDamage'
  const sturn = (phase.sturn ?? {}) as Record<string, any>
  const dmg = (phase.damage ?? {}) as Record<string, any>

  return (
    <>
      <Choice label="type" value={phase.type} fallback={phase.type} options={PHASE_TYPES}
              onChange={(v) => onPatch({ type: v })} />
      {/* The plugin ignores a type it does not recognise rather than failing, so the phase is
          still shown and still saved. Silently dropping it would be the worse answer. */}
      {unknownType && (
        <p className="mt-1 text-[10px] leading-tight text-amber-600">
          The game ignores a phase type it does not know. This one is kept as written.
        </p>
      )}

      <Num label="start" value={phase.start} fallback={0} step={0.05}
           hint="Fraction of totalDuration" onChange={(v) => onPatch({ start: v })} />
      <Num label="end" value={phase.end} fallback={0} step={0.05}
           hint="Fraction of totalDuration" onChange={(v) => onPatch({ end: v })} />
      {/* int, and 0 or less makes the game skip the phase entirely (TimelineBuilder.cs:193),
          which is worth saying rather than leaving as a marker that draws but never fires. */}
      {/* Placeholder 0, not 1: an absent steps is 0 in Types.cs, and the warning below says
          what that means rather than the field quietly implying a sensible number. */}
      <Num label="steps" value={phase.steps} fallback={0} step={1} integer min={0}
           hint="Markers spread evenly from start to end. 1 puts a single one at start."
           onChange={(v) => onPatch({ steps: v })} />
      {(phase.steps ?? 0) <= 0 && (
        <p className="text-[10px] leading-tight text-amber-600">
          The game skips a phase with steps below 1. This one will not fire.
        </p>
      )}

      {moves && (
        <Section title={phase.type === 'ToTargetWide' ? 'arrival offset' : 'movement'}>
          <Vector label="move" value={phase.move} onChange={(v) => onPatch({ move: v })} />
          {phase.type !== 'ToTargetWide' && (
            <Bool label="refresh direction" value={phase.isRefreshDir} fallback={false}
                  onChange={(v) => onPatch({ isRefreshDir: v })} />
          )}
        </Section>
      )}

      {damage && (
        <>
          <Section title="damage">
            <Num label="damage ratio" value={phase.damageRatio} fallback={DEFAULT_DAMAGE_RATIO}
                 step={0.1} min={0}
                 hint="Share of the coin's damage here. Split across markers for a multi-hit."
                 onChange={(v) => onPatch({ damageRatio: v })} />
            {phase.damageRatio === 0 && (
              <p className="text-[10px] leading-tight text-amber-600">
                The game reads 0 as full damage, not none (TimelineBuilder.cs:269).
              </p>
            )}
            {/* int in Types.cs: a fractional one makes the game fail to deserialise the file and
                ignore every coin in it, so it is rounded on the way in rather than written. */}
            <Num label="visual hits" value={dmg.multiHit} fallback={DAMAGE_DEFAULTS.multiHit} step={1}
                 integer min={1}
                 onChange={(v) => onPatch({ damage: { ...dmg, multiHit: v } })} />
            <Num label="hit spacing" value={dmg.multiHitDuration}
                 fallback={DAMAGE_DEFAULTS.multiHitDuration} step={0.05}
                 onChange={(v) => onPatch({ damage: { ...dmg, multiHitDuration: v } })} />
            <Bool label="up attack" value={dmg.isUpAttack} fallback={DAMAGE_DEFAULTS.isUpAttack}
                  onChange={(v) => onPatch({ damage: { ...dmg, isUpAttack: v } })} />
          </Section>

          <Section title="knockback">
            <Choice label="type" value={sturn.sturnType} fallback={STURN_DEFAULTS.sturnType}
                    options={STURN_TYPES}
                    onChange={(v) => onPatch({ sturn: { ...sturn, sturnType: v } })} />
            <Choice label="direction" value={sturn.sturnDir} fallback={STURN_DEFAULTS.sturnDir}
                    options={STURN_DIRS}
                    onChange={(v) => onPatch({ sturn: { ...sturn, sturnDir: v } })} />
            <Choice label="timing" value={sturn.sturnTiming} fallback={STURN_DEFAULTS.sturnTiming}
                    options={STURN_TIMINGS}
                    onChange={(v) => onPatch({ sturn: { ...sturn, sturnTiming: v } })} />
            <Num label="force" value={sturn.forcePower} fallback={STURN_DEFAULTS.forcePower} step={0.5}
                 onChange={(v) => onPatch({ sturn: { ...sturn, forcePower: v } })} />
            <Num label="random force" value={sturn.randomPower} fallback={STURN_DEFAULTS.randomPower}
                 step={0.5}
                 onChange={(v) => onPatch({ sturn: { ...sturn, randomPower: v } })} />
            <Num label="airborne angle" value={sturn.airborneAngle}
                 fallback={STURN_DEFAULTS.airborneAngle} step={5}
                 onChange={(v) => onPatch({ sturn: { ...sturn, airborneAngle: v } })} />
            <Bool label="rotate target" value={sturn.isRotateTarget}
                  fallback={STURN_DEFAULTS.isRotateTarget}
                  onChange={(v) => onPatch({ sturn: { ...sturn, isRotateTarget: v } })} />
            <Num label="target angle" value={sturn.targetRotateAngle}
                 fallback={STURN_DEFAULTS.targetRotateAngle} step={5}
                 onChange={(v) => onPatch({ sturn: { ...sturn, targetRotateAngle: v } })} />
          </Section>
        </>
      )}
    </>
  )
}
