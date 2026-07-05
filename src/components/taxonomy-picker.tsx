import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTaxonomy, createCustomTaskType } from "@/lib/tasks-plus.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { toast } from "sonner";

export type TaxonomyValue = {
  domainId: string | null;
  departmentId: string | null;
  taskTypeIds: string[];
};

export function useTaxonomy() {
  const listFn = useServerFn(listTaxonomy);
  return useQuery({ queryKey: ["taxonomy"], queryFn: () => listFn(), staleTime: 60_000 });
}

export function TaxonomyPicker({ value, onChange }: { value: TaxonomyValue; onChange: (v: TaxonomyValue) => void }) {
  const qc = useQueryClient();
  const { data: tax } = useTaxonomy();
  const addCustom = useServerFn(createCustomTaskType);
  const [openTypes, setOpenTypes] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");

  const departments = useMemo(
    () => (tax?.departments ?? []).filter((d) => !value.domainId || d.domain_id === value.domainId),
    [tax, value.domainId]
  );
  const availableTypes = useMemo(() => {
    const all = tax?.taskTypes ?? [];
    if (!value.departmentId) return all.filter((t) => !t.department_id);
    return all.filter((t) => t.department_id === value.departmentId || !t.department_id);
  }, [tax, value.departmentId]);

  const selectedTypes = (tax?.taskTypes ?? []).filter((t) => value.taskTypeIds.includes(t.id));

  async function handleAddCustom() {
    const name = newTypeName.trim();
    if (!name) return;
    try {
      const row = await addCustom({ data: { name, departmentId: value.departmentId } });
      toast.success("Task type added");
      setNewTypeName("");
      await qc.invalidateQueries({ queryKey: ["taxonomy"] });
      onChange({ ...value, taskTypeIds: [...value.taskTypeIds, row.id] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggleType(id: string) {
    const has = value.taskTypeIds.includes(id);
    onChange({
      ...value,
      taskTypeIds: has ? value.taskTypeIds.filter((x) => x !== id) : [...value.taskTypeIds, id],
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Domain</Label>
          <Select
            value={value.domainId ?? ""}
            onValueChange={(v) => onChange({ domainId: v || null, departmentId: null, taskTypeIds: [] })}
          >
            <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
            <SelectContent>
              {tax?.domains.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Department</Label>
          <Select
            value={value.departmentId ?? ""}
            disabled={!value.domainId}
            onValueChange={(v) => onChange({ ...value, departmentId: v || null, taskTypeIds: [] })}
          >
            <SelectTrigger><SelectValue placeholder={value.domainId ? "Select department" : "Pick a domain first"} /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Task types <span className="text-xs text-muted-foreground">(multi-select)</span></Label>
        <Popover open={openTypes} onOpenChange={setOpenTypes}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between">
              <span className="truncate">
                {selectedTypes.length === 0 ? "Choose task types" : `${selectedTypes.length} selected`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-2 max-h-72 overflow-auto">
            <div className="space-y-1">
              {availableTypes.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">No preset types. Add one below.</p>
              )}
              {availableTypes.map((t) => {
                const active = value.taskTypeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    className="w-full flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      {t.name}
                      {t.is_custom && <Badge variant="outline" className="text-[10px]">custom</Badge>}
                    </span>
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1 border-t pt-2">
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Add custom type…"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustom())}
              />
              <Button type="button" size="sm" onClick={handleAddCustom}><Plus className="h-3 w-3" /></Button>
            </div>
          </PopoverContent>
        </Popover>
        {selectedTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {selectedTypes.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1">
                {t.name}
                <button type="button" onClick={() => toggleType(t.id)}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AssetLinksEditor({ value, onChange }: { value: { label: string; url: string }[]; onChange: (v: { label: string; url: string }[]) => void }) {
  function update(i: number, patch: Partial<{ label: string; url: string }>) {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Asset links <span className="text-xs text-muted-foreground">Drive / Canva / Figma</span></Label>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...value, { label: "", url: "" }])}>
          <Plus className="h-3 w-3 mr-1" /> Add link
        </Button>
      </div>
      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <Input placeholder="Label" value={row.label} onChange={(e) => update(i, { label: e.target.value })} className="h-8 text-sm" />
          <Input placeholder="https://…" value={row.url} onChange={(e) => update(i, { url: e.target.value })} className="h-8 text-sm" />
          <Button type="button" size="icon" variant="ghost" onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
