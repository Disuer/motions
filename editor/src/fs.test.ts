import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BASE, checkSkillJson, createCharacter, findCharacters, folderNameRejection, importAssets,
  isModsRoot, loadCharacter, modFolderRejection, nameRejection,
} from './fs'
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
    // 1-based, matching the coin tabs in the editor: the raw index sent people to the wrong tab.
    expect(checkSkillJson(json, 'S1.json')).toMatch(/coin 2 has no hitCheckers/)
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

/** Builds the first 33 bytes of a PNG: signature + IHDR, same shape as png.test.ts's helper. */
function pngBytes(bitDepth: number, colorType: number, interlace = 0) {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const dv = new DataView(b.buffer)
  dv.setUint32(8, 13)
  b.set([0x49, 0x48, 0x44, 0x52], 12)
  dv.setUint32(16, 200)
  dv.setUint32(20, 400)
  b[24] = bitDepth
  b[25] = colorType
  b[28] = interlace
  return b
}

/**
 * A writable fake directory: records every write rather than touching disk, so importAssets'
 * real filtering logic runs against something that behaves like FileSystemDirectoryHandle's
 * write path (getFileHandle(create) -> createWritable -> write -> close). getFileHandle without
 * `create` throws for a name not yet written, same as the real API - importAssets uses exactly
 * that call to detect a collision before overwriting.
 */
