"use client";

/**
 * 「小美」数字人 AI 能力入口。
 *
 * 小美与「诗仙」共用同一套魔珐星云具身智能体运行时，但使用各自独立的
 * 驱动应用凭证（XINGYUN_XIAOMEI_APP_ID / XINGYUN_XIAOMEI_APP_SECRET）。
 * 本文件仅把运行时能力按 profile="xiaomei" 收敛为一组可直接调用的接口，
 * 不改变原有 Live2D 形象与「诗仙」的任何行为。
 */

import {
  askXingyun,
  destroyXingyunAgent,
  interruptXingyun,
  isXingyunAgentReady,
  mountXingyunAgent,
  speakWithXingyun,
  startXingyunASR,
  stopXingyunASR,
  subscribeXingyunConversation,
  type XingyunAgentProfile,
  type XingyunMountHandlers,
} from "@/lib/xingyun/agent";

const PROFILE: XingyunAgentProfile = "xiaomei";

/** 在容器内挂载小美（独立 App ID / App Secret） */
export function mountXiaomeiAgent(container: HTMLElement, handlers: XingyunMountHandlers = {}): Promise<void> {
  return mountXingyunAgent(container, handlers, { profile: PROFILE });
}

export function destroyXiaomeiAgent(): Promise<void> {
  return destroyXingyunAgent();
}

export function isXiaomeiAgentReady(): boolean {
  return isXingyunAgentReady(PROFILE);
}

/** 用小美自带音色与动作播报；false 时回退到原有 TTS 链路 */
export function speakWithXiaomei(text: string): boolean {
  return speakWithXingyun(text, PROFILE);
}

/** 打断小美当前播报 */
export function interruptXiaomei(): void {
  interruptXingyun(PROFILE);
}

/** 星云内置大脑对话（小美原生能力） */
export function askXiaomei(text: string): Promise<boolean> {
  return askXingyun(text, PROFILE);
}

/** 星云内置语音识别（需用户手势触发） */
export function startXiaomeiASR(): Promise<boolean> {
  return startXingyunASR(PROFILE);
}

export function stopXiaomeiASR(): Promise<boolean> {
  return stopXingyunASR(PROFILE);
}

/** 订阅小美对话/播报状态 */
export function subscribeXiaomeiConversation(...args: Parameters<typeof subscribeXingyunConversation>) {
  return subscribeXingyunConversation(...args);
}
