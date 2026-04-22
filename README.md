# TwinMind — Live Suggestions

A live meeting copilot in one browser tab: transcript on the left, context-aware suggestions in the middle, streaming chat on the right.

**[Live demo →](https://REPLACE_ME.vercel.app)** · Paste your Groq API key once, press the mic, start talking. Everything runs session-only — nothing is stored.

---

## Quick start (Setup)

```bash
git clone <repo>
cd twinmind-live-suggestions
npm install
npm run dev          # http://localhost:3000
```

On first load, the Settings modal opens. Paste a [Groq API key](https://console.groq.com/keys). Optionally write a one-line meeting context (e.g. "technical interview, I'm the candidate"). Close and press the red mic button.

- Transcript chunks arrive every ~30s.
- A fresh batch of 3 suggestions auto-generates on the same session. The "Reload suggestions" button triggers a manual refresh, and the countdown in the middle column shows when the next auto-refresh fires.
- Click a suggestion card - it seeds a streaming detailed answer in the chat panel.
- Type a question directly - same chat panel, different prompt optimized for free-form dialogue.
- **Export** button packages the full session (transcript + every batch + chat + timestamps) as JSON.

Works best on Safari. Safari has MediaRecorder features that needed specific handling (refer [Audio capture](#audio-capture)).

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16 (App Router)** + TypeScript | API routes and UI in one deployable unit. One `vercel deploy` and you have a public URL very quickly. |
| State | **Zustand** | Session state in-memory (to maintain storage session-only). Settings persisted to `localStorage`. |
| Styling | **Tailwind**, no component library | The three-column UI is small enough to represent in a simplified way |
| Audio | **MediaRecorder** with stop/restart chunking | Native, no dependencies. |
| LLM | **Groq** | Whisper Large V3 for transcription, GPT-OSS 120B for suggestions and chat. Called directly via the OpenAI-compatible REST endpoint (no SDK — cleaner errors) |

---

## Architecture

**A single Next.js app with 3 API routes**
**Vercel's serverless platform auto-scales these routes without production-like requirements like CORS handling etc.**


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

Three routes, one shared Groq client helper (`src/lib/groq.ts`), no middleware. Each route does input validation, proxies to Groq with the user's API key, and handles errors explicitly.

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

### Prompt design principles, in priority order

1. **Specificity over abstraction.** Every `preview` has to have at least one concrete element (number/named entity/date or a specific testable claim). Users quickly glance at cards during live conversation, so specificity is a good way to deliver value in short.
1. **Grounded results over specificity.** (refer prompt hard rule #3) If the model doesn't know a real number, it picks a type that doesn't need one (like `question_to_ask`). 
2. **Topic lock.** (refer prompt hard rule #0) Every suggestion stays inside the subject of the most recent transcript. To prevent drift. If 
it can not at all find suggestions on the topic, then it can reduce number of suggestions, but never show irrelevant suggestions.
3. **Recency weight.** The last chunk matters more than the previous two minutes. So split context into `EARLIER CONTEXT` (background) and `MOST RECENT (highest priority)`. The prompt explicitly instructs anchoring to the most recent chunk, for suggestions to be relevant.
4. **Type diversity with a conditional exception.** Batches of 3 mix at least two different types. Exception: if a direct question was just asked, one suggestion must be type `answer` with the actual answer in `preview`.
5. **Standalone value.** `preview` delivers value without clicking. No teasers ("want to know more?"). This makes the preview itself valuable.
6. **Anti-repetition.** Recent batch preview-snippets passed into the prompt to avoid those ideas — find fresh angles within the same topic.
7. **Prompt-cache friendly.** The system prompt is identical across calls so Groq's prompt cache gives 50% discount + lower TTFT on 'warm calls'. Dynamic context (transcript, dedup list, meeting context etc.) goes last.

### What's in the prompt `user` message -

- MEETING CONTEXT: The user has option to describe this conversation as: "technical interview, I'm the candidate". This makes the model match the register. With it, "casual chat with a friend" produces lighter suggestions; "technical interview" produces rigorous specifics.
- RECENT_BATCH_TITLES (to avoid repeating these):
- EARLIER CONTEXT (background only, lower priority): ...transcript 2-30s ago...
- MOST RECENT (highest priority — anchor every suggestion here): ...transcript last 30s...

### Suggestion types

| Type | Chip Color | When it fires |
|---|---|---|
| `question_to_ask` | orange | User could dig deeper or look for a risk |
| `talking_point`   | purple | Concrete fact/precedent the user could bring up right now |
| `answer`          | green  | Direct question was just asked — answer it |
| `fact_check`      | yellow | A specific claim was made that's worth verifying or nuancing |
| `clarification`   | blue   | A term was used ambiguously |

The type is the primary visual signal on the card.

### Detailed-answer and chat prompts

When a suggestion card is clicked, a **separate** prompt fires. It knows the clicked suggestion's type and shapes the response accordingly:

- Click a `question_to_ask` → response explains why to ask it, what to listen for, a follow-up
- Click a `talking_point` → response expands the fact, its source, how to frame it in conversation
- Click an `answer` → response provides detailed answer
- Click a `fact_check` → response lays out the corrected claim and the source of confidence
- Click a `clarification` → response defines the term with an example

Free-typed chat uses a third prompt tuned for intent classification — short questions get short answers, thinking-out-loud gets structured back, meta-questions ("summarize the last 5 minutes") use the transcript directly.

---

## Iteration history — what broke and how I fixed it

I ran five test transcripts (technical interview, sales discovery, direct question, claim-for-fact-check, investor pitch) and iterated until the average quality score was 4+ or 5 on these factors: topic-anchor, grounded specificity, and actionability. I assigned scores based on self perception and AI tooling.

The issues I encountered and fixed:

### 1. Hallucinated statistics
**Bug:** Early prompt rule said "every suggestion must contain a concrete element — a number, a named entity, a date." The model sometimes inventing numbers. Outputs like *"Netflix June 2022 Scaling Metadata Service with Redis report"* — This report does not exist.
**Fix:** I rewrote the rule to prioritize being grounded over specificity (hard rule #3) asking to never fabricate numbers, and if you don't know a fact, use `question_to_ask` instead of inventing. I rewrote few-shot examples to demonstrate this.

### 2. Off-topic drift because of anti-repetition
**Bug:** Transcript was clearly about message queues (Kafka, SQS). After 2 batches, the model suggested asking about *databases* — completely unrelated. It was trying so hard to find a "fresh angle" that it switched topics.
**Fix:** I added rule 0 — **topic lock** — above all other rules for suggestions to strictly stay inside the current subject, to the extent that if you cannot generate 3 on-topic suggestions, generate fewer. Added Example 4.

### 4. Whisper hallucinating on silence
**Bug:** When recording continued after the user stopped speaking, Whisper would transcribe silence by echoing the `prompt` parameter (the tail of the previous chunk's transcript passed as prompt bias) back verbatim, many times. "I'm going to create a caching layer on top of DynamoDB" repeated 8 times in a single chunk.
**Fix (explicit tradeoff):** Simple fix was to **detect and drop exact duplicate chunks** before appending to the transcript — a 3-line regex. Suggestions will also no fire if transcript length does not change. User's manual refresh always works.

---

## Default settings — what each knob does and why the default

All defaults live in `src/lib/prompts.ts` under `DEFAULTS`. The goal for each: best quality/latency tradeoff on Groq free tier.

| Setting | Default | Reason |
|---|---|---|
| `suggestionModel` | `openai/gpt-oss-120b` |  |
| `chatModel` | `openai/gpt-oss-120b` |  |
| `transcriptionModel` | `whisper-large-v3` |  |
| `suggestionReasoningEffort` | `medium` | Low reasoning produced visibly less good content — unnamed Netflix stats, generic questions. Medium consistently named real systems and wrote more specific questions. |
| `chatReasoningEffort` | `medium` | User is waiting for depth on chat, so quality > speed. |
| `suggestionContextChars` | 4000 (~2 min of speech) | 8000 was the original default. Dropping to 4000 reduced token cost ~25% with no quality drop — the prompt explicitly tells the model older context is "lower priority" anyway. |
| `detailedAnswerContextChars` | 32000 | Full meeting context for detailed answers. Chat is a rare call so token cost doesn't matter a lot. |
| `chatContextChars` | 32000 | Same. |
| `refreshIntervalMs` | 30000 | Matches chunk duration — a new transcript chunk should trigger a new batch. |
| `chunkDurationMs` | 30000 | Tried 7s (faster first-feedback) but short chunks produced noticeably worse Whisper quality at boundaries, and more of previous chunks would have to be passed to make sense of the current chunk with some context. |
| `suggestionTemperature` | 0.3 | At 0.4 the model occasionally invented creative-sounding but fake facts. 0.3 kept enough variance to avoid repetition across batches and is less prone to making things up. |
| `chatTemperature` | 0.6 | More conversational, so a bit more latitude than suggestions. |
| `recentBatchesForDedup` | 2 | Pass the last 2 batches' first-6-words-of-preview into the "avoid these ideas" list |

Everything in this table is editable via the Settings modal. The user can reset per-prompt or reset everything.
The Groq API key is stored in `localStorage` only — never logged server-side, never sent anywhere but Groq. Every API route forwards the key as a request-scoped header.

---

## Latency

Measured on the deployed Vercel app, Groq dev tier:

| Operation | Target | Measured |
|---|---|---|
| Reload click → first suggestion rendered | < 3s | typically 1.8-2.6s |
| Chat send → first streamed token | < 600ms | typically 400-500ms |
| Transcript chunk → appears in UI | ~1s after chunk ends | ~800ms |

Each batch's header shows its own `generationMs` ("Newest · 11:25:44 AM · 2.6s") so evaluators can verify in real time. The numbers are also in the exported JSON per batch.

**Prompt caching:** The system prompt is byte-identical across calls (it comes from Settings, which doesn't change mid-session). This means Groq's prompt cache fires on call #2 and later, giving 50% token discount and lower TTFT. Confirmed in the Groq dashboard's cache-hit metric.

---

## Known limitations

- Whisper occasionally hallucinates short foreign-language fragments on ambient noise. The exact-duplicate guard catches the common repetition case; occasional single-shot hallucinations may still appear in the transcript. Noted in the iteration history.
- On Groq free tier (8k TPM), continuous conversation can rate-limit after ~2 minutes. The app handles this gracefully with an auto-retry banner; upgrading to dev tier ($5/mo) eliminates it.
- Chrome on Mac occasionally routes the mic to the wrong input device; if transcript is empty or garbled, check System Settings → Microphone.

