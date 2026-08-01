import { useEffect, useRef, useState } from 'react'
import Canvas from './Canvas'
import Inspector from './Inspector'
import Timeline from './Timeline'
import {
  LoadedCharacter, Mode, ensurePermission, loadCharacter, nameRejection, pickFolder,
  recallFolder, rememberFolder,
} from './fs'
import { alignOffset, Bbox, boundsOf } from './png'
import { AnimationSpec, effectivePpu, Frame, frameIndexAt } from './spec'

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

const SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export default function App() {
  const [character, setCharacter] = useState<LoadedCharacter | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [recalled, setRecalled] = useState<{ handle: FileSystemDirectoryHandle; mode: Mode } | null>(null)
  const [tab, setTab] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [onionSkin, setOnionSkin] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 180 })

  // The loaded character is immutable once read; edits live in a separate specs array keyed by
  // tab index, so saving knows exactly what changed.
  const [specs, setSpecs] = useState<AnimationSpec[]>([])
  const [dirty, setDirty] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  // Preview time in seconds while playing, null when stopped.
  const [playhead, setPlayhead] = useState<number | null>(null)

  useEffect(() => {
    void recallFolder().then(setRecalled)
  }, [])

  useEffect(() => {
    if (character) setSpecs(character.motions.map((m) => structuredClone(m.spec)))
  }, [character])

  const spec = specs[tab]
  // Timeline's pointerup handler is bound once, at the start of a drag, via a raw
  // window.addEventListener - it does not pick up new closures from the re-renders that happen
  // mid-drag as onFrameTime updates state. Kept current on every render (not in an effect, which
  // would lag a tick behind) so onFrameDragEnd below always sees the frame's true final position.
  const specRef = useRef(spec)
  specRef.current = spec

  function editSpec(patch: (s: AnimationSpec) => AnimationSpec) {
    setSpecs((prev) => prev.map((s, i) => (i === tab ? patch(structuredClone(s)) : s)))
    setDirty((prev) => new Set(prev).add(tab))
  }

  function updateFrame(i: number, patch: Partial<Frame>) {
    editSpec((s) => {
      s.frames[i] = { ...s.frames[i], ...patch }
      return s
    })
  }

  function nudgeAll(dx: number, dy: number) {
    editSpec((s) => {
      s.frames = nudgeAllFrames(s.frames, dx, dy)
      return s
    })
  }

  function spaceEvenly(fps: number) {
    editSpec((s) => {
      const spaced = spaceEvenlyFrames(s.frames, fps)
      s.frames = spaced.frames
      s.duration = spaced.duration
      return s
    })
  }

  /**
   * Called once a frame drag ends (not during it — see the comment on sortFramesByTime).
   * Re-sorts and follows the dragged frame to its new index, computed by sorting a local copy of
   * specRef.current.frames: since sortFramesByTime doesn't clone individual frames, the dragged
   * frame's object identity survives the sort and indexOf finds where it landed. Reads specRef
   * rather than the `spec` closure because this function is called from a window listener bound
   * at the start of the drag, before the moves that actually change frame i's time.
   */
  function onFrameDragEnd(i: number) {
    const current = specRef.current.frames
    const newIndex = sortFramesByTime(current).indexOf(current[i])
    editSpec((s) => {
      s.frames = sortFramesByTime(s.frames)
      return s
    })
    setFrameIndex(newIndex)
    setSelected((sel) => (sel === i ? newIndex : sel))
  }

  async function alignAll(axis: 'xy' | 'x') {
    const motion = character!.motions[tab]
    // Each frame's decode is caught individually, so one corrupt or missing PNG leaves that
    // frame unchanged instead of rejecting the whole Promise.all and silently no-oping the
    // entire align — partial alignment is more useful than none.
    const failed: string[] = []
    const next = await Promise.all(
      spec.frames.map(async (f) => {
        const asset = motion.assets.get(f.sprite)
        if (!asset) return f
        try {
          const b = await boundsOf(asset.url, asset.width, asset.height)
          if (!b) return f
          return alignFrame(f, b, asset.width, asset.height, spec.ppu, axis)
        } catch {
          failed.push(f.sprite)
          return f
        }
      }),
    )
    editSpec((s) => {
      s.frames = next
      return s
    })
    if (failed.length > 0) {
      setProblem(`Could not read ${failed.join(', ')} to align it/them — left unchanged. Re-export the file and try again.`)
    }
  }

  // Selection decides the target: a frame selected moves that frame, nothing selected moves
  // every frame at once.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const step = e.shiftKey ? 0.1 : 0.01
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
      const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
      if (dx === 0 && dy === 0) return
      // Let form controls that own their own arrow-key behaviour handle it themselves - a select
      // (e.g. the filter dropdown) cycles its options on ArrowUp/Down, and without this guard
      // that gets suppressed by preventDefault() below while a frame is silently nudged anyway.
      const editable = ['INPUT', 'SELECT', 'TEXTAREA']
      if (editable.includes(document.activeElement?.tagName ?? '')) return
      e.preventDefault()

      if (selected === null) nudgeAll(dx, dy)
      else updateFrame(selected, {
        offset: [spec.frames[selected].offset[0] + dx, spec.frames[selected].offset[1] + dy],
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, spec, tab])

  // Steps through frames with the same frameIndexAt lookup the runtime uses, rather than
  // tweening — a blended preview would have authors aligning frames against a lie.
  useEffect(() => {
    if (playhead === null || !spec) return
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = ((now - started) / 1000) % spec.duration
      setPlayhead(t)
      setFrameIndex(Math.max(0, frameIndexAt(spec.frames.map((f) => f.t), t)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Restarting on every playhead change would reset the clock, so this deliberately
    // depends only on whether playback is on at all.
  }, [playhead === null, spec?.duration, tab])

  async function open(handle: FileSystemDirectoryHandle, mode: Mode) {
    setProblem(null)
    if (!(await ensurePermission(handle))) {
      setProblem('Permission to read and write that folder was refused.')
      return
    }
    const rejection = nameRejection(handle.name, mode)
    if (rejection) {
      setProblem(rejection)
      return
    }
    const loaded = await loadCharacter(handle, mode)
    await rememberFolder(handle, mode)
    setCharacter(loaded)
  }

  async function choose(mode: Mode) {
    try {
      await open(await pickFolder(), mode)
    } catch {
      // The user dismissed the picker. Nothing to report.
    }
  }

  if (!SUPPORTED) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Motions — sprite motion editor</h1>
        <p className="mt-4 rounded border border-amber-400 bg-amber-50 p-4 text-sm">
          This editor needs <strong>Chrome or Edge</strong>. It writes straight into your mod
          folder, and Firefox and Safari cannot do that yet.
        </p>
      </main>
    )
  }

  if (!character) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold">Motions — sprite motion editor</h1>
        <p className="mt-2 text-sm text-gray-600">
          Pick the character folder you want to edit. Nothing is written until you save.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button onClick={() => void choose('appearance')}
                  className="rounded border p-4 text-left hover:bg-gray-50">
            <div className="font-medium">New appearance</div>
            <code className="text-xs text-gray-500">motion_appearances/&lt;Name&gt;/</code>
            <p className="mt-2 text-xs text-gray-600">A character of your own. Has an appearance.json.</p>
          </button>

          <button onClick={() => void choose('override')}
                  className="rounded border p-4 text-left hover:bg-gray-50">
            <div className="font-medium">Override a character</div>
            <code className="text-xs text-gray-500">custom_motions/&lt;appearanceID&gt;/</code>
            <p className="mt-2 text-xs text-gray-600">Replaces the motions of an existing appearance.</p>
          </button>
        </div>

        {recalled && (
          <button onClick={() => void open(recalled.handle, recalled.mode)}
                  className="mt-4 text-sm text-blue-700 underline">
            Reopen {recalled.handle.name}
          </button>
        )}

        {problem && <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm">{problem}</p>}
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-lg font-semibold">{character.name}</h1>
      <p className="text-xs text-gray-500">
        {character.mode === 'appearance'
          ? `registers as !motions_${character.name}, built on ${character.appearanceBase}`
          : 'overrides an existing appearance'}
      </p>

      {character.s1Warning && (
        <p className="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          {character.s1Warning}
        </p>
      )}

      <div className="mt-4 flex gap-1 border-b text-sm">
        {character.motions.map((m, i) => (
          // selected is a frame index into the OLD tab's spec; carrying it into a motion with
          // fewer frames would crash the arrow-key handler on spec.frames[selected].offset.
          // null is the safe reset - it means "arrows move ALL frames", not "frame 0 of the wrong motion".
          <button key={m.folder} onClick={() => { setTab(i); setFrameIndex(0); setSelected(null) }}
                  className={`px-3 py-1 ${i === tab ? 'border-b-2 border-black font-medium' : 'text-gray-600'}`}>
            {m.folder}
          </button>
        ))}
      </div>

      {character.motions[tab] && (
        <>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <label><input type="checkbox" checked={onionSkin}
                          onChange={(e) => setOnionSkin(e.target.checked)} /> onion skin</label>
            <label>zoom <input type="range" min={0.25} max={4} step={0.05} value={zoom}
                               onChange={(e) => setZoom(Number(e.target.value))} /></label>
            <span>frame {frameIndex + 1} / {character.motions[tab].spec.frames.length}</span>
            <button onClick={() => setFrameIndex((i) => Math.max(0, i - 1))}>prev</button>
            <button onClick={() => setFrameIndex((i) =>
              Math.max(0, Math.min(character.motions[tab].spec.frames.length - 1, i + 1)))}>next</button>
            <button onClick={() => void alignAll('xy')} className="rounded border px-2 py-0.5">Align all</button>
            <button onClick={() => void alignAll('x')} className="rounded border px-2 py-0.5">Align X only</button>
            <button onClick={() => setSelected(selected === null ? frameIndex : null)}
                    className="rounded border px-2 py-0.5">
              {selected === null ? 'arrows move: ALL frames' : `arrows move: frame ${selected + 1}`}
            </button>
          </div>
          {spec && (
            <>
              <div className="mt-2 flex h-[520px] rounded border">
                <div className="flex-1">
                  <Canvas
                    spec={spec}
                    assets={character.motions[tab].assets}
                    index={frameIndex}
                    onionSkin={onionSkin}
                    zoom={zoom}
                    pan={pan}
                    onPan={setPan}
                    onDragFrame={(dx, dy) => updateFrame(frameIndex, {
                      offset: [spec.frames[frameIndex].offset[0] + dx,
                               spec.frames[frameIndex].offset[1] + dy],
                    })}
                  />
                </div>
                <Inspector
                  spec={spec}
                  index={frameIndex}
                  onFrame={(p) => updateFrame(frameIndex, p)}
                  onSpec={(p) => editSpec((s) => ({ ...s, ...p }))}
                />
              </div>

              <button onClick={() => setPlayhead(playhead === null ? 0 : null)}
                      className="mt-2 rounded border px-2 py-0.5 text-xs">
                {playhead === null ? '▶ play' : '■ stop'}
              </button>

              <Timeline
                spec={spec}
                index={frameIndex}
                playhead={playhead}
                onPick={setFrameIndex}
                onFrameTime={(i, t) => updateFrame(i, { t })}
                onFrameDragEnd={onFrameDragEnd}
                onSfxTime={(i, t) => editSpec((s) => { s.sfx[i] = { ...s.sfx[i], t }; return s })}
                onSpace={spaceEvenly}
              />
            </>
          )}
        </>
      )}
      {character.motions.length === 0 && <p className="mt-4 text-sm text-gray-500">No motions/ folder found.</p>}
    </main>
  )
}
