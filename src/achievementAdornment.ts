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
export function renderAchievementAdornment(rank: AchievementRank, state: AchievementEmblemState = 'earned'): string {
  const frame = state === 'locked' ? 'locked' : rank;
  const advanced = ['gold', 'platinum', 'legendary'].includes(frame);
  let marks = '<rect data-frame-part="square" x="9" y="6" width="46" height="47" rx="2" fill="none" stroke="currentColor" stroke-width="' +
    (frame === 'bronze' || frame === 'locked' ? '1.5' : '2') + '"' + (state === 'target' ? ' stroke-dasharray="3 2"' : '') + '/>';
  if (frame === 'silver') marks += '<rect data-frame-part="inner-square" x="11.5" y="8.5" width="41" height="42" rx="1" fill="none" stroke="currentColor" stroke-width=".8"/>';
  if (advanced) {
    // Leaves grow up both sides of the square; no circular medal or filled base.
    for (const x of [8, 56]) for (let i = 0; i < 4; i++) {
      const side = x < 32 ? -1 : 1;
      marks += '<path data-frame-part="laurel" d="M' + x + ' ' + (55 - i * 6) +
        'q' + side * 7 + ' -4 ' + side * 3 + ' -9q' + -side * 6 + ' 3 ' + -side * 3 + ' 9" fill="currentColor"/>';
    }
    marks += '<path data-frame-part="stem" d="M8 52Q32 65 56 52" fill="none" stroke="currentColor" stroke-width="1.2"/>';
  }
  if (frame === 'platinum' || frame === 'legendary') marks += '<path data-frame-part="corners" d="M10 15l8-8M46 7l8 8M10 44l8 8M46 52l8-8" fill="none" stroke="currentColor" stroke-width="1.2"/>';
  if (frame === 'legendary') marks += '<path data-frame-part="apex" d="m32 1 5 5-5 5-5-5Z" fill="currentColor"/>';
  if (frame === 'milestone' && state === 'earned') marks += '<path data-frame-part="complete" d="m44 54 4 4 10-12" fill="none" stroke="currentColor" stroke-width="2.5"/>';
  if (frame === 'locked') marks += '<path data-frame-part="lock" d="M28 53v-3a4 4 0 0 1 8 0v3m-9 0h10v8H27Z" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  return marks;
}
