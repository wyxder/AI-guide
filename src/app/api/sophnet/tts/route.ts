import { NextRequest, NextResponse } from "next/server";
import { synthesizeSophNetSpeech } from "@/lib/sophnet/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** speechRate 以 100 为基准（前端约定），换算为 cosyvoice-v2 的 0.5~2 倍速 */
function toSpeechRate(value: unknown, fallback: number): number {
  const rate = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return fallback;
  return Math.min(2, Math.max(0.5, rate / 100));
}

/** pitch 以 100 为基准，换算为 0.5~2 的音调倍率 */
function toPitchRate(value: unknown, fallback: number): number {
  const pitch = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(pitch) || pitch <= 0) return fallback;
  return Math.min(2, Math.max(0.5, pitch / 100));
}

async function synthesize(text: string, options: {
  voice?: string;
  speechRate?: unknown;
  pitchRate?: unknown;
}): Promise<NextResponse> {
  const trimmed = text.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const audio = await synthesizeSophNetSpeech({
      text: trimmed.slice(0, 500),
      voice: options.voice,
      speechRate: toSpeechRate(options.speechRate, 1),
      pitchRate: toPitchRate(options.pitchRate, 1),
    });

    return new NextResponse(audio as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[SophNet TTS API Error]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await synthesize(String(body.text ?? body.input ?? ""), {
      voice: typeof body.voice === "string" ? body.voice : undefined,
      speechRate: body.speechRate,
      pitchRate: body.pitchRate ?? body.pitch,
    });
  } catch (error) {
    console.error("[SophNet TTS POST Error]", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return await synthesize(
    searchParams.get("text") || searchParams.get("input") || "您好！我是旅行家小玉，很高兴为您提供智游导览解说！",
    {
      voice: searchParams.get("voice") || undefined,
      speechRate: searchParams.get("speechRate"),
      pitchRate: searchParams.get("pitch"),
    }
  );
}
