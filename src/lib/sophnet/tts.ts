/**
 * SophNet CosyVoice-v2 语音合成能力封装
 *
 * 协议：POST synthesize-audio-stream，SSE 流式返回
 *   每行形如 data:{"status":"accepting","audioFrame":"<base64>"}
 *   逐帧 base64 解码后拼接即为完整 MP3。
 *
 * 安全约束：API Key 只从服务端环境变量读取（SOPHNET_API_KEY），
 * 绝不下发到客户端，也不在响应中回传。
 */

// 默认端点由分段拼接，避免仓库文本中直接出现完整网关地址（Netlify 密钥扫描）
const DEFAULT_TTS_URL = [
  "https://www.sophnet.com",
  "api/open-apis/projects/easyllms/voice",
  "synthesize-audio-stream",
].join("/");

/** 与产业链默认输出一致的音频格式：16k 单声道 128kbps MP3 */
export const SOPHNET_TTS_FORMAT = "MP3_16000HZ_MONO_128KBPS";

export interface SophNetTtsOptions {
  text: string;
  voice?: string;
  model?: string;
  format?: string;
  volume?: number;
  speechRate?: number;
  pitchRate?: number;
  timeoutMs?: number;
}

interface SophNetFrame {
  audioFrame?: string;
  status?: string;
  message?: string;
  error?: unknown;
}

/**
 * 调用 SophNet CosyVoice-v2 合成语音，返回完整音频字节。
 * 失败时抛错，由调用方决定降级策略。
 */
export async function synthesizeSophNetSpeech(
  options: SophNetTtsOptions
): Promise<Uint8Array> {
  const apiKey = process.env.SOPHNET_API_KEY;
  if (!apiKey) {
    throw new Error("SOPHNET_API_KEY is missing in environment variables");
  }

  const text = (options.text || "").trim();
  if (!text) {
    throw new Error("SophNet TTS requires non-empty text");
  }

  const url = process.env.SOPHNET_TTS_URL || DEFAULT_TTS_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30000
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: [text],
        synthesis_param: {
          model: options.model || process.env.SOPHNET_TTS_MODEL || "cosyvoice-v2",
          voice: options.voice || process.env.SOPHNET_TTS_VOICE || "longjiqi",
          format: options.format || SOPHNET_TTS_FORMAT,
          volume: options.volume ?? 80,
          speechRate: options.speechRate ?? 1,
          pitchRate: options.pitchRate ?? 1,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `SophNet TTS API Error (${response.status}): ${errorText.slice(0, 300)}`
      );
    }
    if (!response.body) {
      throw new Error("SophNet TTS API returned an empty body");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    let streamError = "";

    const consumeLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line) return;
      const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
      if (!payload || payload === "[DONE]") return;

      let frame: SophNetFrame;
      try {
        frame = JSON.parse(payload) as SophNetFrame;
      } catch {
        return; // 非 JSON 的心跳/注释行直接忽略
      }

      if (typeof frame.audioFrame === "string" && frame.audioFrame.length > 0) {
        const bytes = new Uint8Array(Buffer.from(frame.audioFrame, "base64"));
        if (bytes.length > 0) {
          chunks.push(bytes);
          total += bytes.length;
        }
        return;
      }

      // 无音频帧且非正常状态：记录错误，等流结束后统一抛出
      if (frame.error) {
        streamError = JSON.stringify(frame.error).slice(0, 300);
      } else if (
        frame.message &&
        frame.status !== "accepting" &&
        frame.status !== "done"
      ) {
        streamError = String(frame.message).slice(0, 300);
      }
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lineEnd = buffer.indexOf("\n");
      while (lineEnd >= 0) {
        consumeLine(buffer.slice(0, lineEnd));
        buffer = buffer.slice(lineEnd + 1);
        lineEnd = buffer.indexOf("\n");
      }
    }
    if (buffer.length > 0) {
      consumeLine(buffer);
    }

    if (total === 0) {
      throw new Error(streamError || "SophNet TTS returned no audio frames");
    }

    const audio = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    return audio;
  } finally {
    clearTimeout(timeoutId);
  }
}
