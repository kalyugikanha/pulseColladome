import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type AuthDetails = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string; client_uri?: string } | null;
  scope?: string;
  scopes?: string[];
};

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + (location.searchStr ?? "");
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization error</CardTitle>
          <CardDescription>{String((error as Error)?.message ?? error)}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  ),
});

function ConsentPage() {
  const { authorization_id } = Route.useSearch();
  const router = useRouter();
  const [details, setDetails] = useState<AuthDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await oauthApi().getAuthorizationDetails(authorization_id);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect URL returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const clientName = details?.client?.name ?? "an external app";
  const scopeList = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader>
          <CardTitle>Connect {clientName} to Colladome Pulse</CardTitle>
          <CardDescription>
            {clientName} will be able to call Pulse's enabled tools while you are signed in. This does not bypass Pulse's permissions or backend policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {details?.client?.client_uri && (
            <div className="text-xs text-muted-foreground break-all">
              Client: {details.client.client_uri}
            </div>
          )}
          {scopeList.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="font-medium mb-1">Requested permissions</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {scopeList.map((s) => (
                  <li key={s}>{scopeLabel(s)}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => decide(true)} disabled={busy}>
              Approve
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => router.navigate({ to: "/dashboard" })}
          >
            Back to Pulse
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "openid":
      return "Verify your identity";
    case "email":
      return "Share your email address";
    case "profile":
      return "Share your basic profile";
    default:
      return `Additional permission: ${scope}`;
  }
}
