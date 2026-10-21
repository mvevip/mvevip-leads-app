# Script de Empaquetado para AWS Lambda en Linux x86_64
$ErrorActionPreference = "Stop"

$serverDir = Resolve-Path "$PSScriptRoot/../server"
$deployDir = Resolve-Path "$PSScriptRoot"
$zipPath = "$deployDir/lambda-backend.zip"

# El contenedor monta /app/node_modules como volumen anonimo: una dependencia nueva de package.json NO aparece ahi
# hasta instalarla. Sin este paso, el paquete saldria sin ella y la Lambda fallaria al arrancar.
Write-Host "Instalando dependencias del servidor en el contenedor (npm install)..." -ForegroundColor Cyan
docker exec mvevip_lead_server npm install
if ($LASTEXITCODE -ne 0) {
    throw "npm install fallo dentro del contenedor mvevip_lead_server"
}

Write-Host "Generando cliente de Prisma para Lambda (rhel-openssl-3.0.x)..." -ForegroundColor Cyan
docker exec mvevip_lead_server npx prisma generate
if ($LASTEXITCODE -ne 0) {
    throw "prisma generate fallo dentro del contenedor mvevip_lead_server"
}

Write-Host "Eliminando empaquetado previo si existe..." -ForegroundColor Cyan
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Host "Empaquetando backend en $zipPath..." -ForegroundColor Cyan
docker exec mvevip_lead_server sh -c 'zip -q -r /app/lambda-backend.zip lambda.js package.json src prisma node_modules -x "*.git*" -x "*.md" -x "*.map" -x "node_modules/prisma/*" -x "node_modules/@prisma/engines/*" -x "node_modules/effect/*" -x "node_modules/fast-check/*"'

# Mover el archivo zip generado al directorio deploy
docker cp mvevip_lead_server:/app/lambda-backend.zip $zipPath
docker exec mvevip_lead_server rm -f /app/lambda-backend.zip

# Verificacion del contenido: cada dependencia de package.json y los archivos clave deben estar en el paquete
Write-Host "Verificando el contenido del paquete..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipFile = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = @($zipFile.Entries | ForEach-Object { $_.FullName })
} finally {
    $zipFile.Dispose()
}

$packageJson = Get-Content "$serverDir/package.json" -Raw | ConvertFrom-Json
$required = @("lambda.js", "package.json", "src/app.js", "node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node")
foreach ($dependency in $packageJson.dependencies.PSObject.Properties.Name) {
    $required += "node_modules/$dependency/package.json"
}

$missing = @($required | Where-Object { $entries -notcontains $_ })
if ($missing.Count -gt 0) {
    Remove-Item $zipPath -Force
    throw "El paquete Lambda esta incompleto y se descarto. Faltan: $($missing -join ', ')"
}
Write-Host "Contenido verificado: $($required.Count) elementos requeridos presentes." -ForegroundColor Green

$fileItem = Get-Item $zipPath
$zipSize = [math]::Round($fileItem.Length / 1MB, 2)
Write-Host "Paquete Lambda creado exitosamente: $zipSize MB en $zipPath" -ForegroundColor Green
