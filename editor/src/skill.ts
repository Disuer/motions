// The shape of a skill file. schema/schema.json is the published contract, but where it and
// Motions/Types.cs disagree the C# wins, because the C# is what reads the file at runtime - see
// the note on the DEFAULTS below, which lists the three places they differ.
//
// Keep this in step with both: if it drifts, the editor writes a file the game reads differently
// from what is on screen.
//
// Times are FRACTIONS of the coin's totalDuration, except totalDuration itself and the duration
// of zooms, rotates and shakes, which are seconds. That split is the single most common thing to
// get wrong in these files, and it is why the editor draws them on a 0..1 timeline.

export const PHASE_TYPES = ['Relative', 'ToTargetWide', 'GiveDamage', 'MoveEnemy'] as const
export type PhaseType = (typeof PHASE_TYPES)[number]

export const EASE_TYPES = [
  'Unset', 'Linear',
  'InSine', 'OutSine', 'InOutSine',
  'InQuad', 'OutQuad', 'InOutQuad',
  'InCubic', 'OutCubic', 'InOutCubic',
  'InQuart', 'OutQuart', 'InOutQuart',
  'InQuint', 'OutQuint', 'InOutQuint',
  'InExpo', 'OutExpo', 'InOutExpo',
  'InCirc', 'OutCirc', 'InOutCirc',
  'InElastic', 'OutElastic', 'InOutElastic',
  'InBack', 'OutBack', 'InOutBack',
  'InBounce', 'OutBounce', 'InOutBounce',
] as const

export const STURN_TYPES = ['AIRBORNE', 'KNOCKBACK', 'HOLDING', 'STURN', 'NONE'] as const
export const STURN_DIRS = ['DIR_ACTOR', 'DIR_TARGET', 'DIR_TOACTOR', 'DIR_TOTARGET', 'NONE'] as const
export const STURN_TIMINGS = ['ALL', 'FIRST', 'LAST', 'NONE'] as const

export interface Vec3 { x?: number; y?: number; z?: number }

export interface Damage {
  multiHit?: number
  isUpAttack?: boolean
  multiHitDuration?: number
}

export interface Sturn {
  sturnType?: string
  sturnDir?: string
  sturnTiming?: string
  forcePower?: number
  randomPower?: number
  airborneAngle?: number
  isRotateTarget?: boolean
  targetRotateAngle?: number
}

/**
 * `type` is a plain string, not PhaseType: the plugin ignores a type it does not know rather than
 * failing, so a file holding one still has to open and round-trip unchanged.
 *
 * start/end/steps are required by the schema but optional here, because a file in the wild can
 * be missing them and the editor must not invent them. Absent `steps` is 0 in Types.cs, and 0
 * makes the game skip the phase (TimelineBuilder.cs:193) - writing 1 in its place would turn a
 * phase that does nothing into one that fires.
 */
export interface Phase {
  type: string
  start?: number
  end?: number
  steps?: number
  move?: Vec3
  isRefreshDir?: boolean
  damage?: Damage
  damageRatio?: number
  sturn?: Sturn
}

export interface HitChecker {
  time?: number
  isNextMotionCoinDelay?: number
}

export interface Zoom {
  start?: number
  duration?: number
  attacker?: boolean
  targets?: boolean
  between?: number
  axisY?: number
  size?: number
  zoomDuration?: number
  isRelative?: boolean
  focusSpeed?: number
  easeType?: string
}

export interface Rotate {
  start?: number
  duration?: number
  targetAngle?: Vec3
  focusRotateSpeed?: number
  easeType?: string
}

export interface Shake {
  start?: number
  duration?: number
  strength?: number
  vibrato?: number
  randomness?: number
  fadeOut?: boolean
}

export interface Coin {
  totalDuration: number
  phases: Phase[]
  hitCheckers?: HitChecker[]
  zooms?: Zoom[]
  rotates?: Rotate[]
  shakes?: Shake[]
  /** 1-indexed into the character's original VFX tracks, logged by the plugin at startup. */
  vfx?: number[]
}

export interface Skill {
  coins: Coin[]
}

