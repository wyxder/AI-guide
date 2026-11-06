# harmony/ · 旅行家Pro 鸿蒙（HarmonyOS NEXT）移动端适配工程

> ⚠️ **隔离声明**：本目录是独立的鸿蒙适配工程，与根目录的 Web 项目（`src/`、`public/`、`doc/`、`next.config.ts` 等）**完全解耦**。
> 本目录内任何文件的增删改 **不会** 影响 Web 项目的 `bun dev / build / start` 与 Vercel 部署。
> Web 项目始终可独立运行；鸿蒙端通过 **远程 URL（路线一）** 或 **后续原生重写（路线二）** 消费同一套云端 API。

完整方案（架构分析、路线对比、实施步骤、上架流程、验收清单）见项目根目录 **`鸿蒙1.md`**。

---

## 目录结构

```
harmony/
├── README.md                        # 本文件
├── sync-resources.ps1               # 静态资源同步脚本（只读复制 public/ → 鸿蒙 rawfile，不改动原文件）
├── web-bridge/
│   └── bridge.js                    # 注入 H5 的 JSBridge v2（WebView 壳方案核心，路线一使用）
└── app/                             # DevEco Studio 工程（HarmonyOS NEXT, API 12+）
    ├── AppScope/
    │   ├── app.json5                # 应用级配置（bundleName、版本）
    │   └── resources/…              # 应用名资源 + app_icon
    ├── hvigor/hvigor-config.json5   # hvigor 构建系统配置（modelVersion 5.0.0）
    ├── oh-package.json5             # 工程级包描述
    ├── build-profile.json5          # 签名 / SDK 版本 / 产物配置
    ├── hvigorfile.ts                # 工程级构建脚本
    └── entry/
        ├── hvigorfile.ts
        ├── oh-package.json5
        └── src/main/
            ├── module.json5         # 权限、Ability（singleton）、avoid_cutout 元数据
            ├── resources/base/element/string.json     # 权限用途文案（上架审核必填）
            ├── resources/base/media/app_icon.png      # 桌面图标（由 public/icon-512.png 复制）
            ├── resources/rawfile/bridge.js            # 由 sync-resources.ps1 从 web-bridge/ 同步
            ├── resources/rawfile/offline.html         # 壳专用离线兜底页（重试走原生 bridge）
            └── ets/
                ├── config/ApiConfig.ets              # 云端 API / H5 地址 / 调试开关
                ├── entryability/EntryAbility.ets     # 入口 Ability（沉浸式、跨端迁移预留）
                ├── bridge/NativeBridge.ets           # JSBridge 原生侧处理器（震动/TTS/拍照/定位/分享/后台音频）
                └── pages/Index.ets                   # ArkWeb 壳页面（加载 H5 + javaScriptProxy + 兜底链路）
```

## 快速开始（路线一：ArkUI WebView 壳）

1. 安装 **DevEco Studio 5.0+**（HarmonyOS NEXT），SDK 选择 API 12+（5.0.0(12)）。
2. `File → Open` 选择本目录下的 `app/`，等待 Sync 完成。
3. **首次构建前配置调试签名**：`File → Project Structure → Signing Configs` → 勾选 `Automatically generate signature`
   （需登录华为开发者账号）。`build-profile.json5` 中 `signingConfigs` 留空是有意设计，IDE 会自动填充本地调试证书，
   未配置直接 `Build` 会报 "no signature" 错误。
4. 执行资源同步（生成/更新 `rawfile/bridge.js`）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File harmony\sync-resources.ps1
   ```
5. 环境地址在 `ets/config/ApiConfig.ets` 集中配置：
   - 默认加载线上 `https://traveler-pro.vercel.app`；
   - 局域网真机调试：把 `bun dev` 的地址填入 `DEBUG_H5_URL`（如 `http://192.168.x.x:3000`）并保持 `DEBUG=true`，
     `mixedContent` 与 bridge 注入规则会自动跟随，**无需改 module.json5**（旧版 README 提到的"放开 cleartext"系误述，
     HarmonyOS NEXT 的 WebView 不通过 module.json5 控制明文流量）；
   - **发布前**：`DEBUG` 改回 `false`（关闭 WebView DevTools 远程调试）。
6. `Build → Build Hap(s)/APP(s)` 产出 `.hap`，真机或模拟器运行。

## 能力链路速查

| 功能 | 链路 | 失败降级 |
| :-- | :-- | :-- |
| 登录会话持久化 | `domStorageAccess(true)` → localStorage `eazo.session` 落应用沙箱，杀进程重开保持 | — |
| SSE 问答流 | H5 `fetch /api/qa/chat` → ArkWeb Chromium 内核流式读取 | 与浏览器一致 |
| 相机/麦克风 | H5 `getUserMedia` → `onPermissionRequest` → 系统弹窗（按授权结果 grant/deny） | deny 时广播 `harmony:permissiondenied` |
| 拍照识别增强 | `__harmony__.capturePhoto()` → cameraPicker → base64 | H5 仍可用 getUserMedia 链路 |
| 语音输入 | H5 MediaRecorder → 服务端 stepfun ASR（原生 STT 预留协议桩） | — |
| TTS 播报增强 | `__harmony__.tts()` → Core Speech Kit（失败回 err） | H5 Web Speech |
| 定位 | `geolocationAccess` + `onGeolocationShow` 运行时申请；`__harmony__.getLocation()` 高精度 | H5 navigator.geolocation |
| 返回手势 | `onBackPress` → `accessBackward/backward` 逐层回退，栈空退出 | — |
| 安全区避让 | EntryAbility 避让区 px → AppStorage → Index.ets `@StorageProp` 原生 padding | 动态监听折叠/旋转 |
| 离线兜底 | 失败 1~2 次原生重试层；≥3 次或超时载入 `rawfile/offline.html`，重试按钮回在线 | — |
| 后台音频 FM | `__harmony__.beginAudioBackground()` → AUDIO_PLAYBACK 后台任务（KEEP_BACKGROUND_RUNNING） | 前台播放不受影响 |

## 与 Web 项目的协作约定

| 事项 | 约定 |
| :--- | :--- |
| 云端 API | 复用 Next.js Route Handlers（Vercel），鸿蒙端 **不迁移** 任何服务端逻辑与密钥 |
| 静态资源 | `public/image`、`public/images` 由脚本 **复制** 到鸿蒙 rawfile，原目录保持不动（`images\spots` 需显式 `-WithImages`） |
| H5 页面 | 线上 Vercel 地址即鸿蒙 WebView 加载地址，Web 迭代 → 鸿蒙端自动生效（热更新形态） |
| 原生能力 | 相机、录音、定位、TTS/STT 通过 JSBridge 由 ArkTS 侧代理（`bridge.js` ↔ `NativeBridge.ets`） |
| 增量增强 | H5 不强制适配 bridge：`window.__harmony__` 不存在时 Web 功能零损失，src/ 无需任何改动 |
