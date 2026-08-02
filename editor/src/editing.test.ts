import { describe, expect, it } from 'vitest'
import {
  alignFrame, dirtyMotions, nudgeAllFrames, planSave, remapAfterRemoval, remapFrameIndex,
  removeFrame, sortFramesByTime, spaceEvenlyFrames,
} from './editing'
import { LoadedCharacter } from './fs'
import { Frame } from './spec'

function frame(sprite: string, offset: [number, number], scale = 1): Frame {
  return { t: 0, sprite, offset, scale }
}

describe('nudgeAllFrames', () => {
  it('adds the same delta to every frame, leaving other fields untouched', () => {
    const frames = [frame('a.png', [0, 0]), frame('b.png', [0.1, -0.2], 2)]
    const next = nudgeAllFrames(frames, 0.05, -0.01)
    expect(next[0].offset[0]).toBeCloseTo(0.05, 9)
    expect(next[0].offset[1]).toBeCloseTo(-0.01, 9)
    expect(next[1].offset[0]).toBeCloseTo(0.15, 9)
    expect(next[1].offset[1]).toBeCloseTo(-0.21, 9)
    expect(next[1].scale).toBe(2)
    expect(next[1].sprite).toBe('b.png')
  })

  it('does not mutate the input array or its frames', () => {
    const frames = [frame('a.png', [0, 0])]
    const next = nudgeAllFrames(frames, 1, 1)
    expect(frames[0].offset).toEqual([0, 0])
    expect(next).not.toBe(frames)
  })

  it('is a no-op with a zero delta', () => {
    const frames = [frame('a.png', [0.4, -0.4])]
    expect(nudgeAllFrames(frames, 0, 0)).toEqual(frames)
  })
})

describe('alignFrame', () => {
  const f = frame('a.png', [1, 1])
  // content off-centre and floating above the canvas bottom, at ppu 200:
  // x should move to -0.25 (see png.test.ts's alignOffset cases), y to -0.5.
  const b = { x: 100, y: 100, w: 100, h: 200 }

  it("axis 'xy' replaces both offset components", () => {
    const out = alignFrame(f, b, 200, 400, 200, 'xy')
    expect(out.offset[0]).toBeCloseTo(-0.25, 9)
    expect(out.offset[1]).toBeCloseTo(-0.5, 9)
  })

  it("axis 'x' replaces x but leaves the original y untouched", () => {
    const out = alignFrame(f, b, 200, 400, 200, 'x')
    expect(out.offset[0]).toBeCloseTo(-0.25, 9)
    expect(out.offset[1]).toBe(1)  // unchanged from the input frame's offset
  })

  it('accounts for per-frame scale via effectivePpu', () => {
    // At scale 2, effectivePpu(200, 2) = 100, so the same pixel offsets cover twice the world units.
    const scaled = frame('a.png', [0, 0], 2)
    const out = alignFrame(scaled, b, 200, 400, 200, 'xy')
    expect(out.offset[0]).toBeCloseTo(-0.5, 9)
    expect(out.offset[1]).toBeCloseTo(-1, 9)
  })

  it('leaves fields other than offset untouched', () => {
    const out = alignFrame(f, b, 200, 400, 200, 'xy')
    expect(out.sprite).toBe('a.png')
    expect(out.scale).toBe(1)
    expect(out.t).toBe(0)
  })
})

describe('spaceEvenlyFrames', () => {
  it('places frame i at i/fps and sets duration to count/fps', () => {
    const frames = [frame('a.png', [0, 0]), frame('b.png', [0, 0]), frame('c.png', [0, 0])]
    const out = spaceEvenlyFrames(frames, 12)
    expect(out.frames.map((f) => f.t)).toEqual([0, 1 / 12, 2 / 12])
    expect(out.duration).toBeCloseTo(3 / 12, 9)
  })

  it('leaves non-time fields untouched', () => {
    const frames = [frame('a.png', [0.4, -0.2], 2)]
    const out = spaceEvenlyFrames(frames, 24)
    expect(out.frames[0].sprite).toBe('a.png')
    expect(out.frames[0].offset).toEqual([0.4, -0.2])
    expect(out.frames[0].scale).toBe(2)
  })

  it('handles a single frame: t 0, duration 1/fps', () => {
    const out = spaceEvenlyFrames([frame('a.png', [0, 0])], 12)
    expect(out.frames[0].t).toBe(0)
    expect(out.duration).toBeCloseTo(1 / 12, 9)
  })

  it('handles an empty frame list without throwing', () => {
    const out = spaceEvenlyFrames([], 12)
    expect(out.frames).toEqual([])
    expect(out.duration).toBe(0)
  })

  it('does not mutate the input array', () => {
    const frames = [frame('a.png', [0, 0])]
    spaceEvenlyFrames(frames, 12)
    expect(frames[0].t).toBe(0)
  })
})

