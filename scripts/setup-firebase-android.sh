#!/usr/bin/env bash
# Tempel google-services.json ke project Android hasil `cap add android`
# dan pasang plugin com.google.gms.google-services (hanya jika config tersedia).
#
# Sumber config:
#   1. env GOOGLE_SERVICES_JSON_B64 (base64) — dipakai CI dari GitHub Secret
#   2. file secrets/google-services.json    — untuk build lokal (di-gitignore)
#
# Dipakai setelah: npx cap add android && npx cap sync android
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_DIR="$ANDROID_DIR/app"
TARGET_JSON="$APP_DIR/google-services.json"

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: folder android/app tidak ditemukan. Jalankan 'npx cap add android' dulu." >&2
  exit 1
fi

# --- 1. Cari & tulis google-services.json ---
FOUND=0
if [ -n "${GOOGLE_SERVICES_JSON_B64:-}" ]; then
  echo "$GOOGLE_SERVICES_JSON_B64" | base64 -d > "$TARGET_JSON"
  FOUND=1
  echo "✓ google-services.json ditulis dari env GOOGLE_SERVICES_JSON_B64"
elif [ -f "$ROOT/secrets/google-services.json" ]; then
  cp "$ROOT/secrets/google-services.json" "$TARGET_JSON"
  FOUND=1
  echo "✓ google-services.json disalin dari secrets/google-services.json"
fi

if [ "$FOUND" -eq 0 ]; then
  echo "WARN: tidak ada sumber config Firebase — build lanjut tanpa google-services." >&2
  echo "  - Set GitHub Secret ANDROID_GOOGLE_SERVICES_JSON (base64), atau" >&2
  echo "  - letakkan file di secrets/google-services.json (lokal)." >&2
  rm -f "$TARGET_JSON"
  exit 0
fi

# Validasi JSON minimal
if ! grep -q '"package_name"' "$TARGET_JSON"; then
  echo "ERROR: google-services.json tidak valid (package_name tidak ada)." >&2
  exit 1
fi

# --- 2. Pastikan classpath google-services ada di build.gradle root ---
ROOT_GRADLE="$ANDROID_DIR/build.gradle"
if ! grep -q "com.google.gms:google-services" "$ROOT_GRADLE"; then
  sed -i.bak 's/dependencies {/dependencies {\n        classpath "com.google.gms:google-services:4.4.2"/' "$ROOT_GRADLE"
  rm -f "$ROOT_GRADLE.bak"
  echo "✓ classpath google-services ditambahkan ke build.gradle root"
else
  echo "• classpath google-services sudah ada"
fi

# --- 3. Terapkan plugin di app/build.gradle ---
APP_GRADLE="$APP_DIR/build.gradle"
if ! grep -q "com.google.gms.google-services" "$APP_GRADLE"; then
  printf '\napply plugin: "com.google.gms.google-services"\n' >> "$APP_GRADLE"
  echo "✓ plugin google-services diterapkan di app/build.gradle"
else
  echo "• plugin google-services sudah diterapkan"
fi

echo "Firebase config siap untuk build Android."
