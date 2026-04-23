"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession, useSettings } from "./store";
import type { Suggestion, SuggestionBatch } from "./types";

/**
 * Hook that orchestrates live-suggestion generation:
 *   - Fires the very first batch as soon as the first transcript chunk lands
 *     (no waiting for the 30s timer — better perceived latency).
 *   - After that, auto-refreshes on the configured interval while recording.
 *   - Drives the countdown displayed in the middle column header.
 *   - Supports manual refresh (resets the countdown).
 *   - Handles dedup by passing the last N batches' titles into the prompt.
 *   - Splits transcript into "earlier context" + "most recent" (recency weight).
 */
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

  // Countdown tick. Only runs while recording.
  const countdownStartRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstBatchFiredRef = useRef<boolean>(false);
  const lastProcessedTranscriptLenRef = useRef(0);
  const lastBatchGeneratedAtRef = useRef<number>(0);
  const lastBatchTranscriptLenRef = useRef<number>(0);    // to skip auto-refresh calls when nothing new has been said.

  const resetCountdown = useCallback(() => {
    countdownStartRef.current = Date.now();
    setAutoRefreshCountdownMs(settings.refreshIntervalMs);
  }, [settings.refreshIntervalMs, setAutoRefreshCountdownMs]);

  // Core generation. True - `manual` user-initiated click
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
        .flatMap((b) => b.suggestions.map((s) => s.preview.split(" ").slice(0,6).join(" ")));

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
        // console.log(`${JSON.stringify(data, null, 2)}`)
        if (resp.status === 429) {
          const retryMs = Number(data.retryAfterMs ?? 15000);
          const retrySec = Math.ceil(retryMs / 1000);
          // rateLimitUntilRef.current = Date.now() + retryMs;
          setLastSuggestionError(`Rate limit reached (Groq free tier: 8k TPM). Retry in ${retrySec}s — or upgrade to dev tier for higher limits.`);
          // setTimeout(() => {
          //   setLastSuggestionError(null);
          //   runOnceRef.current(false);
          // }, retryMs + 500);
          return;
        }
        if (resp.status === 400 && data.error?.includes("invalid JSON")) {
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
        if (!resp.ok) {
          // setLastSuggestionError(data.error ?? "Failed to generate suggestions");
          throw new Error(data.error ?? `HTTP ${resp.status}`);
          // return;
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
        // setLastSuggestionError("Network error. Please check connection and try again.");
        setLastSuggestionError(err?.message ?? "Failed to generate suggestions");
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

    // keep a ref pointing at the latest runOnce. The interval uses this
    // ref instead of capturing runOnce in a closure, so we always call the
    // current version with current transcript.
  const runOnceRef = useRef(runOnce);
    useEffect(() => {
      runOnceRef.current = runOnce;
  }, [runOnce]);

  const runManual = useCallback(() => runOnceRef.current(true), []);

  // Public wrapper so UI callers always count as "manual" and see errors.
  // const runManual = useCallback(() => runOnce(true), [runOnce]);

  useEffect(() => {
    if (isRecording) {
      firstBatchFiredRef.current = false;
      lastProcessedTranscriptLenRef.current = 0
      lastBatchTranscriptLenRef.current = 0;
    }
  }, [isRecording]);

  // Auto-fire the first batch as soon as the first transcript chunk arrives.
  // This removes the "30 seconds of nothing" UX hole.
  useEffect(() => {
    if (
      isRecording &&
      !firstBatchFiredRef.current &&
      transcript.length >= 1 &&
      transcript.map((c) => c.text).join("").trim().length >= 10
    ) {
      firstBatchFiredRef.current = true;
      runOnceRef.current(false);
      // runOnce(false);
    }
  }, [isRecording, transcript]);

  useEffect(() => {
    if (isRecording) {
      lastProcessedTranscriptLenRef.current = transcript.length;
      return;
    }
    // final batch - maybe a late chunk landed (from a pending transcription at stop time)
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
      // const msSinceLastBatch = Date.now() - lastBatchGeneratedAtRef.current;
      // if (msSinceLastBatch < 10_000) {
      //   console.log(
      //     `[orchestrator] skipping stop-triggered call; last batch was ${msSinceLastBatch}ms ago`,
      //   );
      //   return;
      // }
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
        // countdownStartRef.current = Date.now();
        // const currentTranscriptLen = useSession.getState().transcript.length;
        // if (currentTranscriptLen === lastBatchTranscriptLenRef.current) {
        //   console.log("[orchestrator] auto-refresh: transcript unchanged, skipping");
        //   // resetCountdown();
        //   return;
        // }
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
