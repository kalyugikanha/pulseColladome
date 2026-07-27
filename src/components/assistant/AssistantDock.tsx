import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useViewAs } from "@/hooks/use-view-as";
import { applyProposal } from "@/lib/assistant/apply.functions";
import type { Proposal } from "@/lib/assistant/proposals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Mic, Square, X, CheckCircle2, Loader2, MessageSquare, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const renderMarkdownComponents: any = {
  a: ({ node, ...props }: any) => {
    const href = props.href || "";
    const isWhatsApp = href.includes("wa.me") || href.includes("api.whatsapp.com");
    return (
      <span className="inline-flex items-center gap-1 my-1">
        <a {...props} target="_blank" rel="noopener noreferrer" className={cn(
          "inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline",
          isWhatsApp ? "text-green-600 dark:text-green-500" : "text-primary"
        )}>
          {isWhatsApp && <MessageCircle className="w-3.5 h-3.5" />}
          {props.children}
        </a>
        <Button 
          variant="outline" 
          size="icon" 
          className="h-6 w-6 ml-1 rounded hover:bg-black/5 dark:hover:bg-white/10" 
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard.writeText(href);
            toast.success("Link copied!");
          }}
          title="Copy link"
        >
          <Copy className="w-3 h-3 text-muted-foreground" />
        </Button>
      </span>
    );
  },
  p: ({ node, ...props }: any) => (
    <p {...props} className="mb-4 last:mb-0 leading-relaxed whitespace-pre-wrap" />
  ),
};

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposals?: Proposal[];
  appliedIdx?: Set<number>;
  error?: string;
};

const STORAGE_OPEN = "pulse.assistant.open";

