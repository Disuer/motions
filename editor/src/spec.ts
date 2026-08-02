// A line-by-line port of Motions/SpriteMotionSpec.cs. Keep it that way: if the two
// disagree, the editor draws a frame in a place the game will not put it.

/** Measured against Yi Sang. A 200x400 PNG is character-sized: 1 x 2 world units. */
export const DEFAULT_PPU = 200
export const DEFAULT_FPS = 12

export interface Frame {
  t: number
  sprite: string
  /** World-unit nudge from where this frame would sit by default. */
  offset: [number, number]
  scale: number
}

export interface Sfx {
  t: number
  file: string
  clipIn?: number
  duration?: number
}

export interface AnimationSpec {
  duration: number
  ppu: number
  /** "point" for pixel art, anything else for bilinear. */
  filter?: string
  frames: Frame[]
  sfx: Sfx[]
}

const isDigit = (c: string) => c >= '0' && c <= '9'

/**
 * Orders "frame_2" before "frame_10" by comparing runs of digits numerically. Plain string
 * comparison would put 10 first, which silently scrambles any animation not zero-padded.
 */
export function compareNatural(a: string, b: string): number {
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (isDigit(a[i]) && isDigit(b[j])) {
      const si = i
      const sj = j
      while (i < a.length && isDigit(a[i])) i++
      while (j < b.length && isDigit(b[j])) j++

      const da = a.slice(si, i).replace(/^0+/, '')
      const db = b.slice(sj, j).replace(/^0+/, '')

      if (da.length !== db.length) return da.length - db.length
      if (da !== db) return da < db ? -1 : 1
    } else {
      if (a[i] !== b[j]) return a.charCodeAt(i) - b.charCodeAt(j)
      i++
      j++
    }
  }
  return (a.length - i) - (b.length - j)
}

/** Scaling up means fewer pixels per world unit, so the sprite covers more ground. */
export const effectivePpu = (ppu: number, scale: number): number => (scale <= 0 ? ppu : ppu / scale)

/**
 * Normalised pivot placing the frame offsetX world units from the transform, horizontally
 * centred. The pivot is the point pinned to the transform, so it moves opposite the offset.
 * Values outside 0..1 are legal in Unity.
 */
export const pivotX = (offsetX: number, width: number, ep: number): number =>
  width <= 0 ? 0.5 : 0.5 - (offsetX * ep) / width

/**
 * Vertically the frame is anchored by its BOTTOM edge, not its centre: the character transform
 * sits at the feet, so centring buries half of every frame underground. An offset.y of 0
 * therefore means "standing on the ground".
 */
export const pivotY = (offsetY: number, height: number, ep: number): number =>
  height <= 0 ? 0 : -(offsetY * ep) / height

/**
 * Index of the frame showing at t, stepped. Clamps to the first frame before the start - the
 * renderer replaces the original, so showing nothing means an invisible character.
 */
export function frameIndexAt(times: number[], t: number): number {
  if (times.length === 0) return -1
  let result = 0
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= t) result = i
    else break
  }
  return result
}

