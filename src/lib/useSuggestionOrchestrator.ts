"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession, useSettings } from "./store";
import type { Suggestion, SuggestionBatch } from "./types";

/**
 * Hook that orchestrates live-suggestion generation:
 *   - Fires the very first batch as soon as the first transcript chunk lands & auto-refreshes on the configured interval while recording.
 *   - Drives the countdown displayed in the middle column header.
 *   - Supports manual refresh (resets the countdown).
 *   - Handles dedup by passing the last N batches' titles into the prompt.
\ */
export function useSuggestionOrchestrator() {
  const {
    transcript,
    batches,
    isRecording,
    isGeneratingSuggestions,
    setGeneratingSuggestions,
    addBatch,
    setLastSuggestionError,
    setAutoRefreshCountdownMs,
  } = useSession();
  const { settings } = useSettings();

  const countdownStartRef = useRef<number>(Date.now());     // Only runs while recording.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstBatchFiredRef = useRef<boolean>(false);
  const lastProcessedTranscriptLenRef = useRef(0);
  const lastBatchGeneratedAtRef = useRef<number>(0);
  const lastBatchTranscriptLenRef = useRef<number>(0);    // to skip auto-refresh calls when nothing new has been said.

  const resetCountdown = useCallback(() => {
    countdownStartRef.current = Date.now();
    setAutoRefreshCountdownMs(settings.refreshIntervalMs);
  }, [settings.refreshIntervalMs, setAutoRefreshCountdownMs]);

  const runOnce = useCallback(
    async (manual: boolean = true) => {
      if (isGeneratingSuggestions) return;
      if (!settings.groqApiKey) {
        if (manual) {
          setLastSuggestionError(
            "Missing Groq API key. Open Settings (gear icon) and paste one.",
          );
        }
        return;
      }

      const fullText = transcript.map((c) => c.text).join("\n");
      const mostRecent = transcript[transcript.length - 1]?.text ?? "";
      const earlier = (() => {
        const joined = transcript.slice(0, -1).map((c) => c.text).join("\n");
        const maxChars = settings.suggestionContextChars;
        if (joined.length <= maxChars) return joined;
        return "…" + joined.slice(-maxChars);
      })();

      if (fullText.trim().length < 10) {
        if (manual) {
          setLastSuggestionError(
            "Not enough transcript yet — start speaking or wait for the first chunk (~6s).",
          );
        }
        return;
      }

      const recentBatchTitles = batches
        .slice(0, settings.recentBatchesForDedup)
        .flatMap((b) => b.suggestions.map((s) => s.preview.split(" ").slice(0, 15).join(" ")));

      setGeneratingSuggestions(true);
      setLastSuggestionError(null);

      try {
        var resp = await fetch("/api/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-groq-key": settings.groqApiKey,
          },
          body: JSON.stringify({
            systemPrompt: settings.suggestionSystemPrompt,
            model: settings.suggestionModel,
            meetingContext: settings.meetingContext,
            reasoningEffort: settings.suggestionReasoningEffort,
            temperature: settings.suggestionTemperature,
            transcriptWindow: earlier,
            mostRecent,
            recentBatchTitles,
          }),
        });

        var data = await resp.json();

        if (resp.status === 429) {
          const retryMs = Number(data.retryAfterMs ?? 15000);
          const retrySec = Math.ceil(retryMs / 1000);
          if (data.error === "daily_limit") {
            const mins = Math.ceil(retrySec / 60);
            setLastSuggestionError(
              `Daily rate limit reached. Resets in ~${mins} minute${mins === 1 ? "" : "s"}. Upgrade to Groq Dev Tier for higher limits.`,
            );
            return;
          } else {
            setLastSuggestionError(
              `Rate limited (Groq free tier: 8k TPM). Retrying in ${retrySec}s…`,
            );
            setTimeout(() => { setLastSuggestionError(null); runOnceRef.current(false); }, retryMs + 500);
            return;
          }
        }
        if (resp.status === 400 && data.error === "invalid_json") {
          console.warn("[orchestrator] Model emitted invalid JSON, retrying once");
          await new Promise(r => setTimeout(r, 300));
          const retryResp = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-groq-key": settings.groqApiKey },
            body: JSON.stringify({
              systemPrompt: settings.suggestionSystemPrompt,
              model: settings.suggestionModel,
              meetingContext: settings.meetingContext,
              reasoningEffort: settings.suggestionReasoningEffort,
              temperature: settings.suggestionTemperature,
              transcriptWindow: earlier,
              mostRecent,
              recentBatchTitles,
            }),
          });
          if (retryResp.ok) {
            resp = retryResp;
            data = await retryResp.json();
          }
        }
        if (resp.status === 401) {
          setLastSuggestionError("Missing or invalid Groq API key. Open Settings to paste one.");
          return;
        }
        if (!resp.ok) {
          setLastSuggestionError(
            data.error === "no_valid_suggestions"
              ? "Couldn't generate suggestions from this audio. Try speaking for longer."
              : "Something went wrong generating suggestions. Try the Reload button.",
          );
          return;
        }

        const batch: SuggestionBatch = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          suggestions: data.suggestions as Suggestion[],
          generationMs: data.generationMs,
        };
        addBatch(batch);
        lastBatchGeneratedAtRef.current = Date.now();
        lastBatchTranscriptLenRef.current = transcript.length;
      } catch (err: any) {
        setLastSuggestionError("Network error. Please check connection and try again.");
      } finally {
        setGeneratingSuggestions(false);
        resetCountdown();
      }
    },
    [
      addBatch,
      batches,
      isGeneratingSuggestions,
      resetCountdown,
      setGeneratingSuggestions,
      setLastSuggestionError,
      settings,
      transcript,
    ],
  );

  const runOnceRef = useRef(runOnce);
  useEffect(() => {
    runOnceRef.current = runOnce;
  }, [runOnce]);

  const runManual = useCallback(() => runOnceRef.current(true), []);

  useEffect(() => {
    if (isRecording) {
      firstBatchFiredRef.current = false;
      lastProcessedTranscriptLenRef.current = 0
      lastBatchTranscriptLenRef.current = 0;
    }
  }, [isRecording]);

  // Auto-fire the first batch as soon as the first transcript chunk arrives -
  useEffect(() => {
    if (
      isRecording &&
      !firstBatchFiredRef.current &&
      transcript.length >= 1 &&
      transcript.map((c) => c.text).join("").trim().length >= 10
    ) {
      firstBatchFiredRef.current = true;
      runOnceRef.current(false);
    }
  }, [isRecording, transcript]);

  // final batch -
  useEffect(() => {
    if (isRecording) {
      lastProcessedTranscriptLenRef.current = transcript.length;
      return;
    }
    if (
      transcript.length > lastProcessedTranscriptLenRef.current &&
      transcript.map((c) => c.text).join("").trim().length >= 10
    ) {
      lastProcessedTranscriptLenRef.current = transcript.length;
      if (transcript.length <= lastBatchTranscriptLenRef.current) {
        console.log(
          `[orchestrator] skipping catch-up; last batch already covered transcript len ${transcript.length}`,
        );
        return;
      }
      runOnceRef.current(false);
    }
  }, [isRecording, transcript]);

  // Auto-refresh loop
  useEffect(() => {
    if (!isRecording) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    resetCountdown();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - countdownStartRef.current;
      const remaining = settings.refreshIntervalMs - elapsed;
      setAutoRefreshCountdownMs(Math.max(0, remaining));
      if (remaining <= 0) {
        runOnceRef.current(false);
      }
    }, 250);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, settings.refreshIntervalMs]);

  return { runOnce: runManual };
}
