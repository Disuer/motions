import { describe, expect, it } from 'vitest'
import { groupMotions, nextCoin, parseMotionFolder } from './motions'

describe('parseMotionFolder', () => {
  it('reads a coin folder as a coin of its skill', () => {
    expect(parseMotionFolder('S1_2')).toEqual({ base: 'S1', coin: 2 })
    expect(parseMotionFolder('S10_11')).toEqual({ base: 'S10', coin: 11 })
  })

  it('reads a plain motion as coin 0', () => {
    expect(parseMotionFolder('S1')).toEqual({ base: 'S1', coin: 0 })
    expect(parseMotionFolder('Idle')).toEqual({ base: 'Idle', coin: 0 })
  })

  // The subtlety worth pinning: these are motions in the enum in their own right, so they must not
  // be filed as coin 2 of a "Damaged" or "Parrying" that the folder never meant.
  it('keeps an enum name that ends in a number whole', () => {
    expect(parseMotionFolder('Damaged_2')).toEqual({ base: 'Damaged_2', coin: 0 })
    expect(parseMotionFolder('Special1')).toEqual({ base: 'Special1', coin: 0 })
    expect(parseMotionFolder('Duel_Ready')).toEqual({ base: 'Duel_Ready', coin: 0 })
  })

  it('leaves anything that is not a plain positive number alone', () => {
    expect(parseMotionFolder('S1_')).toEqual({ base: 'S1_', coin: 0 })
    expect(parseMotionFolder('S1_x')).toEqual({ base: 'S1_x', coin: 0 })
    expect(parseMotionFolder('S1_-2')).toEqual({ base: 'S1_-2', coin: 0 })
    expect(parseMotionFolder('S1_2.5')).toEqual({ base: 'S1_2.5', coin: 0 })
    expect(parseMotionFolder('_2')).toEqual({ base: '_2', coin: 0 })
  })
})

describe('groupMotions', () => {
  it('files a skill and its coins under one entry, in coin order', () => {
    const groups = groupMotions(['Idle', 'S1', 'S1_1', 'S1_2'])
    expect(groups.map((g) => g.base)).toEqual(['Idle', 'S1'])
    expect(groups[1].variants.map((v) => v.coin)).toEqual([0, 1, 2])
    expect(groups[1].variants.map((v) => v.folder)).toEqual(['S1', 'S1_1', 'S1_2'])
  })

  it('carries the original index through, since specs and dirty are keyed by it', () => {
    const groups = groupMotions(['Idle', 'S1', 'S1_1'])
    expect(groups[1].variants.map((v) => v.index)).toEqual([1, 2])
  })

  it('keeps the order the folders arrived in, which is already natural-sorted', () => {
    expect(groupMotions(['S1', 'S2', 'S10']).map((g) => g.base)).toEqual(['S1', 'S2', 'S10'])
  })

  // A coin whose base folder was never made is still that skill's coin, and still needs somewhere
  // to live rather than becoming a top-level tab of its own.
  it('groups a coin even when the motion itself has no folder', () => {
    const groups = groupMotions(['S1_2'])
    expect(groups).toHaveLength(1)
    expect(groups[0].base).toBe('S1')
    expect(groups[0].variants.map((v) => v.coin)).toEqual([2])
  })

  it('marks which motions take coins at all', () => {
    const groups = groupMotions(['Idle', 'S1', 'Special1'])
    expect(groups.map((g) => [g.base, g.takesCoins])).toEqual([
      ['Idle', false], ['S1', true], ['Special1', false],
    ])
  })

  it('sorts coins numerically, not as text', () => {
    const groups = groupMotions(['S1_10', 'S1_2', 'S1'])
    expect(groups[0].variants.map((v) => v.coin)).toEqual([0, 2, 10])
  })
})

describe('nextCoin', () => {
  it('is one past the highest coin there, so it never collides', () => {
    expect(nextCoin(groupMotions(['S1'])[0])).toBe(1)
    expect(nextCoin(groupMotions(['S1', 'S1_1', 'S1_2'])[0])).toBe(3)
    expect(nextCoin(groupMotions(['S1', 'S1_7'])[0])).toBe(8)
  })
})
