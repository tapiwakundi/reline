/** Inclusive calendar-day math for cycle windows. */

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const next = startOfDay(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Day span between start and end (matches create form: start + N days). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000
  );
}

/**
 * Snap a cycle's length to 1 or 2 weeks. Anything about 10 days or under
 * becomes a 1-week cadence; longer becomes 2 weeks.
 */
export function snapCycleDurationDays(start: Date, end: Date): number {
  const days = Math.max(1, daysBetween(start, end));
  return days <= 10 ? 7 : 14;
}

export type CycleWindow = { startDate: Date; endDate: Date };

/**
 * Build the next `count` planned cycle windows after `anchorEnd`, continuing
 * from any existing upcoming cycles' last end date.
 */
export function upcomingCycleWindows(opts: {
  durationDays: number;
  /** End of the cycle being closed (or latest known cycle). */
  anchorEnd: Date;
  /** Existing planned cycles (soonest first). */
  planned: { startDate: Date; endDate: Date }[];
  count: number;
}): CycleWindow[] {
  if (opts.count <= 0) return [];

  let cursor = startOfDay(opts.anchorEnd);
  for (const c of opts.planned) {
    const end = startOfDay(c.endDate);
    if (end.getTime() > cursor.getTime()) cursor = end;
  }

  const windows: CycleWindow[] = [];
  for (let i = 0; i < opts.count; i++) {
    const startDate = addDays(cursor, 1);
    const endDate = addDays(startDate, opts.durationDays);
    windows.push({ startDate, endDate });
    cursor = endDate;
  }
  return windows;
}
