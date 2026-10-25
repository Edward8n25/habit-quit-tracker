# 启动本地开发服务器
# 用法：.\scripts\dev-server.ps1 [port]

param(
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'

# 切到项目根目录（脚本所在目录的上一级）
$ScriptDir = Split-Path -Parent $PSCommandPath
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Quit Tracker Dev Server" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Root: $ProjectRoot"
Write-Host "  URL:  http://localhost:$Port/"
Write-Host ""
Write-Host "  按 Ctrl+C 停止" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# 优先 python，备选 node
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
  & python -m http.server $Port
} else {
  $node = Get-Command npx -ErrorAction SilentlyContinue
  if ($node) {
    & npx -y http-server -p $Port -c-1
  } else {
    Write-Host "[ERROR] 需要安装 Python 或 Node.js 才能启动本地服务器" -ForegroundColor Red
    Write-Host "  下载 Python: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  下载 Node.js: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
  }
}
