"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, MicDot } from "./ui";
import { useSession, useSettings } from "@/lib/store";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TranscriptColumn() {
  const { transcript, isRecording, setRecording, appendTranscript } =
    useSession();
  const { settings } = useSettings();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastTranscriptTailRef = useRef<string>(""); // for Whisper promptBias

  const [chunksReceived, setChunksReceived] = useState(0);
  const [inFlight, setInFlight] = useState(0);

  const prevChunkTextRef = useRef<string>("");

  // Auto-scroll to the latest chunk when transcript grows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 100) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript.length]);

  const { start, stop } = useAudioRecorder({
    chunkMs: settings.chunkDurationMs,
    onChunk: async (blob, index) => {
      if (!blob || blob.size < 3000) {
        console.log(`[skip] tiny/empty chunk #${index} size=${blob?.size ?? 0}`);
        return;
      }
      setChunksReceived((n) => n + 1);
      if (!settings.groqApiKey) {
        appendTranscript("[⚠️ Missing API key — paste one in Settings]");
        return;
      }
      setInFlight((n) => n + 1);
      try {
        const form = new FormData();
        form.append("audio", blob, blob.type.includes("mp4") ? "chunk.m4a" : "chunk.webm");
        if (lastTranscriptTailRef.current) {
          form.append("promptBias", lastTranscriptTailRef.current);
        }
        form.append("model", settings.transcriptionModel);

        console.log(`[transcribe] chunk #${index} size=${(blob.size / 1024).toFixed(1)}KB type=${blob.type}`);

        const resp = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "x-groq-key": settings.groqApiKey },
          body: form,
        });
        const data = await resp.json();
        
        if (!resp.ok) {
          const errMsg = String(data.error ?? `HTTP ${resp.status}`);
          appendTranscript(`[⚠️ ${errMsg}]`);
          return;
        }
        const text = (data.text ?? "").trim();
        if (text && text === prevChunkTextRef.current) {
          console.warn(`[transcribe] chunk #${index} is an exact duplicate, dropped`);
          return;
        }
        if (text) {
          prevChunkTextRef.current = text;
          appendTranscript(text);
          lastTranscriptTailRef.current = text.slice(-400);
        } else {
          console.log(`[transcribe] chunk #${index} returned empty text`);
        }
      } catch (err: any) {
        appendTranscript(`[⚠️ ${err?.message ?? "Transcription error"}]`);
      } finally {
        setInFlight((n) => Math.max(0, n - 1));
      }
    },
    onError: (err) => {
      appendTranscript(`[⚠️ Mic error: ${err.message}]`);
      setRecording(false);
    },
  });

  const toggle = async () => {
    if (isRecording) {
      stop();
      setRecording(false);
    } else {
      if (!settings.groqApiKey) {
        alert("Paste your Groq API key in Settings first.");
        return;
      }
      try {
        setChunksReceived(0);
        setInFlight(0);
        await start();
        setRecording(true);
      } catch (err: any) {
        alert(`Microphone permission denied: ${err?.message ?? err}`);
      }
    }
  };

  const statusLine = (() => {
    if (!isRecording && transcript.length === 0) return "Press the mic to start.";
    if (isRecording && chunksReceived === 0)
      return "Listening — first chunk in ~6s…";
    if (inFlight > 0)
      return `Transcribing chunk ${chunksReceived}… (${inFlight} in flight)`;
    if (isRecording)
      return `Listening — ${chunksReceived} chunk${chunksReceived === 1 ? "" : "s"} processed.`;
    return `Stopped — ${chunksReceived} chunk${chunksReceived === 1 ? "" : "s"} total.`;
  })();

  return (
    <Panel
      title="1. Mic & Transcript"
      headerRight={
        <span className="flex items-center gap-2">
          <MicDot active={isRecording} />
          {isRecording ? "Recording" : "Idle"}
        </span>
      }
    >
      <div className="px-4 py-3 border-b border-panel-border shrink-0 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors border ${isRecording
              ? "bg-red-500/90 border-red-400 text-white hover:bg-red-500"
              : "bg-panel-soft border-panel-border text-neutral-300 hover:border-neutral-500"
            }`}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <span className="h-3 w-3 bg-white rounded-sm" />
          ) : (
            <span className="h-3 w-3 bg-red-500 rounded-full" />
          )}
        </button>
        <div className="text-sm text-neutral-300 flex-1 min-w-0 truncate">
          {statusLine}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[14px] leading-relaxed"
      >
        {transcript.length === 0 ? (
          <div className="text-neutral-500 text-sm">
            The transcript will appear here in ~{Math.round(settings.chunkDurationMs / 1000)}-second chunks while
            recording (first chunk at ~6s). Start the mic, talk for a bit, and
            watch the suggestions populate in the middle column.
          </div>
        ) : (
          transcript.map((c) => (
            <div key={c.id} className="flex gap-3">
              <span className="text-neutral-500 text-xs font-mono shrink-0 pt-0.5 tabular-nums">
                {formatTime(c.createdAt)}
              </span>
              <p className="text-neutral-100">{c.text}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
