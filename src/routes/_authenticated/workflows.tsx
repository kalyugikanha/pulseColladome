import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  listWorkflowTemplates, saveWorkflowTemplate, deleteWorkflowTemplate,
  type WorkflowStageInput, type WorkflowRequiredField, type WorkflowBranchOption,
} from "@/lib/workflows.functions";


export const Route = createFileRoute("/_authenticated/workflows")({ component: WorkflowsAdmin });

function WorkflowsAdmin() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const list = useServerFn(listWorkflowTemplates);
  const save = useServerFn(saveWorkflowTemplate);
  const del = useServerFn(deleteWorkflowTemplate);

  const { data: templates } = useQuery({ queryKey: ["workflow-templates"], queryFn: () => list() });
  const [editing, setEditing] = useState<null | { id?: string; name: string; description: string; department: string; is_active: boolean; stages: WorkflowStageInput[] }>(null);

  if (!me?.isAdmin && !me?.isSuperAdmin) return <div className="p-8 text-muted-foreground">Admins only.</div>;

  async function refresh() { await qc.invalidateQueries({ queryKey: ["workflow-templates"] }); }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Workflow templates</h1>
          <p className="text-sm text-muted-foreground">Design chained tasks: an assignee closing one stage auto-creates the next task.</p>
        </div>
        <Button className="gradient-primary" onClick={() => setEditing({
          name: "", description: "", department: "", is_active: true,
          stages: [{ position: 1, name: "Stage 1", requires_review: false, default_assignee_id: null, default_reviewer_id: null, default_due_offset_days: null, required_fields: [], branch_options: [], branch_target_map: {}, next_stage_position: null }],
        })}><Plus className="h-4 w-4 mr-1" /> New template</Button>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {(templates ?? []).map((t) => (
          <Card key={t.id} className="cursor-pointer hover:border-primary/50" onClick={() => setEditing({
            id: t.id, name: t.name, description: t.description ?? "", department: t.department ?? "",
            is_active: t.is_active,
            stages: t.stages.map((s) => ({
              position: s.position, name: s.name, requires_review: s.requires_review,
              default_assignee_id: s.default_assignee_id,
              default_reviewer_id: (s as { default_reviewer_id?: string | null }).default_reviewer_id ?? null,
              default_due_offset_days: s.default_due_offset_days,
              required_fields: s.required_fields as WorkflowRequiredField[],
              branch_options: s.branch_options as WorkflowBranchOption[],
              branch_target_map: s.branch_target_map as Record<string, number>,
              next_stage_position: (s as { next_stage_position?: number | null }).next_stage_position ?? null,
            })),
          })}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {t.department && <Badge variant="outline">{t.department}</Badge>}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Duplicate template"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await save({ data: {
                          name: `Copy of ${t.name}`,
                          description: t.description ?? "",
                          department: t.department ?? "",
                          is_active: true,
                          stages: t.stages.map((s) => ({
                            position: s.position,
                            name: s.name,
                            requires_review: s.requires_review,
                            default_assignee_id: s.default_assignee_id,
                            default_reviewer_id: (s as { default_reviewer_id?: string | null }).default_reviewer_id ?? null,
                            default_due_offset_days: s.default_due_offset_days,
                            required_fields: s.required_fields as WorkflowRequiredField[],
                            branch_options: s.branch_options as WorkflowBranchOption[],
                            branch_target_map: s.branch_target_map as Record<string, number>,
                            next_stage_position: (s as { next_stage_position?: number | null }).next_stage_position ?? null,
                          })),
                        }});
                        toast.success("Template duplicated");
                        await refresh();
                      } catch (err) { toast.error((err as Error).message); }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.description}
              <div className="mt-2 flex flex-wrap gap-1">
                {t.stages.map((s) => <Badge key={s.id} variant="secondary" className="text-[10px]">{s.position}. {s.name}{s.requires_review ? " ✓" : ""}</Badge>)}
              </div>
            </CardContent>
          </Card>
        ))}
        {(templates?.length ?? 0) === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground">No templates yet.</CardContent></Card>}
      </div>

      {editing && (
        <TemplateEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => { try { await save({ data: payload }); toast.success("Saved"); await refresh(); setEditing(null); } catch (e) { toast.error((e as Error).message); } }}
          onDelete={editing.id ? async () => { if (!confirm("Delete template?")) return; try { await del({ data: { id: editing.id! } }); toast.success("Deleted"); await refresh(); setEditing(null); } catch (e) { toast.error((e as Error).message); } } : undefined}
        />
      )}
    </div>
  );
}

