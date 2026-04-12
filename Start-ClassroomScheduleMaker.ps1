param(
    [ValidateSet("dev", "preview")]
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

$repoRoot = "C:\dev\personal\classroom-schedule-maker"
$hostArg = "0.0.0.0"
$port = 8005

Set-Location $repoRoot

if (-not (Test-Path -LiteralPath ".\node_modules")) {
    Write-Host "Installing dependencies first..." -ForegroundColor Yellow
    npm install
}

if ($Mode -eq "preview") {
    npm run build
    npm run host:preview -- --host $hostArg --port $port
} else {
    npm run host:dev -- --host $hostArg --port $port
}
