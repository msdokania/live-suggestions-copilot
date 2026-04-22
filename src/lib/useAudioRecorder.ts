"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Records the mic and emits a complete, self-contained WebM/Opus blob every
 * `chunkMs` milliseconds.
 *
 * Implementation note: we DO NOT use MediaRecorder's `timeslice` parameter.
 * Timeslice produces fragmented WebM chunks that aren't independently
 * decodable — Whisper rejects them. Instead we call .stop() → .start() on a
 * timer, which produces a series of complete, standalone WebM files.
 *
 * Known limitation: the stop/start cycle has a tiny gap (~tens of ms) where
 * mic input is dropped. Acceptable for the assignment; a production build
 * would dual-buffer.
 */
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
        // Immediately start the next recorder if still active.
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

    // Emit the first chunk early so the user sees transcript and suggestions
    // fire within ~6 seconds instead of waiting the full 30s. After the first
    // chunk, we settle into the normal cadence.
    const FIRST_CHUNK_MS = Math.min(7000, opts.chunkMs);

    const scheduleTick = (delayMs: number) => {
      tickRef.current = setTimeout(() => {
        const rec = recorderRef.current;
        if (rec && rec.state === "recording") {
          console.log(`[recorder] tick: stopping recorder to flush chunk`);
          // Ask the recorder to flush any buffered data into ondataavailable,
          // then stop. Not strictly required — stop() triggers ondataavailable
          // automatically — but defensive against some browser quirks.
          // try {
          //   rec.requestData();
          // } catch {
          //   /* not all browsers support this; fine to ignore */
          // }
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
      // Fire a final chunk — onstop will NOT restart because activeRef is false.
      rec.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Safety: tear down on unmount.
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

// // src/lib/audioAnalysis.ts

// /**
//  * Measures the RMS (loudness) of an audio blob to detect silent chunks.
//  * Returns a value in [0, 1] where 0 is dead silence.
//  *
//  * We use this to avoid shipping silent chunks to Whisper — Whisper
//  * hallucinates on silence by echoing the `prompt` parameter repeatedly.
//  */
// export async function measureAudioRMS(blob: Blob): Promise<number> {
//   try {
//     const arrayBuffer = await blob.arrayBuffer();
//     const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
//     const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

//     // Get the first channel; mono mic input is what we care about.
//     const channel = audioBuffer.getChannelData(0);

//     // Compute RMS over the whole buffer.
//     let sumSquares = 0;
//     for (let i = 0; i < channel.length; i++) {
//       sumSquares += channel[i] * channel[i];
//     }
//     const rms = Math.sqrt(sumSquares / channel.length);

//     // Close the context to avoid leaks.
//     audioCtx.close();

//     return rms;
//   } catch (err) {
//     console.warn("[audioAnalysis] RMS measurement failed, defaulting to 'loud enough'", err);
//     return 1; // On measurement failure, assume the chunk is valid — don't drop user audio.
//   }
// }