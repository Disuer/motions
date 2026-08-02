import { compareNatural } from './spec'

/**
 * The real MOTION_DETAIL enum, in declaration order. A snapshot of a game enum, so free text is
 * accepted too - the plugin logs an unknown name rather than crashing.
 */
export const MOTION_NAMES = [
  'Idle', 'Default', 'Move', 'Attack', 'Damaged', 'Damaged_2', 'Damaged_3',
  'Guard', 'Evade', 'Dead', 'Break', 'Reload', 'Retire', 'Retreat', 'UnRetreat',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12',
  'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21',
  'Special1', 'Special2', 'Special3',
  'Parrying', 'Parrying_Range', 'Parrying_Lose',
  'Duel_Ready', 'Duel_Win', 'Duel_Lose', 'Duel_Ready_Actor', 'Duel_Ready_Target',
  'Duel_Compation',
  'Empty',
]

/**
 * Only skills take a _N coin suffix. The plugin ignores Idle_1 (SpriteMotionLoader.cs:34), so
 * the editor does not offer it. Special1..3 start with S but are not coin skills.
 */
export function isSkill(name: string): boolean {
  return /^S\d+$/.test(name)
}

/**
 * Splits a motion folder name into the motion and its coin number, the same way the plugin does
 * (SpriteMotionSpec.ParseFolderName). Coin 0 means the folder is the motion itself.
 *
 * The check against the enum comes FIRST, and that ordering is the whole subtlety: "Damaged_2" is
 * a motion in its own right, not coin 2 of "Damaged". Splitting on the underscore before looking
 * the name up would file it under a motion that does not exist.
 */
export function parseMotionFolder(folder: string): { base: string; coin: number } {
  if (MOTION_NAMES.includes(folder)) return { base: folder, coin: 0 }

  const cut = folder.lastIndexOf('_')
  if (cut <= 0 || cut === folder.length - 1) return { base: folder, coin: 0 }

  const suffix = folder.slice(cut + 1)
  // Digits only, no sign: the plugin parses with NumberStyles.None, so "S1_-2" is a motion called
  // "S1_-2" rather than a negative coin.
  if (!/^\d+$/.test(suffix)) return { base: folder, coin: 0 }

  return { base: folder.slice(0, cut), coin: Number(suffix) }
}

/** One coin of a motion, and which of its two halves are actually there. */
export interface CoinSlot {
  /** 0-based, the index the game asks for. Shown as `coin ${coin + 1}`. */
  coin: number
  /** Where the art lives, or would: `${base}` for coin 0, `${base}_${coin}` after. */
  folder: string
  /** Index into the motions array that was passed in, or null when that folder is not on disk. */
  motion: number | null
  /** Whether the skill file has a coins[coin]. False when there is no skill file at all. */
  json: boolean
}

export interface MotionEntry {
  base: string
  /** Only a skill takes coins; the loader refuses _N on anything else (SpriteMotionLoader.cs:34). */
  takesCoins: boolean
  /** Index into the skills array that was passed in, or null when there is no `${base}.json`. */
  skill: number | null
  /** One per coin either side knows about. Never empty. */
  coins: CoinSlot[]
}

/**
 * One entry per motion, over the UNION of the motion folders and the skill files. The two halves
 * of a coin are two files in two places - motions/S1_1/animation.json and S1.json's coins[1] - and
 * listing only the folders (or only the file's coins) is what made a coin missing on one side
 * unreachable from the other.
 *
 * The pairing is the plugin's: MotionInjector.cs:46-58 fills coinDurations[i] from folder
 * <Motion>_i, with i = 0 being the bare <Motion> folder, and TimelineBuilder.cs:385 indexes that
 * array by the JSON coins[] index. So coins[0] is motions/S1/ and coins[1] is motions/S1_1/.
 *
 * `skills` is passed as name-and-count rather than the loaded documents so this file stays free of
 * fs.ts - the same reason SpriteMotionSpec.cs takes an isKnownName predicate instead of importing
 * MOTION_DETAIL.
 */
export function mergeMotions(
  folders: string[],
  skills: { name: string; coins: number }[],
): MotionEntry[] {
  /** base -> coin -> index into `folders`. */
  const owned = new Map<string, Map<number, number>>()
  /** base -> index into `skills`. */
  const files = new Map<string, number>()

  folders.forEach((folder, index) => {
    const { base, coin } = parseMotionFolder(folder)
    const mine = owned.get(base) ?? new Map<number, number>()
    mine.set(coin, index)
    owned.set(base, mine)
  })
  skills.forEach((sk, index) => files.set(sk.name.replace(/\.json$/i, ''), index))

  const bases = [...new Set([...owned.keys(), ...files.keys()])]
  // Sorted rather than left in arrival order: the folders and the skill files are each already
  // natural-sorted, but interleaving them is not, and a JSON-only S2 belongs between S1 and S10.
  bases.sort(compareNatural)

  return bases.map((base) => {
    const mine = owned.get(base) ?? new Map<number, number>()
    const skill = files.get(base) ?? null
    const jsonCoins = skill === null ? 0 : skills[skill].coins
    const highest = mine.size > 0 ? Math.max(...mine.keys()) : -1
    // At least one, so every motion has a coin to show even when neither side has anything to say.
    const count = Math.max(highest + 1, jsonCoins, 1)

    return {
      base,
      takesCoins: isSkill(base),
      skill,
      coins: Array.from({ length: count }, (_, coin) => ({
        coin,
        folder: coin === 0 ? base : `${base}_${coin}`,
        motion: mine.get(coin) ?? null,
        json: coin < jsonCoins,
      })),
    }
  })
}

/**
 * The slot for a coin, whether or not it exists yet. Selecting one past the end is how a coin is
 * added: the panel for an empty slot is what offers to create each half.
 */
export function slotFor(entry: MotionEntry, coin: number): CoinSlot {
  return entry.coins[coin] ?? {
    coin,
    folder: coin === 0 ? entry.base : `${entry.base}_${coin}`,
    motion: null,
    json: false,
  }
}

/**
 * The motion whose duration the game will use for this coin, or null when none does - in which
 * case the file's own totalDuration is what runs. Follows MotionData.TryGetSpriteMotion: the
 * coin's own folder, else the bare folder for any coin above 0.
 */
export function spriteFor(entry: MotionEntry, coin: number): number | null {
  const own = entry.coins[coin]?.motion
  if (own !== null && own !== undefined) return own
  if (coin > 0) return entry.coins[0]?.motion ?? null
  return null
}
