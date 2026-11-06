/**
 * 路线一核心页面：ArkWeb 壳加载线上 H5（旅行家Pro Web 版）
 * - 文档启动前注入 rawfile/bridge.js，向 H5 暴露 window.__harmony__ JSBridge
 * - javaScriptProxy 注册 window.__nativeBridge__（postMessage/retry），原生能力见 NativeBridge.ets
 * - onPermissionRequest：H5 getUserMedia（相机/麦克风）→ 系统授权弹窗，按用户结果 grant/deny
 * - 安全区避让：EntryAbility 写入 AppStorage 的避让高度（@StorageProp 响应式）作原生 padding，
 *   Web 组件不进沉浸式，H5 内 env(safe-area-inset-*) 恒为 0，无双避让
 * - 返回手势：优先回退 H5 路由历史，栈空时才退出应用
 * - 加载失败：1~2 次显示原生重试层；≥3 次载入 rawfile/offline.html 兜底页
 */
import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { ApiConfig } from '../config/ApiConfig';
import { NativeBridge } from '../bridge/NativeBridge';

const TAG: string = 'TravelerPro';
const DOMAIN: number = 0x0001;

/** 页面加载模式：在线 H5 / 原生重试层 / rawfile 离线兜底页 */
enum PageMode {
  ONLINE = 0,
  FAILED = 1,
  OFFLINE = 2,
}

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();
  // 安全区（px）：@StorageProp + @Watch 保证 EntryAbility 异步写入后实时刷新
  @StorageProp('safeTopPx') @Watch('onSafeAreaChanged') safeTopPx: number = 0;
  @StorageProp('safeBottomPx') @Watch('onSafeAreaChanged') safeBottomPx: number = 0;
  // 桌面卡片/碰一碰深链目标路由（EntryAbility.onNewWant 写入）
  @StorageProp('cardTargetRoute') @Watch('onCardRouteChanged') cardTargetRoute: string = '';
  @State safeTopVp: number = 0;
  @State safeBottomVp: number = 0;
  @State pageMode: PageMode = PageMode.ONLINE;
  @State loading: boolean = true;
  private failCount: number = 0;
  private bridgeScript: string = '';
  private nativeBridge: NativeBridge = new NativeBridge(this.controller);
  private context: common.UIAbilityContext | null = null;
  private loadTimerId: number = -1;

  aboutToAppear(): void {
    if (ApiConfig.DEBUG) {
      // 仅调试包开放 DevTools 远程调试；release 由 ApiConfig.DEBUG=false 关闭
      webview.WebviewController.setWebDebuggingAccess(true);
    }
    const host = this.getUIContext().getHostContext();
    if (host) {
      this.context = host as common.UIAbilityContext;
      this.nativeBridge.setContext(this.context);
    }
    this.bridgeScript = this.readBridgeScript();
    // 离线兜底页"重新连接"→ 原生侧重载线上 H5
    this.nativeBridge.onRetry = (): void => {
      this.retryOnline();
    };
    this.onSafeAreaChanged();
  }

  aboutToDisappear(): void {
    this.clearLoadTimer();
  }

  /** AppStorage 避让高度变化 → 换算 vp */
  onSafeAreaChanged(): void {
    this.safeTopVp = this.getUIContext().px2vp(this.safeTopPx);
    this.safeBottomVp = this.getUIContext().px2vp(this.safeBottomPx);
  }

  /** 卡片/碰一碰拉起：把目标路由广播给 H5（bridge.js → CustomEvent('harmony:navigate')） */
  onCardRouteChanged(): void {
    if (this.cardTargetRoute.length > 0 && this.pageMode === PageMode.ONLINE) {
      const data: Record<string, Object> = {};
      data['route'] = this.cardTargetRoute;
      this.nativeBridge.broadcast('navigate', data);
      AppStorage.setOrCreate('cardTargetRoute', '');
    }
  }

  /** 主文档加载失败/超时统一入口：Web 组件始终保活，仅切换覆盖层，避免 refresh 崩溃 */
  private handleLoadFailure(source: string): void {
    if (this.pageMode !== PageMode.ONLINE) {
      return;
    }
    this.failCount++;
    hilog.warn(DOMAIN, TAG, 'main frame load failure #%{public}d (%{public}s)', this.failCount, source);
    this.clearLoadTimer();
    this.loading = false;
    if (this.failCount >= ApiConfig.OFFLINE_AFTER_FAILS) {
      this.pageMode = PageMode.OFFLINE;
      setTimeout((): void => {
        try {
          // loadUrl 支持 Resource：载入 rawfile/offline.html（页内按钮走 __nativeBridge__.retry）
          this.controller.loadUrl($rawfile(ApiConfig.OFFLINE_PAGE));
        } catch (e) {
          hilog.error(DOMAIN, TAG, 'load offline page failed: %{public}s', JSON.stringify(e as BusinessError));
          this.pageMode = PageMode.FAILED;
        }
      }, 0);
    } else {
      this.pageMode = PageMode.FAILED;
    }
  }

  /** 重试：回到在线模式并重新加载生效地址 */
  private retryOnline(): void {
    this.failCount = 0;
    this.pageMode = PageMode.ONLINE;
    this.loading = true;
    try {
      this.controller.loadUrl(ApiConfig.activeUrl());
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'retry loadUrl failed: %{public}s', JSON.stringify(e as BusinessError));
      this.controller.refresh();
    }
  }

  private startLoadTimer(): void {
    this.clearLoadTimer();
    this.loadTimerId = setTimeout((): void => {
      if (this.loading) {
        this.handleLoadFailure('timeout');
      }
    }, ApiConfig.LOAD_TIMEOUT_MS);
  }

  private clearLoadTimer(): void {
    if (this.loadTimerId >= 0) {
      clearTimeout(this.loadTimerId);
      this.loadTimerId = -1;
    }
  }

  /** 相机/麦克风/定位：H5 发起请求时联动系统权限，逐项核对用户授权结果 */
  private async grantWebPermissions(request: webview.PermissionRequest): Promise<void> {
    const types: string[] = request.getType();
    const needed: Permissions[] = [];
    for (let i = 0; i < types.length; i++) {
      const t: string = types[i];
      if (t === 'TYPE_VIDEO_CAPTURE' && !needed.includes('ohos.permission.CAMERA')) {
        needed.push('ohos.permission.CAMERA');
      } else if (t === 'TYPE_AUDIO_CAPTURE' && !needed.includes('ohos.permission.MICROPHONE')) {
        needed.push('ohos.permission.MICROPHONE');
      } else if (t === 'TYPE_GEOLOCATION') {
        if (!needed.includes('ohos.permission.APPROXIMATELY_LOCATION')) {
          needed.push('ohos.permission.APPROXIMATELY_LOCATION');
        }
        if (!needed.includes('ohos.permission.LOCATION')) {
          needed.push('ohos.permission.LOCATION');
        }
      }
    }
    if (needed.length === 0 || this.context === null) {
      // 未知资源类型（MIDI 等）一律拒绝，最小授权面
      request.deny();
      return;
    }
    const atManager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
    try {
      const grantResult = await atManager.requestPermissionsFromContext(this.context, needed);
      const codes: number[] = grantResult.authResults; // 0 = MSG_PERMISSION_RESULT_ENABLE
      let allGranted = codes.length > 0;
      for (let i = 0; i < codes.length; i++) {
        if (codes[i] !== 0) {
          allGranted = false;
        }
      }
      if (allGranted) {
        request.grant(request.getAccessibleResources());
      } else {
        request.deny();
        this.broadcastPermissionDenied(types);
      }
    } catch (e) {
      hilog.error(DOMAIN, TAG, 'requestPermissions failed: %{public}s', JSON.stringify(e as BusinessError));
      request.deny();
      this.broadcastPermissionDenied(types);
    }
  }

  /** 拒绝授权时通知 H5，供其展示引导并走 Web 降级逻辑（Web 项目现状不监听也不受影响） */
  private broadcastPermissionDenied(types: string[]): void {
    const data: Record<string, Object> = {};
    data['resources'] = types.join(',');
    this.nativeBridge.broadcast('permissiondenied', data);
  }

  /** H5 navigator.geolocation 前置申请系统定位（ArkWeb 依赖 App 侧已授权） */
  private ensureLocationPermission(): void {
    if (this.context === null) {
      return;
    }
    const atManager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
    const perms: Permissions[] = ['ohos.permission.APPROXIMATELY_LOCATION', 'ohos.permission.LOCATION'];
    atManager.requestPermissionsFromContext(this.context, perms).then((result): void => {
      hilog.info(DOMAIN, TAG, 'location perms: %{public}s', JSON.stringify(result.authResults));
    }).catch((e: BusinessError): void => {
      hilog.warn(DOMAIN, TAG, 'location perm request failed: %{public}s', JSON.stringify(e));
    });
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      // Web 组件常驻组件树（覆盖层只做展示），保证失败重试时 controller 始终可用
      Web({ src: ApiConfig.activeUrl(), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)              // Eazo SDK 会话（localStorage eazo.session）依赖
        .fileAccess(false)
        .mixedContent(ApiConfig.isHttps() ? MixedContentMode.NEVER : MixedContentMode.CompatibleMode)
        .geolocationAccess(true)             // H5 navigator.geolocation → 系统定位
        .zoomControls(false)
        .horizontalSwipeAccess(false)        // 禁横滑，避免与 H5 手势冲突
        .backgroundColor('#FAF8F5')
        .javaScriptProxy({
          object: this.nativeBridge,
          name: '__nativeBridge__',
          methodList: ['postMessage', 'retry'],
          controller: this.controller
        })
        .javaScriptOnDocumentStart(this.bridgeScript.length > 0
          ? [{ script: this.bridgeScript, scriptRules: ApiConfig.bridgeUrlRules() }]
          : [])
        .onPermissionRequest((event) => {
          if (event) {
            this.grantWebPermissions(event.request);
          }
        })
        .onGeolocationShow((_event) => {
          this.ensureLocationPermission();
        })
        .onErrorReceive((event) => {
          // 主文档加载失败 → 兜底链路（静态资源失败不触发）
          if (event && event.request.isMainFrame()) {
            this.handleLoadFailure(`net_error ${event.error.getErrorCode()}`);
          }
        })
        .onHttpErrorReceive((event) => {
          // 主文档 4xx/5xx（如 Vercel 域名解析错、服务端 5xx）同样进入兜底
          if (event && event.request.isMainFrame() && event.response.getResponseCode() >= 400) {
            this.handleLoadFailure(`http_${event.response.getResponseCode()}`);
          }
        })
        .onPageBegin((event) => {
          if (event && event.url.startsWith(ApiConfig.activeUrl())) {
            this.loading = true;
            this.startLoadTimer();
          }
        })
        .onPageEnd((event) => {
          if (event && event.url.startsWith(ApiConfig.activeUrl())) {
            this.loading = false;
            this.clearLoadTimer();
            this.failCount = 0;
            if (this.pageMode !== PageMode.ONLINE) {
              this.pageMode = PageMode.ONLINE;
            }
            this.notifyMigratedSession();
          }
        })
        .onConsole((event) => {
          // bridge 回传日志落 hilog，便于真机排查
          hilog.info(DOMAIN, TAG, 'H5: %{public}s', event?.message.getMessage() ?? '');
          return false;
        })

      if (this.loading && this.pageMode === PageMode.ONLINE) {
        // 首屏/路由级加载覆盖层
        Row({ space: 10 }) {
          LoadingProgress().width(28).height(28).color('#B08B5F')
          Text('正在连接旅行家Pro…').fontSize(14).fontColor('#8A837C')
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#FAF8F5')
      }

      if (this.pageMode === PageMode.FAILED) {
        // 弱网/断网兜底 1~2 次：原生重试层
        Column({ space: 16 }) {
          Text('网络似乎不太顺畅').fontSize(18).fontWeight(FontWeight.Bold)
          Text(`已重试 ${this.failCount} 次，请检查网络连接`).fontSize(13).fontColor('#8A837C')
          Button('重新连接').onClick(() => {
            this.retryOnline();
          })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#FAF8F5')
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: this.safeTopVp, bottom: this.safeBottomVp })
    .backgroundColor('#FAF8F5')
  }

  /** 跨端迁移到达：EntryAbility.onCreate 写入的 sessionId 广播给 H5（增强项，Web 现状不消费） */
  private notifyMigratedSession(): void {
    const sid: string = AppStorage.get<string>('migratedSessionId') ?? '';
    if (sid.length > 0) {
      AppStorage.setOrCreate('migratedSessionId', '');
      const data: Record<string, Object> = {};
      data['sessionId'] = sid;
      this.nativeBridge.broadcast('migrated', data);
    }
  }

  /** 从 rawfile 读取 bridge.js（一次性缓存，避免 build 反复 IO） */
  private readBridgeScript(): string {
    if (!ApiConfig.BRIDGE_ENABLED) {
      return '';
    }
    try {
      const data = getContext(this).resourceManager.getRawFileContentSync(ApiConfig.BRIDGE_SCRIPT);
      return buffer2String(data);
    } catch (e) {
      hilog.warn(DOMAIN, TAG, 'bridge.js not found in rawfile, running pure-H5 mode');
      return '';
    }
  }

  /** 系统返回手势/返回键：先回退 H5 历史 */
  onBackPress(): boolean {
    if (this.pageMode !== PageMode.ONLINE) {
      return false; // 兜底页/离线页无 H5 历史，直接退出
    }
    try {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true; // 已消费，不退出应用
      }
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'accessBackward failed: %{public}s', JSON.stringify(err as BusinessError));
    }
    return false; // 栈空 → 退出
  }
}

function buffer2String(buf: Uint8Array): string {
  const decoder = new util.TextDecoder('utf-8');
  return decoder.decodeToString(buf); // API 12 util.TextDecoder
}
