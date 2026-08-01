import { describe, expect, it } from 'vitest'
import { frameRect } from './Canvas'
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
