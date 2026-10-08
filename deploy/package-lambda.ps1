# Script de Empaquetado para AWS Lambda en Linux x86_64
$ErrorActionPreference = "Stop"

$serverDir = Resolve-Path "$PSScriptRoot/../server"
$deployDir = Resolve-Path "$PSScriptRoot"
$zipPath = "$deployDir/lambda-backend.zip"

Write-Host "Generando cliente de Prisma para Lambda (rhel-openssl-3.0.x)..." -ForegroundColor Cyan
docker exec mvevip_lead_server npx prisma generate

Write-Host "Eliminando empaquetado previo si existe..." -ForegroundColor Cyan
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Host "Empaquetando backend en $zipPath..." -ForegroundColor Cyan
docker exec mvevip_lead_server sh -c 'zip -q -r /app/lambda-backend.zip lambda.js package.json src prisma node_modules -x "*.git*" -x "*.md" -x "*.map" -x "node_modules/prisma/*" -x "node_modules/@prisma/engines/*" -x "node_modules/effect/*" -x "node_modules/fast-check/*"'

# Mover el archivo zip generado al directorio deploy
docker cp mvevip_lead_server:/app/lambda-backend.zip $zipPath
docker exec mvevip_lead_server rm -f /app/lambda-backend.zip

$fileItem = Get-Item $zipPath
$zipSize = [math]::Round($fileItem.Length / 1MB, 2)
Write-Host "Paquete Lambda creado exitosamente: $zipSize MB en $zipPath" -ForegroundColor Green
