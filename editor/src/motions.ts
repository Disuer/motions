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

export interface MotionVariant {
  folder: string
  /** Index into the array that was passed in, which is what specs and dirty are keyed by. */
  index: number
  /** 0 for the motion's own folder, 1+ for a coin. */
  coin: number
}

export interface MotionGroup {
  base: string
  /** Only a skill takes coins; the loader refuses _N on anything else (SpriteMotionLoader.cs:34). */
  takesCoins: boolean
  variants: MotionVariant[]
}

/**
 * Folders grouped into one entry per motion, with its coins under it. A flat tab strip put S1,
 * S1_1 and S1_2 side by side as if they were unrelated motions, when they are one skill and its
 * per-coin animations.
 *
 * Groups keep the order the folders arrived in, which is already natural-sorted, so S2 follows S1
 * and S10 follows S9. Coins are sorted by number within a group.
 */
export function groupMotions(folders: string[]): MotionGroup[] {
  const groups = new Map<string, MotionGroup>()

  folders.forEach((folder, index) => {
    const { base, coin } = parseMotionFolder(folder)
    const group = groups.get(base) ?? { base, takesCoins: isSkill(base), variants: [] }
    group.variants.push({ folder, index, coin })
    groups.set(base, group)
  })

  for (const group of groups.values()) group.variants.sort((a, b) => a.coin - b.coin)
  return [...groups.values()]
}

/** The coin number a "+ coin" button should create next: one past the highest already there. */
export function nextCoin(group: MotionGroup): number {
  return group.variants.reduce((max, v) => Math.max(max, v.coin), 0) + 1
}
