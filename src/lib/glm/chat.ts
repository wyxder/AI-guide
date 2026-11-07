/**
 * GLM-5.3-Flash 文本模态接入（SophNet 开放网关）
 *
 * 端点：POST https://www.sophnet.com/api/open-apis/v1/chat/completions
 * 协议：OpenAI Chat Completions 兼容，支持 SSE 流式返回。
 *
 * 安全约束：API Key 仅从服务端环境变量 GLM_API_KEY 读取，绝不下发到客户端。
 * 容灾：GLM 超时/异常时自动降级至 Eazo SDK 托管的 deepseek.v3.1。
 */
import { ai } from "@eazo/sdk";

export interface GlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GlmChatOptions {
  messages: GlmMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  model?: string;
}

const DEFAULT_BASE_URL = "https://www.sophnet.com/api/open-apis/v1";
const DEFAULT_MODEL = "glm-5.3-flash";

function resolveEndpoint(): string {
  const base = (process.env.GLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return `${base}/chat/completions`;
}

function resolveTimeout(): number {
  const raw = Number(process.env.GLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 35000;
}

/**
 * 调用 GLM-5.3-Flash 文本能力。
 * stream=true 时返回 SSE 异步迭代器，每个元素为 OpenAI 兼容的 chunk。
 */
export async function glmChat(options: GlmChatOptions) {
  const {
    messages,
    temperature = 0.7,
    max_tokens,
    stream = false,
    model = process.env.GLM_MODEL || DEFAULT_MODEL,
  } = options;

  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error("GLM_API_KEY is not defined in the environment variables.");
  }

  try {
    const reasoningHeadroom = Number(process.env.GLM_REASONING_HEADROOM);
    const reserve = Number.isFinite(reasoningHeadroom) && reasoningHeadroom > 0 ? reasoningHeadroom : 1000;

    const payload: Record<string, unknown> = {
      model,
      messages,
      temperature,
      stream,
      // 该网关对 glm-5.3-flash 的思考开关不生效，模型仍会先输出 reasoning_content，
      // 因此按“业务需要 + 预留思考预算”下发 max_tokens，避免正文被思考链挤空。
      thinking: { type: process.env.GLM_THINKING === "enabled" ? "enabled" : "disabled" },
    };
    if (typeof max_tokens === "number") {
      payload.max_tokens = max_tokens + reserve;
    }

    const response = await fetch(resolveEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      // 非流式：8s 内必须返回；流式：给整段答案留 60s，避免中途截断
      signal: AbortSignal.timeout(stream ? Math.max(resolveTimeout() * 8, 60000) : resolveTimeout()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GLM API error: ${response.status} - ${errorText.slice(0, 300)}`);
    }

    if (!stream) {
      return await response.json();
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    return {
      [Symbol.asyncIterator]: async function* () {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;

              const dataStr = trimmed.slice(5).trim();
              if (dataStr === "[DONE]") continue;

              try {
                yield JSON.parse(dataStr);
              } catch {
                // 忽略不完整的 SSE 分片
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
  } catch (error) {
    console.warn(
      "[GLM Connector] glm-5.3-flash 调用失败，降级至 Eazo SDK deepseek.v3.1：",
      error
    );

    return ai.chat({
      model: "deepseek.v3.1",
      messages: messages as any,
      temperature,
      stream: stream as any,
      max_tokens,
    });
  }
}
