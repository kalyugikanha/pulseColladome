import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown, X } from "lucide-react";

export type AssigneeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
};

export function AssigneeMultiSelect({
  people, value, onChange, placeholder = "Pick teammates", excludeIds = [],
}: {
  people: AssigneeOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const available = useMemo(() => people.filter((p) => !excludeIds.includes(p.id)), [people, excludeIds]);
  const filtered = useMemo(() => {
    if (!q.trim()) return available;
    const s = q.toLowerCase();
    return available.filter((p) =>
      (p.full_name ?? "").toLowerCase().includes(s) ||
      (p.email ?? "").toLowerCase().includes(s) ||
      (p.department ?? "").toLowerCase().includes(s)
    );
  }, [available, q]);

  const selectedSet = new Set(value);
  const allSelected = available.length > 0 && available.every((p) => selectedSet.has(p.id));

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }
  function toggleAll() {
    if (allSelected) onChange(value.filter((v) => !available.some((p) => p.id === v)));
    else {
      const merged = new Set(value);
      for (const p of available) merged.add(p.id);
      onChange(Array.from(merged));
    }
  }

  const chips = value
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is AssigneeOption => !!p);

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9">
            <span className="truncate text-left">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                <span>{value.length} selected</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b space-y-2">
            <Input
              placeholder="Search name, email, department…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8"
            />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Select all ({available.length})
            </label>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 cursor-pointer"
              >
                <Checkbox
                  checked={selectedSet.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                />
                <span className="flex-1 truncate">
                  {p.full_name ?? p.email}
                  {p.department ? <span className="text-muted-foreground"> · {p.department}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-1">
              {p.full_name ?? p.email}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== p.id))}
                className="hover:text-destructive"
                aria-label={`Remove ${p.full_name ?? p.email}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
