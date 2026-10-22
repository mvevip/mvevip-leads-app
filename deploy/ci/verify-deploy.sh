#!/usr/bin/env bash
# Verificacion posterior al despliegue: /health, estado y hash de la Lambda, errores en logs.
# Variables: FUNCTION_NAME, REGION, HEALTH_URL, EXPECTED_SHA (opcional)
set -euo pipefail

for i in 1 2 3 4 5 6; do
  status=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query LastUpdateStatus --output text)
  [ "$status" = "Successful" ] && break
  echo "LastUpdateStatus=$status; esperando..."; sleep 5
done
[ "$status" = "Successful" ] || { echo "::error::La Lambda no termino de actualizarse ($status)"; exit 1; }

if [ -n "${EXPECTED_SHA:-}" ]; then
  live=$(aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --region "$REGION" --query CodeSha256 --output text)
  [ "$live" = "$EXPECTED_SHA" ] || { echo "::error::CodeSha256 distinto: esperado $EXPECTED_SHA, actual $live"; exit 1; }
  echo "CodeSha256 verificado."
fi

for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)
  [ "$code" = "200" ] && { echo "/health respondio 200."; break; }
  echo "/health respondio $code; reintento $i/5"; sleep 6
done
[ "$code" = "200" ] || { echo "::error::/health no respondio 200 ($code)"; exit 1; }

# Errores en los logs de los ultimos 3 minutos (tras dejar correr el cron un momento)
sleep 20
since=$(( ($(date +%s) - 180) * 1000 ))
errors=$(aws logs filter-log-events --log-group-name "/aws/lambda/$FUNCTION_NAME" --region "$REGION" \
  --start-time "$since" --filter-pattern '?ERROR ?"Task timed out" ?"Runtime.ImportModuleError"' \
  --query 'length(events)' --output text)
[ "$errors" = "0" ] || { echo "::error::$errors eventos de error en los logs tras el despliegue"; exit 1; }
echo "Sin errores en los logs."
