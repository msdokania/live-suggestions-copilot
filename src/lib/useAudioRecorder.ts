"use client";

import { useCallback, useEffect, useRef } from "react";

export function useAudioRecorder(opts: {
  chunkMs: number;
  onChunk: (blob: Blob, index: number) => void | Promise<void>;
  onError?: (err: Error) => void;
}) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);
  const activeRef = useRef(false);

  const start = useCallback(async () => {
    if (activeRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    activeRef.current = true;
    chunkIndexRef.current = 0;

    const mime = pickMime();

    const startRecorder = () => {
      if (!activeRef.current || !streamRef.current) return;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(
          streamRef.current,
          mime ? { mimeType: mime } : undefined,
        );
      } catch (err: any) {
        opts.onError?.(new Error(`MediaRecorder init failed: ${err?.message ?? err}`));
        return;
      }
      const parts: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          parts.push(e.data);
          console.log(
            `[recorder] fragment: ${(e.data.size / 1024).toFixed(1)}KB (total parts: ${parts.length})`,
          );
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(parts, { type: mime || "audio/webm" });
        const index = chunkIndexRef.current++;
        console.log(
          `[recorder] chunk #${index} flushed: ${(blob.size / 1024).toFixed(1)}KB, ${parts.length} parts`,
        );
        if (blob.size > 0) {
          Promise.resolve(opts.onChunk(blob, index)).catch((err) =>
            opts.onError?.(err instanceof Error ? err : new Error(String(err))),
          );
        }
        if (activeRef.current) startRecorder();
      };

      recorder.onerror = (e: any) => {
        opts.onError?.(new Error(e?.error?.message ?? "MediaRecorder error"));
      };

      recorderRef.current = recorder;
      try {
        recorder.start(1000);
        console.log(`[recorder] started; mime=${mime ?? "default"}; timeslice=1000ms`);
      } catch (err: any) {
        opts.onError?.(new Error(`MediaRecorder start failed: ${err?.message ?? err}`));
      }
    };

    startRecorder();

    const FIRST_CHUNK_MS = Math.min(6000, opts.chunkMs);

    const scheduleTick = (delayMs: number) => {
      tickRef.current = setTimeout(() => {
        const rec = recorderRef.current;
        if (rec && rec.state === "recording") {
          console.log(`[recorder] tick: stopping recorder to flush chunk`);
          rec.stop();
        } else {
          console.log(
            `[recorder] tick: recorder not in 'recording' state (state=${rec?.state ?? "null"})`,
          );
        }
        if (!activeRef.current) return;
        scheduleTick(opts.chunkMs);
      }, delayMs)
    };
    scheduleTick(FIRST_CHUNK_MS);
  }, [opts]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (tickRef.current) {
      clearTimeout(tickRef.current as unknown as ReturnType<typeof setTimeout>);
      tickRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // tear down on unmount.
  useEffect(() => () => stop(), [stop]);

  return { start, stop };
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}