/** Zero-config fallback: every PNG in the folder, natural order, evenly spaced. */
export function defaultSpec(pngFileNames: string[]): AnimationSpec {
  const ordered = [...pngFileNames].sort(compareNatural)
  return {
    duration: ordered.length / DEFAULT_FPS,
    ppu: DEFAULT_PPU,
    frames: ordered.map((sprite, i) => ({
      t: i / DEFAULT_FPS,
      sprite,
      offset: [0, 0] as [number, number],
      scale: 1,
    })),
    sfx: [],
  }
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * The plugin's deserializer (SpriteMotionSpec.cs) is configured with AllowTrailingCommas and
 * ReadCommentHandling.Skip, so a hand-edited animation.json with either loads fine in the game.
 * JSON.parse accepts neither, so we strip them first - walking the string ourselves rather than
 * regexing, because a regex cannot tell a "//" inside a sprite path from a line comment.
 */
function stripJsoncExtras(json: string): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < json.length) {
    const c = json[i]

    if (inString) {
      out += c
      if (c === '\\' && i + 1 < json.length) {
        // An escape sequence: copy the following character verbatim (works for \" too,
        // which is the whole reason this needs a walk instead of a regex).
        out += json[i + 1]
        i += 2
        continue
      }
      if (c === '"') inString = false
      i++
      continue
    }

    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === '/' && json[i + 1] === '/') {
      i += 2
      while (i < json.length && json[i] !== '\n') i++
      continue
    }
    if (c === '/' && json[i + 1] === '*') {
      i += 2
      while (i < json.length && !(json[i] === '*' && json[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === ',') {
      // Look past whitespace/comments for the next significant character; a comma followed
      // by ']' or '}' is a trailing comma and gets dropped rather than copied.
      let j = i + 1
      for (;;) {
        if (/\s/.test(json[j])) { j++; continue }
        if (json[j] === '/' && json[j + 1] === '/') { while (j < json.length && json[j] !== '\n') j++; continue }
        if (json[j] === '/' && json[j + 1] === '*') {
          j += 2
          while (j < json.length && !(json[j] === '*' && json[j + 1] === '/')) j++
          j += 2
          continue
        }
        break
      }
      if (json[j] === ']' || json[j] === '}') { i++; continue }
      out += c
      i++
      continue
    }

    out += c
    i++
  }
  return out
}

/**
 * Parses and validates. Returns an error string rather than throwing. Rejects exactly what the
 * plugin rejects structurally - no frames, bad duration, bad ppu, a frame with no sprite - so a
 * file the editor accepts is a file the game will load. It is deliberately lenient about field
 * types (e.g. `"duration": "1.2"` parses), because saving normalises them back to real numbers,
 * so opening and re-saving a slightly-wrong file repairs it instead of refusing it.
 */
export function parseSpec(json: string): { spec: AnimationSpec | null; error: string | null } {
  let raw: any
  try {
    raw = JSON.parse(stripJsoncExtras(json))
  } catch (e) {
    return { spec: null, error: `malformed JSON: ${(e as Error).message}` }
  }

  if (!raw || typeof raw !== 'object') return { spec: null, error: 'JSON parsed to nothing' }
  if (!Array.isArray(raw.frames) || raw.frames.length === 0) return { spec: null, error: 'no frames' }

  const duration = num(raw.duration)
  if (!(duration > 0)) return { spec: null, error: `duration must be > 0, got ${raw.duration}` }

  const ppu = raw.ppu === undefined ? DEFAULT_PPU : num(raw.ppu)
  if (!(ppu > 0)) return { spec: null, error: `ppu must be > 0, got ${raw.ppu}` }

  const frames: Frame[] = []
  for (let i = 0; i < raw.frames.length; i++) {
    const f = raw.frames[i]
    if (!f || typeof f.sprite !== 'string' || f.sprite === '') {
      return { spec: null, error: `frame ${i} has no sprite` }
    }
    const scale = num(f.scale, 1)
    const off = Array.isArray(f.offset) && f.offset.length >= 2 ? f.offset : [0, 0]
    frames.push({
      t: num(f.t),
      sprite: f.sprite,
      scale: scale > 0 ? scale : 1,
      offset: [num(off[0]), num(off[1])],
    })
  }

  // Authoring order should not have to match time order.
  frames.sort((x, y) => x.t - y.t)

  const sfx: Sfx[] = (Array.isArray(raw.sfx) ? raw.sfx : [])
    .filter((s: any) => s && typeof s.file === 'string' && s.file !== '')
    .map((s: any) => ({
      t: num(s.t),
      file: s.file,
      ...(s.clipIn === undefined ? {} : { clipIn: num(s.clipIn) }),
      ...(s.duration === undefined ? {} : { duration: num(s.duration) }),
    }))

  return {
    spec: { duration, ppu, ...(typeof raw.filter === 'string' ? { filter: raw.filter } : {}), frames, sfx },
    error: null,
  }
}

// Six decimals is far finer than a pixel at any sane ppu, and rounding here is what makes
// repeated saves idempotent instead of accumulating float noise.
const round = (n: number): number => Math.round(n * 1e6) / 1e6

export function serialiseSpec(spec: AnimationSpec): string {
  const out: any = { duration: round(spec.duration), ppu: round(spec.ppu) }
  if (spec.filter) out.filter = spec.filter

  out.frames = spec.frames.map((f) => {
    const o: any = { t: round(f.t), sprite: f.sprite, offset: [round(f.offset[0]), round(f.offset[1])] }
    if (f.scale !== 1) o.scale = round(f.scale)
    return o
  })

  if (spec.sfx.length > 0) {
    out.sfx = spec.sfx.map((s) => {
      const o: any = { t: round(s.t), file: s.file }
      if (s.clipIn !== undefined) o.clipIn = round(s.clipIn)
      if (s.duration !== undefined) o.duration = round(s.duration)
      return o
    })
  }

  return JSON.stringify(out, null, 2) + '\n'
}
