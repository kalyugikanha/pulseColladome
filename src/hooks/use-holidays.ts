import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Holiday = { id: string; holiday_date: string; name: string };

export function useHolidays() {
  return useQuery<Holiday[]>({
    queryKey: ["holidays"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("holidays").select("id, holiday_date, name").order("holiday_date");
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });
}

// Which occurrence of this weekday within its month (1..5)
function weekdayOccurrence(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

/** Sundays are always off. */
export function isSundayOff(date: Date): boolean {
  return date.getDay() === 0;
}

/** 2nd and 4th Saturdays of the month are off; 1st/3rd/5th are working. */
export function isSaturdayOff(date: Date): boolean {
  if (date.getDay() !== 6) return false;
  const n = weekdayOccurrence(date);
  return n === 2 || n === 4;
}

export function isWeeklyOff(date: Date): boolean {
  return isSundayOff(date) || isSaturdayOff(date);
}

export function weeklyOffLabel(date: Date): string | null {
  if (isSundayOff(date)) return "Sunday";
  if (isSaturdayOff(date)) {
    const n = weekdayOccurrence(date);
    return n === 2 ? "2nd Saturday" : "4th Saturday";
  }
  return null;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return the nearest upcoming day off — seeded public holiday, Sunday, or off-Saturday —
 * whichever comes first from today.
 */
export function nextHoliday(list: Holiday[] | undefined): Holiday | null {
  const todayISO = new Date().toISOString().slice(0, 10);
  const nextSeeded = (list ?? []).find((h) => h.holiday_date >= todayISO) ?? null;

  // Scan up to 60 days ahead for the next weekly off (starting today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let nextWeekly: Holiday | null = null;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = weeklyOffLabel(d);
    if (label) {
      nextWeekly = { id: `weekly-${toISO(d)}`, holiday_date: toISO(d), name: label };
      break;
    }
  }

  if (nextSeeded && nextWeekly) {
    return nextSeeded.holiday_date <= nextWeekly.holiday_date ? nextSeeded : nextWeekly;
  }
  return nextSeeded ?? nextWeekly;
}
