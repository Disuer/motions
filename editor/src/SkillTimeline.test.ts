import { describe, expect, it } from 'vitest'
import {
  Marker, patchMarker, positionOf, removeMarker, rulerLabel, widthOf,
} from './SkillTimeline'
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

describe('rulerLabel', () => {
  // With a sprite motion behind the coin the fraction axis IS a seconds axis, and saying so is
  // what lets a phase be read against the frame it fires on.
  it('reads seconds when a duration resolves', () => {
    expect(rulerLabel(0.5, 1.2)).toBe('0.6s')
    expect(rulerLabel(0, 1.2)).toBe('0s')
    expect(rulerLabel(1, 1.2)).toBe('1.2s')
  })

  it('reads the fraction when no duration does', () => {
    expect(rulerLabel(0.5, null)).toBe('0.5')
    expect(rulerLabel(0.3, null)).toBe('0.3')
  })

  // A zero or negative duration would label every tick 0s, which is worse than the fraction.
  it('falls back to the fraction on a duration that is not positive', () => {
    expect(rulerLabel(0.5, 0)).toBe('0.5')
    expect(rulerLabel(0.5, -1)).toBe('0.5')
  })
})

describe('patchMarker', () => {
  it('writes onto the marker the selection names', () => {
    const c = coin({ phases: [{ type: 'GiveDamage', start: 0 }, { type: 'Relative', start: 0.5 }] })
    patchMarker(c, { track: 'phases', index: 1 }, { start: 0.7 })
    expect(c.phases[1].start).toBe(0.7)
    expect(c.phases[0].start).toBe(0)
  })

  // undefined means the field was cleared, and cleared means the key goes. Assigning undefined
  // would leave it present, and then the model and the file disagree about whether it is set.
  it('deletes a key set to undefined rather than assigning undefined', () => {
    const c = coin({ zooms: [{ start: 0, size: -2 }] })
    patchMarker(c, { track: 'zooms', index: 0 }, { size: undefined })
    expect('size' in c.zooms![0]).toBe(false)
  })

  it('does nothing when the marker is not there', () => {
    const c = coin()
    expect(() => patchMarker(c, { track: 'phases', index: 3 }, { start: 1 })).not.toThrow()
  })
})

describe('removeMarker', () => {
  it('splices the marker out of its own track', () => {
    const c = coin({
      phases: [{ type: 'A' }, { type: 'B' }],
      shakes: [{ start: 0 }],
    })
    removeMarker(c, { track: 'phases', index: 0 })
    expect(c.phases.map((p) => p.type)).toEqual(['B'])
    expect(c.shakes).toHaveLength(1)
  })

  it('does nothing on a track that is not there', () => {
    const c = coin()
    expect(() => removeMarker(c, { track: 'rotates', index: 0 })).not.toThrow()
  })
})
