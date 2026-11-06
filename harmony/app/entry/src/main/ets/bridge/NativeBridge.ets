/**
 * 旅行家Pro · JSBridge 原生侧代理（路线一）
 * 通过 Web 组件 javaScriptProxy 以 window.__nativeBridge__ 暴露给 H5，
 * 与 web-bridge/bridge.js（v2 协议）配对：
 *   H5 → 原生：__nativeBridge__.postMessage(JSON 字符串)
 *   原生 → H5：controller.runJavaScript("window.__harmony_emit__(callId, err, result)")
 * 原则：任何处理器失败都以 err 回调，H5 侧保持 Web 降级路径可用，
 *       绝不让桥接故障阻断原 Web 功能。
 */
import { webview } from '@kit.ArkWeb';
import { common, wantAgent } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { vibrator } from '@kit.SensorServiceKit';
import { geoLocationManager } from '@kit.MapKit';
import { camera, cameraPicker } from '@kit.CameraKit';
import { fileIo as fs, fileUri } from '@kit.CoreFileKit';
import { textToSpeech } from '@kit.CoreSpeechKit';
import { systemShare } from '@kit.ShareKit';
import { uniformTypeDescriptor as utd } from '@kit.ArkData';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';

const TAG: string = 'TravelerProBridge';
const DOMAIN: number = 0x0001;

/** bridge.js invoke() 发来的指令包 */
class BridgeMessage {
  callId: string = '';
  action: string = '';
  payload: Record<string, Object> = {};
}

export class NativeBridge {
  private controller: webview.WebviewController;
  private context: common.UIAbilityContext | null = null;
  private ttsEngine: textToSpeech.TextToSpeechEngine | null = null;
  private audioBgRunning: boolean = false;
  /** 离线页 retry() 时由 Index.ets 注入：重置失败计数并重新加载线上 H5 */
  onRetry: () => void = (): void => {};

  constructor(controller: webview.WebviewController) {
    this.controller = controller;
  }

  /** Index.aboutToAppear 拿到 UIAbilityContext 后注入 */
  setContext(context: common.UIAbilityContext): void {
    this.context = context;
  }

  /** H5 → 原生统一入口（代理方法必须同步返回，处理过程 fire-and-forget） */
  postMessage(raw: string): void {
    let msg: BridgeMessage | null = null;
    try {
      msg = JSON.parse(raw) as BridgeMessage;
    } catch (e) {
      hilog.warn(DOMAIN, TAG, 'postMessage parse failed: %{public}s', String(e));
      return;
    }
    const callId: string = msg.callId;
    switch (msg.action) {
      case 'vibrate':
        this.handleVibrate(msg);
        break;
      case 'tts':
        this.handleTts(msg);
        break;
      case 'stt':
        // 端侧 ASR 暂不双实现：H5 已有服务端 stepfun ASR 链路，显式回错触发降级
        this.reply(callId, 'stt_native_disabled', null);
        break;
      case 'capturePhoto':
        this.handleCapturePhoto(msg);
        break;
      case 'getLocation':
        this.handleGetLocation(msg);
        break;
      case 'share':
        this.handleShare(msg);
        break;
      case 'audioBg':
        this.handleAudioBg(msg);
        break;
      default:
        this.reply(callId, `unknown action: ${msg.action}`, null);
    }
  }

  /** rawfile/offline.html 重试按钮调用 */
  retry(): void {
    hilog.info(DOMAIN, TAG, 'offline retry requested');
    this.onRetry();
  }

