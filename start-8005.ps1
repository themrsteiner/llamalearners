$ErrorActionPreference = "Stop"

Set-Location "C:\dev\personal\classroom-schedule-maker"

if (-not (Test-Path -LiteralPath ".\node_modules")) {
    Write-Host "Installing dependencies first..." -ForegroundColor Yellow
    npm install
}

npm run host:dev -- --host 0.0.0.0 --port 8005
