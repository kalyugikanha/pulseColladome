import { useMemo } from "react";
import { useTaxonomy } from "@/components/taxonomy-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CLEAR_VALUE = "__clear__";

export function DepartmentSelect({
  value,
  onChange,
  placeholder = "Select department",
  allowClear = true,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const { data: tax } = useTaxonomy();

  const options = useMemo(() => {
    const domains = tax?.domains ?? [];
    const domainName = new Map(domains.map((d) => [d.id, d.name] as const));
    const rows = (tax?.departments ?? []).map((d) => ({
      name: d.name,
      label: d.domain_id ? `${domainName.get(d.domain_id) ?? "—"} — ${d.name}` : d.name,
    }));
    // Dedupe by name (column stores name string)
    const seen = new Set<string>();
    const unique: { name: string; label: string }[] = [];
    for (const r of rows) {
      if (seen.has(r.name)) continue;
      seen.add(r.name);
      unique.push(r);
    }
    unique.sort((a, b) => a.label.localeCompare(b.label));
    return unique;
  }, [tax]);

  const hasCurrent = !!value && options.some((o) => o.name === value);

  return (
    <Select
      value={value || undefined}
      disabled={disabled}
      onValueChange={(v) => onChange(v === CLEAR_VALUE ? "" : v)}
    >
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={CLEAR_VALUE}>— None —</SelectItem>}
        {!hasCurrent && value && (
          <SelectItem value={value} disabled>{value} (legacy)</SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.name} value={o.name}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
