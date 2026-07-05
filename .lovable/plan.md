
# Pulse Assistant — Natural-language copilot

A right-side dock that lets any user say or type (in any language) things like *"Log 3h on CLDM123 yesterday, testing work"*, *"Punch me in"*, *"Mark task X done"*, or *"Apply casual leave next Mon–Tue for a family function"*. The assistant translates that into a structured action, **shows a confirmation card**, and then writes to the exact same tables your existing UI writes to — no separate flow, no separate approvals model.

## Behavior

- **Placement:** Persistent collapsible dock on the right (icon rail when collapsed, ~380px panel when open). Available on every authenticated page.
- **Input:** Text box + mic button. Mic uses Lovable AI STT (`openai/gpt-4o-mini-transcribe`) — records WAV, uploads to a server route, streams transcript back into the composer. User hits send.
- **Language:** Prompt the LLM to understand any language the user types/speaks and reply in the same language. Actions/dates get normalized to app-native values server-side.
- **Confirmation-first:** Assistant never writes silently. It renders a **structured confirmation card** ("Log 3.0 h · CLDM123 · Sat 4 Jul · 'testing work' — Confirm / Edit / Cancel"). Only on Confirm does it call the write path.
- **Attribution:** Writes go through the same server functions the UI uses, so RLS + audit fields (last_edited_by, created_by) work identically. "View as" impersonation is honored — while impersonating Kanishka, the assistant acts as Kanishka.
- **Transparency:** Every tool call renders as a small collapsible activity strip in the message ("Looked up projects", "Saved timesheet") so it never feels like a black box.
- **History:** One rolling conversation per user, stored in `assistant_messages` (last ~50 turns kept in context). No thread list in v1.

## Actions covered in v1

| Intent | Backing table / server fn | Confirmation card fields |
|---|---|---|
| Log timesheet hours / edit a day's tasks | `attendance_logs` (same as Day Editor) | user, date, project code+name, hours, comments |
| Punch in / punch out | `punch_sessions` | action, timestamp, note |
| Create / update / complete a task | `tasks` | project, title, assignee, due, status |
| Apply for leave | `leave_requests` | leave_type, from-to, days, reason |

Out of scope for v1 (added later): approvals, project/vendor CRUD, finance, taxonomy edits.

## UX flow

```text
User: "log 4 hours on colladome social media yesterday, made 3 reels"
   ↓ (LLM + tools)
[Assistant activity] resolved project → CLDM00000, date → 4 Jul 2026
Assistant renders card:
  ┌───────────────────────────────────────────┐
  │ Log timesheet · Fri 4 Jul                 │
  │ Project: CLDM00000 · Colladome Social Media│
  │ Hours:   4.0                              │
  │ Notes:   made 3 reels                     │
  │ For:     Kanishka (you)                   │
  │ [Cancel]  [Edit]  [Confirm & save]        │
  └───────────────────────────────────────────┘
   ↓ Confirm
[Assistant activity] saved to attendance_logs
Assistant: "Done — added 4h on CLDM00000 for 4 Jul. Your day now totals 6h."
```

Edit reopens the field values inline in the card so the user can tweak hours/date/notes before confirming.

## Technical section

**Stack:** AI SDK (`ai` + `@ai-sdk/openai-compatible`) via Lovable AI Gateway, following `ai-sdk-lovable-gateway` + `tanstack-ai-chat` + `chat-agent-ui-contract` + `chat-ui-composition`. Default model `google/gemini-3-flash-preview` (fast + multilingual + tool-calling).

**New files:**
- `src/lib/ai-gateway.server.ts` — provider helper (canonical snippet from the knowledge file).
- `src/routes/api/assistant/chat.ts` — streaming chat route; `streamText` + tools, persists messages via `onFinish`.
- `src/routes/api/assistant/transcribe.ts` — multipart passthrough to `/v1/audio/transcriptions` (STT).
- `src/lib/assistant/tools.server.ts` — AI SDK `tool()` definitions (see below). Each mutating tool has `needsApproval: true` and returns a *proposed action* payload; the actual write is a separate server fn called only after the user hits Confirm in the UI.
- `src/lib/assistant/actions.functions.ts` — `createServerFn` wrappers for `applyTimesheetEdit`, `applyPunch`, `applyTaskChange`, `applyLeaveRequest`. Each uses `requireSupabaseAuth`, re-validates the payload with Zod, and writes to the same tables the existing pages use (so RLS / triggers / audit fields behave identically). Impersonation: read `viewAsUserId` from the request header the client sends (mirroring `use-view-as`) and treat writes as originating from that user_id when the caller is a super admin — audit columns still record `context.userId`.
- `src/components/assistant/AssistantDock.tsx` — right-side collapsible dock, mounted once in `src/routes/_authenticated/route.tsx` next to `<ViewAsBanner />`.
- `src/components/assistant/ConfirmationCard.tsx` — renders proposed action, Edit/Cancel/Confirm.
- `src/components/assistant/VoiceButton.tsx` — mic recorder → WAV → POST to transcribe route → fill composer.
- AI Elements installed: `conversation message prompt-input shimmer tool`.

**Tools exposed to the model** (all read-only unless flagged):
- `listProjects(query?)` — search projects by code/name.
- `listMyRecentTasks()` — top 20 tasks assigned to current user.
- `resolveDate(natural)` — normalize "yesterday", "last Mon", Hindi/Marathi date phrases → `yyyy-mm-dd`.
- `getMyDay(date)` — read current attendance_logs row (for merge vs replace decisions).
- `getMyPunchStatus()` — is user punched in? current session.
- `getLeaveBalance()` — current balances.
- `proposeTimesheetEdit`, `proposePunch`, `proposeTaskChange`, `proposeLeaveRequest` — **mutating**. Each returns a structured payload rendered as a ConfirmationCard; the model does not write. When the user clicks Confirm, the client calls the matching `apply*` server fn with that payload.

**System prompt highlights:**
- Role: "You are Pulse Assistant, an internal copilot for Colladome employees. You help them log time, punch, manage tasks, and apply for leave — nothing else."
- Always reply in the user's language.
- Always call a `propose*` tool before claiming an action is done — never fabricate confirmations.
- Prefer resolving ambiguity by asking one short question rather than guessing (e.g. "Which project — CLDM123 (Social Media) or CLDM124 (Website)?").
- Never touch approvals, salaries, or other users' data unless the caller is admin/HR.

**Persistence:** New table `assistant_messages` (user_id, role, content jsonb, created_at) with RLS `user_id = auth.uid()`. Load last 50 turns on dock open; append user+assistant messages via `onFinish`.

**Secrets:** `LOVABLE_API_KEY` (already present). No user-facing keys.

**Client bearer:** already wired via existing `functionMiddleware` in `src/start.ts`.

## Rollout

Ship v1 with the four action families above, text + STT, confirmation-mandatory, English/Hindi/Marathi verified. Full realtime voice (TTS back), approvals, and finance actions come in a follow-up once the confirmation UX is proven.

If you have reference apps/screens you'd like the dock UI to feel like, share them after you approve the plan and I'll fold the visual direction in before building.
