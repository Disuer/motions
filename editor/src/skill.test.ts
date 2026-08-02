import { describe, expect, it } from 'vitest'
import {
  DAMAGE_DEFAULTS, ROTATE_DEFAULTS, SHAKE_DEFAULTS, STURN_DEFAULTS, ZOOM_DEFAULTS,
  clampFraction, newCoin, newPhase, parseSkill, serialiseSkill,
} from './skill'

const skill = (coins: unknown[]) => JSON.stringify({ coins })

describe('parseSkill', () => {
  it('reads a coin with every array the schema allows', () => {
    const { skill: s, error } = parseSkill(skill([{
      totalDuration: 2,
      phases: [{ type: 'GiveDamage', start: 0.3, end: 0.3, steps: 1 }],
      hitCheckers: [{ time: 1 }],
      zooms: [{ start: 0.2, duration: 0.5 }],
      rotates: [], shakes: [], vfx: [1, 3],
    }]))

    expect(error).toBeNull()
    expect(s!.coins[0].totalDuration).toBe(2)
    expect(s!.coins[0].phases[0].type).toBe('GiveDamage')
    expect(s!.coins[0].vfx).toEqual([1, 3])
  })

  // The plugin ignores a phase type it does not know rather than failing, so refusing the file
  // would strand an author on a file the game runs happily.
  it('accepts a phase type the schema does not list', () => {
    const { skill: s, error } = parseSkill(skill([{
      totalDuration: 1,
      phases: [{ type: 'SomethingNewInTheGame', start: 0, end: 0, steps: 1 }],
    }]))
    expect(error).toBeNull()
    expect(s!.coins[0].phases[0].type).toBe('SomethingNewInTheGame')
  })

  // Filling these in was a bug: Types.cs gives an absent `steps` the value 0, and 0 makes the
  // game SKIP the phase (TimelineBuilder.cs:193). Writing 1 in its place turned a phase that did
  // nothing into one that fired, the first time anything else in the file was edited and saved.
  it('invents nothing for a phase missing start, end and steps', () => {
    const { skill: s, error } = parseSkill(skill([
      { totalDuration: 1, phases: [{ type: 'Relative' }] },
    ]))
    expect(error).toBeNull()
    expect(s!.coins[0].phases[0]).toEqual({ type: 'Relative' })
  })

  it('treats a coin with no phases as a coin with none, not a broken one', () => {
    const { skill: s, error } = parseSkill(skill([{ totalDuration: 1 }]))
    expect(error).toBeNull()
    expect(s!.coins[0].phases).toEqual([])
  })

  it('rejects what the timeline cannot be drawn from', () => {
    expect(parseSkill('{not json').error).toMatch(/Not valid JSON/)
    expect(parseSkill('[]').error).toMatch(/top level must be an object/)
    expect(parseSkill('{}').error).toMatch(/No "coins" array/)
    expect(parseSkill(skill([{ phases: [] }])).error).toMatch(/totalDuration greater than 0/)
    expect(parseSkill(skill([{ totalDuration: 0 }])).error).toMatch(/totalDuration greater than 0/)
    expect(parseSkill(skill([{ totalDuration: -1 }])).error).toMatch(/totalDuration greater than 0/)
    expect(parseSkill(skill([{ totalDuration: 1, phases: {} }])).error).toMatch(/"phases" must be an array/)
    expect(parseSkill(skill([{ totalDuration: 1, zooms: 3 }])).error).toMatch(/"zooms" must be an array/)
    expect(parseSkill(skill([{ totalDuration: 1, phases: [{ start: 0 }] }])).error).toMatch(/no "type"/)
  })

  it('names the coin and phase a problem is in, since a file holds several', () => {
    const text = skill([{ totalDuration: 1, phases: [] }, { totalDuration: 1, phases: [{}] }])
    expect(parseSkill(text).error).toMatch(/Coin 2, phase 1/)
  })
})

