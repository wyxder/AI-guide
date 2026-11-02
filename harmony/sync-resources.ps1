# 旅行家Pro · 静态资源同步脚本（Web public/ → 鸿蒙 rawfile）
# 只读复制，绝不修改/删除原项目任何文件。
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File harmony\sync-resources.ps1

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot          # 仓库根目录
$src     = Join-Path $root 'public'
$dest    = Join-Path $PSScriptRoot 'app\entry\src\main\resources\rawfile\assets'

# 需要同步的静态资源子目录/文件（与 H5 壳离线兜底、首屏图相关）
$targets = @(
    'image',              # logo / gw / jd / VR / 城市背景等 webp
    'images\spots',       # 景点图（按需，体积大，MVP 可注释掉）
    'offline.html',       # 弱网兜底页
    'manifest.json'       # 应用元信息（名称/图标一致性）
)

if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

foreach ($t in $targets) {
    $from = Join-Path $src $t
    if (Test-Path $from) {
        $to = Join-Path $dest $t
        $toDir = Split-Path -Parent $to
        if (-not (Test-Path $toDir)) { New-Item -ItemType Directory -Path $toDir -Force | Out-Null }
        if ((Get-Item $from).PSIsContainer) {
            Copy-Item -Path $from -Destination (Split-Path -Parent $to) -Recurse -Force
            Write-Host "[sync] DIR  $from -> $to"
        } else {
            Copy-Item -Path $from -Destination $to -Force
            Write-Host "[sync] FILE $from -> $to"
        }
    } else {
        Write-Warning "[sync] skip (not found): $from"
    }
}

# 同步 JSBridge 到 rawfile 根（Index.ets 按 rawfile/bridge.js 读取）
Copy-Item -Path (Join-Path $PSScriptRoot 'web-bridge\bridge.js') `
          -Destination (Join-Path $PSScriptRoot 'app\entry\src\main\resources\rawfile\bridge.js') -Force
Write-Host '[sync] bridge.js -> rawfile/bridge.js'
Write-Host '[sync] done. 原 public/ 目录未被修改。'
