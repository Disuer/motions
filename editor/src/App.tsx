import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import Inspector from './Inspector'
import {
  LoadedCharacter, Mode, ensurePermission, loadCharacter, nameRejection, pickFolder,
  recallFolder, rememberFolder,
} from './fs'
import { alignOffset, Bbox, boundsOf } from './png'
import { AnimationSpec, effectivePpu, Frame } from './spec'

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

  useEffect(() => {
    void recallFolder().then(setRecalled)
  }, [])

  useEffect(() => {
    if (character) setSpecs(character.motions.map((m) => structuredClone(m.spec)))
  }, [character])

  const spec = specs[tab]

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

  async function alignAll(axis: 'xy' | 'x') {
    const motion = character!.motions[tab]
    const next = await Promise.all(
      spec.frames.map(async (f) => {
        const asset = motion.assets.get(f.sprite)
        if (!asset) return f
        const b = await boundsOf(asset.url, asset.width, asset.height)
        if (!b) return f
        return alignFrame(f, b, asset.width, asset.height, spec.ppu, axis)
      }),
    )
    editSpec((s) => {
      s.frames = next
      return s
    })
  }

  // Selection decides the target: a frame selected moves that frame, nothing selected moves
  // every frame at once.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const step = e.shiftKey ? 0.1 : 0.01
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
      const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
      if (dx === 0 && dy === 0) return
      if (document.activeElement?.tagName === 'INPUT') return  // let number fields do their own thing
      e.preventDefault()

      if (selected === null) nudgeAll(dx, dy)
      else updateFrame(selected, {
        offset: [spec.frames[selected].offset[0] + dx, spec.frames[selected].offset[1] + dy],
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, spec, tab])

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
          )}
        </>
      )}
      {character.motions.length === 0 && <p className="mt-4 text-sm text-gray-500">No motions/ folder found.</p>}
    </main>
  )
}
