import { LoadedCharacter } from './fs'
import { alignOffset, Bbox } from './png'
import { effectivePpu, Frame } from './spec'

/**
 * Moves every frame by the same amount. Pulled out of the component so it is testable without
 * React: "add (dx, dy) to every frame's offset" is the operation an author leans on hardest to
 * fix "the whole motion sits slightly too low", and an off-by-one in which frames it touches
 * would otherwise only show up as a half-shifted motion in the browser.
 */
export function nudgeAllFrames(frames: Frame[], dx: number, dy: number): Frame[] {
  return frames.map((f) => ({ ...f, offset: [f.offset[0] + dx, f.offset[1] + dy] }))
}

/**
 * The per-frame align decision, separated from the async decode in `boundsOf` so it can be
 * tested without a canvas. axis 'xy' snaps bottom-centre; 'x' leaves vertical alone so a
 * deliberate jump or crouch survives aligning everything else.
 */
export function alignFrame(f: Frame, b: Bbox, width: number, height: number, ppu: number, axis: 'xy' | 'x'): Frame {
  const ep = effectivePpu(ppu, f.scale)
  const [x, y] = alignOffset(b, width, height, ep)
  return { ...f, offset: [x, axis === 'x' ? f.offset[1] : y] }
}

/**
 * spec.frames must be in ascending t whenever anything reads it with frameIndexAt — both the
 * preview and the game walk forward and stop at the first time past t, so an out-of-order array
 * makes that lookup return the wrong frame. Dragging a marker past its neighbour on the Timeline
 * is the one thing in the editor that can put frames out of order; this is how it gets undone.
 */
export function sortFramesByTime(frames: Frame[]): Frame[] {
  return [...frames].sort((a, b) => a.t - b.t)
}

/**
 * Adds an unused asset to the timeline as a new frame, then re-sorts. The sort is the point:
 * a hand-written animation.json can hold a frame past `duration`, so appending at `t = duration`
 * does not necessarily append in time order, and frameIndexAt (preview and game alike) reads the
 * wrong frame from an array that isn't ascending. Bottom-centre, scale 1 - the same defaults
 * defaultSpec uses, so an imported PNG starts standing on the ground.
 */
export function addFrameAt(frames: Frame[], sprite: string, t: number): Frame[] {
  return sortFramesByTime([...frames, { t, sprite, offset: [0, 0], scale: 1 }])
}

/**
 * Clamps a frame index into a frames array of `length`. prev/next used to clamp against the
 * on-disk spec's length while the canvas drew the edited one, so removing frames walked the index
 * off the end of what was actually on screen: blank canvas, "No frame selected", and a Delete that
 * removed nothing while still marking the tab dirty. Length must come from the edited spec.
 */
export function clampFrameIndex(i: number, length: number): number {
  return Math.max(0, Math.min(length - 1, i))
}

/**
 * Maps a frame index through a sort by identity, not position: resolves the frame object at `i`
 * in the pre-sort array, then finds where that same object landed in `sorted`. A drag can reorder
 * frames other than the dragged one past a selected frame, so comparing `i` to the dragged index
 * (as an earlier version of this did) silently points `selected` at the wrong sprite once that
 * happens — only identity survives a sort correctly. `null` passes through: no frame selected
 * isn't a frame to look up.
 */
export function remapFrameIndex(frames: Frame[], sorted: Frame[], i: number | null): number | null {
  return i === null ? null : sorted.indexOf(frames[i])
}

/**
 * Places frame i at i/fps and sets duration to match, so the whole motion runs at that rate.
 * Pulled out for the same reason as nudgeAllFrames: "space evenly" is the button that carries
 * most of this task's value, and the arithmetic deserves a test that doesn't need a browser.
 */
export function spaceEvenlyFrames(frames: Frame[], fps: number): { frames: Frame[]; duration: number } {
  return {
    frames: frames.map((f, i) => ({ ...f, t: i / fps })),
    duration: frames.length / fps,
  }
}

/**
 * Removes frame `i`. Never touches disk - the PNG that frame referenced simply stops being
 * referenced, so it reappears in the "unused assets" list; deleting bytes is not this function's
 * job (see planSave/save above: nothing in this editor ever deletes a file). Refuses to drop the
 * last frame - an empty `frames` array is a spec `parseSpec` itself rejects on reload, so removing
 * it would write a file the editor (and the game) can no longer open. Callers can tell nothing
 * happened because the returned array is the same array, by reference.
 */
export function removeFrame(frames: Frame[], i: number): Frame[] {
  if (frames.length <= 1) return frames
  return frames.filter((_, idx) => idx !== i)
}

/**
 * Where a frame/selection index should land after removeFrame(frames, removed, ...). Removal
 * doesn't reorder anything else - it only closes a gap - so this is plain arithmetic rather than
 * the identity lookup remapFrameIndex needs for a sort: the removed index maps to itself, clamped
 * into range (there is no "same frame" to follow, since it's gone); anything after it shifts down
 * one; anything before is untouched. `null` passes through - no selection stays no selection.
 */
export function remapAfterRemoval<T extends number | null>(index: T, removed: number, lengthAfter: number): T {
  if (index === null) return null as T
  if (index === removed) return Math.min(index, lengthAfter - 1) as T
  return (index > removed ? index - 1 : index) as T
}

/**
 * -1 is not a motion index; it is the marker `dirty` uses for "appearance.json changed" (see the
 * appearance-base field below). Every loop over `dirty` has to filter it out before indexing
 * character.motions, or it reads motions[-1]. Pulled out so that guard lives in exactly one place.
 */
export function dirtyMotions(dirty: Set<number>): number[] {
  return [...dirty].filter((i) => i >= 0)
}

/**
 * The frozen contents of a confirmation dialog: exactly what save() writes, decided once at the
 * moment the dialog opens. `indices`/`appearance` are what save() acts on; `files` is what the
 * dialog displays. Keeping them together is what makes the plan authoritative - save() must
 * consume this object rather than re-deriving from `dirty`, or a tab edited after the dialog
 * opened (while nothing on screen blocks that) can join the write having never been shown.
 */
export interface SavePlan {
  indices: number[]
  appearance: boolean
  files: string[]
}

/**
 * Which files Save is about to write. This is what the confirmation dialog shows the user and
 * exactly what save() then writes — the last line of defence before anything hits disk, so it is
 * kept pure and separate from the component so a dialog that silently under-reports (worse than
 * no dialog at all) has a test that does not need a browser.
 */
export function planSave(character: LoadedCharacter, dirty: Set<number>): SavePlan {
  const indices = dirtyMotions(dirty)
  const appearance = character.mode === 'appearance'
  const files = indices.map((i) => `motions/${character.motions[i].folder}/animation.json`)
  if (appearance) files.push('appearance.json')
  return { indices, appearance, files }
}
