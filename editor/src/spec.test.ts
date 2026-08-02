import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FPS, DEFAULT_PPU, compareNatural, defaultSpec, effectivePpu,
  frameIndexAt, parseSpec, pivotX, pivotY, serialiseSpec,
} from './spec'

describe('compareNatural', () => {
  it('sorts 2 before 10', () => {
    expect(['frame_10.png', 'frame_2.png', 'frame_1.png'].sort(compareNatural))
      .toEqual(['frame_1.png', 'frame_2.png', 'frame_10.png'])
  })
  it('ignores zero padding', () => {
    expect(['a_002.png', 'a_1.png'].sort(compareNatural)).toEqual(['a_1.png', 'a_002.png'])
  })
})

// These are the exact values Motions.Tests/Program.cs asserts. If the two ever
// disagree, the canvas is lying about where the game will draw the frame.
describe('pivot maths matches the plugin', () => {
  it('scales ppu the same way', () => {
    expect(effectivePpu(100, 1)).toBe(100)
    expect(effectivePpu(100, 2)).toBe(50)
  })
  it('centres horizontally with no offset', () => {
    expect(pivotX(0, 100, 100)).toBeCloseTo(0.5, 9)
  })
  it('stands on the origin with no vertical offset', () => {
    expect(pivotY(0, 200, 100)).toBeCloseTo(0, 9)
  })
  it('allows a pivot outside the rect', () => {
    expect(pivotX(1.0, 100, 100)).toBeCloseTo(-0.5, 9)
  })
  it('lifts the frame with a positive offset', () => {
    expect(pivotY(0.5, 200, 100)).toBeCloseTo(-0.25, 9)
  })
  it('sinks the frame with a negative offset', () => {
    expect(pivotY(-0.5, 200, 100)).toBeCloseTo(0.25, 9)
  })
})

describe('frameIndexAt', () => {
  const times = [0, 0.1, 0.2]
  it('holds the earlier frame between boundaries', () => {
    expect(frameIndexAt(times, 0.05)).toBe(0)
  })
  it('takes the new frame exactly on a boundary', () => {
    expect(frameIndexAt(times, 0.1)).toBe(1)
  })
  it('clamps past the end', () => {
    expect(frameIndexAt(times, 99)).toBe(2)
  })
  it('clamps before the start rather than showing nothing', () => {
    expect(frameIndexAt(times, -1)).toBe(0)
  })
})

describe('defaultSpec', () => {
  it('spaces PNGs evenly in natural order', () => {
    const s = defaultSpec(['b_10.png', 'b_2.png'])
    expect(s.frames.map(f => f.sprite)).toEqual(['b_2.png', 'b_10.png'])
    expect(s.ppu).toBe(DEFAULT_PPU)
    expect(s.duration).toBeCloseTo(2 / DEFAULT_FPS, 9)
    expect(s.frames[1].t).toBeCloseTo(1 / DEFAULT_FPS, 9)
  })
})

describe('parseSpec', () => {
  it('reads a well-formed file', () => {
    const { spec, error } = parseSpec(
      '{"duration":1.2,"ppu":50,"frames":[{"t":0,"sprite":"a.png","offset":[0.1,0.2]}]}')
    expect(error).toBeNull()
    expect(spec!.ppu).toBe(50)
    expect(spec!.frames[0].offset).toEqual([0.1, 0.2])
    expect(spec!.frames[0].scale).toBe(1)
  })
  it('sorts frames by time regardless of authoring order', () => {
    const { spec } = parseSpec(
      '{"duration":1,"frames":[{"t":0.5,"sprite":"b.png"},{"t":0,"sprite":"a.png"}]}')
    expect(spec!.frames.map(f => f.sprite)).toEqual(['a.png', 'b.png'])
  })
  it('rejects rather than throws', () => {
    expect(parseSpec('{').error).toMatch(/malformed JSON/)
    expect(parseSpec('{"duration":1,"frames":[]}').error).toBe('no frames')
    expect(parseSpec('{"duration":0,"frames":[{"t":0,"sprite":"a.png"}]}').error)
      .toMatch(/duration must be > 0/)
    expect(parseSpec('{"duration":1,"ppu":0,"frames":[{"t":0,"sprite":"a.png"}]}').error)
      .toMatch(/ppu must be > 0/)
    expect(parseSpec('{"duration":1,"frames":[{"t":0}]}').error).toBe('frame 0 has no sprite')
  })
  it('drops sfx entries with no file', () => {
    const { spec } = parseSpec(
      '{"duration":1,"frames":[{"t":0,"sprite":"a.png"}],"sfx":[{"t":0.5},{"t":0.1,"file":"x.wav"}]}')
    expect(spec!.sfx.map(s => s.file)).toEqual(['x.wav'])
  })
})

