/** Shared, bounded SVG geometry only. No award evaluation, resources or I/O. */
export type AchievementRank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary' | 'milestone';
export type AchievementEmblemState = 'earned' | 'target' | 'locked';

export const ACHIEVEMENT_EXPORT_RANK_COLORS: Readonly<Record<AchievementRank | 'locked', string>> = {
  bronze: '#e7b899', silver: '#e1e7ef', gold: '#efce76', platinum: '#8dcaf0',
  legendary: '#cfadff', milestone: '#d6dce5', locked: '#929ba8',
};

/** All marks stay within the same 64-unit square, including the legendary apex.
 * The same fragment is used over webview PNGs and inside standalone SVG exports.
 * Keep geometry free of nested groups so share cells retain their simple structure. */
export function renderAchievementAdornment(rank: AchievementRank, state: AchievementEmblemState = 'earned', compact = false): string {
  const frame = state === 'locked' ? 'locked' : rank;
  const advanced = ['gold', 'platinum', 'legendary'].includes(frame);
  let marks = '<rect data-frame-part="square" x="1.5" y="1.5" width="61" height="61" rx="5" fill="none" stroke="currentColor" stroke-width="' +
    (frame === 'bronze' || frame === 'locked' ? '1.5' : '2') + '"' + (state === 'target' ? ' stroke-dasharray="3 2"' : '') + '/>';
  if (frame === 'silver' && !compact) marks += '<rect data-frame-part="inner-square" x="3.5" y="3.5" width="57" height="57" rx="4" fill="none" stroke="currentColor" stroke-width=".8"/>';
  if (advanced && !compact) {
    // Keep leaves on the outer artwork border; never reserve space by shrinking the PNG.
    for (const x of [4, 60]) for (let i = 0; i < 4; i++) {
      const side = x < 32 ? -1 : 1;
      marks += '<path data-frame-part="laurel" d="M' + x + ' ' + (59 - i * 6) +
        'q' + side * 4 + ' -4 ' + side * 1.5 + ' -9q' + -side * 4 + ' 3 ' + -side * 1.5 + ' 9" fill="currentColor"/>';
    }
    marks += '<path data-frame-part="stem" d="M4 58Q32 66 60 58" fill="none" stroke="currentColor" stroke-width="1.2"/>';
  }
  if (!compact && (frame === 'platinum' || frame === 'legendary')) marks += '<path data-frame-part="corners" d="M3 11l8-8M53 3l8 8M3 53l8 8M53 61l8-8" fill="none" stroke="currentColor" stroke-width="1.2"/>';
  if (frame === 'legendary') marks += '<path data-frame-part="apex" d="m32 0 4 4-4 4-4-4Z" fill="currentColor"/>';
  if (frame === 'milestone' && state === 'earned') marks += '<path data-frame-part="complete" d="m49 59 4 3 8-10" fill="none" stroke="currentColor" stroke-width="2.5"/>';
  if (frame === 'locked') marks += '<path data-frame-part="lock" d="M51 54v-3a3 3 0 0 1 6 0v3m-7 0h8v8h-8Z" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  return marks;
}
