import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown, Filter } from "lucide-react";

export const UNASSIGNED = "__unassigned__";

export type MultiOption = { value: string; label: string; sub?: string };

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  includeUnassigned = false,
  unassignedLabel = "Unassigned",
  className,
  buttonClassName,
  align = "end",
}: {
  label: string;
  options: MultiOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  includeUnassigned?: boolean;
  unassignedLabel?: string;
  className?: string;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
}) {
  const [q, setQ] = useState("");
  const all = useMemo<MultiOption[]>(() => {
    const base = includeUnassigned ? [{ value: UNASSIGNED, label: unassignedLabel }, ...options] : options;
    if (!q.trim()) return base;
    const needle = q.toLowerCase();
    return base.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
  }, [options, includeUnassigned, unassignedLabel, q]);

  const summary = selected.size === 0
    ? `All ${label.toLowerCase()}`
    : selected.size === 1
      ? (() => {
          const v = Array.from(selected)[0];
          const opt = [...options, { value: UNASSIGNED, label: unassignedLabel }].find((o) => o.value === v);
          return opt?.label ?? v;
        })()
      : `${selected.size} selected`;

  function toggle(v: string) {
    const n = new Set(selected);
    if (n.has(v)) n.delete(v); else n.add(v);
    onChange(n);
  }
  function selectAll() { onChange(new Set(all.map((o) => o.value))); }
  function clear() { onChange(new Set()); }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={buttonClassName ?? "h-9"}>
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          <span className="truncate max-w-[180px]">{label}: {summary}</span>
          <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={className ?? "w-64 p-2"} align={align}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="h-8 mb-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
          <button type="button" className="hover:underline" onClick={selectAll}>Select all</button>
          <button type="button" className="hover:underline" onClick={clear}>Clear</button>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {all.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3">No matches.</div>}
          {all.map((o) => {
            const id = `msf-${label}-${o.value}`;
            return (
              <label key={o.value} htmlFor={id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                <Checkbox id={id} checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{o.label}</div>
                  {o.sub && <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>}
                </div>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
