import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import {
  LoadedCharacter, Mode, ensurePermission, loadCharacter, nameRejection, pickFolder,
  recallFolder, rememberFolder,
} from './fs'

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

  useEffect(() => {
    void recallFolder().then(setRecalled)
  }, [])

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
          <button key={m.folder} onClick={() => { setTab(i); setFrameIndex(0) }}
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
              Math.min(character.motions[tab].spec.frames.length - 1, i + 1))}>next</button>
          </div>
          <div className="mt-2 h-[520px] rounded border">
            <Canvas
              spec={character.motions[tab].spec}
              assets={character.motions[tab].assets}
              index={frameIndex}
              onionSkin={onionSkin}
              zoom={zoom}
              pan={pan}
              onPan={setPan}
              onDragFrame={() => {}}
            />
          </div>
        </>
      )}
      {character.motions.length === 0 && <p className="mt-4 text-sm text-gray-500">No motions/ folder found.</p>}
    </main>
  )
}
