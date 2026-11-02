/**
 * 鸿蒙端统一环境配置。
 * ⚠️ 安全约束：这里只允许出现"公网可访问地址"与非敏感 AppID。
 * DEEPSEEK / STEPFUN / 讯飞 / SiliconFlow 等 API Key 与 DATABASE_URL
 * 一律保留在 Next.js 云端（Route Handler 内），绝不下发到鸿蒙端。
 */
export class ApiConfig {
  // 路线一：WebView 壳直接加载线上 H5（Vercel 部署地址）
  // 局域网真机调试可临时改为 'http://192.168.x.x:3000'
  static readonly H5_URL: string = 'https://traveler-pro.vercel.app';

  // 云端 API 基地址（路线二/三原生页面直连同一套 Next.js API Routes）
  static readonly API_BASE: string = 'https://traveler-pro.vercel.app';

  // SSE 问答流端点
  static readonly QA_CHAT_STREAM: string = '/api/qa/chat';

  // 是否启用 JSBridge 注入（调试期可关闭以对比纯 H5 行为）
  static readonly BRIDGE_ENABLED: boolean = true;

  // rawfile 内的 bridge 脚本路径
  static readonly BRIDGE_SCRIPT: string = 'bridge.js';

  // 离线兜底页（弱网/断网时 WebView 加载的本地页，可后续放入 rawfile）
  static readonly OFFLINE_PAGE: string = 'offline.html';
}
