# ==============================================================================
# CARGA O QUITA UNA VARIABLE DE ENTORNO DE LA LAMBDA SIN PERDER LAS DEMÁS
# Pensado para secretos (por ejemplo CHATRACE_API_TOKEN): el valor se pide con entrada oculta,
# no queda en pantalla, ni en el historial de la terminal, ni en el repositorio.
#
# Por qué existe: `aws lambda update-function-configuration --environment` REEMPLAZA todas las variables.
# Este script lee las actuales, cambia solo la indicada y escribe el conjunto completo.
#
# Uso (PowerShell, perfil de AWS CLI `marketingvip`):
#   .\deploy\set-lambda-env.ps1 -DryRun                      # simulación: no cambia nada (hacerla primero)
#   .\deploy\set-lambda-env.ps1                              # carga CHATRACE_API_TOKEN (pide el valor oculto)
#   .\deploy\set-lambda-env.ps1 -Remove                      # quita CHATRACE_API_TOKEN (apaga la integración al instante)
#   .\deploy\set-lambda-env.ps1 -VariableName CHATRACE_DEFAULT_COUNTRY   # otra variable
#
# Qué NO hace: no muestra valores (solo nombres), no guarda copias de los secretos en disco
# (el archivo temporal necesario para la AWS CLI se borra siempre, incluso si hay un error).
# ==============================================================================

param (
    [string]$FunctionName = "mvevip-lead-api",
    [string]$Region = "us-west-2",
    [string]$Profile = "marketingvip",
    [ValidatePattern('^[A-Z][A-Z0-9_]*$')]
    [string]$VariableName = "CHATRACE_API_TOKEN",
    [switch]$Remove,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-Aws {
    # Ejecuta la AWS CLI y falla si el código de salida no es 0 (los errores de aws no son excepciones de PowerShell)
    $output = & aws @args
    if ($LASTEXITCODE -ne 0) {
        throw "La AWS CLI falló (código $LASTEXITCODE) al ejecutar: aws $($args[0]) $($args[1])"
    }
    return $output
}

Write-Host ">>> Lambda: $FunctionName  |  región: $Region  |  perfil: $Profile" -ForegroundColor Cyan

# 1. Leer las variables actuales (valores solo en memoria; nunca se imprimen)
$currentJson = Invoke-Aws lambda get-function-configuration --function-name $FunctionName --region $Region --profile $Profile --query "Environment.Variables" --output json
$current = @{}
$parsed = ($currentJson -join "`n") | ConvertFrom-Json
if ($null -ne $parsed) {
    foreach ($property in $parsed.PSObject.Properties) { $current[$property.Name] = [string]$property.Value }
}
Write-Host "Variables actuales ($($current.Count)): $(($current.Keys | Sort-Object) -join ', ')"

# 2. Preparar el conjunto nuevo
$updated = @{}
foreach ($key in $current.Keys) { $updated[$key] = $current[$key] }

if ($Remove) {
    if (-not $updated.ContainsKey($VariableName)) {
        Write-Host "La variable $VariableName no existe: no hay nada que quitar." -ForegroundColor Yellow
        return
    }
    $updated.Remove($VariableName)
    Write-Host "Se QUITARÁ $VariableName (si es CHATRACE_API_TOKEN, la integración quedará apagada)." -ForegroundColor Yellow
}
else {
    $secure = Read-Host "Pega el valor de $VariableName (no se mostrará)" -AsSecureString
    $plain = [System.Net.NetworkCredential]::new("", $secure).Password
    if ([string]::IsNullOrWhiteSpace($plain)) { throw "El valor está vacío: no se hizo ningún cambio." }
    if ($plain -match '\s') { throw "El valor contiene espacios o saltos de línea (¿se pegó con un salto de línea?): no se hizo ningún cambio." }
    $existed = $updated.ContainsKey($VariableName)
    $updated[$VariableName] = $plain
    Write-Host "Se $(if ($existed) { 'ACTUALIZARÁ' } else { 'AGREGARÁ' }) $VariableName ($($plain.Length) caracteres)."
}

if ($DryRun) {
    Write-Host "`nSIMULACIÓN: no se escribió nada. Variables que quedarían ($($updated.Count)): $(($updated.Keys | Sort-Object) -join ', ')" -ForegroundColor Green
    $plain = $null
    return
}

# 3. Escribir el conjunto completo. El JSON temporal contiene secretos: se borra SIEMPRE (finally).
$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("lambda-env-" + [guid]::NewGuid().ToString("N") + ".json")
try {
    $payload = @{ Variables = $updated } | ConvertTo-Json -Compress
    # UTF-8 sin BOM (con BOM, la AWS CLI puede rechazar el JSON)
    [System.IO.File]::WriteAllText($tempFile, $payload, (New-Object System.Text.UTF8Encoding($false)))

    # --query evita que la respuesta imprima la configuración completa (incluiría todos los secretos)
    $status = Invoke-Aws lambda update-function-configuration --function-name $FunctionName --environment "file://$tempFile" --region $Region --profile $Profile --query "LastUpdateStatus" --output text
    Write-Host "Actualización enviada (estado: $status). Esperando a que termine..."
    Invoke-Aws lambda wait function-updated --function-name $FunctionName --region $Region --profile $Profile | Out-Null
}
finally {
    if (Test-Path $tempFile) { Remove-Item $tempFile -Force }
    $plain = $null
    $payload = $null
}

# 4. Verificar: no se perdió ninguna variable y la indicada quedó como se pidió (solo nombres, nunca valores)
$afterJson = Invoke-Aws lambda get-function-configuration --function-name $FunctionName --region $Region --profile $Profile --query "Environment.Variables" --output json
$after = ($afterJson -join "`n") | ConvertFrom-Json
$afterNames = @()
if ($null -ne $after) { $afterNames = @($after.PSObject.Properties.Name) }

$expected = @($updated.Keys)
$missing = @($expected | Where-Object { $afterNames -notcontains $_ })
$unexpected = @($afterNames | Where-Object { $expected -notcontains $_ })
if ($missing.Count -gt 0 -or $unexpected.Count -gt 0) {
    Write-Host "ATENCIÓN: el resultado no coincide con lo esperado. Faltan: [$($missing -join ', ')]  Sobran: [$($unexpected -join ', ')]" -ForegroundColor Red
    exit 1
}

Write-Host "`nListo. Variables ahora ($($afterNames.Count)): $(($afterNames | Sort-Object) -join ', ')" -ForegroundColor Green
if ($Remove) {
    Write-Host "$VariableName ya NO está definida." -ForegroundColor Green
}
else {
    Write-Host "$VariableName quedó definida." -ForegroundColor Green
    Write-Host "Para comprobarlo: abre la app como administrador -> Perfil -> Integración Chatrace (debe decir 'Conectada')."
}
