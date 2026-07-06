import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Plus, Trash2, Sparkles } from "lucide-react";
import type { StageInput, StageKind } from "@/lib/tasks-stages.functions";
import { STAGE_TEMPLATES } from "@/lib/task-stage-templates";

type Person = { id: string; full_name: string | null; email?: string | null };

type Props = {
  people: Person[];
  value: StageInput[];
  onChange: (rows: StageInput[]) => void;
};

const KIND_LABEL: Record<StageKind, string> = {
  work: "Work",
  internal_review: "Internal review",
  client_review: "Client review",
};

export function StageEditor({ people, value, onChange }: Props) {
  const [showTemplates, setShowTemplates] = useState(false);

  function update(i: number, patch: Partial<StageInput>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function add() {
    onChange([...value, { name: "", kind: "work", owner_id: people[0]?.id ?? "" }]);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function loadTemplate(key: string) {
    const tpl = STAGE_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    onChange(tpl.stages.map((s) => ({
      name: s.name,
      kind: s.kind,
      owner_id: people[0]?.id ?? "",
    })));
    setShowTemplates(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Workflow stages</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowTemplates((v) => !v)}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Templates
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add stage
          </Button>
        </div>
      </div>

      {showTemplates && (
        <div className="rounded-md border border-border/60 p-2 space-y-1 bg-muted/30">
          {STAGE_TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => loadTemplate(t.key)}
              className="block w-full text-left p-2 rounded hover:bg-accent">
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
            </button>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No stages yet — add one or load a template.</p>
      )}

      <div className="space-y-2">
        {value.map((s, i) => (
          <div key={i} className="rounded-md border border-border/60 p-2 space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
              <Input
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Stage name"
                className="flex-1 h-8"
              />
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Kind</Label>
                <Select value={s.kind} onValueChange={(v) => update(i, { kind: v as StageKind })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABEL).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{s.kind === "work" ? "Owner" : "Reviewer"}</Label>
                <Select value={s.owner_id} onValueChange={(v) => update(i, { owner_id: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Pick person" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? "Unnamed"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
