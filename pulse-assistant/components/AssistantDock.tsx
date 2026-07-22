import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useViewAs } from "@/hooks/use-view-as";
import { applyProposal } from "@assistant/lib/apply.functions";
import { chatFn } from "@assistant/api/chat";
import { transcribeFn } from "@assistant/api/transcribe";
import type { Proposal } from "@assistant/lib/proposals";
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
  const chatApi = useServerFn(chatFn);
  const transcribeApi = useServerFn(transcribeFn);

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
      const data = await chatApi({ 
        data: { 
          message: text,
          token: session?.access_token ?? "",
          userName: me?.fullName ?? "Team Member",
          userEmail: me?.email ?? "",
          originUrl: window.location.origin,
        }
      });
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apply({ 
        data: { 
          proposal: p, 
          viewAsUserId: viewAsUserId ?? null,
          token: session?.access_token ?? ""
        }
      });
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
      const text = await transcribeApi({ 
        data: { 
          formData: form,
          token: session?.access_token ?? ""
        }
      });
      const trimmed = (text ?? "").trim();
      if (trimmed) setInput((v) => (v ? `${v} ${trimmed}` : trimmed));
      else toast.error("Couldn't hear that — try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally { setBusy(false); inputRef.current?.focus(); }
  }

  if (!me) return null;

  return (
    <>
      <style>{`
        .pulse-fab {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 9999;
          width: 3.5rem;
          height: 3.5rem;
          border-radius: 50%;
          background: var(--gradient-primary, #B58F15);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-elevated, 0 10px 25px rgba(0,0,0,0.2));
          cursor: pointer;
          transition: transform 0.2s ease;
          border: none;
        }
        .pulse-fab:hover {
          transform: scale(1.05);
        }
        .pulse-window {
          position: fixed;
          bottom: 5.5rem;
          right: 1.5rem;
          z-index: 9999;
          width: 380px;
          height: 600px;
          max-height: calc(100vh - 7rem);
          max-width: calc(100vw - 3rem);
          background-color: var(--color-background, #F6EFE4);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 1rem;
          box-shadow: var(--shadow-elevated, 0 10px 40px rgba(0,0,0,0.2));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: var(--font-sans, sans-serif);
        }
        .pulse-header {
          height: 3.5rem;
          background: var(--gradient-primary, #B58F15);
          color: white;
          display: flex;
          align-items: center;
          padding: 0 1rem;
          gap: 0.75rem;
          flex-shrink: 0;
        }
        .pulse-body {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .pulse-footer {
          padding: 0.75rem;
          border-top: 1px solid var(--color-border, #e5e7eb);
          background-color: var(--color-surface, #ffffff);
          flex-shrink: 0;
        }
      `}</style>

      {/* Floating Action Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="pulse-fab"
          aria-label="Open Pulse Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Chat Window */}
      {open && (
        <aside className="pulse-window">
          <header className="pulse-header">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-white">
              <Sparkles size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm leading-tight">Pulse Assistant</div>
              <div className="text-[10px] opacity-80 leading-tight">Ask in any language · voice or text</div>
            </div>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} />
            </Button>
          </header>

          <div ref={scrollRef} className="pulse-body">
            {msgs.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                <div className="font-medium text-foreground">How can I help you today?</div>
                <div className="space-y-1 mt-4">
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
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  m.role === "user" ? "bg-sidebar text-sidebar-foreground" : "bg-surface text-foreground border border-border",
                )}>
                  {m.error ? (
                    <div className="text-destructive text-xs">{m.error}</div>
                  ) : m.role === "assistant" ? (
                    <div className="group relative flex flex-col gap-2">
                      <div className="prose prose-sm max-w-none
                        prose-p:mb-4 prose-p:mt-1 last:prose-p:mb-0 prose-p:leading-relaxed
                        prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-4 prose-headings:mb-2
                        prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                        prose-strong:text-foreground prose-strong:font-semibold
                        prose-em:text-muted-foreground
                        prose-ul:mb-4 prose-ul:mt-1 prose-ul:pl-4 prose-li:my-1 prose-li:marker:text-primary
                        prose-ol:mb-4 prose-ol:mt-1 prose-ol:pl-4
                        prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
                        prose-pre:bg-black/10 prose-pre:rounded-lg prose-pre:text-xs prose-pre:my-2
                        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                        prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-blockquote:my-2
                        prose-hr:border-border
                      ">
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
                <div className="bg-surface border border-border shadow-sm rounded-2xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="pulse-footer">
            <div className="relative flex items-end gap-2 bg-background border border-border rounded-xl p-1 shadow-sm focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={recording ? "Listening..." : "Message Pulse..."}
                rows={1}
                disabled={busy || recording}
                className="flex-1 min-h-[36px] max-h-[120px] resize-none border-0 shadow-none focus-visible:ring-0 p-2 text-sm bg-transparent"
                style={{ overflowY: input.length > 50 ? 'auto' : 'hidden' }}
              />
              <div className="flex items-center gap-1 pb-1 pr-1">
                <Button
                  variant={recording ? "destructive" : "ghost"} size="icon"
                  onClick={() => (recording ? stopRecording() : startRecording())}
                  disabled={busy && !recording}
                  aria-label={recording ? "Stop recording" : "Record voice"}
                  className="h-8 w-8 rounded-full"
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                </Button>
                <Button 
                  size="icon" 
                  onClick={() => send(input)} 
                  disabled={busy || !input.trim()} 
                  aria-label="Send" 
                  className="h-8 w-8 rounded-full bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  <Send size={14} className="translate-x-[1px]" />
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
    <div className="mt-2 rounded-lg border border-border bg-background/80 p-2 text-xs space-y-1 shadow-sm">
      <div className="font-semibold text-foreground">{title}</div>
      <ProposalBody proposal={proposal} />
      <div className="flex justify-end gap-2 pt-1">
        {applied ? (
          <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs">
            <CheckCircle2 size={14} /> Saved
          </span>
        ) : (
          <Button size="sm" className="h-7 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 rounded-md px-3" disabled={pending}
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
