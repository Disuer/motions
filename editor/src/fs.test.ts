import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE, checkSkillJson, loadCharacter, nameRejection } from './fs'
import { defaultSpec } from './spec'

// vitest's environment has no createObjectURL; loadAsset needs it to exist. It only has to
// return a string, since the fixture tests below never inspect the URL itself.
;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'

// A fixture, not a mock: canned entries for handle.values()/getFileHandle so loadCharacter and
// loadMotion's real logic runs against fixed input, the same idea as an in-memory filesystem.
type FakeEntry =
  | { kind: 'file'; content: string }
  | { kind: 'directory'; entries: Record<string, FakeEntry> }

const file = (content = ''): FakeEntry => ({ kind: 'file', content })
const dir = (entries: Record<string, FakeEntry>): FakeEntry => ({ kind: 'directory', entries })

function fakeDir(name: string, entries: Record<string, FakeEntry>): FileSystemDirectoryHandle {
  return {
    name,
    kind: 'directory',
    async *values() {
      for (const [entryName, entry] of Object.entries(entries)) {
        yield entry.kind === 'directory' ? fakeDir(entryName, entry.entries) : { kind: 'file', name: entryName }
      }
    },
    async getFileHandle(fileName: string) {
      const entry = entries[fileName]
      if (!entry || entry.kind !== 'file') throw new Error(`not found: ${fileName}`)
      return {
        async getFile() {
          const bytes = new TextEncoder().encode(entry.content)
          return { text: async () => entry.content, arrayBuffer: async () => bytes.buffer }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle
}

// checkSkillJson is read-only over parsed skill JSON; pinning the one branch that determines
// whether an author sees a warning at all.
describe('checkSkillJson', () => {
  it('is silent when coins is absent or empty - the plugin hands off at the end on its own', () => {
    expect(checkSkillJson('{}', 'S1.json')).toBeNull()
    expect(checkSkillJson('{"coins": []}', 'S1.json')).toBeNull()
  })

  it('is silent when every coin has hitCheckers', () => {
    const json = JSON.stringify({ coins: [{ hitCheckers: [{ time: 1.0, isNextMotionCoinDelay: 0 }] }] })
    expect(checkSkillJson(json, 'S1.json')).toBeNull()
  })

  it('names the coin index missing hitCheckers', () => {
    const json = JSON.stringify({
      coins: [{ hitCheckers: [{ time: 1.0, isNextMotionCoinDelay: 0 }] }, { hitCheckers: [] }],
    })
    expect(checkSkillJson(json, 'S1.json')).toMatch(/coin 1 has no hitCheckers/)
  })

  it('flags malformed JSON without touching the file', () => {
    expect(checkSkillJson('{not json', 'S1.json')).toMatch(/not valid JSON/)
  })

  it('is null when the file does not exist', () => {
    expect(checkSkillJson(null, 'S1.json')).toBeNull()
  })
})

describe('nameRejection', () => {
  it('catches the Lethe truncation for new appearances only', () => {
    expect(nameRejection('MyAppearance_v2', 'appearance')).toMatch(/!motions_MyAppearance/)
    expect(nameRejection('MyAppearance_v2', 'override')).toBeNull()
    expect(nameRejection('MyGuy', 'appearance')).toBeNull()
  })
})

// This is the only branching logic in the task besides checkSkillJson, and Tasks 5-8 build on
// LoadedCharacter/LoadedMotion as their data model - the brief's Step 6 (a manual browser check)
// is the one true end-to-end test, and it isn't run here, so this is the only remaining net.
describe('loadCharacter', () => {
  it('falls back to the default spec for a motion with PNGs and no animation.json', async () => {
    const root = fakeDir('MyGuy', {
      motions: dir({ Idle: dir({ 'frame_1.png': file(), 'frame_2.png': file() }) }),
    })
    const character = await loadCharacter(root, 'appearance')
    expect(character.motions).toHaveLength(1)
    const [idle] = character.motions
    expect(idle.folder).toBe('Idle')
    expect(idle.hadJson).toBe(false)
    expect(idle.error).toBeNull()
    expect(idle.spec).toEqual(defaultSpec(['frame_1.png', 'frame_2.png']))
  })

  it('keeps the motion and falls back to the default spec when animation.json fails to parse', async () => {
    const root = fakeDir('MyGuy', {
      motions: dir({ Idle: dir({ 'frame_1.png': file(), 'animation.json': file('{"frames": []}') }) }),
    })
    const character = await loadCharacter(root, 'appearance')
    expect(character.motions).toHaveLength(1)
    const [idle] = character.motions
    expect(idle.hadJson).toBe(false)
    expect(idle.error).toMatch(/no frames/)
    expect(idle.spec).toEqual(defaultSpec(['frame_1.png']))
  })

  it('sorts motion folders naturally, not lexically', async () => {
    const root = fakeDir('MyGuy', {
      motions: dir({ S10: dir({}), S1: dir({}), S2: dir({}) }),
    })
    const character = await loadCharacter(root, 'appearance')
    expect(character.motions.map((m) => m.folder)).toEqual(['S1', 'S2', 'S10'])
  })

  it('defaults to DEFAULT_BASE when appearance.json is absent', async () => {
    const root = fakeDir('MyGuy', { motions: dir({}) })
    const character = await loadCharacter(root, 'appearance')
    expect(character.appearanceBase).toBe(DEFAULT_BASE)
    expect(character.hadAppearanceJson).toBe(false)
  })

  it('defaults to DEFAULT_BASE without throwing when appearance.json is malformed', async () => {
    const root = fakeDir('MyGuy', { motions: dir({}), 'appearance.json': file('{not json') })
    const character = await loadCharacter(root, 'appearance')
    expect(character.appearanceBase).toBe(DEFAULT_BASE)
  })
})
