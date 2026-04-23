# Live Suggestions Copilot

This is an AI-powered live meeting copilot. Speak into your mic. The app transcribes what you're saying in 30-second chunks, generates 3 context-aware suggestions every 30 seconds based on the most recent content, and lets you click any suggestion or type a free-form question to get a detailed streaming answer grounded in the full meeting transcript.

**Three columns, one browser tab:**
- **Left:** mic control and scrolling transcript
- **Middle:** live suggestions (question to ask, talking point, answer, fact-check, or clarification - color-coded)
- **Right:** streaming chat for detailed answers

**[Live demo →](https://live-suggestions-copilot.vercel.app)** · Paste your Groq API key once, press the mic and start talking. Everything runs session-only - nothing is stored.

---

## Quick start (Setup)

```bash
git clone https://github.com/msdokania/live-suggestions-copilot.git
cd twinmind-live-suggestions
npm install
npm run dev          # http://localhost:3000
```

- Transcript chunks arrive every ~30s while recording.
- A fresh batch of 3 suggestions auto-generates on the same session. The "Reload suggestions" button triggers a manual refresh. The countdown in the middle column shows when the next auto-refresh fires.
- Click a suggestion card → it seeds a streaming detailed answer in the chat panel.
- Type a question directly → same chat panel.
- **Export** button → packages the full session (transcript + every batch + chat + timestamps) as JSON.

Works on Safari and Chrome.

---

## Notes from using TwinMind Product

I tested TwinMind on several types of conversations: a production incident discussion with a colleague, a podcast interview about AI and careers, a YouTube lecture by Ilya Sutskever on AI's societal impact, etc. Few things stood out that directly shaped my prompts:

**1. TwinMind's suggestions did not use a lot of specific facts.** Rather than citing "GC pauses cause 10-15 minute spikes" or "Netflix retry timeout is 30s," TwinMind's suggestions looked more like *"Did the rollback restore latency to the 40% CPU baseline, or is it still elevated?"* or *"Could an upstream gateway cause this instead of the service itself?"* They're good reasoning suggestions, but can be augmented in a meeting by reference material. When I initially tried to include concrete numbers in my suggestions, the model started fabricating them to satisfy the specificity requirement (see [Iteration #1](#1-the-fabrication-vs-specificity-arc) below). And if I tried fighting that with anti-fabrication rules, that led to model stop producing *any* concrete content. Getting this balance right took several prompt iterations.

**2. TwinMind's detailed chat answers feel like a thinking partner, not just a search engine.** When I clicked on a suggestion during the production-incident conversation, the response opened with a judgment ("Yes, that's plausible"), anchored to specifics I had already mentioned ("since rollback didn't help"), reasoned through hypotheses, offered concrete next checks, and ended with an offer to continue thinking with me ("Want me to phrase that as a one-sentence question you can ask out loud?"). My initial detailed-answer prompt produced textbook-style explanations instead. I rewrote it around the explicit principle *"reason, don't recite"* with a list of specific behaviors a great answer does (open with judgment, anchor to user's language, offer next moves, end with a forward push).

**3. Where I tried to improve on TwinMind:** I noticed TwinMind's suggestions, while thoughtful, often surface ideas a user could have thought of themselves with deeper reflection. I wanted at least *one* suggestion per batch to reach higher - a reframe, a non-obvious angle, a pattern from an adjacent domain, the kind of insight an experienced practitioner would surface. I added this as an explicit aspiration in the last prompt iteration without forcing it on every suggestion (forcing it makes output feel strained when the conversation doesn't warrant reframes). The goal was a natural mix of normal thinking-partner moves with occasional higher-aspiration insights.

