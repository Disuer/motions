import { describe, expect, it } from 'vitest'
import { mergeMotions, parseMotionFolder, slotFor, spriteFor } from './motions'

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

describe('mergeMotions', () => {
  it('unions folder bases and skill file bases into one entry each', () => {
    const merged = mergeMotions(
      ['Idle', 'S1', 'S1_1'],
      [{ name: 'S1.json', coins: 2 }, { name: 'S2.json', coins: 1 }],
    )
    expect(merged.map((e) => e.base)).toEqual(['Idle', 'S1', 'S2'])
    expect(merged.map((e) => e.skill)).toEqual([null, 0, 1])
  })

  it('takes the coin count from whichever side is longer, and never goes below one', () => {
    const jsonLonger = mergeMotions(['S1'], [{ name: 'S1.json', coins: 3 }])
    expect(jsonLonger[0].coins.map((s) => s.coin)).toEqual([0, 1, 2])

    const foldersLonger = mergeMotions(['S1', 'S1_1', 'S1_2'], [{ name: 'S1.json', coins: 1 }])
    expect(foldersLonger[0].coins.map((s) => s.coin)).toEqual([0, 1, 2])

    expect(mergeMotions(['Idle'], [])[0].coins).toHaveLength(1)
  })

  // The pairing the whole feature rests on: coin 0 is the bare folder, coin n is <base>_<n>.
  it('maps coin 0 to the bare folder and coin n to <base>_<n>', () => {
    const merged = mergeMotions(['S1', 'S1_1'], [{ name: 'S1.json', coins: 2 }])
    expect(merged[0].coins.map((s) => s.folder)).toEqual(['S1', 'S1_1'])
    expect(merged[0].coins.map((s) => s.motion)).toEqual([0, 1])
    expect(merged[0].coins.map((s) => s.json)).toEqual([true, true])
  })

  it('says which side is missing rather than hiding the coin', () => {
    // Three coins in the file, one folder: coins 2 and 3 have no art of their own.
    const jsonOnly = mergeMotions(['S1'], [{ name: 'S1.json', coins: 3 }])
    expect(jsonOnly[0].coins.map((s) => s.motion)).toEqual([0, null, null])
    expect(jsonOnly[0].coins.map((s) => s.json)).toEqual([true, true, true])

    // Two folders, one coin in the file: S1_1's art is never built into a timeline.
    const folderOnly = mergeMotions(['S1', 'S1_1'], [{ name: 'S1.json', coins: 1 }])
    expect(folderOnly[0].coins.map((s) => s.json)).toEqual([true, false])
  })

  it('gives a skill that exists only as a JSON file an entry with no folders', () => {
    const merged = mergeMotions([], [{ name: 'S1.json', coins: 2 }])
    expect(merged).toHaveLength(1)
    expect(merged[0].base).toBe('S1')
    expect(merged[0].coins.map((s) => s.motion)).toEqual([null, null])
    expect(merged[0].coins.map((s) => s.folder)).toEqual(['S1', 'S1_1'])
  })

  // The coin number is the array position now, not a sort key, so S1_10 has to land at index 10
  // with the untouched coins between it and S1_2 showing as slots with nothing in them.
  it('places a coin at its own number, whatever order the folders arrived in', () => {
    const merged = mergeMotions(['S1_10', 'S1_2', 'S1'], [])
    expect(merged[0].coins).toHaveLength(11)
    expect(merged[0].coins[10].folder).toBe('S1_10')
    expect(merged[0].coins.map((s) => s.motion)).toEqual([2, null, 1, null, null, null, null, null, null, null, 0])
  })

  it('carries the motion index through, since specs and dirty are keyed by it', () => {
    const merged = mergeMotions(['Idle', 'S1', 'S1_1'], [])
    expect(merged[1].coins.map((s) => s.motion)).toEqual([1, 2])
  })

  // Damaged_2 is a MOTION_DETAIL in its own right, so parseMotionFolder keeps it whole and it
  // must land as its own entry rather than as coin 2 of a Damaged that was never meant.
  it('keeps an enum name that ends in a number as its own entry', () => {
    const merged = mergeMotions(['Damaged', 'Damaged_2'], [])
    expect(merged.map((e) => e.base)).toEqual(['Damaged', 'Damaged_2'])
    expect(merged.map((e) => e.coins.length)).toEqual([1, 1])
  })

  it('marks which motions take coins at all', () => {
    const merged = mergeMotions(['Idle', 'S1', 'Special1'], [])
    expect(merged.map((e) => [e.base, e.takesCoins])).toEqual([
      ['Idle', false], ['S1', true], ['Special1', false],
    ])
  })

  it('orders entries naturally, so a JSON-only skill lands in sequence', () => {
    const merged = mergeMotions(['S1', 'S10'], [{ name: 'S2.json', coins: 1 }])
    expect(merged.map((e) => e.base)).toEqual(['S1', 'S2', 'S10'])
  })

  // A non-skill motion can still have a .json - the plugin reads <name>.json for any MOTION_DETAIL.
  it('gives a non-skill motion its file coins without marking it as taking coins', () => {
    const merged = mergeMotions(['Idle'], [{ name: 'Idle.json', coins: 2 }])
    expect(merged[0].takesCoins).toBe(false)
    expect(merged[0].coins).toHaveLength(2)
  })
})

describe('slotFor', () => {
  it('answers for a coin past the end, which is how a new one is selected before it exists', () => {
    const entry = mergeMotions(['S1'], [{ name: 'S1.json', coins: 1 }])[0]
    expect(slotFor(entry, 0)).toEqual({ coin: 0, folder: 'S1', motion: 0, json: true })
    expect(slotFor(entry, 2)).toEqual({ coin: 2, folder: 'S1_2', motion: null, json: false })
  })
})

describe('spriteFor', () => {
  it("prefers the coin's own folder", () => {
    const entry = mergeMotions(['S1', 'S1_1'], [{ name: 'S1.json', coins: 2 }])[0]
    expect(spriteFor(entry, 1)).toBe(1)
  })

  // MotionData.TryGetSpriteMotion falls back to index 0 for any coin above it.
  it('falls back to the bare folder for a coin without one', () => {
    const entry = mergeMotions(['S1'], [{ name: 'S1.json', coins: 3 }])[0]
    expect(spriteFor(entry, 2)).toBe(0)
    expect(spriteFor(entry, 9)).toBe(0)
  })

  // No <base>/ and no <base>_<n>/ leaves coinDurations[n] unset, so totalDuration stays live -
  // even though a sibling coin does have art. That is the plugin's behaviour, not a shortcut.
  it('answers null when neither the coin nor coin 0 has a folder', () => {
    const entry = mergeMotions(['S1_1'], [{ name: 'S1.json', coins: 3 }])[0]
    expect(spriteFor(entry, 2)).toBeNull()
    expect(spriteFor(entry, 0)).toBeNull()
    expect(spriteFor(entry, 1)).toBe(0)
  })
})