// SpriteMotionSpec.cs configures its deserializer with AllowTrailingCommas and
// ReadCommentHandling.Skip (Motions.Tests/Program.cs asserts the trailing-comma case). The editor
// has to tolerate at least as much, or a hand-edited file the game loads fine gets rejected here.
describe('parseSpec tolerates what the plugin tolerates', () => {
  it('allows a trailing comma in an array', () => {
    const { error } = parseSpec('{"duration":1,"frames":[{"t":0,"sprite":"a.png"},]}')
    expect(error).toBeNull()
  })
  it('allows a trailing comma in an object', () => {
    const { spec, error } = parseSpec('{"duration":1,"ppu":50,"frames":[{"t":0,"sprite":"a.png"},]}')
    expect(error).toBeNull()
    expect(spec!.ppu).toBe(50)
  })
  it('skips a line comment on its own line', () => {
    const { spec, error } = parseSpec('{\n// a comment\n"duration":1,"frames":[{"t":0,"sprite":"a.png"}]}')
    expect(error).toBeNull()
    expect(spec!.frames[0].sprite).toBe('a.png')
  })
  it('skips a line comment trailing real content', () => {
    const { error } = parseSpec('{"duration":1, // seconds\n"frames":[{"t":0,"sprite":"a.png"}]}')
    expect(error).toBeNull()
  })
  it('skips a block comment', () => {
    const { error } = parseSpec('{"duration":1,/* block */"frames":[{"t":0,"sprite":"a.png"}]}')
    expect(error).toBeNull()
  })
  it('leaves a "//" inside a string value intact', () => {
    const { spec } = parseSpec('{"duration":1,"frames":[{"t":0,"sprite":"a//b.png"}]}')
    expect(spec!.frames[0].sprite).toBe('a//b.png')
  })
  it('leaves a comma before a closing bracket inside a string value intact', () => {
    const { spec } = parseSpec('{"duration":1,"frames":[{"t":0,"sprite":"a,"}]}')
    expect(spec!.frames[0].sprite).toBe('a,')
  })
  it('does not end a string early on an escaped quote', () => {
    const { spec } = parseSpec('{"duration":1,"frames":[{"t":0,"sprite":"a\\"b.png"}]}')
    expect(spec!.frames[0].sprite).toBe('a"b.png')
  })
})

describe('round trip', () => {
  it('does not drift values', () => {
    const source = JSON.stringify({
      duration: 1.2, ppu: 200, filter: 'point',
      frames: [
        { t: 0, sprite: 'a.png', offset: [0, 0] },
        { t: 0.25, sprite: 'b.png', offset: [0.05, -0.02], scale: 1.5 },
      ],
      sfx: [{ t: 0.3, file: 'slash.wav', clipIn: 0.1, duration: 0.4 }],
    })
    const once = parseSpec(source).spec!
    const twice = parseSpec(serialiseSpec(once)).spec!
    expect(twice).toEqual(once)
    // and stable on a second pass, so repeated saves cannot creep
    expect(serialiseSpec(twice)).toBe(serialiseSpec(once))
  })
})