All Prompts iterations are available in the archived_prompts (`src/lib/archived_prompts/`) folder.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16 (App Router)** + TypeScript | API routes and UI in one deployable unit. One `vercel deploy` and you have a public URL. |
| State | **Zustand** | Session state in-memory (to maintain storage session-only). Settings persisted to `localStorage`. |
| Styling | **Tailwind**, no component library | The three-column UI is small enough that one `ui.tsx` primitive file covers it. |
| Audio | **MediaRecorder** with stop/restart chunking | Native, no dependencies. |
| LLM | **Groq** | Whisper Large V3 for transcription, GPT-OSS 120B for suggestions and chat. Called directly via the OpenAI-compatible REST endpoint (no SDK, so no dependencies and cleaner errors) |

---

## Architecture

A single Next.js app with 3 API routes.
Vercel's serverless platform auto-scales these routes without production-like requirements like CORS handling etc.


```
┌──────────────┐    30s blob    ┌────────────────────┐
│   Browser    │ ──────────────▶│ /api/transcribe    │ ── Groq Whisper V3
│              │ ◀── text ───── └────────────────────┘
│ MediaRecorder│
│ (chunker)    │                ┌────────────────────┐
│              │ ──window+dedup▶│ /api/suggest       │ ── Groq GPT-OSS 120B
│ transcript   │ ◀── 3 sugg. ── │ (JSON mode, medium │    (JSON mode)
│ store        │                │  reasoning)        │
│              │                └────────────────────┘
│              │                ┌────────────────────┐
│ chat store   │ ──msg+tscript▶ │ /api/chat          │ ── Groq GPT-OSS 120B
│              │ ◀── SSE ────── │ (streaming)        │    (streaming)
└──────────────┘                └────────────────────┘
```

Three routes, one shared Groq client helper (`src/lib/groq.ts`), no middleware.

### File structure

```
src/
├── app/
│   ├── api/
│   │   ├── transcribe/route.ts       # Whisper audio to text api
│   │   ├── suggest/route.ts          # 3-suggestion JSON generation api
│   │   └── chat/route.ts             # Streaming chat/detailed-answer api
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # 3-column base page
├── components/
│   ├── TranscriptColumn.tsx          # Leftmost column: Mic + chunks + auto-scroll
│   ├── SuggestionsColumn.tsx         # Middle column: Color-coded chips (suggestion category), cards + batch dividers
│   ├── ChatColumn.tsx                # Rightmost column: Streaming assistant + typed input
│   ├── SettingsModal.tsx             # All editable fields + reset defaults
│   └── ui.tsx                        # Panel, IconButton primitives
└── lib/
    ├── types.ts                      # Shared types
    ├── prompts.ts                    # ALL PROMPTS + default settings
    ├── store.ts                      # Zustand: session (ephemeral) + settings (persisted)
    ├── groq.ts                       # Server-side Groq REST client
    ├── useAudioRecorder.ts           # MediaRecorder chunking
    ├── useSuggestionOrchestrator.ts  # Main Orchestrator for 30s loop + countdown + manual refresh + dedup
    ├── useChatStream.ts              # SSE streaming, context windowing
    └── exportSession.ts              # JSON session export (Output download)
```

---

## Prompt strategy

All default prompts are in `src/lib/prompts.ts` and are editable at runtime through the Settings modal.
Suggestion types: `question_to_ask`, `talking_point`, `answer`, `fact_check`, `clarification`.

### Prompt design principles

