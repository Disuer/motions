const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export interface PngInfo {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

/**
 * Reads the IHDR chunk, which the spec requires to be first, so the first 33 bytes are enough.
 * Null means "not a PNG at all".
 */
export function readPngHeader(bytes: Uint8Array): PngInfo | null {
  if (bytes.length < 33) return null
  for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) return null
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    width: dv.getUint32(16),
    height: dv.getUint32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  }
}

/**
 * Null if the game can load this file, otherwise the reason it cannot.
 *
 * Lethe's PngDecoder - which the plugin uses because ImageConversion.LoadImage throws under
 * IL2CPP - reads 8-bit RGB, RGBA, greyscale and greyscale+alpha only. Catching the others here
 * matters more than it looks: in game an unloadable frame produces no error, just a frame that
 * silently does not appear, and several art tools export indexed PNGs by default.
 */
export function pngRejection(info: PngInfo | null): string | null {
  if (!info) return 'not a PNG'
  if (info.colorType === 3) return 'indexed / palette PNG, re-save it as 8-bit RGB or RGBA'
  if (info.bitDepth !== 8) return `${info.bitDepth}-bit PNG, re-save it as 8-bit`
  if (info.interlace !== 0) return 'interlaced PNG, re-save it without interlacing'
  return null
}

export interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

/** Bounding box of pixels with any alpha, in image pixel coordinates. Null if fully transparent. */
export function opaqueBounds(image: ImageData): Bbox | null {
  const { width, height, data } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * The offset that puts this frame's drawn content bottom-centre on the origin.
 *
 * The runtime anchors the PNG's *canvas*, not its content, so a frame with empty space below
 * the feet floats. Note a fully opaque frame - a bbox covering the whole canvas - correctly
 * yields [0, 0]: there is nothing to correct.
 */
export function alignOffset(b: Bbox, width: number, height: number, ep: number): [number, number] {
  const x = -((b.x + b.w / 2) - width / 2) / ep
  const y = -(height - b.y - b.h) / ep
  return [x + 0, y + 0]  // Adding 0 converts -0 to 0
}

/**
 * Decodes an image and finds its opaque bounds. Uses a throwaway canvas because ImageData is
 * the only way to see alpha; the result is cached by the caller, not here.
 */
export async function boundsOf(url: string, width: number, height: number): Promise<Bbox | null> {
  if (width === 0 || height === 0) return null
  const img = new Image()
  img.src = url
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  return opaqueBounds(ctx.getImageData(0, 0, width, height))
}
