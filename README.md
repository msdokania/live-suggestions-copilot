# Live Suggestions Copilot

An AI-powered live meeting copilot. Speak into your mic; the app transcribes what you're saying in 30-second chunks, generates 3 context-aware suggestions every 30 seconds based on the most recent content, and lets you click any suggestion or type a free-form question to get a detailed streaming answer grounded in the full meeting transcript.

**Three columns, one browser tab:**
- **Left:** mic control and scrolling transcript
- **Middle:** live suggestions (question to ask, talking point, answer, fact-check, or clarification — color-coded by type)
- **Right:** streaming chat for detailed answers

**[Live demo →](https://...vercel.app)** · Paste your Groq API key once, press the mic, start talking. Everything runs session-only — nothing is stored.

---

## Quick start (Setup)

```bash
git clone https://github.com/msdokania/live-suggestions-copilot.git
cd twinmind-live-suggestions
npm install
npm run dev          # http://localhost:3000
```

On first load, the Settings modal opens. Paste a [Groq API key](https://console.groq.com/keys). Optionally write a one-line meeting context (e.g. "technical interview, I'm the candidate" or "casual chat with a friend"). Close and press the red mic button.

- Transcript chunks arrive every ~30s while recording.
- A fresh batch of 3 suggestions auto-generates on the same session. The "Reload suggestions" button triggers a manual refresh; the countdown in the middle column shows when the next auto-refresh fires.
- Click a suggestion card → it seeds a streaming detailed answer in the chat panel.
- Type a question directly → same chat panel, different prompt tuned for free-form dialogue.
- **Export** button packages the full session (transcript + every batch + chat + timestamps) as JSON.

Works on Safari and Chrome. Safari had MediaRecorder specifics that required specific handling.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16 (App Router)** + TypeScript | API routes and UI in one deployable unit. One `vercel deploy` and you have a public URL. |
| State | **Zustand** | Session state in-memory (to maintain storage session-only). Settings persisted to `localStorage`. |
| Styling | **Tailwind**, no component library | The three-column UI is small enough that one `ui.tsx` primitive file covers it. |
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
2. **Topic lock.** (refer prompt hard rule #0) Every suggestion stays inside the subject of the most recent transcript. To prevent drift. If it can not at all find suggestions on the topic, then it can reduce number of suggestions, but never show irrelevant suggestions.
3. **Recency weight.** The last chunk matters more than the previous two minutes. So split context into `EARLIER CONTEXT` (background) and `MOST RECENT (highest priority)`. The prompt explicitly instructs anchoring to the most recent chunk, for suggestions to be relevant.
4. **Type diversity with a conditional exception.** Batches of 3 mix at least two different types. Exception: if a direct question was just asked, one suggestion must be type `answer` with the actual answer in `preview`.
5. **Standalone value.** `preview` delivers value without clicking. No teasers ("want to know more?"). Since a user may never click, the preview itself is the deliverable.
6. **Anti-repetition.** The first 6 words of each suggestion's `preview` from the last 2 batches are passed into the new prompt as an "avoid these ideas" list. The prompt instructs "find fresh angles within the same topic", so as not to cause topic drift.
7. **Prompt-cache friendly.** The system prompt is byte-identical across calls. Groq's prompt cache gives 50% token discount on warm calls. Dynamic context (transcript, dedup list, meeting context) goes last in the prompt.

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


**`DEFAULT_DETAILED_ANSWER_SYSTEM_PROMPT`** fires when the user clicks a suggestion. It knows the clicked suggestion's type and routes the response shape accordingly:
- Click a `question_to_ask` → response explains why to ask it, what to listen for, a follow-up
- Click a `talking_point` → response expands the fact, its source, how to frame it in conversation
- Click an `answer` → response provides detailed answer
- Click a `fact_check` → response lays out the corrected claim and the source of confidence
- Click a `clarification` → response defines the term with an example

**`DEFAULT_CHAT_SYSTEM_PROMPT`** fires on free-typed input. It handles unconstrained user messages with an explicit intent-classification step:
- Specific question about the meeting ("what did they say about Kafka?") → use the transcript
- General question → direct answer with concrete knowledge
- Thinking out loud → help the user structure the decision, don't just validate
- Meta-question ("summarize the last 5 minutes") → deliver what was asked from the transcript

---

## Iteration history — what broke and how I fixed it

I ran five test transcripts across different meeting types (technical interview as candidate, sales discovery call as seller, direct-question-needing-answer, claim-that-needs-fact-check, investor pitch) and iterated until quality scores hit the target.

### Scoring methodology

I scored each batch manually on a 1-5 rubric across three dimensions:
- **Topic anchor** — does every suggestion connect to the most recent transcript? (5 = all three do, 1 = none do)
- **Grounded specificity** — if a number or name appears, is it verifiable? (5 = all verifiable, 3 = plausible-but-unverified, 1 = obviously fabricated)
- **Actionability** — if I were actually in this meeting, would I use any of these? (5 = 2+ I'd use, 3 = one I might, 1 = none)

Target: average 4+ across all batches across all 5 test transcripts. I iterated on the prompts until I hit it.

The issues I encountered and fixed to improve scores:

### 1. Hallucinated statistics
**Bug:** Early prompt rule said "every suggestion must contain a concrete element — a number, a named entity, a date." The model sometimes started inventing numbers and outputs like *"Netflix June 2022 Scaling Metadata Service with Redis report"* — where this report does not exist. **Fix:** I rewrote the rule to prioritize being grounded over specificity (hard rule #3) asking to never fabricate numbers, and if you don't know a fact, use `question_to_ask` instead of inventing. I rewrote few-shot examples to demonstrate this.

### 2. Off-topic drift because of anti-repetition
**Bug:** Transcript was clearly about message queues (Kafka, SQS). But after 2 batches, the model suggested asking about *databases*, which was completely unrelated. It was trying so hard to find a "fresh angle" that it switched topics. **Fix:** I added rule 0 — **topic lock** — above all other rules for suggestions to strictly stay inside the current subject, to the extent that if you cannot generate 3 on-topic suggestions, generate fewer. Added Example 4.

### 3. Suggestion generation latency >2s
The original schema had each suggestion output `type + title + preview + reasoning + sourceHint + confidence` — 6 fields. The `reasoning` field explained why the suggestion was surfaced; `sourceHint` pointed to the specific transcript phrase. Both were shown in the UI as tooltips. **In practice, users don't hover during live meetings.** These fields were costing extra tokens and I dropped them as well as `title` and `confidence` as they were redundant. Latency improved by ~300ms per batch with no quality loss (the model still does the reasoning internally; it just doesn't emit it).

### 4. Context window, suggestion temperature, suggestion reasoning effort
The suggestion prompt was sending ~2000 tokens of "earlier context" as background. This was a lot of tokens for content the prompt explicitly tells the model is "lower priority." Halving to 4000 chars (~2 min of speech) reduced token cost. I also set a stricter temperature and changed the reasoning effort from low to medium for higher quality of suggestions.

### 5. Whisper hallucinating on silence
**Bug:** When recording continued after the user stopped speaking, Whisper would transcribe silence by echoing the `prompt` parameter (the tail of the previous chunk's transcript passed as prompt bias) back verbatim, many times. "I'm going to create a caching layer on top of DynamoDB" repeated 8 times in a single chunk since I had left the mic running. **Fix (explicit tradeoff):** Simple fix was to detect and drop exact duplicate chunks before appending to the transcript — a 3-line regex. Suggestions will also no fire if transcript length does not change. User's manual refresh always works.

---

## Default settings — what each knob does and why the default

All defaults live in `src/lib/prompts.ts` under `DEFAULTS`. The goal for each: best quality/latency tradeoff on Groq free tier.

| Setting | Default | Reason |
|---|---|---|
| `suggestionModel` | `openai/gpt-oss-120b` | As required |
| `chatModel` | `openai/gpt-oss-120b` | As required |
| `transcriptionModel` | `whisper-large-v3` | As required |
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

## Error handling

Errors are categorized, handled according to severity, and surfaced without crashing the session.

**Transcription errors** (`/api/transcribe`)
- Missing API key → prompt user to open Settings
- Audio-too-short (from Groq's 0.01s minimum) → silently dropped; benign, happens on mic stabilization
- Rate limit (429) → surface with retry suggestion
- Network failure or 500 → surfaced as `[⚠️ ...]` in transcript so user knows a chunk was lost

**Suggestion errors** (`/api/suggest`)
- Rate limit (429) → parsed from Groq's "Please try again in Ns" message. Surfaced as an amber banner in the middle column with a live countdown. Auto-retries when the window clears. User can continue recording during the pause.
- Invalid JSON from model (400) → retries the request once. Most JSON-validate failures are non-deterministic — same input on retry usually succeeds.
- Missing API key → amber banner prompts user to open Settings
- 500 / network → red banner with the actual error message; user can hit Reload manually

**Chat errors** (`/api/chat`)
- Streaming errors mid-response → the partial content stays; error appended to the assistant message as `⚠️ <reason>`
- Missing API key → same banner flow
- 429 → inline error in the assistant bubble; user can retry by resending

**Double-call prevention**
- `inFlightRef` synchronous guard prevents the auto-refresh interval from firing a second Groq call while one is already in flight (state updates from `useState` are async; refs update synchronously).
- Transcript-unchanged guard prevents wasted calls when user is recording in silence.
- Stop-triggered debounce prevents a final-chunk call from firing within 10s of a regular auto-refresh call.

---

## Latency

Measured on the deployed Vercel app, Groq dev tier:

| Operation | Target | Measured |
|---|---|---|
| Reload click → first suggestion rendered (medium reasoning) | < 3s | typically **2.2-2.6s** |
| Reload click → first suggestion rendered (low reasoning) | < 1.5s | typically **~1.0s** |
| Transcript chunk → appears in UI after 30s chunk ends | ~1s | ~800ms |

Each batch's header shows its own `generationMs` ("Newest · 11:25:44 AM · 2.3s") so evaluators can verify in real time. The numbers are also in the exported JSON per batch.

---

## Known limitations

- Whisper occasionally hallucinates short foreign-language fragments on ambient noise. The exact-duplicate guard catches the common repetition case; occasional single-shot hallucinations may still appear in the transcript. Noted in the iteration history.
- On Groq free tier (8k TPM), continuous conversation can rate-limit after ~2 minutes. The app handles this gracefully with an auto-retry banner; upgrading to dev tier ($5/mo) eliminates it.
- Chrome on Mac occasionally routes the mic to the wrong input device; if transcript is empty or garbled, check System Settings → Microphone or System Settings → Sound → Input.

