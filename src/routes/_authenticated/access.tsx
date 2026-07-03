import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/access")({
  component: AccessPage,
});

function AccessPage() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("admin");
  const [isSuper, setIsSuper] = useState(false);

  if (me && !me.isSuperAdmin) throw redirect({ to: "/dashboard" });

  const { data: grants } = useQuery({
    queryKey: ["role-grants"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => (await supabase.from("role_grants").select("*").order("email")).data ?? [],
  });

  async function addGrant() {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes("@")) return toast.error("Valid email required");
    const { error } = await supabase.from("role_grants").upsert({ email: em, role, is_super_admin: isSuper });
    if (error) return toast.error(error.message);
    toast.success(`${em} will become ${isSuper ? "super admin" : role} on sign-in`);
    setEmail(""); setIsSuper(false); setRole("admin");
    qc.invalidateQueries({ queryKey: ["role-grants"] });
  }

  async function removeGrant(em: string) {
    const { error } = await supabase.from("role_grants").delete().eq("email", em);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["role-grants"] });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Access & Roles</h1>
        <p className="text-muted-foreground text-sm mt-1">Super admin only — pre-assign roles by email. Applied automatically the first time that email signs in.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="font-display">Grant a role</CardTitle><CardDescription>The person must sign up with this exact email address.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 space-y-1"><Label>Email</Label><Input placeholder="name@colladome.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Super admin</Label>
              <Select value={isSuper ? "yes" : "no"} onValueChange={(v) => setIsSuper(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4"><Button className="gradient-primary" onClick={addGrant}>Save grant</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">Current grants</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(grants?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No grants yet.</p>}
          {grants?.map((g: any) => (
            <div key={g.email} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <div className="text-sm font-medium">{g.email}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize">{g.role}</Badge>
                  {g.is_super_admin && <Badge className="gradient-primary"><Shield className="h-3 w-3 mr-1" /> Super admin</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeGrant(g.email)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