function fakeWritableDir(): FileSystemDirectoryHandle & { written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>()
  return {
    written,
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!opts?.create && !written.has(name)) {
        throw new DOMException(`not found: ${name}`, 'NotFoundError')
      }
      return {
        async createWritable() {
          return {
            async write(contents: Uint8Array) { written.set(name, contents) },
            async close() {},
          }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle & { written: Map<string, Uint8Array> }
}

// importAssets is the last line of defence against PNGs Lethe's decoder cannot read - in game
// those fail silently, so every rejection here has to name the file and the reason.
describe('importAssets', () => {
  it('accepts a valid 8-bit RGBA PNG', async () => {
    const dir = fakeWritableDir()
    const png = new File([pngBytes(8, 6)], 'good.png')
    const result = await importAssets(dir, [png])
    expect(result.written).toEqual(['good.png'])
    expect(result.replaced).toEqual([])
    expect(result.rejected).toEqual([])
    expect(dir.written.has('good.png')).toBe(true)
  })

  it('rejects an indexed PNG by name, with the reason', async () => {
    const dir = fakeWritableDir()
    const png = new File([pngBytes(8, 3)], 'indexed.png')
    const result = await importAssets(dir, [png])
    expect(result.written).toEqual([])
    expect(result.rejected).toEqual([{ name: 'indexed.png', why: expect.stringMatching(/indexed/) }])
    expect(dir.written.size).toBe(0)
  })

  it('rejects a 16-bit PNG', async () => {
    const dir = fakeWritableDir()
    const png = new File([pngBytes(16, 6)], 'sixteen.png')
    const result = await importAssets(dir, [png])
    expect(result.rejected).toEqual([{ name: 'sixteen.png', why: expect.stringMatching(/8-bit/) }])
  })

  it('rejects an interlaced PNG', async () => {
    const dir = fakeWritableDir()
    const png = new File([pngBytes(8, 6, 1)], 'interlaced.png')
    const result = await importAssets(dir, [png])
    expect(result.rejected).toEqual([{ name: 'interlaced.png', why: expect.stringMatching(/interlac/) }])
  })

  it('accepts .wav and .ogg without inspecting them as PNGs', async () => {
    const dir = fakeWritableDir()
    const wav = new File([new Uint8Array(4)], 'hit.wav')
    const ogg = new File([new Uint8Array(4)], 'hit.ogg')
    const result = await importAssets(dir, [wav, ogg])
    expect(result.written.sort()).toEqual(['hit.ogg', 'hit.wav'])
    expect(result.rejected).toEqual([])
  })

  it('rejects an unrelated extension', async () => {
    const dir = fakeWritableDir()
    const txt = new File([new Uint8Array(4)], 'notes.txt')
    const result = await importAssets(dir, [txt])
    expect(result.written).toEqual([])
    expect(result.rejected).toEqual([{ name: 'notes.txt', why: expect.stringMatching(/only \.png, \.wav and \.ogg/) }])
  })

  it('writes the accepted files and skips the rejected ones in a mixed batch', async () => {
    const dir = fakeWritableDir()
    const files = [
      new File([pngBytes(8, 6)], 'good.png'),
      new File([pngBytes(8, 3)], 'bad.png'),
      new File([new Uint8Array(4)], 'hit.wav'),
    ]
    const result = await importAssets(dir, files)
    expect(result.written.sort()).toEqual(['good.png', 'hit.wav'])
    expect(result.replaced).toEqual([])
    expect(result.rejected.map((r) => r.name)).toEqual(['bad.png'])
    expect(dir.written.size).toBe(2)
  })

  // writeFile always truncates (getFileHandle(create: true) + createWritable), so re-dropping a
  // re-exported PNG silently clobbers the previous bytes unless something says so. Not a delete,
  // but still someone's art disappearing with no acknowledgement.
  it('reports a re-imported file as replaced, not just written', async () => {
    const dir = fakeWritableDir()
    const first = await importAssets(dir, [new File([pngBytes(8, 6)], 'good.png')])
    expect(first.written).toEqual(['good.png'])
    expect(first.replaced).toEqual([])

    const second = await importAssets(dir, [new File([pngBytes(8, 6)], 'good.png')])
    expect(second.written).toEqual(['good.png'])
    expect(second.replaced).toEqual(['good.png'])
  })

  it('does not mark a file in the same batch as replaced when it is genuinely new', async () => {
    const dir = fakeWritableDir()
    const result = await importAssets(dir, [
      new File([pngBytes(8, 6)], 'a.png'),
      new File([pngBytes(8, 6)], 'b.png'),
    ])
    expect(result.written.sort()).toEqual(['a.png', 'b.png'])
    expect(result.replaced).toEqual([])
  })
})

// The mod folder is what an author has open, and it is two levels above motions/. Every case
// below was an empty editor with nothing on screen explaining why.
describe('findCharacters', () => {
  const character = { motions: dir({ Idle: dir({ 'idle_1.png': file() }) }) }

  it('descends into the mod folder an author actually picks', async () => {
    const mod = fakeDir('MotionsGuy', {
      custom_limbus_data: dir({ personality: dir({ 'guy.json': file('{}') }) }),
      motion_appearances: dir({ MyGuy: dir(character) }),
    })
    const found = await findCharacters(mod)

    expect(found).toHaveLength(1)
    expect(found[0].path).toBe('motion_appearances/MyGuy')
    // Read off the path, which is the whole point: nobody is asked which kind this is.
    expect(found[0].mode).toBe('appearance')
  })

  // A folder picked on its own has no path to read the kind off. appearance.json settles it;
  // nothing else does, and a null here is what puts the question to the author.
  it('takes a character folder as itself, and only claims a kind it can prove', async () => {
    const bare = await findCharacters(fakeDir('MyGuy', character))
    expect(bare).toEqual([expect.objectContaining({ path: 'MyGuy', mode: null })])

    const withDonor = await findCharacters(
      fakeDir('MyGuy', { ...character, 'appearance.json': file('{"base":"x"}') }),
    )
    expect(withDonor[0].mode).toBe('appearance')
  })

  it('accepts motion_appearances/ itself, the other level people land on', async () => {
    const found = await findCharacters(fakeDir('motion_appearances', { MyGuy: dir(character) }))
    expect(found).toEqual([expect.objectContaining({ path: 'MyGuy', mode: 'appearance' })])
  })

  it('finds both roots and skips the reserved bundle folders by name', async () => {
    const mod = fakeDir('BigMod', {
      motion_appearances: dir({ Zed: dir(character), Ada: dir(character) }),
      custom_motions: dir({
        '10101_YiSang': dir(character),
        DASHBOARD: dir({ 'ui.bundle': file() }),
        CUSTOMSCREEN_2: dir({ 'border.bundle': file() }),
        MOTIONBUFF_Sinking: dir({ 'fx.bundle': file() }),
      }),
    })
    const found = await findCharacters(mod)

    expect(found.map((c) => c.path)).toEqual([
      'custom_motions/10101_YiSang',
      'motion_appearances/Ada',
      'motion_appearances/Zed',
    ])
    expect(found.map((c) => c.mode)).toEqual(['override', 'appearance', 'appearance'])
  })

  // A bundle character has no motions/ at all - the plugin registers it from the same folder
  // (Motions.cs:158) and loads its .bundle. Refusing it was refusing the folder an author would
  // add their first sprite motion to, and the S1.json the editor reads hitCheckers out of.
  it('opens a bundle character, which has no motions/ folder to find', async () => {
    const bundleChar = { 'motion.bundle': file(), 'S1.json': file('{}') }
    const mod = fakeDir('RCorp_Myo', {
      custom_appearance: dir({ 'myocom.bundle': file() }),
      custom_motions: dir({ '!custom_10703_Heathclif_RCorpAppearance': dir(bundleChar) }),
    })

    const fromMod = await findCharacters(mod)
    expect(fromMod.map((c) => c.path)).toEqual(['custom_motions/!custom_10703_Heathclif_RCorpAppearance'])
    // override, so nameRejection does not fire on the "Appearance" in that folder name - the
    // truncation it guards against only applies to motion_appearances/.
    expect(fromMod[0].mode).toBe('override')

    // And picked directly, which is the other way an author reaches it - kind unproven there.
    const direct = await findCharacters(fakeDir('!custom_10703_Heathclif', bundleChar))
    expect(direct).toEqual([expect.objectContaining({ path: '!custom_10703_Heathclif', mode: null })])
  })

  it('finds nothing in a folder that holds no character at all', async () => {
    expect(await findCharacters(fakeDir('Mods', { SomeOtherMod: dir({}) }))).toEqual([])
  })
})

// Both rejections run before a folder exists, because the alternative is deleting a folder that
// was created under a name the game will not match.
describe('folderNameRejection', () => {
  it('accepts the names people actually use', () => {
    expect(folderNameRejection('MyGuy')).toBeNull()
    expect(folderNameRejection('10101_YiSang')).toBeNull()
    expect(folderNameRejection('!custom_10703_Heathclif_RCorp')).toBeNull()
  })

  it('refuses an empty name and one that is only spaces', () => {
    expect(folderNameRejection('')).toMatch(/Needs a name/)
    expect(folderNameRejection('   ')).toMatch(/Needs a name/)
  })

  it('refuses a path separator rather than letting it create a nested folder', () => {
    expect(folderNameRejection('a/b')).toBe('A folder name cannot contain /')
    expect(folderNameRejection('a\\b')).toBe('A folder name cannot contain \\')
    expect(folderNameRejection('a:b')).toBe('A folder name cannot contain :')
  })

  // Windows takes these and then makes the folder awkward to open or delete again, so they are
  // refused here rather than left to getDirectoryHandle, which accepts them.
  it('refuses trailing spaces and dots, which Windows accepts and then regrets', () => {
    expect(folderNameRejection('MyGuy ')).toMatch(/trailing spaces/)
    expect(folderNameRejection('MyGuy.')).toMatch(/end in a dot/)
  })
})

/** A directory fake that can create: records every folder and file made under it, by full path. */
function fakeCreatableDir(name: string, existing: string[] = []) {
  const made: string[] = []
  const files = new Map<string, string>()

  function dirAt(path: string): FileSystemDirectoryHandle {
    return {
      name: path.split('/').pop() ?? path,
      kind: 'directory',
      async getDirectoryHandle(child: string, opts?: { create?: boolean }) {
        const full = path ? `${path}/${child}` : child
        if (!opts?.create && !made.includes(full)) throw new DOMException(full, 'NotFoundError')
        if (!made.includes(full)) made.push(full)
        return dirAt(full)
      },
      async getFileHandle(file: string, opts?: { create?: boolean }) {
        const full = path ? `${path}/${file}` : file
        if (!opts?.create && !existing.includes(full)) throw new DOMException(full, 'NotFoundError')
        return {
          async createWritable() {
            return {
              async write(contents: string) { files.set(full, String(contents)) },
              async close() {},
            }
          },
        }
      },
    } as unknown as FileSystemDirectoryHandle
  }

  return { handle: dirAt(name), made, files }
}

describe('createCharacter', () => {
  it('builds the whole path the plugin looks for, in one go', async () => {
    const mod = fakeCreatableDir('MyMod')
    const made = await createCharacter(mod.handle, 'MyGuy', 'appearance')

    expect(mod.made).toEqual([
      'MyMod/motion_appearances',
      'MyMod/motion_appearances/MyGuy',
      'MyMod/motion_appearances/MyGuy/motions',
    ])
    expect(made.path).toBe('motion_appearances/MyGuy')
    expect(made.mode).toBe('appearance')
  })

  it('puts an override under custom_motions, with no appearance.json', async () => {
    const mod = fakeCreatableDir('MyMod')
    const made = await createCharacter(mod.handle, '10101_YiSang', 'override')

    expect(mod.made[0]).toBe('MyMod/custom_motions')
    expect(made.path).toBe('custom_motions/10101_YiSang')
    expect([...mod.files.keys()]).toEqual([])
  })

  it('writes the donor the plugin would have defaulted to anyway', async () => {
    const mod = fakeCreatableDir('MyMod')
    await createCharacter(mod.handle, 'MyGuy', 'appearance')
    const written = mod.files.get('MyMod/motion_appearances/MyGuy/appearance.json')
    expect(JSON.parse(written!)).toEqual({ base: DEFAULT_BASE })
  })

  // Creating over an existing character is how an author re-opens one they made earlier; the donor
  // they chose is theirs, and re-running this must not put the default back.
  it('leaves an existing appearance.json alone', async () => {
    const mod = fakeCreatableDir('MyMod', ['MyMod/motion_appearances/MyGuy/appearance.json'])
    await createCharacter(mod.handle, 'MyGuy', 'appearance')
    expect(mod.files.size).toBe(0)
  })
})

// mods/ and a mod folder look alike and behave nothing alike. Creating a character in the wrong
// one produces mods/motion_appearances/<Name>/ - which the plugin loads as a mod called
// "motion_appearances", finds nothing in, and reports nothing about.
describe('isModsRoot', () => {
  const character = { motions: dir({ Idle: dir({ 'idle_1.png': file() }) }) }
  const mod = { motion_appearances: dir({ MyGuy: dir(character) }) }

  it('recognises the folder whose children are mods', async () => {
    expect(await isModsRoot(fakeDir('mods', { MotionsGuy: dir(mod) }))).toBe(true)
  })

  // By evidence, not by the name: a mods folder is not always called mods, and a mod folder
  // called "mods" is still one level below.
  it('does not go by the name', async () => {
    expect(await isModsRoot(fakeDir('plugins', { SomeMod: dir(mod) }))).toBe(true)
    expect(await isModsRoot(fakeDir('mods', mod))).toBe(false)
  })

  it('is false for a mod folder, a character folder and an empty one', async () => {
    expect(await isModsRoot(fakeDir('MotionsGuy', mod))).toBe(false)
    expect(await isModsRoot(fakeDir('MyGuy', character))).toBe(false)
    expect(await isModsRoot(fakeDir('New folder', {}))).toBe(false)
  })

  it('sees a mods folder holding an override-only mod too', async () => {
    const overrideMod = { custom_motions: dir({ '10101_YiSang': dir(character) }) }
    expect(await isModsRoot(fakeDir('mods', { OtherMod: dir(overrideMod) }))).toBe(true)
  })
})

describe('modFolderRejection', () => {
  it('refuses the prefixes the plugin skips, which would load nothing and say nothing', () => {
    expect(modFolderRejection('DISABLED_MyMod')).toMatch(/never load/)
    expect(modFolderRejection('FULLDISABLED_MyMod')).toMatch(/never load/)
  })

  it('still applies the plain folder rules', () => {
    expect(modFolderRejection('')).toMatch(/Needs a name/)
    expect(modFolderRejection('MyMod')).toBeNull()
  })
})

// The mods folder must never come back as a character, even when something loose in it makes it
// look like one - opening it there is the exact mistake the refusal exists to prevent.
describe('findCharacters at the mods folder', () => {
  const mod = { motion_appearances: dir({ MyGuy: dir({ motions: dir({}) }) }) }

  it('finds nothing in it, so the refusal is what an author gets', async () => {
    expect(await findCharacters(fakeDir('mods', { MotionsGuy: dir(mod) }))).toEqual([])
  })

  it('still finds nothing when a stray file makes it look like a character folder', async () => {
    const mods = fakeDir('mods', { MotionsGuy: dir(mod), 'manifest.json': file('{}') })
    expect(await findCharacters(mods)).toEqual([])
  })
})

// The plugin reads appearance.json with AllowTrailingCommas and comments skipped
// (AppearanceRegistry.cs:33-38). Parsing it strictly here meant a file that works in game fell
// back to the default donor on screen, and then, because appearance.json was written on every
// save, put that default on disk over the author's real one.
describe('loadCharacter and appearance.json', () => {
  const withAppearance = (content: string) =>
    fakeDir('MyGuy', { motions: dir({}), 'appearance.json': file(content) })

  it('reads a donor out of a file with comments and a trailing comma', async () => {
    const c = await loadCharacter(
      withAppearance('{\n  // my donor\n  "base": "10403_Ishmael_BaseAppearance",\n}'),
      'appearance',
    )
    expect(c.appearanceBase).toBe('10403_Ishmael_BaseAppearance')
    expect(c.appearanceReadable).toBe(true)
  })

  it('marks a genuinely unreadable one, so the donor on screen is never written back', async () => {
    const c = await loadCharacter(withAppearance('{ this is not json at all'), 'appearance')
    expect(c.appearanceBase).toBe(DEFAULT_BASE)
    expect(c.appearanceReadable).toBe(false)
  })

  it('counts a character with no appearance.json as readable, having nothing to lose', async () => {
    const c = await loadCharacter(fakeDir('MyGuy', { motions: dir({}) }), 'appearance')
    expect(c.hadAppearanceJson).toBe(false)
    expect(c.appearanceReadable).toBe(true)
  })
})

describe('checkSkillJson and JSONC', () => {
  it('does not call a file the game reads perfectly well invalid', () => {
    const json = '{\n  // the opener\n  "coins": [{ "hitCheckers": [{ "time": 1.0 }] }],\n}'
    expect(checkSkillJson(json, 'S1.json')).toBeNull()
  })
})

// The plugin walks the MOTION_DETAIL enum and looks for "<name>.json" (Motions.cs:189-195).
// Treating every root .json as a skill file put a valid CharacterVFX.json behind a red
// "could not be read" banner, and gave stray files a tab for something the game never opens.
describe('which JSON files count as skill files', () => {
  it('takes the motion-named ones and leaves everything else alone', async () => {
    const root = fakeDir('MyGuy', {
      motions: dir({}),
      'S1.json': file('{"coins":[]}'),
      'Idle.json': file('{"coins":[]}'),
      'CharacterVFX.json': file('{"anything":1}'),
      'notes.json': file('not even json'),
      'S1_1.json': file('{"coins":[]}'),
      'appearance.json': file('{"base":"x"}'),
    })
    const character = await loadCharacter(root, 'appearance')
    expect(character.skills.map((s) => s.name).sort()).toEqual(['Idle.json', 'S1.json'])
  })
})

describe('reserved folder names', () => {
  const character = { motions: dir({ Idle: dir({}) }) }

  // The plugin only skips these inside custom_motions (Motions.cs:82,97,113). Applying the rule
  // to motion_appearances too made a legitimately named appearance impossible to open.
  it('skips them under custom_motions and not under motion_appearances', async () => {
    const mod = fakeDir('Mod', {
      custom_motions: dir({ DASHBOARD: dir(character), '10101_YiSang': dir(character) }),
      motion_appearances: dir({ MOTIONBUFF_Guy: dir(character) }),
    })
    const found = await findCharacters(mod)
    expect(found.map((c) => c.path).sort()).toEqual([
      'custom_motions/10101_YiSang',
      'motion_appearances/MOTIONBUFF_Guy',
    ])
  })
})
