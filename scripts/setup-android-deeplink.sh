#!/usr/bin/env bash
# Suntikkan intent-filter deep-link OAuth (nanime://) ke AndroidManifest.xml
# hasil `npx cap add android`. Idempoten — aman dijalankan berkali-kali.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: AndroidManifest.xml tidak ditemukan. Jalankan 'npx cap add android' dulu." >&2
  exit 1
fi

if grep -q 'android:scheme="nanime"' "$MANIFEST"; then
  echo "• intent-filter deep-link nanime:// sudah ada"
  exit 0
fi

# Sisipkan intent-filter sebagai anak <activity> utama (sebelum </activity>).
# Hanya menangani scheme nanime:// (bukan VIEW umum untuk http/https).
python3 - "$MANIFEST" << 'PY'
import sys, re
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    xml = f.read()

intent = (
    '            <intent-filter>\n'
    '                <action android:name="android.intent.action.VIEW" />\n'
    '                <category android:name="android.intent.category.DEFAULT" />\n'
    '                <category android:name="android.intent.category.BROWSABLE" />\n'
    '                <data android:scheme="nanime" />\n'
    '            </intent-filter>\n'
)

# Tempel sebelum </activity> pertama (activity utama MainActivity).
idx = xml.find('</activity>')
if idx == -1:
    print('ERROR: tidak menemukan </activity> di manifest.', file=sys.stderr)
    sys.exit(1)

# Cari awal baris </activity> untuk menjaga indentasi.
line_start = xml.rfind('\n', 0, idx) + 1
indent = xml[line_start:idx]
xml = xml[:line_start] + intent + xml[line_start:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(xml)
print('✓ intent-filter nanime:// ditambahkan ke AndroidManifest.xml')
PY
