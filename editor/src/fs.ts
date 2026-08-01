import { AnimationSpec, compareNatural, defaultSpec, parseSpec } from './spec'
import { pngRejection, readPngHeader } from './png'

export type Mode = 'appearance' | 'override'

export interface LoadedAsset {
  name: string
  /** Object URL for <img src>. Revoked when the folder is closed. */
  url: string
  width: number
  height: number
  /** Non-null means the game cannot decode this file. */
  rejection: string | null
}

export interface LoadedMotion {
  folder: string
  handle: FileSystemDirectoryHandle
  spec: AnimationSpec
  /** False means the spec was reconstructed from the zero-config default. */
  hadJson: boolean
  assets: Map<string, LoadedAsset>
  sounds: string[]
  /** Why animation.json was rejected, if it was. The plugin falls back to the bundle here. */
  error: string | null
}

export interface LoadedCharacter {
  handle: FileSystemDirectoryHandle
  name: string
  mode: Mode
  motions: LoadedMotion[]
  appearanceBase: string
  hadAppearanceJson: boolean
  s1Warning: string | null
}

/** The plugin's fallback donor when appearance.json is missing (AppearanceRegistry.DefaultBase). */
export const DEFAULT_BASE = '10101_YiSang_BaseAppearance'

export function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

/**
 * Lethe truncates any appearance ID containing "Appearance" at that substring
 * (Lethe/Patches/Skin.cs:243), so a folder called MyAppearance_v2 silently registers as
 * !motions_MyAppearance. Caught here, where there is someone to tell.
 */
export function nameRejection(name: string, mode: Mode): string | null {
  if (mode !== 'appearance') return null
  if (name.includes('Appearance')) {
    return `"${name}" contains "Appearance", which Lethe truncates the ID at — ` +
           `this would register as "!motions_${name.slice(0, name.indexOf('Appearance') + 'Appearance'.length)}". Rename the folder.`
  }
  return null
}

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name)
    return await (await fh.getFile()).text()
  } catch {
    return null
  }
}

async function loadAsset(dir: FileSystemDirectoryHandle, name: string): Promise<LoadedAsset> {
  const file = await (await dir.getFileHandle(name)).getFile()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = readPngHeader(bytes)
  return {
    name,
    // Never revoked: Task 5 starts rendering these into <img>/canvas, and revoking on folder
    // close would need every consumer torn down first. Until that exists, blob URLs accumulate
    // for the tab's lifetime across repeated folder opens.
    url: URL.createObjectURL(file),
    width: info?.width ?? 0,
    height: info?.height ?? 0,
    rejection: pngRejection(info),
  }
}

async function loadMotion(handle: FileSystemDirectoryHandle, folder: string): Promise<LoadedMotion> {
  const pngs: string[] = []
  const sounds: string[] = []

  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    const lower = entry.name.toLowerCase()
    if (lower.endsWith('.png')) pngs.push(entry.name)
    else if (lower.endsWith('.wav') || lower.endsWith('.ogg')) sounds.push(entry.name)
  }
  pngs.sort(compareNatural)
  sounds.sort(compareNatural)

  const assets = new Map<string, LoadedAsset>()
  for (const name of pngs) assets.set(name, await loadAsset(handle, name))

  const json = await readText(handle, 'animation.json')
  let spec: AnimationSpec
  let error: string | null = null
  let hadJson = false

  if (json !== null) {
    const parsed = parseSpec(json)
    if (parsed.spec) {
      spec = parsed.spec
      hadJson = true
    } else {
      // Show the folder anyway, as the default, so the author can see and fix it.
      error = parsed.error
      spec = defaultSpec(pngs)
    }
  } else {
    spec = defaultSpec(pngs)
  }

  return { folder, handle, spec, hadJson, assets, sounds, error }
}

/**
 * hitCheckers marks where a coin may hand off, and defaults to 15% of the coin when absent - so
 * a two second animation stops after 0.3s. It is the most common cause of "my attack gets cut
 * short", and the file is sitting right there, so it is worth reading. Read-only, always.
 *
 * The empty-coins case is deliberately not a warning: with no coins at all, the plugin
 * synthesises one and, for a sprite motion, hands off at the very end on its own
 * (TimelineBuilder.cs:345-374) - the 15% default only fires once a coin exists and that coin's
 * own hitCheckers is missing or empty (TimelineBuilder.cs:74-85). hitCheckers lives on each
 * coin, not on the skill root, so a coins-less file has nothing to check here.
 */
export function checkSkillJson(text: string | null, name: string): string | null {
  if (text === null) return null
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return `${name} is not valid JSON, so the game will ignore it.`
  }
  const coins: any[] = Array.isArray(data?.coins) ? data.coins : []
  const badIndex = coins.findIndex((c) => !Array.isArray(c?.hitCheckers) || c.hitCheckers.length === 0)

  if (badIndex !== -1) {
    return `${name} coin ${badIndex} has no hitCheckers. That defaults to 15% of the coin, ` +
           `which cuts the animation off early. Add "hitCheckers": [{ "time": 1.0, "isNextMotionCoinDelay": 0.0 }] ` +
           `- unlike animation.json, time here is a fraction of totalDuration, so 1.0 means the end.`
  }
  return null
}

export async function loadCharacter(
  handle: FileSystemDirectoryHandle,
  mode: Mode,
): Promise<LoadedCharacter> {
  const motions: LoadedMotion[] = []
  let s1Warning: string | null = null

  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && /\.json$/i.test(entry.name) && entry.name !== 'appearance.json') {
      s1Warning ??= checkSkillJson(await readText(handle, entry.name), entry.name)
    }
    if (entry.kind !== 'directory' || entry.name !== 'motions') continue

    const root = entry as FileSystemDirectoryHandle
    for await (const sub of root.values()) {
      if (sub.kind !== 'directory') continue
      motions.push(await loadMotion(sub as FileSystemDirectoryHandle, sub.name))
    }
  }
  motions.sort((a, b) => compareNatural(a.folder, b.folder))

  const appearanceText = await readText(handle, 'appearance.json')
  let appearanceBase = DEFAULT_BASE
  if (appearanceText !== null) {
    try {
      const parsed = JSON.parse(appearanceText)
      if (typeof parsed?.base === 'string' && parsed.base) appearanceBase = parsed.base
    } catch {
      // A malformed appearance.json means the plugin falls back to Yi Sang; so do we.
    }
  }

  return {
    handle,
    name: handle.name,
    mode,
    motions,
    appearanceBase,
    hadAppearanceJson: appearanceText !== null,
    s1Warning,
  }
}

const DB = 'motions-editor'
const STORE = 'handles'
const KEY = 'last'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function rememberFolder(handle: FileSystemDirectoryHandle, mode: Mode): Promise<void> {
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ handle, mode }, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function recallFolder(): Promise<{ handle: FileSystemDirectoryHandle; mode: Mode } | null> {
  try {
    const d = await db()
    return await new Promise((resolve) => {
      const tx = d.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/** Handles lose permission across a browser restart. Regaining it needs a user gesture. */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}
