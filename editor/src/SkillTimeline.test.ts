import { describe, expect, it } from 'vitest'
import { Marker, positionOf, widthOf } from './SkillTimeline'
import { Coin } from './skill'

const coin = (over: Partial<Coin> = {}): Coin => ({ totalDuration: 2, phases: [], ...over })

describe('positionOf', () => {
  it('reads a phase from start and a hit checker from time', () => {
    const c = coin({
      phases: [{ type: 'GiveDamage', start: 0.3, end: 0.4, steps: 1 }],
      hitCheckers: [{ time: 0.9 }],
    })
    expect(positionOf(c, { track: 'phases', index: 0 })).toBe(0.3)
    expect(positionOf(c, { track: 'hitCheckers', index: 0 })).toBe(0.9)
  })

  it('falls back to 0 for a field the author left out, rather than drawing NaN', () => {
    const c = coin({ zooms: [{}], hitCheckers: [{}] })
    expect(positionOf(c, { track: 'zooms', index: 0 })).toBe(0)
    expect(positionOf(c, { track: 'hitCheckers', index: 0 })).toBe(0)
  })
})

describe('widthOf', () => {
  it('spans a phase from start to end', () => {
    const c = coin({ phases: [{ type: 'Relative', start: 0.2, end: 0.6, steps: 1 }] })
    expect(widthOf(c, { track: 'phases', index: 0 })).toBeCloseTo(0.4, 9)
  })

  // The whole reason the camera tracks are drawn: their duration is in SECONDS while their start
  // is a fraction, so a 0.5s clip in a 2s coin has to come out a quarter of the bar.
  it('converts a camera duration from seconds into a fraction of the coin', () => {
    const c = coin({ totalDuration: 2, zooms: [{ start: 0.1, duration: 0.5 }] })
    expect(widthOf(c, { track: 'zooms', index: 0 })).toBeCloseTo(0.25, 9)
  })

  it('gives a hit checker no width, since it is an instant', () => {
    expect(widthOf(coin({ hitCheckers: [{ time: 0.5 }] }), { track: 'hitCheckers', index: 0 })).toBe(0)
  })

  it('never returns a negative width for a phase whose end precedes its start', () => {
    const c = coin({ phases: [{ type: 'Relative', start: 0.8, end: 0.2, steps: 1 }] })
    expect(widthOf(c, { track: 'phases', index: 0 })).toBe(0)
  })

  it('does not divide by a zero totalDuration', () => {
    const c = coin({ totalDuration: 0, shakes: [{ start: 0, duration: 1 }] })
    const m: Marker = { track: 'shakes', index: 0 }
    expect(widthOf(c, m)).toBe(0)
  })
})
