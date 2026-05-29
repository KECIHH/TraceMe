$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:TRACEME_REPO) { $env:TRACEME_REPO } else { "https://github.com/KECIHH/TraceMe.git" }
$Branch = if ($env:TRACEME_BRANCH) { $env:TRACEME_BRANCH } else { "main" }
$InstallDir = if ($env:TRACEME_DIR) { $env:TRACEME_DIR } else { Join-Path $HOME "traceme" }
$TraceMePort = if ($env:TRACEME_PORT) { $env:TRACEME_PORT } else { "3000" }
$TraceMeBind = if ($env:TRACEME_BIND) { $env:TRACEME_BIND } else { "127.0.0.1" }
$AppBaseUrl = if ($env:APP_BASE_URL) { $env:APP_BASE_URL } else { "http://127.0.0.1:$TraceMePort" }
$AdminUsername = if ($env:INITIAL_ADMIN_USERNAME) { $env:INITIAL_ADMIN_USERNAME } else { "admin" }
$SeedExampleTrip = if ($env:SEED_EXAMPLE_TRIP) { $env:SEED_EXAMPLE_TRIP } else { "true" }

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function New-RandomSecret {
  param([int]$ByteCount)

  $bytes = [byte[]]::new($ByteCount)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [Convert]::ToBase64String($bytes)
}

function New-RandomPassword {
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  $bytes = [byte[]]::new(24)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

function Wait-ForHealth {
  Write-Host "Waiting for TraceMe to become healthy ..."

  for ($i = 0; $i -lt 60; $i++) {
    docker compose exec -T travel-planner node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }

    Start-Sleep -Seconds 2
  }

  Write-Host "TraceMe did not become healthy in time. Recent logs:" -ForegroundColor Red
  docker compose logs --tail=80 travel-planner
  exit 1
}

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $line = Get-Content -LiteralPath $Path -Encoding UTF8 |
    Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } |
    Select-Object -First 1

  if (-not $line) {
    return ""
  }

  ($line.Substring($line.IndexOf("=") + 1)).Trim('"')
}

function Write-EnvFile {
  param(
    [string]$Path,
    [string]$SessionSecret,
    [string]$AdminPassword
  )

  $openAiKey = if ($env:OPENAI_API_KEY) { $env:OPENAI_API_KEY } else { "" }
  $openAiModel = if ($env:OPENAI_MODEL) { $env:OPENAI_MODEL } else { "gpt-4.1-mini" }
  $aiProvider = if ($env:AI_PROVIDER) { $env:AI_PROVIDER } else { "openai" }
  $aiFeatureEnabled = if ($env:AI_FEATURE_ENABLED) { $env:AI_FEATURE_ENABLED } else { "true" }
  $documentEncryptionKey = if ($env:DOCUMENT_ENCRYPTION_KEY) { $env:DOCUMENT_ENCRYPTION_KEY } else { "" }

  @"
DATABASE_URL="file:./dev.db"
APP_BASE_URL="$AppBaseUrl"
SESSION_SECRET="$SessionSecret"
INITIAL_ADMIN_USERNAME="$AdminUsername"
INITIAL_ADMIN_PASSWORD="$AdminPassword"
TRACEME_BIND="$TraceMeBind"
TRACEME_PORT="$TraceMePort"

# Optional
OPENAI_API_KEY="$openAiKey"
OPENAI_MODEL="$openAiModel"
AI_PROVIDER="$aiProvider"
AI_FEATURE_ENABLED="$aiFeatureEnabled"
DOCUMENT_ENCRYPTION_KEY="$documentEncryptionKey"
SEED_EXAMPLE_TRIP="$SeedExampleTrip"
"@ | Set-Content -LiteralPath $Path -Encoding UTF8
}

Require-Command git
Require-Command docker

docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose v2 is required. Install Docker Desktop or the docker compose plugin first."
}

if (Test-Path -LiteralPath (Join-Path $InstallDir ".git")) {
  Write-Host "Updating TraceMe in $InstallDir ..."
  git -C $InstallDir fetch origin $Branch
  git -C $InstallDir checkout $Branch
  git -C $InstallDir pull --ff-only origin $Branch
} else {
  Write-Host "Cloning TraceMe into $InstallDir ..."
  $parent = Split-Path -Parent $InstallDir
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  git clone --branch $Branch $RepoUrl $InstallDir
}

Set-Location $InstallDir

$generatedPassword = ""
if (-not (Test-Path -LiteralPath ".env")) {
  $generatedPassword = New-RandomPassword
  Write-EnvFile -Path ".env" -SessionSecret (New-RandomSecret -ByteCount 48) -AdminPassword $generatedPassword
  Write-Host "Created .env with a generated admin password."
} else {
  Write-Host "Using existing .env."
}

Write-Host "Building and starting TraceMe ..."
docker compose up -d --build

Wait-ForHealth

Write-Host "Running initial admin seed ..."
docker compose exec -T travel-planner node scripts/seed-admin.mjs

$savedAppBaseUrl = Read-EnvValue -Path ".env" -Key "APP_BASE_URL"
$savedAdminUsername = Read-EnvValue -Path ".env" -Key "INITIAL_ADMIN_USERNAME"
if ($savedAppBaseUrl) {
  $AppBaseUrl = $savedAppBaseUrl
}
if ($savedAdminUsername) {
  $AdminUsername = $savedAdminUsername
}

Write-Host ""
Write-Host "TraceMe is ready."
Write-Host "URL: $AppBaseUrl"
Write-Host "Username: $AdminUsername"
if ($generatedPassword) {
  Write-Host "Password: $generatedPassword"
  Write-Host "The password was also saved in $InstallDir\.env."
} else {
  Write-Host "Password: read INITIAL_ADMIN_PASSWORD from $InstallDir\.env."
}
Write-Host ""
Write-Host "Manage it later with:"
Write-Host "  cd `"$InstallDir`"; docker compose ps"
Write-Host "  cd `"$InstallDir`"; docker compose logs -f"
