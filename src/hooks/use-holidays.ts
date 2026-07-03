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

export function nextHoliday(list: Holiday[] | undefined): Holiday | null {
  if (!list) return null;
  const today = new Date().toISOString().slice(0, 10);
  return list.find((h) => h.holiday_date >= today) ?? null;
}
