import { NextRequest, NextResponse } from "next/server";
import { synthesizeSophNetSpeech } from "@/lib/sophnet/tts";

/**
 * 历史 TTS 代理路由。
 * 原 CosyVoice2-0.5B（SiliconFlow）已下线，统一改由 SophNet cosyvoice-v2 合成，
 * 保留此路径仅为兼容早期调用方；新代码请使用 /api/sophnet/tts。
 */
export async function POST(request: NextRequest) {
  try {
    const { text, input, voice } = await request.json();
    const queryText = input || text;

    if (!queryText) {
      return NextResponse.json({ error: "Input text is required" }, { status: 400 });
    }

    const audioBuffer = await synthesizeSophNetSpeech({
      text: String(queryText).slice(0, 500),
      voice: typeof voice === "string" && !voice.includes("/") ? voice : undefined,
    });

    return new NextResponse(audioBuffer as any, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("[Legacy TTS Proxy Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to synthesize speech" },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryText =
      searchParams.get("input") ||
      searchParams.get("text") ||
      "您好！我是旅行家小玉，很高兴为您提供智游导览解说！";

    const audioBuffer = await synthesizeSophNetSpeech({
      text: queryText.slice(0, 500),
    });

    return new NextResponse(audioBuffer as any, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("[Legacy TTS Proxy GET Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to synthesize speech" },
      { status: 502 }
    );
  }
}
