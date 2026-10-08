# ==============================================================================
# SCRIPT DE DESPLIEGUE EN AWS - MVEVIP LEAD PWA (leads.mvevip.com)
# Perfil AWS CLI: marketingvip
# ==============================================================================

param (
    [string]$BucketName = "mvevip-leads",
    [string]$CloudFrontDistributionId = "E2FMW6HOSKOVMP",
    [string]$LambdaFunctionName = "mvevip-lead-api",
    [switch]$DeployBackend = $false
)

$ErrorActionPreference = "Stop"
Write-Host ">>> Iniciando proceso de despliegue para MVEVIP Lead PWA en AWS..." -ForegroundColor Cyan

# 1. Despliegue de Backend si se solicita
if ($DeployBackend) {
    Write-Host "[BACKEND] Empaquetando y actualizando funcion Lambda: $LambdaFunctionName..." -ForegroundColor Yellow
    & "$PSScriptRoot/package-lambda.ps1"
    
    aws s3 cp "$PSScriptRoot/lambda-backend.zip" "s3://$BucketName/deployments/lambda-backend.zip" --profile marketingvip
    aws lambda update-function-code --function-name $LambdaFunctionName --s3-bucket $BucketName --s3-key "deployments/lambda-backend.zip" --region us-west-2 --profile marketingvip
    Write-Host "[BACKEND] Lambda backend actualizado con exito." -ForegroundColor Green
}

# 2. Compilacion del Frontend Vite
Write-Host "[FRONTEND] Compilando Frontend PWA para produccion (Vite)..." -ForegroundColor Yellow
docker exec mvevip_lead_client npm run build

# 3. Sincronizacion a AWS S3 con perfil marketingvip
Write-Host "[S3] Subiendo archivos estaticos a AWS S3 (Bucket: $BucketName)..." -ForegroundColor Yellow
aws s3 sync "$PSScriptRoot/../client/dist" "s3://$BucketName" --delete --exclude "deployments/*" --exclude "uploads/*" --profile marketingvip
aws s3 cp "$PSScriptRoot/../client/dist/index.html" "s3://$BucketName/index.html" --cache-control "no-cache, no-store, must-revalidate" --profile marketingvip
aws s3 cp "$PSScriptRoot/../client/dist/sw.js" "s3://$BucketName/sw.js" --cache-control "no-cache, no-store, must-revalidate" --profile marketingvip
aws s3 cp "$PSScriptRoot/../client/dist/version.json" "s3://$BucketName/version.json" --cache-control "no-cache, no-store, must-revalidate" --profile marketingvip

# 4. Invalidacion de Cache en CloudFront
if ($CloudFrontDistributionId -ne "") {
    Write-Host "[CLOUDFRONT] Invalidando cache de CloudFront ($CloudFrontDistributionId)..." -ForegroundColor Yellow
    aws cloudfront create-invalidation --distribution-id $CloudFrontDistributionId --paths "/*" --profile marketingvip
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "Despliegue completado con exito con el perfil marketingvip!" -ForegroundColor Green
Write-Host "Dominio: https://leads.mvevip.com" -ForegroundColor Cyan
Write-Host "CloudFront: d372galked0u7s.cloudfront.net (ID: $CloudFrontDistributionId)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Green