/**
 * Every default in one place, taken from the FIELD INITIALISERS IN Motions/Types.cs, not from
 * schema.json. The two disagree, and Types.cs is what actually runs:
 *
 *   isUpAttack        Types.cs says true, schema says false. A `damage` object with the key left
 *                     out launches the target upward (TimelineBuilder.cs:273 only forces false
 *                     when `damage` is null altogether).
 *   focusRotateSpeed  Types.cs has no initialiser, so 0. Schema says 0.2.
 *   duration          Zoom, rotate and shake all have no initialiser, so 0. Schema says 0.5.
 *
 * Showing the schema's numbers as placeholders told authors the game would do something it does
 * not. Where they differ, the C# wins; correcting schema.json is a separate job.
 *
 * Read through `?? DEFAULTS.x` at the point of display rather than written into the file on load:
 * a field the author left out is a field the game fills in, and putting it back explicitly would
 * rewrite their file with keys they never chose. Only a value someone edits becomes explicit.
 */
export const ZOOM_DEFAULTS = {
  start: 0, duration: 0, attacker: true, targets: true, between: 0, axisY: 0,
  size: -2, zoomDuration: -1, isRelative: true, focusSpeed: 0.2, easeType: 'Unset',
} as const

export const ROTATE_DEFAULTS = {
  start: 0, duration: 0, focusRotateSpeed: 0, easeType: 'Unset',
} as const

export const SHAKE_DEFAULTS = {
  start: 0, duration: 0, strength: 0.25, vibrato: 120, randomness: 90, fadeOut: true,
} as const

export const DAMAGE_DEFAULTS = { multiHit: 1, isUpAttack: true, multiHitDuration: 0 } as const

export const STURN_DEFAULTS = {
  sturnType: 'KNOCKBACK', sturnDir: 'DIR_TOTARGET', sturnTiming: 'ALL',
  forcePower: 5, randomPower: 5, airborneAngle: 0, isRotateTarget: false, targetRotateAngle: 0,
} as const

export const HIT_CHECKER_DEFAULTS = { time: 0, isNextMotionCoinDelay: 0 } as const

/** damageRatio's default. Only meaningful on a GiveDamage phase, so it sits apart from the rest. */
export const DEFAULT_DAMAGE_RATIO = 1

/**
 * What the plugin uses when a coin has hitCheckers missing or empty: 15% of the coin
 * (TimelineBuilder.cs:74-85). It is the most common cause of "my attack gets cut short", which is
 * why a coin created here is given an explicit one at the end instead.
 */
export const IMPLIED_HIT_CHECKER_TIME = 0.15

import { stripJsoncExtras } from './spec'

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Parses a skill file, rejecting only what the editor cannot draw. Deliberately lenient
 * everywhere the plugin is lenient - an unknown phase type, an unknown ease, a field the schema
 * has not caught up with - because a file that opens read-only-ish and round-trips is far more
 * use than a refusal. Anything rejected here would otherwise put the editor on screen showing
 * numbers that are not in the file.
 */
