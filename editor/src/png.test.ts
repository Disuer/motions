import { describe, expect, it } from 'vitest'
import { alignOffset, opaqueBounds, pngRejection, readPngHeader } from './png'

/** Builds the first 33 bytes of a PNG: signature + IHDR. Enough for the sniffer. */
function header(width: number, height: number, bitDepth: number, colorType: number, interlace = 0) {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const dv = new DataView(b.buffer)
  dv.setUint32(8, 13)                      // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12)      // "IHDR"
  dv.setUint32(16, width)
  dv.setUint32(20, height)
  b[24] = bitDepth
  b[25] = colorType
  b[28] = interlace
  return b
}

describe('readPngHeader', () => {
  it('reads dimensions and format', () => {
    expect(readPngHeader(header(200, 400, 8, 6))).toEqual({
      width: 200, height: 400, bitDepth: 8, colorType: 6, interlace: 0,
    })
  })
  it('returns null for something that is not a PNG', () => {
    expect(readPngHeader(new Uint8Array(64))).toBeNull()
  })
})

// Lethe's decoder reads 8-bit RGB, RGBA, greyscale and greyscale+alpha only.
describe('pngRejection', () => {
  it('accepts what the game can load', () => {
    expect(pngRejection(readPngHeader(header(200, 400, 8, 6)))).toBeNull()  // RGBA
    expect(pngRejection(readPngHeader(header(200, 400, 8, 2)))).toBeNull()  // RGB
    expect(pngRejection(readPngHeader(header(200, 400, 8, 0)))).toBeNull()  // greyscale
    expect(pngRejection(readPngHeader(header(200, 400, 8, 4)))).toBeNull()  // greyscale + alpha
  })
  it('names indexed PNGs specifically', () => {
    expect(pngRejection(readPngHeader(header(200, 400, 8, 3)))).toMatch(/indexed/)
  })
  it('rejects 16-bit and interlaced', () => {
    expect(pngRejection(readPngHeader(header(200, 400, 16, 6)))).toMatch(/8-bit/)
    expect(pngRejection(readPngHeader(header(200, 400, 8, 6, 1)))).toMatch(/interlac/)
  })
  it('rejects a non-PNG', () => {
    expect(pngRejection(null)).toBe('not a PNG')
  })
})

/** width x height ImageData with an opaque rectangle at (x, y, w, h). */
function withBlob(width: number, height: number, x: number, y: number, w: number, h: number) {
  const px = new Uint8ClampedArray(width * height * 4)
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px[(yy * width + xx) * 4 + 3] = 255
  }
  return { width, height, data: px, colorSpace: 'srgb' } as ImageData
}

describe('opaqueBounds', () => {
  it('finds the drawn rectangle', () => {
    expect(opaqueBounds(withBlob(200, 400, 50, 100, 100, 200))).toEqual({ x: 50, y: 100, w: 100, h: 200 })
  })
  it('returns null for a fully transparent frame', () => {
    expect(opaqueBounds(withBlob(10, 10, 0, 0, 0, 0))).toBeNull()
  })
})

describe('alignOffset', () => {
  it('leaves a frame drawn edge to edge alone', () => {
    expect(alignOffset({ x: 0, y: 0, w: 200, h: 400 }, 200, 400, 200)).toEqual([0, 0])
  })
  it('sinks a frame that floats above its canvas bottom', () => {
    // content bottom is at pixel y=300, i.e. 100px (0.5u at ppu 200) above the canvas bottom
    const [x, y] = alignOffset({ x: 50, y: 100, w: 100, h: 200 }, 200, 400, 200)
    expect(x).toBeCloseTo(0, 9)
    expect(y).toBeCloseTo(-0.5, 9)
  })
  it('centres content drawn off to one side', () => {
    // content centre is at pixel x=150, i.e. 50px (0.25u) right of the canvas centre
    const [x] = alignOffset({ x: 100, y: 0, w: 100, h: 400 }, 200, 400, 200)
    expect(x).toBeCloseTo(-0.25, 9)
  })
})
