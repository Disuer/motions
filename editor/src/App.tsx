import { useEffect, useRef, useState } from 'react'
import Canvas from './Canvas'
import Inspector from './Inspector'
import Timeline from './Timeline'
import {
  DEFAULT_BASE, LoadedCharacter, Mode, ensurePermission, importAssets, loadCharacter,
  nameRejection, pickFolder, recallFolder, rememberFolder, writeFile,
} from './fs'
import { MOTION_NAMES, isSkill } from './motions'
import { boundsOf } from './png'
import { AnimationSpec, DEFAULT_FPS, Frame, frameIndexAt, serialiseSpec } from './spec'
import {
  alignFrame, nudgeAllFrames, planSave, remapAfterRemoval, remapFrameIndex, removeFrame, SavePlan,
  sortFramesByTime, spaceEvenlyFrames,
} from './editing'

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

  const [base, setBase] = useState(DEFAULT_BASE)
  const [pending, setPending] = useState<SavePlan | null>(null)   // frozen confirmation plan
  const [saved, setSaved] = useState<string | null>(null)
  const [newMotion, setNewMotion] = useState('')

  useEffect(() => {
    void recallFolder().then(setRecalled)
  }, [])

  useEffect(() => { if (character) setBase(character.appearanceBase) }, [character])

  // Folders loaded so far, in the order specs/dirty currently index by. Updated at the end of the
  // effect below, so it always holds the order from BEFORE the character that effect is reacting to.
  const prevMotionsRef = useRef<{ folder: string }[]>([])

  useEffect(() => {
    if (!character) return
    const prevMotions = prevMotionsRef.current

    // importAssets and createMotion both re-read the folder with loadCharacter, which replaces
    // `character` and, before this fix, reset every spec from disk - silently discarding any
    // unsaved edit in a tab other than the one just touched. A new motion folder can also sort
    // in ahead of existing ones, shifting every index after it, so matching by array position
    // (as an earlier version of this did) can attribute an edit to the wrong folder entirely.
    // Matching by folder name instead survives both a reorder and a re-read.
    setSpecs((prevSpecs) =>
      character.motions.map((m) => {
        const oldIndex = prevMotions.findIndex((pm) => pm.folder === m.folder)
        return oldIndex >= 0 && prevSpecs[oldIndex] ? prevSpecs[oldIndex] : structuredClone(m.spec)
      }),
    )
    setDirty((prevDirty) => {
      const next = new Set<number>()
      if (prevDirty.has(-1)) next.add(-1)
      character.motions.forEach((m, newIndex) => {
        const oldIndex = prevMotions.findIndex((pm) => pm.folder === m.folder)
        if (oldIndex >= 0 && prevDirty.has(oldIndex)) next.add(newIndex)
      })
      return next
    })
    // `tab` is a position, not a folder name, so a reorder can leave it pointing at a different
    // motion than the one the user was looking at. Follow the folder it used to mean, same idea
    // as remapFrameIndex above.
    setTab((prevTab) => {
      const oldFolder = prevMotions[prevTab]?.folder
      if (oldFolder === undefined) return prevTab
      const newIndex = character.motions.findIndex((m) => m.folder === oldFolder)
      return newIndex >= 0 ? newIndex : prevTab
    })

    prevMotionsRef.current = character.motions.map((m) => ({ folder: m.folder }))
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

  /**
   * Adds a delta to one frame's offset, reading the offset it is added to inside the state
   * updater rather than from the render's `spec`. The canvas drag binds `move` on window once, at
   * pointerdown, so every event in the drag sees the props (and therefore the `spec`) of that one
   * render, while the deltas it reports are incremental — computing the new offset out here would
   * make each event write preDragOffset + oneIncrement and overwrite the drag so far instead of
   * accumulating it. Key repeat on the arrow keys can outrun a render the same way. Same class of
   * bug as the one specRef exists for: state read through a closure that outlives its render.
   */
  function nudgeFrame(i: number, dx: number, dy: number) {
    editSpec((s) => {
      s.frames[i] = {
        ...s.frames[i],
        offset: [s.frames[i].offset[0] + dx, s.frames[i].offset[1] + dy],
      }
      return s
    })
  }

  function nudgeAll(dx: number, dy: number) {
    editSpec((s) => {
      s.frames = nudgeAllFrames(s.frames, dx, dy)
      return s
    })
  }

  /**
   * Removes frame `i` and never the PNG - see removeFrame's doc. Refuses (silently, same as
   * removeFrame itself) on a motion's last frame, so it never writes a spec.frames = [] that
   * parseSpec would reject on reload. frameIndex and selected are both remapped by position, not
   * left to drift: this project has already shipped a crash (Task 6) and a silent mis-edit
   * (Task 7) from an index surviving a frames-array change unremapped.
   */
  function removeSelectedFrame(i: number) {
    const before = spec.frames.length
    if (before <= 1) return
    editSpec((s) => {
      s.frames = removeFrame(s.frames, i)
      return s
    })
    setFrameIndex((fi) => remapAfterRemoval(fi, i, before - 1))
    setSelected((sel) => remapAfterRemoval(sel, i, before - 1))
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
   * Called once a frame drag ends (not during it — see the comment on sortFramesByTime). Reads
   * specRef rather than the `spec` closure because this function is called from a window listener
   * bound at the start of the drag, before the moves that actually change frame i's time.
   * `selected` is remapped the same way as frameIndex — by identity, via remapFrameIndex — because
   * the drag can reorder a different, selected frame past the one being dragged.
   */
  function onFrameDragEnd(i: number) {
    const current = specRef.current.frames
    const sorted = sortFramesByTime(current)
    editSpec((s) => {
      s.frames = sortFramesByTime(s.frames)
      return s
    })
    setFrameIndex(remapFrameIndex(current, sorted, i) ?? i)
    setSelected((sel) => remapFrameIndex(current, sorted, sel))
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

  /**
   * Writes precisely what `plan` listed - never re-reads live `dirty`. The dialog is the promise;
   * if a tab was edited after it opened, that edit simply stays dirty and unsaved rather than
   * sneaking into a write it was never shown in. Only the indices (and appearance.json, if part
   * of the plan) that were actually written come out of `dirty` afterward, so a since-dirtied tab
   * keeps its flag and its own Save button count.
   */
  async function save(plan: SavePlan) {
    for (const i of plan.indices) {
      await writeFile(character!.motions[i].handle, 'animation.json', serialiseSpec(specs[i]))
    }
    if (plan.appearance) {
      await writeFile(character!.handle, 'appearance.json', JSON.stringify({ base }, null, 2) + '\n')
    }
    setSaved(`Wrote ${plan.files.length} file(s).`)
    setDirty((prev) => {
      const next = new Set(prev)
      for (const i of plan.indices) next.delete(i)
      if (plan.appearance) next.delete(-1)
      return next
    })
    setPending(null)
  }

  // The only action that creates a directory, so it gets the same care as a write: the name is
  // typed deliberately (no default), and it only ever creates inside motions/ of the picked folder.
  async function createMotion(name: string) {
    if (!name) return
    const root = await character!.handle.getDirectoryHandle('motions', { create: true })
    await root.getDirectoryHandle(name, { create: true })
    setCharacter(await loadCharacter(character!.handle, character!.mode))
    setNewMotion('')
  }

  // Selection decides the target: a frame selected moves that frame, nothing selected moves
  // every frame at once.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Belt-and-braces alongside `inert` on the main content below: the confirmation dialog is
      // meant to be an honest, frozen snapshot of what Save will write, so nothing - including an
      // arrow-key nudge of a clean tab sitting behind the dialog - may change editor state while
      // it's open.
      if (pending || !spec) return
      // Let form controls that own their own arrow-key behaviour handle it themselves - a select
      // (e.g. the filter dropdown) cycles its options on ArrowUp/Down, and without this guard
      // that gets suppressed by preventDefault() below while a frame is silently nudged anyway.
      // Same guard covers Delete/Backspace: it must not fire while someone is editing text.
      const editable = ['INPUT', 'SELECT', 'TEXTAREA']
      if (editable.includes(document.activeElement?.tagName ?? '')) return

      // Targets frameIndex - the frame currently shown in the Inspector - not `selected`, which
      // only exists to steer arrow-key nudges and is often null ("arrows move ALL frames"). A
      // frame is always being viewed, so Delete/Backspace always has something to act on.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelectedFrame(frameIndex)
        return
      }

      const step = e.shiftKey ? 0.1 : 0.01
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
      const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
      if (dx === 0 && dy === 0) return
      e.preventDefault()

      if (selected === null) nudgeAll(dx, dy)
      else nudgeFrame(selected, dx, dy)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, spec, tab, pending, frameIndex])

  // Steps through frames with the same frameIndexAt lookup the runtime uses, rather than
  // tweening — a blended preview would have authors aligning frames against a lie.
  useEffect(() => {
    if (playhead === null || !spec) return
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = ((now - started) / 1000) % spec.duration
      setPlayhead(t)
      // specRef, not spec: dragging a marker while the preview is running must not restart this
      // effect (that would reset `started` and jump the clock to zero), but the preview still
      // needs to see the frame's live time, not the one it had when playback started.
      setFrameIndex(Math.max(0, frameIndexAt(specRef.current.frames.map((f) => f.t), t)))
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
      {/* inert, not just conditional styling: while the confirmation dialog is open, nothing in
          here should be clickable, focusable or reachable by keyboard - it is the native
          replacement for a hand-rolled focus trap, and the keydown gate above is the redundant
          backstop in case some interaction reaches state without going through focus at all. */}
      <div inert={pending !== null}>
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{character.name}</h1>
        <button onClick={() => setPending(planSave(character, dirty))} disabled={dirty.size === 0}
                className="rounded border px-2 py-0.5 text-xs disabled:opacity-40">
          Save{dirty.size > 0 && ` (${dirty.size})`}
        </button>
        {saved && <span className="text-xs text-green-700">{saved}</span>}
      </div>
      <p className="text-xs text-gray-500">
        {character.mode === 'appearance'
          ? `registers as !motions_${character.name}`
          : 'overrides an existing appearance'}
      </p>
      {character.mode === 'appearance' && (
        <label className="mt-2 flex items-center gap-2 text-xs">
          built on
          <input className="w-72 rounded border px-1 py-0.5" value={base}
                 onChange={(e) => { setBase(e.target.value); setDirty((p) => new Set(p).add(-1)) }} />
          <span className="text-gray-500">the vanilla appearance cloned as a donor rig</span>
        </label>
      )}

      {problem && (
        // Reused from the "pick a folder" screen: the one place a rejected import (or a failed
        // align, from Task 6) surfaces once a character is already loaded. whitespace-pre-line
        // because a multi-PNG drop joins its rejections with newlines.
        <p className="mt-4 whitespace-pre-line rounded border border-red-300 bg-red-50 p-3 text-sm">
          {problem}
        </p>
      )}

      {character.s1Warning && (
        <p className="mt-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          {character.s1Warning}
        </p>
      )}

      <div className="mt-4 flex items-center gap-1 border-b text-sm">
        {character.motions.map((m, i) => (
          // selected is a frame index into the OLD tab's spec; carrying it into a motion with
          // fewer frames would crash the arrow-key handler on spec.frames[selected].offset.
          // null is the safe reset - it means "arrows move ALL frames", not "frame 0 of the wrong motion".
          <button key={m.folder} onClick={() => { setTab(i); setFrameIndex(0); setSelected(null) }}
                  className={`px-3 py-1 ${i === tab ? 'border-b-2 border-black font-medium' : 'text-gray-600'}`}>
            {m.folder}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-1 py-1 text-xs">
          <input
            list="motion-names"
            placeholder="new motion"
            className="w-36 rounded border px-1 py-0.5"
            value={newMotion}
            onChange={(e) => setNewMotion(e.target.value)}
          />
          <datalist id="motion-names">
            {MOTION_NAMES.map((n) => <option key={n} value={n} />)}
            {MOTION_NAMES.filter(isSkill).map((n) => <option key={`${n}_1`} value={`${n}_1`} />)}
          </datalist>
          <button onClick={() => void createMotion(newMotion)} className="rounded border px-2 py-0.5">
            + folder
          </button>
        </span>
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
                <div
                  className="flex-1"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault()
                    const result = await importAssets(character.motions[tab].handle, [...e.dataTransfer.files])
                    if (result.rejected.length > 0) {
                      setProblem(result.rejected.map((r) => `${r.name}: ${r.why}`).join('\n'))
                    }
                    if (result.written.length > 0) {
                      // A re-imported file replaces its old bytes (writeFile always truncates) -
                      // not a delete, but still someone's art disappearing with no acknowledgement
                      // if "4 imported" doesn't say which of those 4 already existed.
                      const newCount = result.written.length - result.replaced.length
                      const parts = []
                      if (newCount > 0) parts.push(`${newCount} imported`)
                      if (result.replaced.length > 0) parts.push(`${result.replaced.length} replaced`)
                      setSaved(parts.join(', '))
                      // Re-read the folder so the new files appear as assets. They are not frames
                      // yet - see the "+ name" buttons below - loadCharacter only puts every PNG
                      // into spec.frames when there was no animation.json to begin with.
                      setCharacter(await loadCharacter(character.handle, character.mode))
                    }
                  }}
                >
                  {/* frameIndex is safe to capture in onDragFrame: a drag cannot change which
                      frame is being dragged. The offset it is added to must not be captured -
                      see nudgeFrame. */}
                  <Canvas
                    spec={spec}
                    assets={character.motions[tab].assets}
                    index={frameIndex}
                    onionSkin={onionSkin}
                    zoom={zoom}
                    pan={pan}
                    onPan={setPan}
                    onDragFrame={(dx, dy) => nudgeFrame(frameIndex, dx, dy)}
                  />
                </div>
                <Inspector
                  spec={spec}
                  index={frameIndex}
                  onFrame={(p) => updateFrame(frameIndex, p)}
                  onSpec={(p) => editSpec((s) => ({ ...s, ...p }))}
                  onRemove={() => removeSelectedFrame(frameIndex)}
                />
                <div className="w-40 shrink-0 overflow-y-auto border-l p-3">
                  <div className="text-xs font-medium">unused assets</div>
                  <p className="mt-1 text-[10px] leading-tight text-gray-500">
                    Imported but not on the timeline. Drop PNGs onto the canvas to import more.
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {[...character.motions[tab].assets.keys()]
                      .filter((name) => !spec.frames.some((f) => f.sprite === name))
                      .map((name) => (
                        <button key={name} className="block w-full truncate rounded border px-1 text-left text-xs"
                                onClick={() => editSpec((s) => {
                                  s.frames.push({ t: s.duration, sprite: name, offset: [0, 0], scale: 1 })
                                  s.duration = s.duration + 1 / DEFAULT_FPS
                                  return s
                                })}>
                          + {name}
                        </button>
                      ))}
                  </div>
                </div>
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
      </div>

      {/* Outside the inert wrapper on purpose - the dialog is the one thing that must stay
          interactive while it is up. */}
      {pending && (
        <div className="fixed inset-0 grid place-items-center bg-black/30">
          <div className="w-96 rounded bg-white p-4 text-sm shadow">
            <p className="font-medium">About to write into {character.name}:</p>
            <ul className="mt-2 list-inside list-disc text-xs">
              {pending.files.map((f) => <li key={f}><code>{f}</code></li>)}
            </ul>
            <p className="mt-2 text-xs text-gray-500">Nothing else is touched, and nothing is deleted.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="rounded border px-3 py-1">Cancel</button>
              <button onClick={() => void save(pending)} className="rounded bg-black px-3 py-1 text-white">Write</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
