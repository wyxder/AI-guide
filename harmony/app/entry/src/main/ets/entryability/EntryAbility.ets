import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

const TAG: string = 'TravelerPro';
const DOMAIN: number = 0x0001;

/**
 * 旅行家Pro 鸿蒙入口 Ability（路线一：WebView 壳）
 * - 沉浸式全屏：内容延伸到状态栏/导航条之下，安全区高度写入 AppStorage 供页面消费
 * - 跨端迁移预留：onContinue 把当前会话 id 传递给目标设备（手机→平板接力）
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onCreate');
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.getMainWindowSync().then(async (win: window.Window) => {
      // 1. 沉浸式：全屏布局，由页面自行处理避让
      await win.setWindowLayoutFullScreen(true);
      // 2. 读取避让区（刘海/状态栏/导航条），换算 vp 存入 AppStorage
      const avoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      AppStorage.setOrCreate('safeTopPx', avoidArea.topRect.height);
      AppStorage.setOrCreate('safeBottomPx', avoidArea.bottomRect.height);
      // 3. 避让区动态变化监听（折叠屏展开/旋转时重算）
      win.on('avoidAreaChange', (data) => {
        if (data.type === window.AvoidAreaType.TYPE_SYSTEM) {
          AppStorage.setOrCreate('safeTopPx', data.area.topRect.height);
          AppStorage.setOrCreate('safeBottomPx', data.area.bottomRect.height);
        }
      });
    }).catch((e: Error) => {
      hilog.error(DOMAIN, TAG, 'window setup failed: %{public}s', JSON.stringify(e));
    });

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, 'loadContent succeeded');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy');
  }

  /**
   * 跨端迁移发起端：把导览会话状态打包进 wantParam，
   * 目标设备 onCreate(want) 中取出并恢复（增强版实现，路线一 MVP 可忽略）。
   */
  onContinue(wantParam: Record<string, Object>): AbilityConstant.OnContinueResult {
    wantParam['sessionId'] = AppStorage.get<string>('qaSessionId') ?? '';
    wantParam['accessibilityMode'] = AppStorage.get<string>('accessibilityMode') ?? 'normal';
    return AbilityConstant.OnContinueResult.AGREE;
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    // 桌面卡片 / 碰一碰 拉起时携带的目标页路由，转发给 H5
    if (want.parameters && want.parameters['targetRoute']) {
      AppStorage.setOrCreate('cardTargetRoute', String(want.parameters['targetRoute']));
    }
  }
}
