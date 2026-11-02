import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, Permissions } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ApiConfig } from '../config/ApiConfig';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';

const TAG: string = 'TravelerPro';

/**
 * 路线一核心页面：ArkWeb 壳加载线上 H5（旅行家Pro Web 版）
 * - 文档启动前注入 bridge.js，向 H5 暴露 window.__harmony__ JSBridge
 * - onPermissionRequest：把 H5 的 getUserMedia（相机/麦克风）请求转成系统授权弹窗
 * - 安全区避让：顶部/底部 padding 来自 EntryAbility 写入的 AppStorage
 * - 返回手势：优先回退 H5 路由历史，栈空时才退出应用
 */
@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();
  @State safeTopVp: number = px2vp(AppStorage.get<number>('safeTopPx') ?? 0);
  @State safeBottomVp: number = px2vp(AppStorage.get<number>('safeBottomPx') ?? 0);
  @State loadFailed: boolean = false;

  aboutToAppear(): void {
    // 允许 WebView HTTP 缓存与 DOM Storage（登录态 cookie/localStorage 依赖）
    webview.WebviewController.setWebDebuggingAccess(true); // 仅 debug 包保留，release 移除
  }

  /** 相机/麦克风：H5 发起 getUserMedia 时联动系统权限 */
  private async grantWebPermissions(request: webview.PermissionRequest): Promise<void> {
    const atManager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
    const perms: Permissions[] = ['ohos.permission.CAMERA', 'ohos.permission.MICROPHONE'];
    try {
      await atManager.requestPermissionsFromContext(getContext(this), perms);
      request.grant(request.getAccessibleResources()); // 授予 H5 请求的资源
      // 注：正式版应逐项校验 request.getResource()[i] 与用户授权结果再 grant/deny
    } catch (e) {
      hilog.error(0x0001, TAG, 'grant failed: %{public}s', JSON.stringify(e as BusinessError));
      request.deny();
    }
  }

  build() {
    Column() {
      if (this.loadFailed) {
        // 弱网/断网兜底：提示重试（后续可替换为 rawfile/offline.html）
        Column({ space: 16 }) {
          Text('网络似乎不太顺畅').fontSize(18).fontWeight(FontWeight.Bold)
          Button('重新连接').onClick(() => {
            this.loadFailed = false;
            this.controller.refresh();
          })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#FAF8F5')
      } else {
        Web({ src: ApiConfig.H5_URL, controller: this.controller })
          .javaScriptAccess(true)
          .domStorageAccess(true)          // Eazo SDK 会话依赖 localStorage
          .fileAccess(false)
          .mixedContent(MixedContentMode.NEVER) // 线上全 HTTPS，禁止混合内容
          .geolocationAccess(true)         // H5 navigator.geolocation → 系统定位
          .zoomControls(false)
          .horizontalSwipeAccess(false)    // 禁横滑，避免与 H5 手势冲突
          .backgroundColor('#FAF8F5')
          .onSafeAreaAdjust((style: WebSafeAreaStyle) => {
            // 把系统避让区交给 H5 CSS env(safe-area-inset-*) 处理（bridge.js 同步注入变量）
            style.topSafeAreaInsetHeight = this.safeTopVp;
            style.bottomSafeAreaInsetHeight = this.safeBottomVp;
          })
          .javaScriptOnDocumentStart([
            { script: this.loadBridgeScript(), scriptRules: [ApiConfig.H5_URL] }
          ])
          .onPermissionRequest((event) => {
            if (event) {
              this.grantWebPermissions(event.request);
            }
          })
          .onErrorReceive((event) => {
            // 主文档加载失败 → 展示原生兜底页（静态资源失败不触发）
            if (event && event.request.isMainFrame()) {
              this.loadFailed = true;
            }
          })
          .onConsole((event) => {
            // bridge 回传日志落 hilog，便于真机排查
            hilog.info(0x0001, TAG, 'H5: %{public}s', event?.message.getMessage() ?? '');
            return false;
          })
      }
    }
    .width('100%')
    .height('100%')
    .padding({ top: this.safeTopVp, bottom: this.safeBottomVp })
  }

  /** 从 rawfile 读取 bridge.js */
  private loadBridgeScript(): string {
    if (!ApiConfig.BRIDGE_ENABLED) {
      return '';
    }
    try {
      const data = getContext(this).resourceManager.getRawFileContentSync(ApiConfig.BRIDGE_SCRIPT);
      return buffer2String(data);
    } catch (e) {
      hilog.warn(0x0001, TAG, 'bridge.js not found in rawfile, running pure-H5 mode');
      return '';
    }
  }

  /** 系统返回手势/返回键：先回退 H5 历史 */
  onBackPress(): boolean {
    try {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true; // 已消费，不退出应用
      }
    } catch (err) {
      hilog.warn(0x0001, TAG, 'accessBackward failed: %{public}s', JSON.stringify(err as BusinessError));
    }
    return false; // 栈空 → 退出
  }
}

function buffer2String(buf: Uint8Array): string {
  const decoder = new util.TextDecoder('utf-8');
  return decoder.decodeToString(buf); // API 12 util.TextDecoder
}
