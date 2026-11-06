# 旅行家Pro · 静态资源同步脚本（Web public/ → 鸿蒙 rawfile）
# 只读复制，绝不修改/删除原项目任何文件。
# 用法：
#   默认（小体积，MVP 推荐）：powershell -ExecutionPolicy Bypass -File harmony\sync-resources.ps1
#   含景点大图（~120 张 webp，HAP 体积显著增大，离线缓存场景才需要）：
#   powershell -ExecutionPolicy Bypass -File harmony\sync-resources.ps1 -WithImages
param(
    [switch]$WithImages
)

$ErrorActionPreference = 'Stop'
$root     = Split-Path -Parent $PSScriptRoot          # 仓库根目录
$src      = Join-Path $root 'public'
$rawfile  = Join-Path $PSScriptRoot 'app\entry\src\main\resources\rawfile'
$dest     = Join-Path $rawfile 'assets'

if (-not (Test-Path $rawfile)) {
    New-Item -ItemType Directory -Path $rawfile -Force | Out-Null
}
if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

# 默认同步：首屏图 + 应用元信息（体积小）。
# 注意：rawfile 根目录的 offline.html 是鸿蒙壳专用页（重试走 __nativeBridge__.retry），
#       public/offline.html 同步到 assets/ 下仅作参考副本，不参与壳兜底逻辑。
$targets = @(
    'image',              # logo / gw / jd / VR / 城市背景等 webp
    'offline.html',       # Web 版离线页（参考副本 → assets/offline.html）
    'manifest.json'       # 应用元信息（名称/图标一致性）
)
if ($WithImages) {
    $targets += 'images\spots'   # 景点图（体积大，仅在需要离线缓存时开启）
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

# 同步 JSBridge 到 rawfile 根（Index.ets 按 rawfile/bridge.js 读取，ApiConfig.BRIDGE_SCRIPT）
Copy-Item -Path (Join-Path $PSScriptRoot 'web-bridge\bridge.js') `
          -Destination (Join-Path $rawfile 'bridge.js') -Force
Write-Host '[sync] bridge.js -> rawfile/bridge.js'
Write-Host '[sync] done. 原 public/ 目录未被修改。'
