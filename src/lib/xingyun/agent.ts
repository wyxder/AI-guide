"use client";

import type { AgentConversationState, AgentState } from "@xmov/avatar/agent";

/**
 * 魔珐星云具身智能体「诗仙」运行管理器。
 *
 * - 只在浏览器执行：SDK 依赖 WebGL2 / WebAudio / WebSocket；
 * - App ID / App Secret 由服务端 `/api/xingyun/config` 同源下发，不写入前端产物；
 * - 单页仅维持一个实例，页面/组件卸载时销毁；
 * - 运行态挂在 globalThis 上，确保「渲染组件」与「对话链路」跨 chunk 共享同一实例。
 */

const DEFAULT_GATEWAY = "https://nebula-agent.xingyun3d.com/user/v1/ttsa_v2/session";
const INIT_TIMEOUT_MS = 60000;

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
  mountingToken: number;
  conversationListeners: Set<(state: AgentConversationState) => void>;
}

export interface XingyunMountHandlers {
  onProgress?: (percent: number) => void;
  onState?: (state: AgentState) => void;
  onConversation?: (state: AgentConversationState) => void;
  onError?: (message: string) => void;
}

function getStore(): XingyunStore {
  const scope = globalThis as unknown as { __XINGYUN_STORE__?: XingyunStore };
  if (!scope.__XINGYUN_STORE__) {
    scope.__XINGYUN_STORE__ = {
      agent: null,
      mountingToken: 0,
      conversationListeners: new Set(),
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

async function loadCredentials(): Promise<{ appId: string; appSecret: string; gatewayServer: string }> {
  const res = await fetch("/api/xingyun/config", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("魔珐星云密钥未配置，请检查 .env 中的 XINGYUN_APP_ID / XINGYUN_APP_SECRET");
  }
  const data = await res.json();
  if (!data?.appId || !data?.appSecret) {
    throw new Error("魔珐星云密钥缺失，请联系管理员配置 .env");
  }
  return {
    appId: data.appId,
    appSecret: data.appSecret,
    gatewayServer: data.gatewayServer || DEFAULT_GATEWAY,
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

/** 在指定容器内挂载（或复用）诗仙数字人实例 */
export async function mountXingyunAgent(container: HTMLElement, handlers: XingyunMountHandlers = {}): Promise<void> {
  const store = getStore();
  const token = ++store.mountingToken;
  await destroyXingyunAgent();

  const { appId, appSecret, gatewayServer } = await loadCredentials();
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
      handlers.onError?.(`渲染异常 ${error?.code ?? ""} ${error?.message ?? ""}`.trim());
    },
    agentCallbacks: {
      onAgentStateChange(state: AgentState) {
        handlers.onState?.(state);
      },
      onConversationChange(event: { state: AgentConversationState }) {
        emitConversation(event.state);
        handlers.onConversation?.(event.state);
      },
      onError(error: { code?: string; message?: string }) {
        handlers.onError?.(`${error?.code ?? ""} ${error?.message ?? ""}`.trim());
      },
    },
  });

  store.agent = agent;

  try {
    await withTimeout(
      agent.init({
        onDownloadProgress(progress: number) {
          handlers.onProgress?.(Math.max(0, Math.min(100, Math.round(progress))));
        },
      }),
      INIT_TIMEOUT_MS,
      "诗仙资源加载超时，请检查网络后重试",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "诗仙初始化失败";
    handlers.onError?.(message);
    await agent.destroy("init_failed").catch(() => undefined);
    if (store.agent === agent) store.agent = null;
    throw error;
  }

  if (token !== store.mountingToken) {
    await agent.destroy("superseded").catch(() => undefined);
    if (store.agent === agent) store.agent = null;
    return;
  }

  handlers.onProgress?.(100);
}

function runnableAgent(): AgentLike | null {
  const agent = getStore().agent;
  if (!agent) return null;
  const state = agent.getAgentState();
  // 官方文档：init 完成即 running；部分版本会短暂停留在 ready，这里一并视为可用
  return state === "running" || state === "ready" ? agent : null;
}

export function isXingyunAgentReady(): boolean {
  return !!runnableAgent();
}

/** 用诗仙自己的语音与动作播报文本；返回 false 时应回退到原有 TTS 链路 */
export function speakWithXingyun(text: string): boolean {
  const content = text.trim();
  const agent = runnableAgent();
  if (!content || !agent) return false;
  try {
    agent.speak(content, true, true);
    return true;
  } catch {
    return false;
  }
}

/** 打断诗仙当前播报（与原有停止播放逻辑串联） */
export function interruptXingyun(): void {
  const agent = runnableAgent();
  if (!agent) return;
  try {
    agent.interrupt();
  } catch { /* ignore */ }
}

/** 用星云内置大脑进行文本对话（保留其原生能力，供后续独立语音交互扩展） */
export async function askXingyun(text: string): Promise<boolean> {
  const agent = runnableAgent();
  if (!text.trim() || !agent) return false;
  try {
    await agent.ask(text);
    return true;
  } catch {
    return false;
  }
}

export async function destroyXingyunAgent(): Promise<void> {
  const store = getStore();
  const agent = store.agent;
  store.agent = null;
  if (!agent) return;
  try {
    await agent.destroy("component_unmount");
  } catch { /* ignore */ }
}
