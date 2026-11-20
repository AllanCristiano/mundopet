# Escala a API entre 1 e 6 replicas. Uso: ./scripts/scale.ps1 6
param([Parameter(Mandatory = $true)][ValidateRange(1, 6)][int]$Replicas)

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    docker compose up -d --no-recreate --scale api=$Replicas api
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "API escalada para $Replicas replica(s). O nginx descobre as novas replicas em ate 10s."
    docker compose ps api
} finally {
    Pop-Location
}
