/**
 * 旅行家Pro · HarmonyOS JSBridge v2（路线一：WebView 壳注入脚本）
 * 由 ArkWeb 的 javaScriptOnDocumentStart 在页面脚本执行前注入（scriptRules 带 /* 通配）。
 * H5 侧统一通过 window.__harmony__ 判断鸿蒙环境并调用原生增强能力。
 *
 * 设计原则：
 * 1. 纯"增量增强"——所有能力均有 Web 降级实现，本脚本不存在时 H5 功能不损失；
 *    因此 Web 项目（src/）无需为本脚本做任何强制改造，原项目零影响。
 * 2. 通信桥：
 *    H5 → ArkTS：window.__nativeBridge__.postMessage(json)（javaScriptProxy 注册，
 *      对包括 rawfile/offline.html 在内的所有页面生效）；
 *    ArkTS → H5：controller.runJavaScript("window.__harmony_emit__(callId, err, result)")。
 * 3. 原生事件（无 callId 广播）统一派发 CustomEvent('harmony:<name>')，已知事件：
 *    - harmony:permissiondenied  系统权限被拒（detail.resources）
 *    - harmony:migrated          跨端迁移到达（detail.sessionId）
 *    - harmony:navigate          卡片/深链拉起路由（detail.route）
 * 4. rawfile/offline.html 重试按钮直接调用 __nativeBridge__.retry()（原生侧重新 loadUrl 线上 H5）。
 */
(function () {
  'use strict';
  if (window.__harmony__) return; // 幂等

  var listeners = {};
  var pendingQueue = []; // 原生代理未就绪时的指令缓冲（document-start 早于 proxy 挂载完成）
  var flushTimer = null;

  function ready() {
    return window.__nativeBridge__ && typeof window.__nativeBridge__.postMessage === 'function';
  }

  function flush() {
    if (!ready()) return;
    while (pendingQueue.length > 0) {
      window.__nativeBridge__.postMessage(pendingQueue.shift());
    }
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  }

  /** H5 → 原生：发送指令并等待回调 */
  function invoke(action, payload, callback) {
    var callId = 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    if (callback) listeners[callId] = callback;
    var msg = JSON.stringify({ callId: callId, action: action, payload: payload || {} });
    if (ready()) {
      window.__nativeBridge__.postMessage(msg);
    } else {
      pendingQueue.push(msg);
      if (!flushTimer) flushTimer = setInterval(flush, 80);
      setTimeout(function () { // 3s 仍未就绪：丢弃该回调，避免 H5 永久等待
        if (listeners[callId]) {
          delete listeners[callId];
          console.warn('[harmony-bridge] native bridge timeout, drop:', action);
        }
      }, 3000);
    }
  }

  /** 原生 → H5：统一入口（ArkTS 侧 runJavaScript 调用）
   *  callId 非空 → 单次调用回调；callId 为空且 err 为 null → 全局事件广播。 */
  window.__harmony_emit__ = function (callId, err, result) {
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch { /* 解析失败时保留原始字符串 */ }
    }
    var cb = callId ? listeners[callId] : null;
    if (cb) {
      delete listeners[callId];
      cb(err ? new Error(err) : null, result);
      return;
    }
    if (!callId && err === null && result && result.event) {
      document.dispatchEvent(new CustomEvent('harmony:' + result.event, { detail: result }));
    }
  };

  var bridge = {
    /** 环境标记：H5 可据此切换 UI 细节（如隐藏"下载App"引导） */
    isHarmony: true,
    osVersion: (navigator.userAgent.match(/(OpenHarmony|HarmonyOS)[^;]*/) || ['HarmonyOS'])[0],

    /** 监听原生广播事件：bridge.on('permissiondenied', fn) */
    on: function (name, handler) {
      document.addEventListener('harmony:' + name, function (e) { handler(e.detail); });
    },

    /** 注入安全区 CSS 变量（原生避让为主链路下的备用钩子；
     *  当前壳工程采用 Web 组件原生 padding 避让，H5 的 env(safe-area-inset-*) 恒为 0，
     *  本方法仅供后续切换沉浸式方案时使用，Web 项目现状不依赖它） */
    applySafeArea: function (topPx, bottomPx) {
      var root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', topPx + 'px');
      root.style.setProperty('--safe-area-inset-bottom', bottomPx + 'px');
      root.setAttribute('data-harmony', '1');
    },

    /** 原生触觉反馈（对应 Navigation.tsx 的 triggerHaptic，鸿蒙端更可靠） */
    vibrate: function (type) {
      invoke('vibrate', { type: type || 'light' });
    },

    /** 端侧 TTS（Core Speech Kit）：Web Speech API 音色不佳时降级到原生播报 */
    tts: function (text, opts, cb) {
      invoke('tts', { text: text, rate: (opts && opts.rate) || 1, voice: (opts && opts.voice) || 'zh-CN' }, cb);
    },

    /** 端侧 STT：当前版本保留协议并回错，H5 走服务端 ASR（stepfun）链路 */
    stt: function (opts, cb) {
      invoke('stt', opts || {}, cb);
    },

    /** 原生相机拍照（VR 即拍即识增强：直出高像素 JPEG base64，绕开 getUserMedia 兼容问题） */
    capturePhoto: function (opts, cb) {
      invoke('capturePhoto', { facing: (opts && opts.facing) || 'environment', quality: 0.85 }, cb);
    },

    /** 高精度定位（Location Kit，优于 H5 geolocation） */
    getLocation: function (cb) {
      invoke('getLocation', { highAccuracy: true }, cb);
    },

    /** 深链跳转：桌面卡片/碰一碰拉起时，原生通知 H5 切换 SPA 路由 */
    onNavigate: function (cb) {
      bridge.on('navigate', cb);
    },

    /** 分享打卡海报（鸿蒙分享面板）：payload = { title, text, imageBase64? } */
    share: function (payload) {
      invoke('share', payload);
    },

    /** 保活后台播放声明（FM 页进入时调用，配合音频后台任务） */
    beginAudioBackground: function () { invoke('audioBg', { on: true }); },
    endAudioBackground: function () { invoke('audioBg', { on: false }); }
  };

  Object.defineProperty(window, '__harmony__', { value: bridge, writable: false });
  console.info('[harmony-bridge] injected, v2');
})();