export function AssistantDock() {
  const { data: me } = useCurrentUser();
  const { viewAsUserId } = useViewAs();
  const apply = useServerFn(applyProposal);

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<{ stop: () => Promise<Blob | null> } | null>(null);

  useEffect(() => {
    try { setOpen(localStorage.getItem(STORAGE_OPEN) === "1"); } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_OPEN, open ? "1" : "0"); } catch { /* noop */ }
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open || !me) return;
    // Load recent history once
    (async () => {
      const { data } = await supabase
        .from("assistant_messages")
        .select("id, role, content, created_at")
        .eq("user_id", me.realId)
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = (data ?? []).reverse();
      setMsgs(rows.filter((r) => r.role === "user" || r.role === "assistant").map((r) => {
        const c = r.content as unknown;
        if (typeof c === "string") return { id: r.id, role: r.role as "user" | "assistant", text: c };
        const obj = c as { text?: string; proposals?: Proposal[] };
        return { id: r.id, role: r.role as "user" | "assistant", text: obj?.text ?? "", proposals: obj?.proposals };
      }));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9 }));
    })();
  }, [open, me]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");
    const localId = crypto.randomUUID();
    setMsgs((m) => [...m, { id: localId, role: "user", text }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMsgs((m) => [...m, {
        id: crypto.randomUUID(), role: "assistant",
        text: data.text ?? "", proposals: (data.proposals ?? []) as Proposal[],
      }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: "", error: msg }]);
    } finally { setBusy(false); inputRef.current?.focus(); }
  }, [busy]);

  async function confirmProposal(msgIdx: number, propIdx: number, p: Proposal) {
    try {
      const res = await apply({ data: { proposal: p, viewAsUserId: viewAsUserId ?? null } });
      toast.success(res.summary);
      setMsgs((m) => m.map((mm, i) => i === msgIdx ? { ...mm, appliedIdx: new Set([...(mm.appliedIdx ?? []), propIdx]) } : mm));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      source.connect(proc); proc.connect(ctx.destination);
      setRecording(true);
      recorderRef.current = {
        stop: async () => {
          stream.getTracks().forEach((t) => t.stop());
          proc.disconnect(); source.disconnect();
          const sr = ctx.sampleRate;
          await ctx.close();
          setRecording(false);
          if (!chunks.length) return null;
          // Concat + encode 16-bit PCM WAV mono
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const merged = new Float32Array(total);
          let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
          return encodeWav(merged, sr);
        },
      };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Microphone access denied");
    }
  }

  async function stopRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return;
    const blob = await rec.stop();
    if (!blob || blob.size < 2048) { toast.error("Recording too short — try again."); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("file", new File([blob], "recording.wav", { type: "audio/wav" }));
      const res = await fetch("/api/assistant/transcribe", {
        method: "POST",
        headers: { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const text = (data?.text ?? "").trim();
      if (text) setInput((v) => (v ? `${v} ${text}` : text));
      else toast.error("Couldn't hear that — try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally { setBusy(false); inputRef.current?.focus(); }
  }

  if (!me) return null;

  return (
    <>
      {/* Collapsed rail */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 h-14 w-14 rounded-full gradient-primary text-white shadow-xl flex items-center justify-center hover:scale-105 transition"
          aria-label="Open Pulse Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <aside className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] bg-background border-l border-border shadow-2xl flex flex-col">
          <header className="h-14 flex items-center gap-2 border-b border-border px-4 shrink-0">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm">Pulse Assistant</div>
              <div className="text-[10px] text-muted-foreground">Ask in any language · voice or text</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {msgs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
                <MessageSquare className="h-6 w-6 mx-auto opacity-50" />
                <div>Try:</div>
                <div className="space-y-1">
                  {[
                    "Log 3h on CLDM00000 for yesterday, testing",
                    "Punch me in on Colladome Social Media",
                    "Mark my latest task done",
                    "Apply casual leave next Mon–Tue, family function",
                  ].map((s) => (
                    <button key={s} onClick={() => setInput(s)} className="block mx-auto text-xs text-primary hover:underline">"{s}"</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}>
                  {m.error ? (
                    <div className="text-destructive text-xs">{m.error}</div>
                  ) : m.role === "assistant" ? (
                    <div className="group relative flex flex-col gap-2">
                      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1">
                        <ReactMarkdown components={renderMarkdownComponents}>{m.text || " "}</ReactMarkdown>
                      </div>
                      <div className="flex justify-end mt-1">
                        {(() => {
                          const text = m.text || "";
                          const linkMatch = text.match(/🔗 \*\*Full sequence:\*\* (http[^\s]+)/);

                          if (linkMatch) {
                            return (
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                                onClick={() => {
                                  navigator.clipboard.writeText(linkMatch[1]);
                                  toast.success("Link copied!");
                                }}
                                title="Copy Link"
                              >
                                <Copy className="h-3 w-3" /> Copy Link
                              </Button>
                            );
                          }

                          return (
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                              onClick={() => {
                                const textToCopy = text.split("\n\n---")[0];
                                navigator.clipboard.writeText(textToCopy);
                                toast.success("Copied to clipboard!");
                              }}
                              title="Copy Output"
                            >
                              <Copy className="h-3 w-3" /> Copy Output
                            </Button>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  )}
                  {m.proposals?.map((p, pi) => (
                    <ProposalCard
                      key={pi}
                      proposal={p}
                      applied={m.appliedIdx?.has(pi) ?? false}
                      onConfirm={() => confirmProposal(i, pi, p)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-2 shrink-0">
            <div className="relative">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={recording ? "Recording…" : "Message or press mic…"}
                rows={2}
                disabled={busy || recording}
                className="pr-24 resize-none text-sm"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <Button
                  variant={recording ? "destructive" : "ghost"} size="icon"
                  onClick={() => (recording ? stopRecording() : startRecording())}
                  disabled={busy && !recording}
                  aria-label={recording ? "Stop recording" : "Record voice"}
                  className="h-8 w-8"
                >
                  {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button size="icon" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send" className="h-8 w-8">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

function ProposalCard({ proposal, applied, onConfirm }: { proposal: Proposal; applied: boolean; onConfirm: () => void }) {
  const [pending, setPending] = useState(false);
  const title =
    proposal.kind === "timesheet" ? `Log timesheet · ${proposal.date}` :
    proposal.kind === "punch" ? `Punch ${proposal.action}` :
    proposal.kind === "task" ? `Task · ${proposal.operation.replace("_", " ")}` :
    `Leave · ${proposal.leave_type}`;

  return (
    <div className="mt-2 rounded-lg border border-border bg-background/60 p-2 text-xs space-y-1">
      <div className="font-semibold text-foreground">{title}</div>
      <ProposalBody proposal={proposal} />
      <div className="flex justify-end gap-2 pt-1">
        {applied ? (
          <span className="inline-flex items-center gap-1 text-green-600 text-xs">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        ) : (
          <Button size="sm" className="h-7 gradient-primary" disabled={pending}
            onClick={async () => { setPending(true); await onConfirm(); setPending(false); }}>
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm & save"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProposalBody({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === "timesheet") return (
    <ul className="space-y-0.5 text-muted-foreground">
      <li>Mode: {proposal.mode}</li>
      {proposal.entries.map((e, i) => (
        <li key={i}>· {e.project_code} — {e.hours}h{e.comments ? ` — "${e.comments}"` : ""}</li>
      ))}
    </ul>
  );
  if (proposal.kind === "punch") return (
    <div className="text-muted-foreground">
      {proposal.project_code ? `Project: ${proposal.project_code}` : "No project"}
      {proposal.comments ? ` · "${proposal.comments}"` : ""}
    </div>
  );
  if (proposal.kind === "task") return (
    <ul className="space-y-0.5 text-muted-foreground">
      {proposal.project_code && <li>Project: {proposal.project_code}</li>}
      {proposal.title && <li>Title: {proposal.title}</li>}
      {proposal.assignee_email && <li>Assignee: {proposal.assignee_email}</li>}
      {proposal.due_date && <li>Due: {proposal.due_date}</li>}
      {proposal.status && <li>Status: {proposal.status}</li>}
      {proposal.priority && <li>Priority: {proposal.priority}</li>}
      {proposal.task_id && <li>Task ID: {proposal.task_id.slice(0, 8)}…</li>}
    </ul>
  );
  return (
    <div className="text-muted-foreground">
      {proposal.start_date} → {proposal.end_date}{proposal.reason ? ` · ${proposal.reason}` : ""}
    </div>
  );
}

/** Encode a Float32Array of PCM samples into a 16-bit WAV Blob (mono). */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