function TemplateEditor({ initial, onClose, onSave, onDelete }: {
  initial: { id?: string; name: string; description: string; department: string; is_active: boolean; stages: WorkflowStageInput[] };
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; description: string; department: string; is_active: boolean; stages: WorkflowStageInput[] }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [department, setDepartment] = useState(initial.department);
  const [isActive, setIsActive] = useState(initial.is_active);
  const [stages, setStages] = useState<WorkflowStageInput[]>(initial.stages);
  const [people, setPeople] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  useEffect(() => { setName(initial.name); setStages(initial.stages); }, [initial]);
  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email").order("full_name").then(({ data }) => setPeople((data ?? []) as typeof people));
  }, []);


  function addStage() {
    const pos = stages.length + 1;
    setStages([...stages, { position: pos, name: `Stage ${pos}`, requires_review: false, default_assignee_id: null, default_reviewer_id: null, default_due_offset_days: null, required_fields: [], branch_options: [], branch_target_map: {}, next_stage_position: null }]);
  }
  function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[idx], next[target]] = [next[target], next[idx]];
    setStages(next.map((s, i) => ({ ...s, position: i + 1 })));
  }
  function removeStage(idx: number) {
    setStages(stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 })));
  }
  function updateStage(idx: number, patch: Partial<WorkflowStageInput>) {
    setStages(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{initial.id ? "Edit template" : "New template"}</CardTitle>
        <div className="flex gap-2">
          {onDelete && <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>}
          <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          <Button size="sm" className="gradient-primary" onClick={() => onSave({ id: initial.id, name, description, department, is_active: isActive, stages })}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Department (optional)</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active</label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Stages</Label>
            <Button size="sm" variant="outline" onClick={addStage}><Plus className="h-3 w-3 mr-1" /> Add stage</Button>
          </div>
          {stages.map((s, i) => (
            <StageEditor key={i} stage={s} index={i} totalStages={stages.length} allStages={stages}
              people={people}
              onChange={(patch) => updateStage(i, patch)}
              onMoveUp={() => moveStage(i, -1)} onMoveDown={() => moveStage(i, 1)}
              onRemove={() => removeStage(i)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StageEditor({ stage, index, totalStages, allStages, people, onChange, onMoveUp, onMoveDown, onRemove }: {
  stage: WorkflowStageInput; index: number; totalStages: number; allStages: WorkflowStageInput[];
  people: Array<{ id: string; full_name: string | null; email: string | null }>;
  onChange: (patch: Partial<WorkflowStageInput>) => void;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void;
}) {
  const laterStages = allStages.filter((s) => s.position > stage.position);
  function addBranch() {
    const key = `option_${stage.branch_options.length + 1}`;
    onChange({ branch_options: [...stage.branch_options, { key, label: "New branch" }], branch_target_map: { ...stage.branch_target_map, [key]: laterStages[0]?.position ?? stage.position + 1 } });
  }
  function updateBranch(k: string, patch: Partial<WorkflowBranchOption> & { targetPosition?: number }) {
    let opts = stage.branch_options;
    let map = { ...stage.branch_target_map };
    if (patch.key && patch.key !== k) {
      opts = opts.map((o) => o.key === k ? { ...o, ...patch, key: patch.key! } : o);
      const target = map[k]; delete map[k]; if (target != null) map[patch.key] = target;
    } else {
      opts = opts.map((o) => o.key === k ? { ...o, ...patch } : o);
    }
    if (patch.targetPosition != null) map[patch.key ?? k] = patch.targetPosition;
    onChange({ branch_options: opts, branch_target_map: map });
  }
  function removeBranch(k: string) {
    const opts = stage.branch_options.filter((o) => o.key !== k);
    const map = { ...stage.branch_target_map }; delete map[k];
    onChange({ branch_options: opts, branch_target_map: map });
  }
  function addField() {
    onChange({ required_fields: [...stage.required_fields, { key: `field_${stage.required_fields.length + 1}`, kind: "text", label: "New field", required: true }] });
  }
  function updateField(k: string, patch: Partial<WorkflowRequiredField>) {
    onChange({ required_fields: stage.required_fields.map((f) => f.key === k ? { ...f, ...patch, key: patch.key ?? f.key } : f) });
  }
  function removeField(k: string) {
    onChange({ required_fields: stage.required_fields.filter((f) => f.key !== k) });
  }

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="text-xs font-mono mt-1 text-muted-foreground">#{stage.position}</div>
        <div className="flex-1 space-y-2">
          <Input value={stage.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Stage name" />
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={stage.requires_review} onChange={(e) => onChange({ requires_review: e.target.checked })} /> Requires review before Done</label>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Default assignee (optional)</Label>
              <Select
                value={stage.default_assignee_id ?? "__none__"}
                onValueChange={(v) => onChange({ default_assignee_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default reviewer (optional)</Label>
              <Select
                value={stage.default_reviewer_id ?? "__none__"}
                onValueChange={(v) => onChange({ default_reviewer_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">None</SelectItem>
                  {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Required fields to close</span>
              <button className="text-xs text-primary" onClick={addField}>+ Add field</button>
            </div>
            {stage.required_fields.map((f) => (
              <div key={f.key} className="flex gap-1 items-center">
                <Input className="h-8 flex-1" value={f.label} onChange={(e) => updateField(f.key, { label: e.target.value })} placeholder="Label" />
                <select value={f.kind} onChange={(e) => updateField(f.key, { kind: e.target.value as WorkflowRequiredField["kind"] })} className="h-8 text-sm rounded border border-input px-2">
                  <option value="text">Text</option>
                  <option value="url">URL</option>
                  <option value="attachment">Attachment</option>
                </select>
                <button onClick={() => removeField(f.key)}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Branch options after this stage</span>
              <button className="text-xs text-primary" onClick={addBranch} disabled={laterStages.length === 0}>+ Add branch</button>
            </div>
            {stage.branch_options.map((b) => (
              <div key={b.key} className="flex gap-1 items-center">
                <Input className="h-8 flex-1" value={b.label} onChange={(e) => updateBranch(b.key, { label: e.target.value })} placeholder="Branch label" />
                <select value={String(stage.branch_target_map[b.key] ?? "")} onChange={(e) => updateBranch(b.key, { targetPosition: Number(e.target.value) })} className="h-8 text-sm rounded border border-input px-2">
                  {laterStages.map((s) => <option key={s.position} value={s.position}>→ #{s.position} {s.name}</option>)}
                </select>
                <button onClick={() => removeBranch(b.key)}><Trash2 className="h-3 w-3 text-muted-foreground" /></button>
              </div>
            ))}
            {stage.branch_options.length === 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-[11px] text-muted-foreground shrink-0">Next stage</Label>
                <select
                  className="h-8 text-sm rounded border border-input px-2 flex-1"
                  value={stage.next_stage_position == null ? "__auto__" : String(stage.next_stage_position)}
                  onChange={(e) => onChange({ next_stage_position: e.target.value === "__auto__" ? null : Number(e.target.value) })}
                >
                  <option value="__auto__">Auto (next in order)</option>
                  {allStages.filter((s) => s.position !== stage.position).map((s) => (
                    <option key={s.position} value={s.position}>→ #{s.position} {s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onMoveUp} disabled={index === 0}><ChevronUp className="h-4 w-4" /></button>
          <button onClick={onMoveDown} disabled={index === totalStages - 1}><ChevronDown className="h-4 w-4" /></button>
          <button onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></button>
        </div>
      </div>
    </div>
  );
}
