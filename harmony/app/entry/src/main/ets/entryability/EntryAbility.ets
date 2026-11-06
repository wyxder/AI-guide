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
    // 跨端迁移到达端：源端 onContinue 打包的 sessionId 在此接管，由 Index.ets 页面加载后广播给 H5
    const sid = want.parameters?.['sessionId'];
    if (typeof sid === 'string' && sid.length > 0) {
      AppStorage.setOrCreate('migratedSessionId', sid);
    }
    // 冷启动深链（卡片/碰一碰直接拉起）也携带 targetRoute
    const route = want.parameters?.['targetRoute'];
    if (typeof route === 'string' && route.length > 0) {
      AppStorage.setOrCreate('cardTargetRoute', route);
    }
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'EntryAbility onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // 顺序化：先完成沉浸式/避让区初始化，再 loadContent，
    // 避免页面先加载而 AppStorage 避让值未就绪（配合 Index.ets @StorageProp 仍会后续刷新，双重保险）
    windowStage.getMainWindow().then(async (win: window.Window) => {
      // 1. 沉浸式：全屏布局，由页面自行处理避让（Index.ets 原生 padding）
      await win.setWindowLayoutFullScreen(true);
      // 2. 读取避让区（刘海/状态栏/导航条），px 存入 AppStorage 供页面响应式消费
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
    }).finally(() => {
      windowStage.loadContent('pages/Index', (err) => {
        if (err.code) {
          hilog.error(DOMAIN, TAG, 'loadContent failed: %{public}s', JSON.stringify(err));
          return;
        }
        hilog.info(DOMAIN, TAG, 'loadContent succeeded');
      });
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
    // 桌面卡片 / 碰一碰 拉起时携带的目标页路由，写入 AppStorage，
    // 由 Index.ets @Watch('cardTargetRoute') 广播给 H5（需 module.json5 launchType=singleton）
    if (want.parameters && want.parameters['targetRoute']) {
      AppStorage.setOrCreate('cardTargetRoute', String(want.parameters['targetRoute']));
    }
    if (want.parameters && want.parameters['sessionId']) {
      AppStorage.setOrCreate('migratedSessionId', String(want.parameters['sessionId']));
    }
  }
}
