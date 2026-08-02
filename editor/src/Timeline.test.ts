import { describe, expect, it } from 'vitest'
import { pct, tickStep } from './Timeline'

describe('tickStep', () => {
  it('rules a short motion finely and a long one coarsely', () => {
    expect(tickStep(0.4)).toBe(0.05)
    expect(tickStep(1)).toBe(0.1)
    expect(tickStep(5)).toBe(0.5)
  })

  it('never asks for more than about ten ticks', () => {
    for (const d of [0.2, 0.75, 1, 2.3, 8, 60, 500]) {
      expect(d / tickStep(d)).toBeLessThanOrEqual(10)
    }
  })
})

describe('pct', () => {
  it('places t at the matching percentage of a normal duration', () => {
    expect(pct(0.5, 2)).toBe('25%')
    expect(pct(2, 2)).toBe('100%')
  })

  it('does not divide by a zero duration', () => {
    expect(pct(1, 0)).toBe('0%')
  })

  it('does not divide by a negative duration', () => {
    expect(pct(1, -5)).toBe('0%')
  })

  it('does not propagate a NaN duration', () => {
    expect(pct(1, NaN)).toBe('0%')
  })
})
