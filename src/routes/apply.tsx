import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, GraduationCap } from "lucide-react";
import logo from "@/assets/colladome-logo.png.asset.json";
import { submitTraineeApplication } from "@/lib/trainee-applications.functions";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply — Colladome Training Program" },
      {
        name: "description",
        content:
          "Apply to the Colladome training program — a hands-on development drive for aspiring engineers.",
      },
      { property: "og:title", content: "Apply — Colladome Training Program" },
      {
        property: "og:description",
        content: "Apply to join the Colladome training program.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const submit = useServerFn(submitTraineeApplication);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setLoading(true);
    try {
      await submit({
        data: {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden gradient-surface p-12 flex-col justify-between border-r border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black shadow-glow overflow-hidden">
            <img src={logo.url} alt="Colladome" className="h-10 w-10 object-contain" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">Colladome Pulse</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Training Program</div>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Learn by shipping real work.
          </h1>
          <p className="text-muted-foreground max-w-md">
            The Colladome training program pairs aspiring developers with real projects, mentors, and
            an operating system used every day by our team. Apply below — HR will review and get back
            to you.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4 max-w-md">
            {["Mentorship", "Real Projects", "Hands-on"].map((t) => (
              <div key={t} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-xs text-muted-foreground">You'll get</div>
                <div className="text-sm font-medium">{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">Powered by Colladome IT Network Solutions</div>
        <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Apply for the Colladome training program
            </CardTitle>
            <CardDescription>
              Tell us a bit about yourself. Once HR approves your application, you'll be able to
              sign in with Google using the email you provide here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {done ? (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <div className="font-medium">Thanks — your application has been submitted.</div>
                  <div className="text-muted-foreground">
                    We'll be in touch once your application is reviewed. Please make sure your Google
                    account uses the email you gave above.
                  </div>
                  <div className="pt-2">
                    <Link to="/">
                      <Button variant="outline" size="sm">Back to home</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Priya Sharma"
                    required
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    maxLength={255}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the Google account you'll sign in with — personal Gmail is fine.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9xxxxxxxxx"
                    maxLength={30}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="note">Tell us about you (optional)</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tell us what you're hoping to learn or work on"
                    rows={4}
                    maxLength={2000}
                  />
                </div>
                <Button type="submit" className="w-full gradient-primary" disabled={loading}>
                  {loading ? "Submitting…" : "Submit application"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Already have an approved account?{" "}
                  <Link to="/auth" className="underline">Sign in</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
