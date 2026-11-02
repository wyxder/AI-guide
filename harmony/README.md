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
│   └── bridge.js                    # 注入 H5 的 JSBridge（WebView 壳方案核心，路线一使用）
└── app/                             # DevEco Studio 工程（HarmonyOS NEXT, API 12+）
    ├── AppScope/
    │   └── app.json5                # 应用级配置（bundleName、版本）
    ├── build-profile.json5          # 签名 / SDK 版本 / 产物配置
    ├── hvigorfile.ts                # 工程级构建脚本
    └── entry/
        ├── hvigorfile.ts
        ├── oh-package.json5
        └── src/main/
            ├── module.json5         # 权限、Ability、元数据声明
            ├── resources/base/element/string.json     # 权限用途文案（上架审核必填）
            └── ets/
                ├── config/ApiConfig.ets              # 云端 API / H5 地址配置
                ├── entryability/EntryAbility.ets     # 入口 Ability（沉浸式、跨端迁移预留）
                └── pages/Index.ets                   # ArkWeb 壳页面（加载 traveler-pro.vercel.app + JSBridge）
```

## 快速开始（路线一：ArkUI WebView 壳）

1. 安装 **DevEco Studio 5.0+**（HarmonyOS NEXT），SDK 选择 API 12+。
2. `File → Open` 选择本目录下的 `app/`（若首次打开报缺文件，按 IDE 提示补全 template 文件即可，本目录只保留业务相关文件）。
3. 修改 `app/entry/src/main/ets/config/ApiConfig.ets` 中的 `H5_URL`（默认指向线上 `https://traveler-pro.vercel.app`，局域网调试可改为 `http://192.168.x.x:3000`，需在 `module.json5` 里临时放开 cleartext）。
4. 将 `web-bridge/bridge.js` 拷贝至 `app/entry/src/main/resources/rawfile/bridge.js`（或执行根目录 `sync-resources.ps1`）。
5. `Build → Build Hap(s)/APP(s)` 产出 `.hap`，真机或模拟器运行。

## 与 Web 项目的协作约定

| 事项 | 约定 |
| :--- | :--- |
| 云端 API | 复用 Next.js Route Handlers（Vercel），鸿蒙端 **不迁移** 任何服务端逻辑与密钥 |
| 静态资源 | `public/image`、`public/images` 由脚本 **复制** 到鸿蒙 rawfile，原目录保持不动 |
| H5 页面 | 线上 Vercel 地址即鸿蒙 WebView 加载地址，Web 迭代 → 鸿蒙端自动生效（热更新形态） |
| 原生能力 | 相机、录音、定位、TTS/STT 通过 JSBridge 由 ArkTS 侧代理（见 `bridge.js`） |
