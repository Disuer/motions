import { describe, expect, it } from 'vitest'
import { pct } from './Timeline'

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
