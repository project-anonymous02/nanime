#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
SOURCE="$ROOT/native/android/com/nanime/app"
TARGET="$ANDROID/app/src/main/java/com/nanime/app"
MANIFEST="$ANDROID/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: AndroidManifest.xml tidak ditemukan. Jalankan 'npx cap add android' dulu." >&2
  exit 1
fi

mkdir -p "$TARGET"
cp "$SOURCE/MainActivity.java" "$TARGET/MainActivity.java"
cp "$SOURCE/PictureInPicturePlugin.java" "$TARGET/PictureInPicturePlugin.java"

python3 - "$MANIFEST" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
xml = path.read_text(encoding='utf-8')
start = xml.find('<activity')
end = xml.find('>', start)
if start < 0 or end < 0:
    raise SystemExit('ERROR: activity utama tidak ditemukan di manifest')
activity = xml[start:end]
for key, value in [('android:supportsPictureInPicture', 'true'), ('android:resizeableActivity', 'true')]:
    if key not in activity:
        activity += f'\n            {key}="{value}"'
xml = xml[:start] + activity + xml[end:]
path.write_text(xml, encoding='utf-8')
print('✓ dukungan Picture-in-Picture ditambahkan ke activity Nanime')
PY

echo "✓ native PiP plugin dan MainActivity Nanime dipasang"
