import { NextRequest, NextResponse } from "next/server";

/**
 * 伴游FM 音频接口（兼容入口）
 * 返回本地真实音乐文件，不再走 TTS 语音合成，保证即点即播。
 * 前端已直接使用 /audio/fm/*.mp3，此接口供旧链接 / 端侧调用。
 */
const TRACK_IDS = new Set([
  "heritage", "celebrities", "history", "food", "life", "landmarks", "legends",
]);

export async function GET(request: NextRequest) {
  const requested = new URL(request.url).searchParams.get("track") || "history";
  const track = TRACK_IDS.has(requested) ? requested : "history";
  return NextResponse.redirect(new URL(`/audio/fm/${track}.mp3`, request.url));
}
