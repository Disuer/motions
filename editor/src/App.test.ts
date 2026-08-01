import { describe, expect, it } from 'vitest'
import { alignFrame, nudgeAllFrames } from './App'
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
