#!/usr/bin/env bash
# Empaqueta el backend para Lambda (Linux x86_64) y verifica su contenido.
# Equivalente a deploy/package-lambda.ps1, pero sin Docker. Uso: deploy/ci/package-lambda.sh [salida.zip]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$(realpath -m "${1:-$ROOT/deploy/lambda-backend.zip}")"

cd "$ROOT/server"
npm ci --no-audit --no-fund
npx prisma generate

rm -f "$OUT"
zip -q -r "$OUT" lambda.js package.json src prisma node_modules \
  -x "*.git*" -x "*.md" -x "*.map" \
  -x "node_modules/prisma/*" -x "node_modules/@prisma/engines/*" \
  -x "node_modules/effect/*" -x "node_modules/fast-check/*"

# Cada dependencia de package.json y los archivos clave deben estar en el paquete
required=$(node -e '
  const deps = Object.keys(require("./package.json").dependencies);
  const files = ["lambda.js","package.json","src/app.js","node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node"];
  console.log([...files, ...deps.map(d => `node_modules/${d}/package.json`)].join("\n"));
')
entries=$(unzip -Z1 "$OUT")
missing=0
while IFS= read -r f; do
  if ! grep -Fxq "$f" <<<"$entries"; then
    echo "::error::Falta en el paquete: $f"
    missing=1
  fi
done <<<"$required"
if [ "$missing" -ne 0 ]; then
  rm -f "$OUT"
  echo "El paquete Lambda esta incompleto y se descarto." >&2
  exit 1
fi

echo "Paquete verificado: $(wc -l <<<"$required") elementos requeridos presentes ($(du -h "$OUT" | cut -f1))."
