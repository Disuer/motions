import { describe, expect, it } from 'vitest'
import { checkSkillJson, nameRejection } from './fs'

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