// The editor writes over a file someone else may have hand-written against a newer game than the
// schema knows about. Dropping a key it does not recognise would be a silent edit.
describe('serialiseSkill', () => {
  it('round-trips a field the editor has never heard of', () => {
    const text = skill([{
      totalDuration: 1,
      phases: [{ type: 'Relative', start: 0, end: 0, steps: 1, someNewField: 42 }],
      aFutureCoinArray: [{ a: 1 }],
    }])
    const { skill: s } = parseSkill(text)
    const out = JSON.parse(serialiseSkill(s!))

    expect(out.coins[0].phases[0].someNewField).toBe(42)
    expect(out.coins[0].aFutureCoinArray).toEqual([{ a: 1 }])
  })

  it('does not write defaults the author left out', () => {
    const { skill: s } = parseSkill(skill([{ totalDuration: 1, phases: [], zooms: [{ start: 0.2 }] }]))
    const out = JSON.parse(serialiseSkill(s!))
    expect(out.coins[0].zooms[0]).toEqual({ start: 0.2 })
  })

  // The shape of a real file: every one in the wild carries a $schema line for editor
  // autocompletion, at the root, where this editor has no field for it. Dropping it on save would
  // quietly take away the author's autocompletion in VS Code.
  it('keeps the $schema line a real file opens with', () => {
    const text = JSON.stringify({
      $schema: 'https://example.invalid/schema.json',
      coins: [{
        totalDuration: 1,
        phases: [{
          type: 'ToTargetWide', start: 0.2, end: 0.2, steps: 1,
          move: { x: 2, y: 0, z: 0 }, isRefreshDir: false,
        }],
      }],
    })
    const { skill: s, error } = parseSkill(text)
    expect(error).toBeNull()
    expect(JSON.parse(serialiseSkill(s!))).toEqual(JSON.parse(text))
  })

  it('ends with a newline, like the animation.json writer', () => {
    expect(serialiseSkill({ coins: [] }).endsWith('}\n')).toBe(true)
  })
})

describe('newCoin', () => {
  // A coin with no hitCheckers hands off at 15% of its length, which surfaces much later as "my
  // attack gets cut short". The editor never creates that shape.
  it('comes with a hit checker at the end, not none', () => {
    expect(newCoin(2).hitCheckers).toEqual([{ time: 1, isNextMotionCoinDelay: 0 }])
  })
})

describe('newPhase', () => {
  it('gives a damage phase a ratio and a movement phase an offset', () => {
    expect(newPhase('GiveDamage', 0.5)).toMatchObject({ start: 0.5, end: 0.5, steps: 1, damageRatio: 1 })
    expect(newPhase('Relative', 0.5).move).toEqual({ x: 0, y: 0, z: 0 })
    expect(newPhase('GiveDamage', 0.5).move).toBeUndefined()
  })
})

describe('clampFraction', () => {
  it('holds a dragged marker inside the 0..1 the schema requires', () => {
    expect(clampFraction(-0.5)).toBe(0)
    expect(clampFraction(1.5)).toBe(1)
    expect(clampFraction(0.25)).toBe(0.25)
    expect(clampFraction(NaN)).toBe(0)
  })
})

// These come from the field initialisers in Motions/Types.cs, NOT from schema.json, which
// disagrees on all three. The C# is what runs, so it is what the editor has to show.
describe('defaults that differ from schema.json', () => {
  it('matches Types.cs on isUpAttack, which schema.json has as false', () => {
    expect(DAMAGE_DEFAULTS.isUpAttack).toBe(true)
  })

  it('matches Types.cs on the uninitialised fields, which schema.json gives values to', () => {
    expect(ROTATE_DEFAULTS.focusRotateSpeed).toBe(0)
    expect(ZOOM_DEFAULTS.duration).toBe(0)
    expect(ROTATE_DEFAULTS.duration).toBe(0)
    expect(SHAKE_DEFAULTS.duration).toBe(0)
  })

  it('still matches on everything both agree about', () => {
    expect(ZOOM_DEFAULTS.size).toBe(-2)
    expect(ZOOM_DEFAULTS.zoomDuration).toBe(-1)
    expect(ZOOM_DEFAULTS.focusSpeed).toBe(0.2)
    expect(SHAKE_DEFAULTS.vibrato).toBe(120)
    expect(STURN_DEFAULTS.sturnType).toBe('KNOCKBACK')
    expect(DAMAGE_DEFAULTS.multiHit).toBe(1)
  })
})
