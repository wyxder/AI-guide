/**
 * 旅行家Pro · HarmonyOS JSBridge（路线一：WebView 壳注入脚本）
 * 由 ArkWeb 的 javaScriptOnDocumentStart 在页面脚本执行前注入。
 * H5 侧统一通过 window.__harmony__ 判断鸿蒙环境并调用原生增强能力。
 *
 * 设计原则：
 * 1. 纯"增量增强"——所有能力均有 Web 降级实现，本脚本不存在时 H5 功能不损失；
 *    因此 Web 项目（src/）无需为本脚本做任何强制改造，原项目零影响。
 * 2. 通信桥：ArkTS → H5 使用 window.__harmony_emit__(event, payload)；
 *    H5 → ArkTS 使用 registerJavaScriptProxy 暴露的 __nativeBridge__.postMessage。
 */
(function () {
  'use strict';
  if (window.__harmony__) return; // 幂等

  var listeners = {};

  function ready() {
    return window.__nativeBridge__ && typeof window.__nativeBridge__.postMessage === 'function';
  }

  /** H5 → 原生：发送指令并等待回调 */
  function invoke(action, payload, callback) {
    var callId = 'c_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    if (callback) listeners[callId] = callback;
    var msg = JSON.stringify({ callId: callId, action: action, payload: payload || {} });
    if (ready()) {
      window.__nativeBridge__.postMessage(msg);
    } else {
      console.warn('[harmony-bridge] native bridge not ready, drop:', action);
    }
  }

  /** 原生 → H5：统一入口（ArkTS 侧 runJavaScript 调用） */
  window.__harmony_emit__ = function (callId, err, result) {
    var cb = listeners[callId];
    if (cb) {
      delete listeners[callId];
      cb(err ? new Error(err) : null, result);
    }
    // 无 callId 时为全局事件广播（如权限变化、卡片拉起路由）
    if (!callId && err) {
      document.dispatchEvent(new CustomEvent('harmony:' + result.event, { detail: result }));
    }
  };

  var bridge = {
    /** 环境标记：H5 可据此切换 UI 细节（如隐藏"下载App"引导） */
    isHarmony: true,
    osVersion: (navigator.userAgent.match(/(OpenHarmony|HarmonyOS)[^;]*/) || ['HarmonyOS'])[0],

    /** 注入安全区 CSS 变量，供 H5 底部 TabBar / TopBar 使用
     *  （与 LayoutShell.tsx 中 env(safe-area-inset-bottom) 逻辑互补） */
    applySafeArea: function (topVp, bottomVp) {
      var root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', topVp + 'vp');
      root.style.setProperty('--safe-area-inset-bottom', bottomVp + 'vp');
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

    /** 端侧 STT（Core Speech Kit）：替代 MediaRecorder + 服务端 ASR 的低延迟路径 */
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
      document.addEventListener('harmony:navigate', function (e) { cb(e.detail); });
    },

    /** 分享打卡海报（鸿蒙分享面板） */
    share: function (payload) {
      invoke('share', payload);
    },

    /** 保活后台播放声明（FM 页进入时调用，配合 AVSession 锁屏控制） */
    beginAudioBackground: function () { invoke('audioBg', { on: true }); },
    endAudioBackground: function () { invoke('audioBg', { on: false }); }
  };

  Object.defineProperty(window, '__harmony__', { value: bridge, writable: false });
  console.info('[harmony-bridge] injected, v1');
})();
