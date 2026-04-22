"use client";

import clsx from "clsx";
import { useEffect } from "react";
import { Panel, IconButton } from "./ui";
import { useSession } from "@/lib/store";
import { useSuggestionOrchestrator } from "@/lib/useSuggestionOrchestrator";
import type { Suggestion, SuggestionType } from "@/lib/types";
import { ThinkingIndicator } from "./ChatColumn";

const TYPE_META: Record<SuggestionType, {
  label: string;
  color: string;        // text color of the chip
  chipBg: string;       // subtle background behind the chip
  ring: string;         // focus ring
  borderStrong: string; // border for newest batch
}> = {
  question_to_ask: {
    label: "Question to Ask",
    color: "text-type-question",
    chipBg: "bg-type-question/10",
    ring: "ring-type-question/40",
    borderStrong: "border-type-clarify/40",
  },
  talking_point: {
    label: "Talking Point",
    color: "text-type-talking",
    chipBg: "bg-type-talking/10",
    ring: "ring-type-talking/40",
    borderStrong: "border-type-clarify/40",
  },
  answer: {
    label: "Answer",
    color: "text-type-answer",
    chipBg: "bg-type-answer/10",
    ring: "ring-type-answer/40",
    borderStrong: "border-type-clarify/40",
  },
  fact_check: {
    label: "Fact-Check",
    color: "text-type-factcheck",
    chipBg: "bg-type-factcheck/10",
    ring: "ring-type-factcheck/40",
    borderStrong: "border-type-clarify/40",
  },
  clarification: {
    label: "Clarification",
    color: "text-type-clarify",
    chipBg: "bg-type-clarify/10",
    ring: "ring-type-clarify/40",
    borderStrong: "border-type-clarify/40",
  },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SuggestionsColumn({
  onSuggestionClick,
}: {
  onSuggestionClick: (s: Suggestion) => void;
}) {
  const {
    batches,
    isGeneratingSuggestions,
    lastSuggestionError,
    autoRefreshCountdownMs,
    isRecording,
  } = useSession();
  const { runOnce } = useSuggestionOrchestrator();

  const countdownSec = Math.ceil(autoRefreshCountdownMs / 1000);

  return (
    <Panel
      title="2. Live Suggestions"
      headerRight={
        <span>
          {batches.length} {batches.length === 1 ? "batch" : "batches"}
        </span>
      }
    >
      <div className="px-4 py-3 border-b border-panel-border shrink-0 flex items-center justify-between">
        <IconButton
          onClick={runOnce}
          disabled={isGeneratingSuggestions}
          title="Generate a fresh batch of 3 suggestions now"
        >
          {isGeneratingSuggestions ? (
            <>
              <Spinner /> Generating…
            </>
          ) : (
            <>↻ Reload suggestions</>
          )}
        </IconButton>
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">
          {isRecording
            ? `Auto-refresh in ${countdownSec}s`
            : "Auto-refresh paused"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {lastSuggestionError && 
          <div
            className={clsx(
              "text-sm rounded-md px-3 py-2 border",
              /rate limit/i.test(lastSuggestionError)
                ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                : "text-red-400 bg-red-500/10 border-red-500/20",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="break-all">⚠️ {lastSuggestionError}</span>
            </div>
          </div>
        // (
        //   <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
        //     {lastSuggestionError}
        //   </div>
        // )
        }

        {batches.length === 0 && !isGeneratingSuggestions && (
          <div className="text-neutral-500 text-sm">
            Suggestions will appear here as the conversation unfolds. Each batch
            contains 3 fresh, context-anchored ideas — questions to ask,
            talking points, answers to questions just asked, or fact-checks.
            The newest batch appears on top.
          </div>
        )}

        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className="space-y-2.5">
            {batchIdx > 0 && (
              <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-neutral-600 py-1">
                <span className="flex-1 h-px bg-neutral-800" />
                <span>
                  Batch {batches.length - batchIdx} · {formatTime(batch.createdAt)}
                  {batch.generationMs
                    ? ` · ${(batch.generationMs / 1000).toFixed(1)}s`
                    : ""}
                </span>
                <span className="flex-1 h-px bg-neutral-800" />
              </div>
            )}
            {batchIdx === 0 && batch.generationMs && (
              <div className="text-[10px] tracking-widest uppercase text-neutral-600">
                Newest · {formatTime(batch.createdAt)} ·{" "}
                {(batch.generationMs / 1000).toFixed(1)}s
              </div>
            )}
            {/* {batchIdx === 0 && isGeneratingSuggestions && (
              <ThinkingIndicator message="Genarating Suggestions" />
            )} */}
            {batch.suggestions.map((s, i) => (
              <SuggestionCard
                key={`${batch.id}-${i}`}
                suggestion={s}
                onClick={() => onSuggestionClick(s)}
                faded={batchIdx > 0}
                isGenerating={isGeneratingSuggestions}
              />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SuggestionCard({
  suggestion,
  onClick,
  faded,
  isGenerating
}: {
  suggestion: Suggestion;
  onClick: () => void;
  faded?: boolean;
  isGenerating?: boolean;
}) {
  const meta = TYPE_META[suggestion.type];
  return (
    <button
      type="button"
      onClick={onClick}
      // title={suggestion.sourceHint || undefined}
      className={clsx(
        // "w-full text-left rounded-lg border border-panel-border bg-panel-soft px-4 py-3",
        // "hover:border-neutral-500 hover:bg-[#1a1e27] transition-colors",
        // "focus:outline-none focus:ring-2 ring-offset-0",
        "w-full text-left rounded-lg px-4 py-3 transition-all",
        "hover:bg-[#1a1e27]",
        "focus:outline-none focus:ring-2 ring-offset-0",
        meta.ring,
        // faded && "opacity-75",
        faded
          ? "border border-panel-border bg-panel-soft/60 opacity-70 hover:opacity-90"
          : clsx(
              "border bg-panel-soft shadow-sm transition-all",
              meta.borderStrong,
              isGenerating &&
              "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_12px_rgba(99,102,241,0.35)]"
            ),
      )}
    >
      <div
        className="mb-1.5"
        // {clsx(
        //   "text-[10px] font-semibold tracking-widest uppercase mb-1.5",
        //   meta.color,
        // )}
      >
        <span
          className={clsx(
            "inline-block text-[10px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded",
            meta.chipBg,
            meta.color,
          )}
          >
            {meta.label}
          </span>
        {/* {meta.label} */}
      </div>
      {/* <div className="text-[14px] text-white font-medium leading-snug mb-1">
        {suggestion.title}
      </div> */}
      {/* <div className="text-[13px] text-neutral-300 leading-relaxed"> */}
      <div className={clsx(
          "text-[13px] leading-relaxed",
          faded ? "text-neutral-400" : "text-neutral-300",
        )}>
        {suggestion.preview}
      </div>
    </button>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-neutral-500 border-t-white animate-spin" />
  );
}
