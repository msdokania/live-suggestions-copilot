import { NextRequest, NextResponse } from "next/server";
import { groqTranscribe } from "@/lib/groq";

// Audio uploads are binary; tell Next to not try to parse the body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-groq-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing Groq API key. Paste your key in Settings." },
      { status: 401 },
    );
  }

  const form = await req.formData();
  const audio = form.get("audio");
  const promptBias = (form.get("promptBias") as string) ?? "";
  const model = (form.get("model") as string) ?? "whisper-large-v3";

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio blob" }, { status: 400 });
  }

  try {
    const result = await groqTranscribe(apiKey, audio, { promptBias, model });
    // console.log(`Result from transcribe: ${JSON.stringify(result, null, 2)}`);
    return NextResponse.json({ text: result.text ?? "" });
  } catch (err: any) {
    console.log(`Error from transcribe: ${JSON.stringify(err, null, 2)}`);
    return NextResponse.json(
      { error: err?.message ?? "Transcription failed" },
      { status: 500 },
    );
  }
}
