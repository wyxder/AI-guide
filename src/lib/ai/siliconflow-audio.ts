/**
 * SiliconFlow AI Audio Capability Integration Module
 * Models integrated:
 * - Speech Recognition (ASR): TeleAI/TeleSpeechASR
 *
 * 说明：语音合成已切换到 SophNet cosyvoice-v2（见 src/lib/sophnet/tts.ts）。
 */

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";

/**
 * Transcribe Audio Speech using SiliconFlow TeleAI/TeleSpeechASR model
 */
export async function transcribeSiliconFlowAudio(
  audioBuffer: Buffer | Uint8Array,
  mimeType: string = "audio/wav",
  fileName: string = "audio.wav"
): Promise<string> {
  const apiKey = SILICONFLOW_API_KEY || process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    throw new Error("SILICONFLOW_API_KEY is missing in environment variables");
  }

  const formData = new FormData();
  const uint8 = new Uint8Array(audioBuffer);
  const blob = new Blob([uint8], { type: mimeType });
  formData.append("file", blob, fileName);
  formData.append("model", "TeleAI/TeleSpeechASR");

  const response = await fetch(`${SILICONFLOW_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SiliconFlow ASR API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.text || "";
}