export function parseSkill(text: string): { skill: Skill | null; error: string | null } {
  let data: unknown
  try {
    // Same tolerance the plugin reads these with: AllowTrailingCommas and comments skipped
    // (TimelineBuilder.cs:37-42). Plain JSON.parse refused files the game runs perfectly well,
    // and then told the author the game would ignore them.
    data = JSON.parse(stripJsoncExtras(text))
  } catch (e) {
    return { skill: null, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { skill: null, error: 'The top level must be an object with a "coins" array.' }
  }

  const coinsRaw = (data as { coins?: unknown }).coins
  if (!Array.isArray(coinsRaw)) {
    return { skill: null, error: 'No "coins" array. Every skill file is { "coins": [ ... ] }.' }
  }

  for (const [i, coin] of coinsRaw.entries()) {
    if (coin === null || typeof coin !== 'object' || Array.isArray(coin)) {
      return { skill: null, error: `Coin ${i + 1} is not an object.` }
    }
    const c = coin as Record<string, unknown>
    if (!isFiniteNumber(c.totalDuration) || c.totalDuration <= 0) {
      return { skill: null, error: `Coin ${i + 1} needs a totalDuration greater than 0.` }
    }
    // Every marker's position is a fraction OF the phases array, so it has to be one.
    if (c.phases !== undefined && !Array.isArray(c.phases)) {
      return { skill: null, error: `Coin ${i + 1}: "phases" must be an array.` }
    }
    for (const key of ['hitCheckers', 'zooms', 'rotates', 'shakes', 'vfx'] as const) {
      if (c[key] !== undefined && !Array.isArray(c[key])) {
        return { skill: null, error: `Coin ${i + 1}: "${key}" must be an array.` }
      }
    }
    for (const [j, phase] of ((c.phases as unknown[]) ?? []).entries()) {
      if (phase === null || typeof phase !== 'object' || Array.isArray(phase)) {
        return { skill: null, error: `Coin ${i + 1}, phase ${j + 1} is not an object.` }
      }
      const p = phase as Record<string, unknown>
      if (typeof p.type !== 'string') {
        return { skill: null, error: `Coin ${i + 1}, phase ${j + 1} has no "type".` }
      }
      // Nothing is filled in. A missing start/end/steps is drawn as the game reads it (0) and
      // shown as an empty box with that default as the placeholder; writing values in here would
      // change what the file does the first time anything else in it is edited.
    }
    // The one exception, and only because the array is what everything else indexes into. A coin
    // with no phases is schema-invalid anyway, so this adds a key to a file already broken.
    if (c.phases === undefined) c.phases = []
  }

  return { skill: data as Skill, error: null }
}

/** Two-space JSON with a trailing newline, matching what the editor writes for animation.json. */
export function serialiseSkill(skill: Skill): string {
  return JSON.stringify(skill, null, 2) + '\n'
}

/**
 * A coin with a hit checker at the very end rather than none at all. A coin with no hitCheckers
 * hands off at 15% of its length, which reads as "my animation is cut short" long after the file
 * was written, so the editor never creates that shape.
 */
export function newCoin(totalDuration = 1): Coin {
  return {
    totalDuration,
    phases: [],
    hitCheckers: [{ time: 1, isNextMotionCoinDelay: 0 }],
  }
}

/**
 * The coins array with `n` guaranteed to exist, filling any gap on the way. Adding coin 3 to a
 * one-coin file has to create 1 and 2 as well: an array cannot have a hole, and quietly appending
 * at the end instead would put the coin somewhere other than the tab it was added from.
 * Copies rather than mutating, like every other edit path - the document is compared by identity.
 */
export function withCoin(coins: Coin[], n: number): Coin[] {
  const next = coins.slice()
  while (next.length <= n) next.push(newCoin())
  return next
}

export function newPhase(type: PhaseType, at: number): Phase {
  const phase: Phase = { type, start: at, end: at, steps: 1 }
  if (type === 'GiveDamage') phase.damageRatio = DEFAULT_DAMAGE_RATIO
  else phase.move = { x: 0, y: 0, z: 0 }
  return phase
}

export function newHitChecker(at: number): HitChecker {
  return { time: at, isNextMotionCoinDelay: 0 }
}

/**
 * Half a second, for anything created here that needs a length. NOT the game's default, which is
 * 0 for all three: a zoom, rotate or shake of zero length does nothing at all, so adding one from
 * the timeline and seeing no effect would be a dead click. This is an authoring starting point,
 * written explicitly into the file like any other value someone chooses.
 */
const NEW_CLIP_SECONDS = 0.5

export function newZoom(at: number): Zoom {
  return { start: at, duration: NEW_CLIP_SECONDS, size: ZOOM_DEFAULTS.size }
}

export function newRotate(at: number): Rotate {
  return { start: at, duration: NEW_CLIP_SECONDS, targetAngle: { x: 0, y: 0, z: 0 } }
}

export function newShake(at: number): Shake {
  return { start: at, duration: NEW_CLIP_SECONDS, strength: SHAKE_DEFAULTS.strength }
}

/** Clamps a fraction to the 0..1 the schema requires. Dragging a marker is the only caller. */
export function clampFraction(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
