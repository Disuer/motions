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
 * -1 is not a motion index; it is the marker `dirty` uses for "appearance.json changed" (see the
 * appearance-base field below). Every loop over `dirty` has to filter it out before indexing
 * character.motions, or it reads motions[-1]. Pulled out so that guard lives in exactly one place.
 */
export function dirtyMotions(dirty: Set<number>): number[] {
  return [...dirty].filter((i) => i >= 0)
}

/**
 * Which files Save is about to write. This is what the confirmation dialog shows the user and,
 * unchanged, what save() then writes — the last line of defence before anything hits disk, so it
 * is kept pure and separate from the component so a dialog that silently under-reports (worse
 * than no dialog at all) has a test that does not need a browser.
 */
export function planSave(character: LoadedCharacter, dirty: Set<number>): string[] {
  const files = dirtyMotions(dirty).map((i) => `motions/${character.motions[i].folder}/animation.json`)
  if (character.mode === 'appearance') files.push('appearance.json')
  return files
}