describe('sortFramesByTime', () => {
  it('sorts scrambled frames into ascending t, keeping each sprite paired with its own t', () => {
    const frames = [
      frame('c.png', [0, 0]), // t 0.2, set below
      frame('a.png', [0, 0]),
      frame('b.png', [0, 0]),
    ]
    frames[0].t = 0.2
    frames[1].t = 0
    frames[2].t = 0.1
    const out = sortFramesByTime(frames)
    expect(out.map((f) => f.t)).toEqual([0, 0.1, 0.2])
    // The point of this test: a sort that reorders times but not the sprites that go with
    // them is the exact bug being guarded against.
    expect(out.map((f) => f.sprite)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('does not mutate the input array', () => {
    const frames = [frame('b.png', [0, 0]), frame('a.png', [0, 0])]
    frames[0].t = 1
    frames[1].t = 0
    const out = sortFramesByTime(frames)
    expect(frames.map((f) => f.sprite)).toEqual(['b.png', 'a.png'])
    expect(out).not.toBe(frames)
  })

  it('is a no-op on an already-sorted list', () => {
    const frames = [frame('a.png', [0, 0]), frame('b.png', [0, 0])]
    frames[1].t = 0.1
    expect(sortFramesByTime(frames).map((f) => f.sprite)).toEqual(['a.png', 'b.png'])
  })
})

describe('removeFrame', () => {
  const frames = [frame('a.png', [0, 0]), frame('b.png', [0.1, 0]), frame('c.png', [0.2, 0])]

  it('removes the first frame, keeping the rest in order with their own fields', () => {
    const out = removeFrame(frames, 0)
    expect(out.map((f) => f.sprite)).toEqual(['b.png', 'c.png'])
    expect(out[0].offset).toEqual([0.1, 0])
    expect(out[1].offset).toEqual([0.2, 0])
  })

  it('removes a middle frame, keeping the others paired with their own sprite', () => {
    const out = removeFrame(frames, 1)
    expect(out.map((f) => f.sprite)).toEqual(['a.png', 'c.png'])
  })

  it('removes the last frame', () => {
    const out = removeFrame(frames, 2)
    expect(out.map((f) => f.sprite)).toEqual(['a.png', 'b.png'])
  })

  it('does not mutate the input array', () => {
    removeFrame(frames, 1)
    expect(frames.map((f) => f.sprite)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('refuses to remove the last remaining frame, returning the same array unchanged', () => {
    const one = [frame('only.png', [0, 0])]
    const out = removeFrame(one, 0)
    expect(out).toBe(one) // same reference: callers can tell nothing happened
    expect(out.map((f) => f.sprite)).toEqual(['only.png'])
  })
})

describe('remapAfterRemoval', () => {
  it('shifts an index after the removed one down by one', () => {
    expect(remapAfterRemoval(2, 0, 2)).toBe(1)
  })

  it('leaves an index before the removed one untouched', () => {
    expect(remapAfterRemoval(0, 2, 2)).toBe(0)
  })

  it('clamps the removed index itself into the new range', () => {
    // 3 frames, index 2 (last) removed, 2 remain (valid indices 0..1) - clamps to 1.
    expect(remapAfterRemoval(2, 2, 2)).toBe(1)
  })

  it('clamps to 0 when the only two frames become one and the first is removed', () => {
    expect(remapAfterRemoval(0, 0, 1)).toBe(0)
  })

  it('passes null through unchanged: no selection stays no selection', () => {
    expect(remapAfterRemoval(null, 1, 2)).toBeNull()
  })
})

describe('remapFrameIndex', () => {
  // A(t=0), B(t=0.1), C(t=0.2) — then C is dragged to t=0.05, landing between A and B.
  // Post-sort order is [A, C, B]: C moved from index 2 to index 1, and B moved from index 1
  // to index 2 even though B itself was never touched by the drag.
  const pre = [frame('a.png', [0, 0]), frame('b.png', [0, 0]), frame('c.png', [0, 0])]
  pre[0].t = 0
  pre[1].t = 0.1
  pre[2].t = 0.05
  const sorted = sortFramesByTime(pre)

  it('follows the dragged frame to its new index', () => {
    const newIndex = remapFrameIndex(pre, sorted, 2) // 2 = C's pre-sort index
    expect(newIndex).toBe(1)
    expect(sorted[newIndex!].sprite).toBe('c.png')
  })

  it('follows a different, selected frame that the drag reordered past', () => {
    const newIndex = remapFrameIndex(pre, sorted, 1) // 1 = B's pre-sort index; B was not dragged
    expect(newIndex).toBe(2)
    expect(sorted[newIndex!].sprite).toBe('b.png')
  })

  it('leaves a selected frame whose position the drag did not affect', () => {
    const newIndex = remapFrameIndex(pre, sorted, 0) // 0 = A's pre-sort index
    expect(newIndex).toBe(0)
    expect(sorted[newIndex!].sprite).toBe('a.png')
  })

  it('passes null through unchanged: no frame selected is not a frame to look up', () => {
    expect(remapFrameIndex(pre, sorted, null)).toBeNull()
  })
})

/** planSave only reads .mode and .motions[i].folder; everything else is irrelevant to the plan. */
function character(mode: 'appearance' | 'override', folders: string[]): LoadedCharacter {
  return { mode, motions: folders.map((folder) => ({ folder })) } as unknown as LoadedCharacter
}

describe('dirtyMotions', () => {
  it('passes real motion indices through untouched', () => {
    expect(dirtyMotions(new Set([0, 2, 1]))).toEqual(expect.arrayContaining([0, 1, 2]))
  })

  it('filters out the -1 appearance.json sentinel', () => {
    expect(dirtyMotions(new Set([-1, 0]))).toEqual([0])
    expect(dirtyMotions(new Set([-1]))).toEqual([])
  })

  it('is empty for an empty dirty set', () => {
    expect(dirtyMotions(new Set())).toEqual([])
  })
})

// This is what the confirmation dialog shows and what save() then writes - under-reporting here
// is worse than no dialog at all, so every case that decides which files appear is covered.
describe('planSave', () => {
  it('lists only the dirty motions, not clean ones', () => {
    const c = character('override', ['Idle', 'S1', 'S2'])
    const plan = planSave(c, new Set([1]))
    expect(plan.indices).toEqual([1])
    expect(plan.files).toEqual(['motions/S1/animation.json'])
  })

  it('lists every dirty motion, in no particular guaranteed order beyond what the Set gives', () => {
    const c = character('override', ['Idle', 'S1', 'S2'])
    const plan = planSave(c, new Set([0, 2]))
    expect(new Set(plan.indices)).toEqual(new Set([0, 2]))
    expect(new Set(plan.files)).toEqual(
      new Set(['motions/Idle/animation.json', 'motions/S2/animation.json']),
    )
  })

  it('includes appearance.json in new-appearance mode', () => {
    const c = character('appearance', ['Idle'])
    const plan = planSave(c, new Set([0]))
    expect(plan.appearance).toBe(true)
    expect(plan.files).toEqual(['motions/Idle/animation.json', 'appearance.json'])
  })

  it('excludes appearance.json in override mode', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set([0]))
    expect(plan.appearance).toBe(false)
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('still writes appearance.json in appearance mode when only the base changed (-1 only)', () => {
    const c = character('appearance', ['Idle', 'S1'])
    const plan = planSave(c, new Set([-1]))
    expect(plan.indices).toEqual([])
    expect(plan.appearance).toBe(true)
    expect(plan.files).toEqual(['appearance.json'])
  })

  it('the -1 sentinel never produces a bogus motions/-1/... path', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set([-1, 0]))
    expect(plan.indices).toEqual([0])
    expect(plan.files.every((f) => !f.includes('-1'))).toBe(true)
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('is empty when nothing is dirty and the character is in override mode', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set())
    expect(plan.indices).toEqual([])
    expect(plan.files).toEqual([])
  })

  // The root-cause regression from the review finding: save() must consume the plan object, not
  // re-read `dirty`, because nothing on screen stops `dirty` growing while the confirmation
  // dialog is open. This pins the half of that fix that lives in planSave: its output is a
  // snapshot, not a live view - mutating the Set handed to it after the fact must not change
  // what a previously-taken plan says.
  it('freezes the write set at plan time: a dirty set that grows afterward does not change it', () => {
    const c = character('override', ['Idle', 'S1'])
    const dirty = new Set([0])
    const plan = planSave(c, dirty)
    dirty.add(1) // simulates an edit made after the confirmation dialog opened
    expect(plan.indices).toEqual([0])
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })
})
