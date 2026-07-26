/** Whole months elapsed from `from` to `to` (e.g. Jan 15 -> Mar 10 is 1
 * month, not 2, since the day-of-month hasn't been reached yet). */
export function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}
