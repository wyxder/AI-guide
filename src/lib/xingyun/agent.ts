"use client";

import type { AgentConversationState, AgentState, AgentASRResult } from "@xmov/avatar/agent";

/**
 * 魔珐星云具身智能体运行管理器（支持「诗仙」与「小美」两个独立驱动应用）。
 *
 * - 只在浏览器执行：SDK 依赖 WebGL2 / WebAudio / WebSocket；
 * - App ID / App Secret 由服务端 `/api/xingyun/config` 同源下发，不写入前端产物；
 * - 单页同一时刻只维持一个实例，页面/组件卸载时销毁，切换形象时按 profile 重建；
 * - 运行态挂在 globalThis 上，确保「渲染组件」与「对话链路」跨 chunk 共享同一实例。
 */

const INIT_TIMEOUT_MS = 60000;

/**
 * 可自愈的瞬态渲染告警：SDK 内部会 forceSyncDecoder / 重建 WebGL 自动恢复，
 * 无需打断用户，也不应覆盖成「加载失败」浮层（常见于主线程繁忙时的 20008 连续丢帧）。
 */
const RECOVERABLE_CODES = new Set([20005, 20006, 20007, 20008, 20009, 60001, 60002, 60004, 60007]);

/** 星云驱动应用档案：shixian=诗仙，xiaomei=小美 */
export type XingyunAgentProfile = "shixian" | "xiaomei";

const PROFILE_LABEL: Record<XingyunAgentProfile, string> = {
  shixian: "诗仙",
  xiaomei: "小美",
};

interface AgentLike {
  init(params?: { onDownloadProgress?: (progress: number) => void }): Promise<void>;
  speak(ssml: string, isStart?: boolean, isEnd?: boolean): string | undefined;
  ask(text: string): Promise<void>;
  startASR(): Promise<void>;
  stopASR(): Promise<void>;
  interrupt(): number;
  destroy(reason?: string): Promise<void>;
  getAgentState(): AgentState;
}

interface XingyunStore {
  agent: AgentLike | null;
  profile: XingyunAgentProfile | null;
  mountingToken: number;
  conversationListeners: Set<(state: AgentConversationState) => void>;
  asrListeners: Set<(result: AgentASRResult) => void>;
  voiceStartListeners: Set<() => void>;
}

export interface XingyunMountHandlers {
  onProgress?: (percent: number) => void;
  onState?: (state: AgentState) => void;
  onConversation?: (state: AgentConversationState) => void;
  onASRResult?: (result: AgentASRResult) => void;
  onError?: (message: string) => void;
}

function getStore(): XingyunStore {
  const scope = globalThis as unknown as { __XINGYUN_STORE__?: XingyunStore };
  if (!scope.__XINGYUN_STORE__) {
    scope.__XINGYUN_STORE__ = {
      agent: null,
      profile: null,
      mountingToken: 0,
      conversationListeners: new Set(),
      asrListeners: new Set(),
      voiceStartListeners: new Set(),
    };
  }
  return scope.__XINGYUN_STORE__;
}

export function subscribeXingyunConversation(cb: (state: AgentConversationState) => void): () => void {
  getStore().conversationListeners.add(cb);
  return () => getStore().conversationListeners.delete(cb);
}

function emitConversation(state: AgentConversationState) {
  getStore().conversationListeners.forEach((cb) => {
    try { cb(state); } catch { /* ignore listener errors */ }
  });
}

/** 订阅星云内置 ASR 识别结果（含中间结果与最终结果） */
export function subscribeXingyunASR(cb: (result: AgentASRResult) => void): () => void {
  getStore().asrListeners.add(cb);
  return () => getStore().asrListeners.delete(cb);
}

function emitASR(result: AgentASRResult) {
  getStore().asrListeners.forEach((cb) => {
    try { cb(result); } catch { /* ignore listener errors */ }
  });
}

/**
 * 订阅「语音真正开始播放」事件。
 *
 * 星云 speak 只是把文本发给服务端，若该驱动应用没有配置语音合成（例如小美），
 * 服务端会静默返回、既不发声也不报错；上层可用本事件判断是否需要用自有 TTS 兜底。
 */
export function subscribeXingyunVoiceStart(cb: () => void): () => void {
  getStore().voiceStartListeners.add(cb);
  return () => getStore().voiceStartListeners.delete(cb);
}

function emitVoiceStart() {
  getStore().voiceStartListeners.forEach((cb) => {
    try { cb(); } catch { /* ignore listener errors */ }
  });
}

