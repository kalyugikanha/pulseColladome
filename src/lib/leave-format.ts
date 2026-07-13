export function formatLeaveDays(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0d";
  // Show one decimal only when non-integer (e.g. 0.5), otherwise integer.
  return v % 1 === 0 ? `${v.toFixed(0)}d` : `${v.toFixed(1)}d`;
}

export function isHalfDay(days: number | string | null | undefined): boolean {
  return Number(days ?? 0) === 0.5;
}
