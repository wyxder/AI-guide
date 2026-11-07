/**
 * GLM-5.3-Flash 视觉模态接入（SophNet 开放网关）
 * 服务 VR「即拍即识」：上传图片 → 返回主景物 / 历史故事 / 拍摄建议。
 *
 * 安全约束：API Key 仅从服务端环境变量 GLM_API_KEY 读取。
 */

export interface RecognitionResult {
  subject: string;
  story: string;
  tip: string;
}

const DEFAULT_BASE_URL = "https://www.sophnet.com/api/open-apis/v1";
const DEFAULT_MODEL = "glm-5.3-flash";

function resolveEndpoint(): string {
  const base = (process.env.GLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return `${base}/chat/completions`;
}

/**
 * 识别图片中的景物。
 * @param base64Data base64 编码后的图片数据（不含 data URL 前缀）
 * @param mimeType 图片 MIME 类型，如 image/jpeg、image/png、image/webp
 * @param contextSpot 可选：游客当前所在景点，用于提升上下文准确度
 */
export async function recognizeImageWithGlm(
  base64Data: string,
  mimeType: string,
  contextSpot?: string
): Promise<RecognitionResult> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error("GLM_API_KEY is not defined in the environment variables.");
  }

  const systemPrompt = `你是翠玉景区的专属AI导览员小玉，精通景区所有景点的历史、文化和自然知识。
${contextSpot ? `当前游客正在参观：${contextSpot}附近区域。` : ""}

请分析图片，识别其中的景物、建筑、植物或自然风光，然后用温暖亲切的语气：
1. 说出识别到的主要景物（30字内）
2. 介绍相关历史文化背景或趣味知识（100字内）
3. 给出游览建议或拍照技巧（50字内）

请用JSON格式回复，且只返回JSON内容本身，包含字段：subject（识别内容）、story（历史/文化介绍）、tip（游览建议）`;

  const response = await fetch(resolveEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GLM_MODEL || DEFAULT_MODEL,
      thinking: { type: process.env.GLM_THINKING === "enabled" ? "enabled" : "disabled" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        },
      ],
      max_tokens: 600 + (Number(process.env.GLM_REASONING_HEADROOM) || 1000),
      stream: false,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.GLM_TIMEOUT_MS) || 35000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GLM Vision API error: ${response.status} - ${errText.slice(0, 300)}`);
  }

  const resultData = await response.json();
  const rawContent = resultData.choices?.[0]?.message?.content ?? "";

  const fallback: RecognitionResult = {
    subject: "您拍摄的景物",
    story: "这是一处充满历史韵味的景点。",
    tip: "建议在晨光或夕阳时分拍摄，效果最佳。",
  };

  try {
    const fenced = rawContent.replace(/```json/gi, "").replace(/```/g, "");
    const match = fenced.match(/\{[\s\S]*\}/);
    if (match) {
      return { ...fallback, ...JSON.parse(match[0]) };
    }
    return { ...fallback, story: rawContent.slice(0, 200) };
  } catch {
    console.error("[recognizeImageWithGlm] JSON parsing failed, raw content:", rawContent);
    return { ...fallback, story: rawContent.slice(0, 200) };
  }
}
