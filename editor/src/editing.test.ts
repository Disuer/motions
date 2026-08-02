import { describe, expect, it } from 'vitest'
import {
  addFrameAt, addSfx, alignFrame, carryOver, carryOverNamed, clampFrameIndex, dirtyMotions,
  duplicateFrame,
  nudgeAllFrames, removeSfx,
  planSave,
  remapAfterRemoval, remapFrameIndex, removeFrame, sfxIn, sfxSpan, sortFramesByTime,
  spaceEvenlyFrames, trimSfxEnd, trimSfxStart,
} from './editing'
import { LoadedCharacter } from './fs'
import { AnimationSpec, Frame } from './spec'

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

describe('addFrameAt', () => {
  function at(t: number, sprite: string): Frame {
    return { t, sprite, offset: [0, 0], scale: 1 }
  }

  it('adds the sprite bottom-centred at scale 1, standing on the ground', () => {
    const out = addFrameAt([at(0, 'a.png')], 'b.png', 0.5)
    expect(out[1].sprite).toBe('b.png')
    expect(out[1].offset).toEqual([0, 0])
    expect(out[1].scale).toBe(1)
    expect(out[1].t).toBe(0.5)
  })

  // The finding: a hand-written animation.json can hold a frame past `duration`, so appending at
  // t = duration is not appending in time order. frameIndexAt then resolves the wrong sprite in
  // both the preview and the game.
  it('re-sorts, so a frame added at duration lands before a frame written past it', () => {
    const frames = [at(0, 'a.png'), at(2, 'late.png')]  // late.png sits past duration 1
    const out = addFrameAt(frames, 'new.png', 1)
    expect(out.map((f) => f.sprite)).toEqual(['a.png', 'new.png', 'late.png'])
    expect(out.map((f) => f.t)).toEqual([0, 1, 2])
  })

  it('appends when the new time really is last', () => {
    const out = addFrameAt([at(0, 'a.png'), at(0.1, 'b.png')], 'c.png', 0.2)
    expect(out.map((f) => f.sprite)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('does not mutate the input array', () => {
    const frames = [at(0, 'a.png')]
    addFrameAt(frames, 'b.png', 1)
    expect(frames.map((f) => f.sprite)).toEqual(['a.png'])
  })
})

describe('clampFrameIndex', () => {
  const frames = [frame('a.png', [0, 0]), frame('b.png', [0, 0]), frame('c.png', [0, 0])]

  it('steps forward and back within range, resolving the expected sprite', () => {
    expect(frames[clampFrameIndex(1, frames.length)].sprite).toBe('b.png')
    expect(frames[clampFrameIndex(0 - 1, frames.length)].sprite).toBe('a.png')
  })

  // The finding: prev/next clamped against the ON-DISK spec's length. Remove two of five frames
  // and next walked frameIndex to 4 - past the end of the edited array the canvas draws.
  it('never leaves an index past the end of a shortened motion', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((n) => frame(`${n}.png`, [0, 0]))
    const shortened = removeFrame(removeFrame(five, 4), 3)  // five frames, two removed
    const i = clampFrameIndex(4, shortened.length)          // where `next` used to walk to
    expect(i).toBe(2)
    expect(shortened[i].sprite).toBe('c.png')  // not undefined: a real frame is still on screen
  })

  it('clamps below zero to the first frame', () => {
    expect(clampFrameIndex(-3, frames.length)).toBe(0)
  })

  it('collapses to 0 for a single-frame motion', () => {
    expect(clampFrameIndex(1, 1)).toBe(0)
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
  // A(t=0), B(t=0.1), C(t=0.2), then C is dragged to t=0.05, landing between A and B.
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

/** planSave reads .mode, .motions[i].folder, .skills[i].name and .appearanceReadable. */
function character(
  mode: 'appearance' | 'override',
  folders: string[],
  appearanceReadable = true,
): LoadedCharacter {
  return {
    mode, appearanceReadable, motions: folders.map((folder) => ({ folder })), skills: [],
  } as unknown as LoadedCharacter
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
    expect(plan.motions).toEqual(['S1'])
    expect(plan.files).toEqual(['motions/S1/animation.json'])
  })

  it('lists every dirty motion, in no particular guaranteed order beyond what the Set gives', () => {
    const c = character('override', ['Idle', 'S1', 'S2'])
    const plan = planSave(c, new Set([0, 2]))
    expect(new Set(plan.motions)).toEqual(new Set(['Idle', 'S2']))
    expect(new Set(plan.files)).toEqual(
      new Set(['motions/Idle/animation.json', 'motions/S2/animation.json']),
    )
  })

  // It used to be included on EVERY save of an appearance character. Combined with the editor
  // falling back to the default donor for an appearance.json it could not parse, that meant one
  // unrelated frame nudge silently replaced the author's donor with Yi Sang.
  it('leaves appearance.json alone when the donor was not touched', () => {
    const c = character('appearance', ['Idle'])
    const plan = planSave(c, new Set([0]))
    expect(plan.appearance).toBe(false)
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('includes appearance.json once the donor is edited', () => {
    const c = character('appearance', ['Idle'])
    const plan = planSave(c, new Set([0, -1]))
    expect(plan.appearance).toBe(true)
    expect(plan.files).toEqual(['motions/Idle/animation.json', 'appearance.json'])
  })

  // The donor on screen is a fallback, not theirs. Writing it back would overwrite the real one.
  it('never writes appearance.json back when the file on disk could not be read', () => {
    const c = character('appearance', ['Idle'], false)
    const plan = planSave(c, new Set([-1]))
    expect(plan.appearance).toBe(false)
    expect(plan.files).toEqual([])
  })

  it('excludes appearance.json in override mode', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set([0]))
    expect(plan.appearance).toBe(false)
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('writes appearance.json alone when only the base changed (-1 only)', () => {
    const c = character('appearance', ['Idle', 'S1'])
    const plan = planSave(c, new Set([-1]))
    expect(plan.motions).toEqual([])
    expect(plan.appearance).toBe(true)
    expect(plan.files).toEqual(['appearance.json'])
  })

  it('the -1 sentinel never produces a bogus motions/-1/... path', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set([-1, 0]))
    expect(plan.motions).toEqual(['Idle'])
    expect(plan.files.every((f) => !f.includes('-1'))).toBe(true)
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('is empty when nothing is dirty and the character is in override mode', () => {
    const c = character('override', ['Idle'])
    const plan = planSave(c, new Set())
    expect(plan.motions).toEqual([])
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
    expect(plan.motions).toEqual(['Idle'])
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })
})

// The switch case is the one that can lose an author's work without any write happening, and the
// re-read case is the one that used to. Both go through carryOver, and they must not agree.
describe('carryOver', () => {
  const spec = (duration: number): AnimationSpec =>
    ({ duration, ppu: 200, frames: [], sfx: [] } as unknown as AnimationSpec)
  const motion = (folder: string, duration = 1) => ({ folder, spec: spec(duration) })

  const EDITED = spec(9.9)   // stands in for an unsaved edit: nothing on disk has this duration

  it('keeps an unsaved edit through a re-read of the same character', () => {
    const next = carryOver(
      ['Idle', 'S1'], [EDITED, spec(1)], new Set([0]), 0,
      [motion('Idle'), motion('S1')], false,
    )
    expect(next.specs[0]).toBe(EDITED)
    expect(next.dirty).toEqual(new Set([0]))
  })

  // The bug that made switching characters unsafe: both have an Idle, and matching by name handed
  // the incoming character the outgoing one's unsaved spec - an edit to a file it never came from.
  it('carries nothing into a different character, however well the folder names line up', () => {
    const next = carryOver(
      ['Idle', 'S1'], [EDITED, EDITED], new Set([0, 1, -1]), 1,
      [motion('Idle', 2), motion('S1', 2)], true,
    )
    expect(next.specs.map((s) => s.duration)).toEqual([2, 2])
    expect(next.specs[0]).not.toBe(EDITED)
    expect(next.dirty).toEqual(new Set())   // including -1, the donor base of the character we left
    expect(next.tab).toBe(0)
  })

  it('follows a folder that a new motion sorted ahead of, rather than the position it held', () => {
    // Creating "Attack" puts it first; the S1 edit and the tab must both move with the name.
    const next = carryOver(
      ['Idle', 'S1'], [spec(1), EDITED], new Set([1]), 1,
      [motion('Attack'), motion('Idle'), motion('S1')], false,
    )
    expect(next.specs[2]).toBe(EDITED)
    expect(next.dirty).toEqual(new Set([2]))
    expect(next.tab).toBe(2)
  })

  it('clones from disk, so editing a fresh spec cannot write through to the loaded character', () => {
    const disk = motion('Idle')
    const next = carryOver([], [], new Set(), 0, [disk], false)
    expect(next.specs[0]).not.toBe(disk.spec)
    expect(next.specs[0]).toEqual(disk.spec)
  })

  it('keeps a dirty donor base through a re-read, and only through a re-read', () => {
    expect(carryOver([], [], new Set([-1]), 0, [motion('Idle')], false).dirty).toEqual(new Set([-1]))
    expect(carryOver([], [], new Set([-1]), 0, [motion('Idle')], true).dirty).toEqual(new Set())
  })
})

// planSave is what the confirmation dialog shows and exactly what save() writes. A skill file
// missing from that list would be written without ever appearing on screen.
describe('planSave with skill files', () => {
  const character = {
    mode: 'override',
    motions: [{ folder: 'Idle' }, { folder: 'S1' }],
    skills: [{ name: 'S1.json' }, { name: 'S2.json' }],
  } as unknown as LoadedCharacter

  it('lists dirty skill files alongside the motions', () => {
    const plan = planSave(character, new Set([1]), new Set([0, 1]))
    expect(plan.files).toEqual(['motions/S1/animation.json', 'S1.json', 'S2.json'])
    expect(plan.skills).toEqual(['S1.json', 'S2.json'])
  })

  it('writes nothing when nothing is dirty', () => {
    expect(planSave(character, new Set(), new Set()).files).toEqual([])
  })

  // dirtySkills survives a re-read that can shorten the list, so an index with no file behind it
  // has to fall out here rather than crash save() on character.skills[i].name.
  it('drops an index no longer backed by a file', () => {
    expect(planSave(character, new Set(), new Set([0, 7])).skills).toEqual(['S1.json'])
  })

  // The reason the plan holds names at all: it is frozen when the dialog opens, but a folder
  // re-read already in flight can land before Write and re-sort the arrays underneath it. An
  // index would then address a different file than the one the dialog listed.
  it('names files rather than positions, so a re-sort cannot redirect the write', () => {
    const before = {
      mode: 'override', appearanceReadable: true,
      motions: [{ folder: 'Idle' }, { folder: 'S1' }],
      skills: [],
    } as unknown as LoadedCharacter
    const plan = planSave(before, new Set([0]))
    expect(plan.motions).toEqual(['Idle'])
    // A new motion sorting in ahead would make the frozen index 0 mean 'Attack'; the name does not
    // move, and save() resolves it against the live array.
    expect(plan.files).toEqual(['motions/Idle/animation.json'])
  })

  it('defaults to no skill files, so the motion-only callers are unaffected', () => {
    expect(planSave(character, new Set([0])).skills).toEqual([])
  })
})

describe('carryOverNamed', () => {
  const disk = (i: number) => `disk-${i}`

  it('keeps an edit whose file is still there, through a reorder', () => {
    const out = carryOverNamed(
      ['S1.json', 'S2.json'], ['edited-1', 'edited-2'], new Set([1]),
      ['S0.json', 'S1.json', 'S2.json'], disk, false,
    )
    expect(out.items).toEqual(['disk-0', 'edited-1', 'edited-2'])
    expect(out.dirty).toEqual(new Set([2]))
  })

  it('carries nothing across a switch, however well the names match', () => {
    const out = carryOverNamed(
      ['S1.json'], ['edited-1'], new Set([0]),
      ['S1.json'], disk, true,
    )
    expect(out.items).toEqual(['disk-0'])
    expect(out.dirty).toEqual(new Set())
  })

  it('reads from disk for a file that was not open before', () => {
    const out = carryOverNamed([], [], new Set(), ['S1.json'], disk, false)
    expect(out.items).toEqual(['disk-0'])
  })
})

// Sounds are the one array on the timeline that is deliberately never re-sorted, and the reason
// is worth pinning: a stable index is what lets the inspector keep pointing at the same sound.
describe('addSfx / removeSfx', () => {
  const sfx = (t: number, file: string) => ({ t, file })

  it('appends without re-sorting, so existing indices keep meaning the same sound', () => {
    const before = [sfx(0.5, 'late.wav')]
    const after = addSfx(before, 'early.wav', 0.1)
    expect(after.map((s) => s.file)).toEqual(['late.wav', 'early.wav'])
    expect(after[0]).toBe(before[0])
  })

  it('never places a sound before the start of the motion', () => {
    expect(addSfx([], 'a.wav', -3)[0].t).toBe(0)
  })

  it('does not mutate the array it was given', () => {
    const before = [sfx(0, 'a.wav')]
    addSfx(before, 'b.wav', 1)
    expect(before).toHaveLength(1)
  })

  // Unlike removeFrame, which refuses to drop the last one: an empty sfx array is a perfectly
  // valid motion, and parseSpec reads it back happily.
  it('removes by index, and will empty the list', () => {
    const before = [sfx(0, 'a.wav'), sfx(1, 'b.wav')]
    expect(removeSfx(before, 0).map((s) => s.file)).toEqual(['b.wav'])
    expect(removeSfx(removeSfx(before, 0), 0)).toEqual([])
  })
})

describe('sfxSpan / trimSfxEnd / trimSfxStart', () => {
  const sound = { t: 1, file: 'hit.wav' }

  it('spans the rest of the file, or the duration when one is set', () => {
    expect(sfxSpan(sound, 2)).toBe(2)
    expect(sfxSpan({ ...sound, clipIn: 0.5 }, 2)).toBe(1.5)
    expect(sfxSpan({ ...sound, duration: 0.3 }, 2)).toBe(0.3)
    // Unknown length, and a zero duration, both mean "no span to draw" rather than a guess.
    expect(sfxSpan(sound, 0)).toBe(0)
    expect(sfxSpan({ ...sound, duration: 0 }, 2)).toBe(2)
  })

  it('writes a duration when the end is pulled in', () => {
    expect(trimSfxEnd(sound, 1.5, 2).duration).toBeCloseTo(0.5)
  })

  it('drops the duration when the end goes back to the end of the file', () => {
    const trimmed = { ...sound, duration: 0.5 }
    expect(trimSfxEnd(trimmed, 3, 2)).not.toHaveProperty('duration')
    // With clipIn, "the end of the file" is that much closer.
    expect(trimSfxEnd({ ...trimmed, clipIn: 1 }, 2, 2)).not.toHaveProperty('duration')
  })

  it('never lets the end cross the start', () => {
    expect(trimSfxEnd(sound, 0.2, 2).duration).toBe(0.01)
  })

  it('cuts the head off without moving the sound in time', () => {
    const next = trimSfxStart(sound, 1.4, 2)
    expect(next.t).toBeCloseTo(1.4)
    expect(next.clipIn).toBeCloseTo(0.4)
    expect(next.duration).toBeUndefined()
  })

  it('shrinks an explicit duration by the same amount it trims', () => {
    const next = trimSfxStart({ ...sound, clipIn: 0.5, duration: 1 }, 1.25, 2)
    expect(next.clipIn).toBeCloseTo(0.75)
    expect(next.duration).toBeCloseTo(0.75)
  })

  it('stops at the beginning of the file, and clears clipIn there', () => {
    const next = trimSfxStart({ ...sound, clipIn: 0.4 }, 0, 2)
    expect(next.t).toBeCloseTo(0.6)
    expect(next).not.toHaveProperty('clipIn')
  })

  it('never lets the start cross the end', () => {
    expect(trimSfxStart({ ...sound, duration: 0.5 }, 9, 2).t).toBeCloseTo(1.49)
  })

  it('leaves a sound of unknown length where it is rather than dragging it forward', () => {
    expect(trimSfxStart(sound, 5, 0).t).toBe(1)
  })
})

describe('sfxIn', () => {
  const sfx = (t: number, file: string) => ({ t, file })
  const all = [sfx(0, 'start.wav'), sfx(0.5, 'mid.wav'), sfx(1, 'end.wav')]

  it('fires a sound the tick crossed', () => {
    expect(sfxIn(all, 0.4, 0.6).map((s) => s.file)).toEqual(['mid.wav'])
  })

  it('fires a sound at zero only when the lap starts below it', () => {
    expect(sfxIn(all, -1, 0).map((s) => s.file)).toEqual(['start.wav'])
    expect(sfxIn(all, 0, 0.1)).toEqual([])
  })

  // Consecutive ticks must not fire the same sound twice, and must not skip one between them.
  it('tiles a lap without gaps or repeats', () => {
    const ticks = [-1, 0, 0.3, 0.5, 0.9, 1]
    const fired = ticks.slice(1).flatMap((to, i) => sfxIn(all, ticks[i], to))
    expect(fired.map((s) => s.file)).toEqual(['start.wav', 'mid.wav', 'end.wav'])
  })

  it('ignores sounds outside the slice', () => {
    expect(sfxIn(all, 0.6, 0.9)).toEqual([])
  })
})

// The only way to add a frame used to be picking an asset that was not on the timeline yet, so a
// sprite already placed could not be placed again and a pose could not be held.
describe('duplicateFrame', () => {
  const at = (t: number, sprite: string, offset: [number, number] = [0, 0], scale = 1) =>
    ({ t, sprite, offset, scale })

  it('puts the copy halfway to the next frame, keeping offset and scale', () => {
    const frames = [at(0, 'a.png', [0.3, -0.2], 2), at(1, 'b.png')]
    const out = duplicateFrame(frames, 0, 1)

    expect(out.frames.map((f) => f.t)).toEqual([0, 0.5, 1])
    expect(out.frames[1]).toMatchObject({ sprite: 'a.png', offset: [0.3, -0.2], scale: 2 })
    expect(out.duration).toBe(1)
  })

  // Sharing a t is not invalid, but frameIndexAt resolves by position, so the copy would never be
  // the frame the preview or the game picks.
  it('never lands the copy on the same time as its source', () => {
    const out = duplicateFrame([at(0.5, 'a.png'), at(0.5, 'b.png')], 0, 1)
    expect(out.frames.filter((f) => f.sprite === 'a.png')).toHaveLength(2)
  })

  it('extends the motion when the frame being copied is the last one', () => {
    const out = duplicateFrame([at(0, 'a.png')], 0, 0.5)
    expect(out.frames.map((f) => f.t)).toEqual([0, 0.5])
    expect(out.duration).toBeCloseTo(0.5 + 1 / 12, 9)
  })

  it('copies the offset array rather than sharing it, so moving one does not move both', () => {
    const frames = [at(0, 'a.png', [1, 2]), at(1, 'b.png')]
    const out = duplicateFrame(frames, 0, 1)
    out.frames[1].offset[0] = 99
    expect(out.frames[0].offset[0]).toBe(1)
  })

  it('does nothing for an index that is not there', () => {
    const frames = [at(0, 'a.png')]
    const out = duplicateFrame(frames, 5, 1)
    expect(out.frames).toBe(frames)
    expect(out.duration).toBe(1)
  })

  it('does not mutate the array it was given', () => {
    const frames = [at(0, 'a.png'), at(1, 'b.png')]
    duplicateFrame(frames, 0, 1)
    expect(frames).toHaveLength(2)
  })
})
