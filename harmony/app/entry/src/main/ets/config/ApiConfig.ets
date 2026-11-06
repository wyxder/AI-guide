/**
 * 鸿蒙端统一环境配置。
 * ⚠️ 安全约束：这里只允许出现"公网可访问地址"与非敏感 AppID。
 * DEEPSEEK / STEPFUN / 讯飞 / SiliconFlow 等 API Key 与 DATABASE_URL
 * 一律保留在 Next.js 云端（Route Handler 内），绝不下发到鸿蒙端。
 */
export class ApiConfig {
  // 路线一：WebView 壳直接加载线上 H5（Vercel 部署地址）
  static readonly H5_URL: string = 'https://traveler-pro.vercel.app';

  // 局域网调试地址（如 'http://192.168.1.100:3000'）。留空 = 不启用。
  // 启用后 mixedContent / bridge 注入规则会自动跟随该地址，无需改其他文件。
  static readonly DEBUG_H5_URL: string = '';

  // 调试开关：控制 setWebDebuggingAccess（release 包发布前必须改为 false）
  static readonly DEBUG: boolean = true;

  // 云端 API 基地址（路线二/三原生页面直连同一套 Next.js API Routes）
  static readonly API_BASE: string = 'https://traveler-pro.vercel.app';

  // SSE 问答流端点
  static readonly QA_CHAT_STREAM: string = '/api/qa/chat';

  // 是否启用 JSBridge 注入（调试期可关闭以对比纯 H5 行为）
  static readonly BRIDGE_ENABLED: boolean = true;

  // rawfile 内的 bridge 脚本路径
  static readonly BRIDGE_SCRIPT: string = 'bridge.js';

  // 离线兜底页（连续加载失败后由 Index.ets loadUrl 载入 rawfile 本地页）
  static readonly OFFLINE_PAGE: string = 'offline.html';

  // 加载超时（毫秒）：超时未 onPageEnd 视为失败，进入兜底链路
  static readonly LOAD_TIMEOUT_MS: number = 15000;

  // 连续失败达到该次数后不再显示重试条，直接载入 rawfile/offline.html
  static readonly OFFLINE_AFTER_FAILS: number = 3;

  /** 当前生效的 H5 地址（DEBUG 且填了局域网地址时优先） */
  static activeUrl(): string {
    return (ApiConfig.DEBUG && ApiConfig.DEBUG_H5_URL.length > 0)
      ? ApiConfig.DEBUG_H5_URL
      : ApiConfig.H5_URL;
  }

  /** 生效地址是否为 HTTPS（决定 Web 组件 mixedContent 策略） */
  static isHttps(): boolean {
    return ApiConfig.activeUrl().startsWith('https://');
  }

  /**
   * javaScriptOnDocumentStart 的 scriptRules：
   * 必须带 /* 通配后缀，否则只匹配站点根路径，SPA 子路由（/spots、/qa 等）不会注入 bridge。
   */
  static bridgeUrlRules(): string[] {
    const rules: string[] = [`${ApiConfig.H5_URL}/*`];
    if (ApiConfig.DEBUG && ApiConfig.DEBUG_H5_URL.length > 0) {
      rules.push(`${ApiConfig.DEBUG_H5_URL}/*`);
    }
    return rules;
  }
}