1. **Reasoning moves over reference material.** Good suggestions push the user's thinking forward. Generic facts - even true ones - are low-value if the user can get them from a web search.
2. **Topic lock.** (refer prompt hard rule #0) Every suggestion stays inside the subject of the most recent transcript. To prevent drift.
5. **Anchor to specifics in the transcript.** Echo the user's exact language where possible. "You mentioned replicas look healthy - worth checking replication lag across all of them" is 10× better than "Check replication health."
6. **Role awareness.** Use the `MEETING CONTEXT` field to calibrate: e.g. a questioner (seller, interviewer) shouldn't need `answer` suggestions.
3. **Recency weight.** The last chunk matters more than the previous two minutes. So split context into `EARLIER CONTEXT` (background) and `MOST RECENT (highest priority)`.
4. **Type diversity with a conditional exception.** Batches of 3 with at least two different suggestion types. Exceptions when role demands e.g. question-heavy suggestions.
7. **Mix quality levels.** At least one suggestion per batch should reach beyond the obvious - an intelligent reframe or non-obvious angle. To aim high and keep the suggestions high quality.
10. **Anti-fabrication rules.**
5. **Standalone value.** `preview` delivers value without clicking. No teasers ("want to know more?"). Since a user may never click, the preview itself is the deliverable.
6. **Anti-repetition.** The first 15 words of each suggestion's `preview` from the last N batches are passed into the new prompt as an "avoid these ideas" list.
7. **Prompt-cache friendly.** The system prompt is byte-identical across calls. Groq's prompt cache gives 50% token discount on warm calls. Dynamic context (transcript, dedup list, meeting context) goes last in the prompt.

### What's in the prompt `user` message -

- MEETING CONTEXT: The user has option to describe this conversation as: "technical interview, I'm the candidate". This makes the model match the register. With it, "casual chat with a friend" produces lighter suggestions; "technical interview" produces rigorous specifics.
- RECENT_BATCH_TITLES (to avoid repeating)
- EARLIER CONTEXT (background only, lower priority)
- MOST RECENT (highest priority — anchor every suggestion here)

### Detailed-answer chat prompts design principles -

1. Open with a judgment or direct take (no preamble, no restating)
2. Anchor to the user's exact phrases and specific situation
3. Reason through the logic, don't recite textbook facts
4. Identify speakers, correct transcription errors, synthesize arguments (for talk-watching contexts)
5. Offer concrete next moves (fast checks, questions to ask, decisions to force)
6. End with a forward push - an offer, a follow-up question, something that continues the thinking
7. Fabrication guardrails

---

## Default settings — what each knob does and why the default

All defaults live in `src/lib/prompts.ts` under `DEFAULTS`. The goal for each: best quality/latency tradeoff on Groq free tier.

| Setting | Default | Reason |
|---|---|---|
| `suggestionModel` | `openai/gpt-oss-120b` | As required |
| `chatModel` | `openai/gpt-oss-120b` | As required |
| `transcriptionModel` | `whisper-large-v3` | As required |
| `suggestionReasoningEffort` | `low` | Low reasoning produced pretty efficient results with well-designed prompts |
| `chatReasoningEffort` | `medium` | User is waiting for depth on chat, so quality > speed. |
| `suggestionContextChars` | 2500 (~90 sec of speech) | 8000 was the original default. Dropping to 2500 reduced token cost |
| `detailedAnswerContextChars` | 32000 | Full meeting context for detailed answers. Chat is a rare call so token cost doesn't matter a lot. |
| `chatContextChars` | 32000 | Same. |
| `refreshIntervalMs` | 30000 | Matches chunk duration - a new transcript chunk should trigger a new batch. |
| `chunkDurationMs` | 30000 | Tried 7s (faster first-feedback) but short chunks produced noticeably worse Whisper quality at boundaries, and more of previous chunks would have to be passed to make sense of the current chunk with some context. |
| `suggestionTemperature` | 0.3 | At 0.4 the model occasionally invented creative-sounding but fake facts. 0.3 kept enough variance to avoid repetition across batches and is less prone to making things up. |
| `chatTemperature` | 0.6 | More conversational, so a bit more latitude than suggestions. |
| `recentBatchesForDedup` | 2 | Pass the last 2 batches' first-15-words-of-preview into the "avoid these ideas" list |

Everything in this table is editable via the Settings modal. The user can reset per-prompt or reset everything.
The Groq API key is stored in `localStorage` only — never logged server-side, never sent anywhere but Groq. Every API route forwards the key as a request-scoped header.

---

## Audio capture

Browser-specific details mattered here, so documenting.

**Chunking strategy.** MediaRecorder with stop/restart every 30 seconds - not the `timeslice` parameter. Timeslice produces fragmented WebM chunks that aren't independently decodable, and Whisper rejects them. Stop/restart gives clean, standalone containers per chunk that Whisper can transcribe directly.

**MIME preference order.** Safari produces MP4/AAC natively. Chrome/Firefox prefer WebM/Opus. The file sent to Whisper is named `chunk.m4a` or `chunk.webm` based on blob type, since Groq uses the extension for format auto-detection.

**Whisper prompt biasing.** The last ~400 chars of the previous chunk's transcript is sent to Whisper as the `prompt` parameter on the next call. This biases decoding for proper-noun continuity and mid-word splits across 30s boundaries - otherwise Whisper treats each chunk as fully independent and occasionally misspells names or splits sentences oddly. Tradeoff: on silent chunks, Whisper sometimes echoes this prompt back as a hallucination.

---

## Error handling

Errors are handled and displayed without crashing the session.

**Transcription errors** (`/api/transcribe`)
- Missing API key → prompt user to open Settings
- Audio-too-short (from Groq's 0.01s minimum) → silently dropped, happens on mic stabilization
- Rate limit (429) → shows with retry suggestion
- Network failure or 500 → shows as `[⚠️ ...]` in transcript so user knows a chunk was lost

**Suggestion errors** (`/api/suggest`)
- **Rate limit (429)** → server distinguishes TPM (tokens-per-minute, transient) from TPD (tokens-per-day, terminal).
- **Invalid JSON from model (400)** → retries the request once with a 300ms backoff.
- **Missing API key (401)** → amber banner prompts user to open Settings
- **500 / network** → clean user-friendly message (not raw JSON), user can hit Reload manually

**Chat errors** (`/api/chat`)
- Streaming errors mid-response → partial content stays, error appended as `⚠️ <reason>`
- Missing API key → same banner flow
- Rate limit 429 → clean structured error in the assistant bubble (not raw JSON dump)

---

## Latency

Measured on the deployed Vercel app, Groq free tier:

| Operation | Target | Measured |
|---|---|---|
| Reload click → first suggestion rendered (medium reasoning) | < 3s | typically **2.2-2.6s** |
| Reload click → first suggestion rendered (low reasoning) | < 1.5s | typically **~1.0s** |
| Chat send → first streamed token | < 1s | < 1s perceived |
| Transcript chunk → appears in UI after 30s chunk ends | ~1s | < 1s |

Each batch's header shows its own `generationMs` ("Newest · 11:25:44 AM · 0.9s") so evaluators can verify in real time. The numbers are also in the exported JSON per batch.

---

## Iteration history — testing and fixing

I ran six test transcripts across different conversation types (production incident debugging, technical interview as candidate, sales discovery call as seller, podcast interview about AI and careers, casual catch-up, YouTube lecture viewing) and iterated.


### 1. The fabrication vs. specificity arc

**Starting point:** the prompt demanded every suggestion contain "a number, a named entity, a date, or a specific testable claim." The model complied by fabricating numbers and reports.

**First fix:** added explicit "do not fabricate" language with banned patterns listed (made-up company metrics, invented percentages, fake citations). This *reduced* fabrication but didn't eliminate it — the model would soften fabricated numbers into hedged versions ("about 1,000 jobs, roughly 10%").

**Second fix:** strengthened the rule with explicit named examples of the fabrication pattern ("Acme cut 30%...", "Stripe's team of 12...") and added "hedged numbers are worse than no numbers — 'roughly 30%' when you don't actually know is still fabrication." This mostly stopped fabrication — but overshot in the other direction. The model became so cautious it stopped producing *any* numbers or named specifics, even ones it could reliably know (like Gallup's well-documented engagement survey numbers).

**Final balance:** rewrote the rule to distinguish what's safe from what's banned, rather than a blanket ban.

### 2. Off-topic drift under anti-repetition pressure

**Bug:** Transcript was clearly about message queues (Kafka, SQS, RabbitMQ). After 2-3 batches of dedup pressure, the model started suggesting *databases* — completely unrelated. It was trying so hard to find a "fresh angle" that it switched topics.

**Fix:** added rule #0 — **topic lock** — above all other rules. Softened the anti-repetition rule to *"find fresh angles within the same topic, not new topics."* Added an example showing topic-lock under explicit dedup pressure.

### 3. Topic = user's message, not just named entities

**Bug:** During a discussion about AI and job displacement (triggered by Block's layoff news), the model latched onto "Block" as the topic and produced suggestions like *"Block cut ~1,000 jobs in Q2 2024, roughly 10% of workforce"* (fabricated) and *"Block's layoff was ~10%, not half as reported"* (fact-checking news the model didn't actually know). The user's actual central idea was AI-and-work, not Block specifically.

**Fix:** added rule 0a — *"TOPIC = USER'S ACTUAL CONCERN, NOT JUST NAMED ENTITIES."* When the user mentions entities in passing while discussing a broader theme, the topic is the theme, not the entity. Added a new examples with good and bad outputs.

### 4. Role awareness — meeting context became load-bearing

**Bug:** The prompt didn't consider `meetingContext`. The Sarah example is illustrative: in a casual catch-up about a colleague's departure, the model produced *"What are the exact handoff tasks assigned for Sarah's role, and who is responsible for each?"* — interview-style interrogation, wrong for the register.

**Fix:** added explicit role-based awareness in the prompt. Casual conversations warrant gentle talking points and *fewer suggestions* (allowing 1-2 instead of forcing 3). Talk-watchers want questions for the speaker and philosophical frames, not interrogation.

### 5. Suggestion generation latency >2s

**Bug:** Original schema had each suggestion output `type + title + preview + reasoning + sourceHint + confidence` — 6 fields. The `reasoning` field explained why the suggestion was surfaced; `sourceHint` pointed to the specific transcript phrase. Both were shown as UI tooltips.

**Fix:** dropped `reasoning`, `sourceHint`, `title`, and `confidence`. In practice, users don't hover during live meetings. For `confidence`: since the prompt asks for exactly 3 suggestions, the field almost never filtered anything out.

### 7. Context window, temperature, reasoning effort

- **Context reduced from 8000 → 2500 chars** (~90 sec of speech). The prompt tells the model older context is "lower priority" anyway. Halving reduced token cost with no quality drop.

- **Temperature lowered from 0.4 → 0.3.** At 0.4 the model occasionally invented creative-sounding but fake facts. 0.3 keeps enough variance to avoid repetition but less prone to making things up.

- **Default reasoning effort set to low.** Prompts were good enough.

### 8. Detailed answers were reciting textbook facts, not reasoning

**Bug:** When I clicked a suggestion during a production-incident test, the detailed answer opened with *"Gateway misconfigurations can cause latency through several mechanisms including connection pool exhaustion..."* — accurate but useless; the user needed their next debugging step, not a textbook chapter. Worse, when I clicked a suggestion that itself contained a fabricated claim (*"Acme Corp cut approval cycle time by 30%"*), the response expanded the fabrication with more invented detail (*"~45 product managers"*, *"5 days to 3.5 days"*, *"rule-based router matched decision types to owners"*). The prompt was *helping* the fabrication by elaborating on it.

**Fix:** rewrote `DEFAULT_DETAILED_ANSWER_SYSTEM_PROMPT` around the explicit principle *"reason, don't recite."* Instructed to anchor to the user's exact phrases and specific situation, and end with a forward push. Added anti fabrication rules.

---

## Known limitations

- Whisper occasionally hallucinates short foreign-language fragments on ambient noise. The exact-duplicate guard catches the common repetition case; occasional single-shot hallucinations may still appear in the transcript.
- On Groq free tier (8k TPM, 200k TPD for GPT-OSS 120B), continuous conversation can rate-limit after ~2 minutes. The app handles this gracefully with an auto-retry banner; upgrading to Groq Dev Tier eliminates it.
- Chrome on Mac occasionally routes the mic to the wrong input device; if transcript is empty or garbled, check System Settings → Microphone or System Settings → Sound → Input.