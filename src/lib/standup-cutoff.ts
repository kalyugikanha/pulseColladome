/** Shared helper: a stand-up flag is "active for today" if it's unresolved
 * and was created between the start of today and today's 11:00 cutoff.
 * Used by both the Dashboard banner and the notifications bell. */
export const STANDUP_MEET_URL = "https://meet.google.com/kea-rfwh-ceo";

export function isBeforeStandupCutoff(createdAt: string): boolean {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(11, 0, 0, 0);
  if (now >= cutoff) return false;
  const created = new Date(createdAt);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return created >= startOfDay && created < cutoff;
}