  /** 原生 → H5 全局事件广播（bridge.js 派发 CustomEvent('harmony:<event>')) */
  broadcast(event: string, data: Record<string, Object>): void {
    const payload: Record<string, Object> = {};
    payload['event'] = event;
    const keys: string[] = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      payload[keys[i]] = data[keys[i]];
    }
    this.execJs(`window.__harmony_emit__ && window.__harmony_emit__(null, null, ${JSON.stringify(payload)})`);
  }

  /** 单次调用回执：err 为 null 表示成功 */
  private reply(callId: string, err: string | null, result: Record<string, Object> | null): void {
    if (callId.length === 0) {
      return;
    }
    const errJs: string = err === null ? 'null' : JSON.stringify(err);
    const resultJs: string = result === null ? 'null' : JSON.stringify(result);
    this.execJs(`window.__harmony_emit__ && window.__harmony_emit__(${JSON.stringify(callId)}, ${errJs}, ${resultJs})`);
  }

  private execJs(js: string): void {
    try {
      this.controller.runJavaScript(js).catch((e: BusinessError) => {
        hilog.warn(DOMAIN, TAG, 'runJavaScript rejected: %{public}s', JSON.stringify(e));
      });
    } catch (e) {
      hilog.warn(DOMAIN, TAG, 'runJavaScript threw (page not ready?): %{public}s', String(e));
    }
  }

  private static num(payload: Record<string, Object>, key: string, def: number): number {
    const v = payload[key];
    return typeof v === 'number' ? v : def;
  }

  private static str(payload: Record<string, Object>, key: string, def: string): string {
    const v = payload[key];
    return typeof v === 'string' ? v : def;
  }

  // ---------- vibrate：原生触觉反馈（Navigation.tsx 增强路径） ----------
  private handleVibrate(msg: BridgeMessage): void {
    const type: string = NativeBridge.str(msg.payload, 'type', 'light');
    const duration: number = type === 'heavy' ? 30 : 15;
    try {
      vibrator.startVibration(
        { type: 'time', duration: duration },
        { id: 0, usage: 'touch' }
      ).then(() => {
        const ok: Record<string, Object> = {};
        ok['duration'] = duration;
        this.reply(msg.callId, null, ok);
      }).catch((e: BusinessError) => {
        this.reply(msg.callId, `vibrate_failed: ${e.code}`, null);
      });
    } catch (e) {
      // 设备无马达等同步异常：回错后 H5 保持静默，不影响点击行为
      this.reply(msg.callId, 'vibrate_failed', null);
    }
  }

  // ---------- getLocation：Location Kit 高精度单次定位 ----------
  private async handleGetLocation(msg: BridgeMessage): Promise<void> {
    try {
      const loc: geoLocationManager.Location = await geoLocationManager.getCurrentLocation();
      const result: Record<string, Object> = {};
      result['latitude'] = loc.latitude;
      result['longitude'] = loc.longitude;
      result['accuracy'] = loc.accuracy;
      result['altitude'] = loc.altitude;
      result['time'] = loc.time;
      this.reply(msg.callId, null, result);
    } catch (e) {
      const err = e as BusinessError;
      // 201=权限拒绝 3301100=定位服务不可用 等，统一回错由 H5 降级 navigator.geolocation
      hilog.warn(DOMAIN, TAG, 'getLocation failed: %{public}s', JSON.stringify(err));
      this.reply(msg.callId, `location_failed: ${err.code ?? 'unknown'}`, null);
    }
  }

  // ---------- capturePhoto：系统相机选拍 → JPEG base64（VR 即拍即识增强路径） ----------
  private async handleCapturePhoto(msg: BridgeMessage): Promise<void> {
    let file: fs.File | null = null;
    if (this.context === null) {
      this.reply(msg.callId, 'context_unavailable', null);
      return;
    }
    try {
      const facing: string = NativeBridge.str(msg.payload, 'facing', 'environment');
      const position: camera.CameraPosition = facing === 'user'
        ? camera.CameraPosition.CAMERA_POSITION_FRONT
        : camera.CameraPosition.CAMERA_POSITION_BACK;
      const profile: cameraPicker.PickerProfile = { cameraPosition: position };
      const picked: cameraPicker.PickerResult =
        await cameraPicker.pick(this.context, [cameraPicker.PickerMediaType.PHOTO], profile);
      if (picked.code !== 0 || picked.resultUri.length === 0) {
        this.reply(msg.callId, 'camera_cancelled', null);
        return;
      }
      file = fs.openSync(picked.resultUri, fs.OpenMode.READ_ONLY);
      const stat: fs.Stat = fs.statSync(file.fd);
      const buf: ArrayBuffer = new ArrayBuffer(stat.size);
      fs.readSync(file.fd, buf);
      fs.closeSync(file);
      file = null;
      const b64: string = await new util.Base64Helper().encodeToString(new Uint8Array(buf));
      const result: Record<string, Object> = {};
      result['uri'] = picked.resultUri;
      result['mimeType'] = 'image/jpeg';
      result['dataUrl'] = `data:image/jpeg;base64,${b64}`;
      this.reply(msg.callId, null, result);
    } catch (e) {
      if (file !== null) {
        try {
          fs.closeSync(file);
        } catch (ignored) {
        }
      }
      const err = e as BusinessError;
      hilog.warn(DOMAIN, TAG, 'capturePhoto failed: %{public}s', JSON.stringify(err));
      this.reply(msg.callId, `capture_failed: ${err.code ?? 'unknown'}`, null);
    }
  }

  // ---------- tts：Core Speech Kit 端侧播报；失败由 H5 降级 Web Speech ----------
  private async ensureTtsEngine(): Promise<textToSpeech.TextToSpeechEngine> {
    if (this.ttsEngine !== null) {
      return this.ttsEngine;
    }
    const extraParam: Record<string, Object> = {
      'style': 'interaction-broadcast',
      'locate': 'CN',
      'name': 'TravelerProTts'
    };
    const initParams: textToSpeech.CreateEngineParams = {
      language: 'zh_CN', // 注意：语种代码为下划线格式，横杠 zh-CN 会创建失败
      person: 0,
      online: 1,
      extraParams: extraParam
    };
    const engine: textToSpeech.TextToSpeechEngine = await textToSpeech.createEngine(initParams);
    const listener: textToSpeech.SpeakListener = {
      onComplete: (requestId: string): void => {
        const done: Record<string, Object> = {};
        done['done'] = true;
        this.reply(requestId, null, done);
      },
      onError: (requestId: string, code: number): void => {
        this.reply(requestId, `tts_error_${code}`, null);
      }
    };
    engine.setListener(listener);
    this.ttsEngine = engine;
    return engine;
  }

  private async handleTts(msg: BridgeMessage): Promise<void> {
    const text: string = NativeBridge.str(msg.payload, 'text', '');
    if (text.length === 0) {
      this.reply(msg.callId, 'tts_empty_text', null);
      return;
    }
    try {
      const engine: textToSpeech.TextToSpeechEngine = await this.ensureTtsEngine();
      // requestId 使用 callId：SpeakListener 回调时按 requestId 向 H5 回执
      const speakParams: textToSpeech.SpeakParams = { requestId: msg.callId };
      engine.speak(text, speakParams);
    } catch (e) {
      const err = e as BusinessError;
      hilog.warn(DOMAIN, TAG, 'tts failed: %{public}s', JSON.stringify(err));
      this.reply(msg.callId, 'tts_native_unavailable', null);
    }
  }

  // ---------- share：鸿蒙系统分享面板（打卡海报） ----------
  private async handleShare(msg: BridgeMessage): Promise<void> {
    if (this.context === null) {
      this.reply(msg.callId, 'context_unavailable', null);
      return;
    }
    try {
      const title: string = NativeBridge.str(msg.payload, 'title', '旅行家Pro');
      const text: string = NativeBridge.str(msg.payload, 'text', '');
      const imageBase64: string = NativeBridge.str(msg.payload, 'imageBase64', '');
      let shareData: systemShare.SharedData | null = null;
      if (imageBase64.length > 0) {
        const raw: string = imageBase64.indexOf(',') >= 0
          ? imageBase64.slice(imageBase64.indexOf(',') + 1)
          : imageBase64;
        const bytes: Uint8Array = await new util.Base64Helper().decode(raw);
        const filePath: string = `${this.context.cacheDir}/share_poster.png`;
        const file: fs.File = fs.openSync(filePath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
        fs.writeSync(file.fd, bytes.buffer as ArrayBuffer);
        fs.closeSync(file);
        shareData = new systemShare.SharedData({
          utd: utd.UniformDataType.IMAGE,
          uri: fileUri.getUriFromPath(filePath),
          title: title,
          description: text
        });
      } else {
        shareData = new systemShare.SharedData({
          utd: utd.UniformDataType.TEXT,
          content: text,
          title: title
        });
      }
      if (shareData === null) {
        this.reply(msg.callId, 'share_data_empty', null);
        return;
      }
      const controller: systemShare.ShareController = new systemShare.ShareController(shareData);
      await controller.show(this.context, {
        previewMode: systemShare.SharePreviewMode.DETAIL,
        selectionMode: systemShare.SelectionMode.SINGLE
      });
      const shown: Record<string, Object> = {};
      shown['shown'] = true;
      this.reply(msg.callId, null, shown);
    } catch (e) {
      const err = e as BusinessError;
      hilog.warn(DOMAIN, TAG, 'share failed: %{public}s', JSON.stringify(err));
      this.reply(msg.callId, 'share_failed', null);
    }
  }

  // ---------- audioBg：伴游 FM 音频后台任务（KEEP_BACKGROUND_RUNNING） ----------
  private async handleAudioBg(msg: BridgeMessage): Promise<void> {
    if (this.context === null) {
      this.reply(msg.callId, 'context_unavailable', null);
      return;
    }
    const onVal: Object | undefined = msg.payload['on'];
    const on: boolean = typeof onVal === 'boolean' ? onVal : NativeBridge.num(msg.payload, 'on', 0) === 1;
    try {
      if (on) {
        if (this.audioBgRunning) {
          const running: Record<string, Object> = {};
          running['running'] = true;
          this.reply(msg.callId, null, running);
          return;
        }
        const info: wantAgent.WantAgentInfo = {
          wants: [{
            bundleName: this.context.abilityInfo.bundleName,
            abilityName: this.context.abilityInfo.name
          }],
          operationType: wantAgent.OperationType.START_ABILITY,
          requestCode: 0,
          wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
        };
        const agent: wantAgent.WantAgent = await wantAgent.getWantAgent(info);
        await backgroundTaskManager.startBackgroundRunning(
          this.context, backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK, agent);
        this.audioBgRunning = true;
      } else if (this.audioBgRunning) {
        await backgroundTaskManager.stopBackgroundRunning(this.context);
        this.audioBgRunning = false;
      }
      const result: Record<string, Object> = {};
      result['running'] = this.audioBgRunning;
      this.reply(msg.callId, null, result);
    } catch (e) {
      const err = e as BusinessError;
      // 后台任务失败不阻断播放本身，仅告警
      hilog.warn(DOMAIN, TAG, 'audioBg failed: %{public}s', JSON.stringify(err));
      this.reply(msg.callId, `audioBg_failed: ${err.code ?? 'unknown'}`, null);
    }
  }
}
