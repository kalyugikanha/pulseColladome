import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function monthRange(month: string) {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Count completed tasks per (assignee, task_type) in a given month. */
export const outputByEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { month: string }) => d)
  .handler(async ({ data, context }) => {
    const { start, end } = monthRange(data.month);
    const { data: rows, error } = await context.supabase
      .from("tasks")
      .select(`
        id, updated_at, status, review_state,
        assignee:profiles!tasks_assignee_profile_fkey(id, full_name, department),
        task_types:task_task_types(task_type:taxonomy_task_types(id, name))
      `)
      .eq("status", "done")
      .gte("updated_at", start)
      .lt("updated_at", end);
    if (error) throw error;

    type Row = {
      employeeId: string;
      employeeName: string;
      department: string | null;
      counts: Record<string, number>;
      total: number;
    };
    const byEmp = new Map<string, Row>();
    const typeSet = new Set<string>();
    for (const t of rows ?? []) {
      const a = (t.assignee as { id?: string; full_name?: string | null; department?: string | null } | null);
      if (!a?.id) continue;
      if (t.review_state && !["none", "approved"].includes(t.review_state as string)) continue;
      const types = ((t.task_types as { task_type: { id: string; name: string } | null }[] | null) ?? [])
        .map((x) => x.task_type).filter((x): x is { id: string; name: string } => !!x);
      const emp = byEmp.get(a.id) ?? {
        employeeId: a.id, employeeName: a.full_name ?? "—", department: a.department ?? null,
        counts: {}, total: 0,
      };
      if (types.length === 0) {
        emp.counts["Uncategorized"] = (emp.counts["Uncategorized"] ?? 0) + 1;
        typeSet.add("Uncategorized");
      } else {
        for (const tt of types) {
          emp.counts[tt.name] = (emp.counts[tt.name] ?? 0) + 1;
          typeSet.add(tt.name);
        }
      }
      emp.total += 1;
      byEmp.set(a.id, emp);
    }
    return { rows: [...byEmp.values()].sort((a, b) => b.total - a.total), types: [...typeSet].sort() };
  });

/** Monthly totals per employee for the past N months. */
export const outputTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { months: number; employeeIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const months = Math.min(24, Math.max(1, data.months));
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    let q = context.supabase
      .from("tasks")
      .select("id, updated_at, status, review_state, assignee:profiles!tasks_assignee_profile_fkey(id, full_name)")
      .eq("status", "done")
      .gte("updated_at", start.toISOString());
    if (data.employeeIds?.length) q = q.in("assignee_id", data.employeeIds);
    const { data: rows } = await q;

    type Point = { month: string; employeeId: string; employeeName: string; count: number };
    const map = new Map<string, Point>();
    for (const t of rows ?? []) {
      const a = (t.assignee as { id?: string; full_name?: string | null } | null);
      if (!a?.id) continue;
      if (t.review_state && !["none", "approved"].includes(t.review_state as string)) continue;
      const d = new Date(t.updated_at as string);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const k = `${key}:${a.id}`;
      const p = map.get(k) ?? { month: key, employeeId: a.id, employeeName: a.full_name ?? "—", count: 0 };
      p.count += 1;
      map.set(k, p);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  });