async function loadCredentials(profile: XingyunAgentProfile): Promise<{ appId: string; appSecret: string; gatewayServer: string }> {
  const query = profile === "xiaomei" ? "?profile=xiaomei" : "";
  const res = await fetch(`/api/xingyun/config${query}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      profile === "xiaomei"
        ? "小美密钥未配置，请检查 .env 中的 XINGYUN_XIAOMEI_APP_ID / XINGYUN_XIAOMEI_APP_SECRET"
        : "魔珐星云密钥未配置，请检查 .env 中的 XINGYUN_APP_ID / XINGYUN_APP_SECRET",
    );
  }
  const data = await res.json();
  if (!data?.appId || !data?.appSecret) {
    throw new Error("魔珐星云密钥缺失，请联系管理员配置 .env");
  }
  if (!data?.gatewayServer) {
    throw new Error("魔珐星云网关地址缺失，请检查 .env 中的 XINGYUN_GATEWAY_SERVER");
  }
  return {
    appId: data.appId,
    appSecret: data.appSecret,
    gatewayServer: data.gatewayServer,
  };
}

function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** 在指定容器内挂载（或复用）星云数字人实例；默认 profile 为「诗仙」，保持既有行为 */
export async function mountXingyunAgent(
  container: HTMLElement,
  handlers: XingyunMountHandlers = {},
  options: { profile?: XingyunAgentProfile } = {},
): Promise<void> {
  const profile = options.profile ?? "shixian";
  const label = PROFILE_LABEL[profile];
  const store = getStore();
  const token = ++store.mountingToken;
  await destroyXingyunAgent();

  const { appId, appSecret, gatewayServer } = await loadCredentials(profile);
  if (token !== store.mountingToken) return;

  const mod: any = await import("@xmov/avatar/agent");
  const AgentCtor = (mod.default ?? mod.XingyunAvatarAgent) as new (options: Record<string, unknown>) => AgentLike;
  if (typeof AgentCtor !== "function") throw new Error("魔珐星云 SDK 加载失败");

  const agent = new AgentCtor({
    containerId: "",
    container,
    appId,
    appSecret,
    gatewayServer,
    onMessage(error: { code?: string | number; message?: string }) {
      const code = Number(error?.code);
      if (RECOVERABLE_CODES.has(code)) {
        // 丢帧/上下文丢失类告警由 SDK 自行恢复，仅记录日志，不弹错误层
        console.warn(`[xingyun] 渲染告警 ${code}`, error?.message ?? "");
        return;
      }
      handlers.onError?.(`渲染异常 ${error?.code ?? ""} ${error?.message ?? ""}`.trim());
    },
    // 由 SDK 在服务端语音帧真正开始播放时回调，用于判断本次 speak 是否真的有声
    onVoiceStateChange(state: string) {
      if (state === "start") emitVoiceStart();
    },
    agentCallbacks: {
      onAgentStateChange(state: AgentState) {
        handlers.onState?.(state);
      },
      onConversationChange(event: { state: AgentConversationState }) {
        emitConversation(event.state);
        handlers.onConversation?.(event.state);
      },
      onASRResult(result: AgentASRResult) {
        emitASR(result);
        handlers.onASRResult?.(result);
      },
      onError(error: { code?: string; message?: string }) {
        handlers.onError?.(`${error?.code ?? ""} ${error?.message ?? ""}`.trim());
      },
    },
  });

  store.agent = agent;
  store.profile = profile;

  try {
    await withTimeout(
      agent.init({
        onDownloadProgress(progress: number) {
          handlers.onProgress?.(Math.max(0, Math.min(100, Math.round(progress))));
        },
      }),
      INIT_TIMEOUT_MS,
      `${label}资源加载超时，请检查网络后重试`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label}初始化失败`;
    handlers.onError?.(message);
    await agent.destroy("init_failed").catch(() => undefined);
    if (store.agent === agent) {
      store.agent = null;
      store.profile = null;
    }
    throw error;
  }

  if (token !== store.mountingToken) {
    await agent.destroy("superseded").catch(() => undefined);
    if (store.agent === agent) {
      store.agent = null;
      store.profile = null;
    }
    return;
  }

  handlers.onProgress?.(100);
}

function runnableAgent(expectedProfile?: XingyunAgentProfile): AgentLike | null {
  const store = getStore();
  const agent = store.agent;
  if (!agent) return null;
  if (expectedProfile && store.profile !== expectedProfile) return null;
  const state = agent.getAgentState();
  // 官方文档：init 完成即 running；部分版本会短暂停留在 ready，这里一并视为可用
  return state === "running" || state === "ready" ? agent : null;
}

export function isXingyunAgentReady(profile?: XingyunAgentProfile): boolean {
  return !!runnableAgent(profile);
}

/** 星云 speak 需要 SSML 文本；纯文本在部分应用（如小美）下不会发声 */
function toSSML(text: string): string {
  const trimmed = text.trim();
  if (/^<speak[\s>]/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<speak>${escaped}</speak>`;
}

export function speakWithXingyun(text: string, profile?: XingyunAgentProfile): boolean {
  const content = text.trim();
  const agent = runnableAgent(profile);
  if (!content || !agent) return false;
  try {
    const speakId = agent.speak(toSSML(content), true, true);
    // 返回空 speakId 说明本次播报未被服务端接收，交给上层回退到原有 TTS
    return typeof speakId === "string" ? speakId.length > 0 : true;
  } catch {
    return false;
  }
}

/** 打断当前播报（与原有停止播放逻辑串联） */
export function interruptXingyun(profile?: XingyunAgentProfile): void {
  const agent = runnableAgent(profile);
  if (!agent) return;
  try {
    agent.interrupt();
  } catch { /* ignore */ }
}

/** 用星云内置大脑进行文本对话（保留其原生能力，供后续独立语音交互扩展） */
export async function askXingyun(text: string, profile?: XingyunAgentProfile): Promise<boolean> {
  const agent = runnableAgent(profile);
  if (!text.trim() || !agent) return false;
  try {
    await agent.ask(text);
    return true;
  } catch {
    return false;
  }
}

/** 开启星云内置语音识别（需用户手势触发） */
export async function startXingyunASR(profile?: XingyunAgentProfile): Promise<boolean> {
  const agent = runnableAgent(profile);
  if (!agent) return false;
  try {
    await agent.startASR();
    return true;
  } catch {
    return false;
  }
}

/** 停止星云内置语音识别 */
export async function stopXingyunASR(profile?: XingyunAgentProfile): Promise<boolean> {
  const agent = runnableAgent(profile);
  if (!agent) return false;
  try {
    await agent.stopASR();
    return true;
  } catch {
    return false;
  }
}

export async function destroyXingyunAgent(): Promise<void> {
  const store = getStore();
  const agent = store.agent;
  store.agent = null;
  store.profile = null;
  if (!agent) return;
  try {
    await agent.destroy("component_unmount");
  } catch { /* ignore */ }
}
