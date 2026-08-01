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
