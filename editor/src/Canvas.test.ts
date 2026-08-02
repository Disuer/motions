import { describe, expect, it } from 'vitest'
import { ZOOM_MAX, ZOOM_MIN, clampZoom, frameRect, zoomAbout } from './Canvas'
import { LoadedAsset } from './fs'

// Minimal stand-in: frameRect only reads width/height off the asset.
function asset(width: number, height: number): LoadedAsset {
  return { name: 'a.png', url: '', width, height, rejection: null }
}

function frame(offset: [number, number], scale = 1) {
  return { t: 0, sprite: 'a.png', offset, scale }
}

describe('frameRect', () => {
  it('places a 200x400 asset at ppu 200 with no offset flush on the ground, centred', () => {
    // effectivePpu(200, 1) = 200, so width = 200/200 = 1, height = 400/200 = 2.
    // Bottom-centre anchored: left is half the width left of centre, bottom sits at offset.y = 0.
    const r = frameRect(asset(200, 400), frame([0, 0]), 200)
    expect(r.width).toBe(1)
    expect(r.height).toBe(2)
    expect(r.left).toBe(-0.5)
    expect(r.bottom).toBe(0)
  })

  it('raises bottom with a positive offset.y', () => {
    const r = frameRect(asset(200, 400), frame([0, 0.3]), 200)
    expect(r.bottom).toBe(0.3)
  })

  it('lowers bottom with a negative offset.y', () => {
    const r = frameRect(asset(200, 400), frame([0, -0.3]), 200)
    expect(r.bottom).toBe(-0.3)
  })

  it('moves left rightward by offset.x', () => {
    // Base left (no offset) is -width/2 = -0.5; offset.x adds directly on top.
    const r = frameRect(asset(200, 400), frame([0.2, 0]), 200)
    expect(r.left).toBeCloseTo(-0.5 + 0.2, 9)
  })

  it('doubles world coverage at scale 2 via effectivePpu', () => {
    // effectivePpu(200, 2) = 100, so width = 200/100 = 2, height = 400/100 = 4 - twice the
    // scale-1 size in each dimension.
    const r = frameRect(asset(200, 400), frame([0, 0], 2), 200)
    expect(r.width).toBe(2)
    expect(r.height).toBe(4)
    expect(r.left).toBe(-1)
  })
})

describe('clampZoom', () => {
  it('holds the wheel inside the same range as the slider', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN)
    expect(clampZoom(99)).toBe(ZOOM_MAX)
    expect(clampZoom(1.5)).toBe(1.5)
    expect(clampZoom(NaN)).toBe(1)
  })
})

// Zooming towards the centre instead of towards the pointer means whatever you were looking at
// slides away, so every zoom needs a pan afterwards. This is the arithmetic that avoids that.
describe('zoomAbout', () => {
  /** Where the point under the cursor ends up on screen once the new pan and zoom are applied. */
  const after = (pan: { x: number; y: number }, cursor: { x: number; y: number }, ratio: number) => {
    const next = zoomAbout(pan, cursor, ratio)
    return {
      x: next.x + (cursor.x - pan.x) * ratio,
      y: next.y + (cursor.y - pan.y) * ratio,
    }
  }

  it('leaves the point under the cursor exactly where it was, zooming in', () => {
    const cursor = { x: 120, y: 75 }
    const out = after({ x: 30, y: -40 }, cursor, 2)
    expect(out.x).toBeCloseTo(cursor.x, 9)
    expect(out.y).toBeCloseTo(cursor.y, 9)
  })

  it('holds for zooming out too', () => {
    const cursor = { x: -140, y: 20 }
    const out = after({ x: -12, y: 88 }, cursor, 0.4)
    expect(out.x).toBeCloseTo(cursor.x, 9)
    expect(out.y).toBeCloseTo(cursor.y, 9)
  })

  it('does not move the pan when the zoom does not change', () => {
    expect(zoomAbout({ x: 5, y: 6 }, { x: 100, y: 100 }, 1)).toEqual({ x: 5, y: 6 })
  })

  it('leaves the pan alone when the cursor is already on the origin', () => {
    expect(zoomAbout({ x: 40, y: 40 }, { x: 40, y: 40 }, 3)).toEqual({ x: 40, y: 40 })
  })
})
