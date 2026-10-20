#!/usr/bin/env python3
"""Bandingkan UI Nanime dengan source AniBiPlay tanpa browser.

Sumber: /tmp/Anibiplay-decompiled/sources (decompiled APK)
Target: /workspace/nanime/src

Fokus: palet warna, radius, font, label kunci, cakupan kelas CSS,
dan aset visual. Semua pembacaan file lokal dan selesai dalam hitungan detik.
"""

from __future__ import annotations

import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = '/tmp/Anibiplay-decompiled/sources'
DEFPACKAGE = os.path.join(SOURCE, 'defpackage')
STYLES = os.path.join(ROOT, 'src', 'styles')
VIEWS = os.path.join(ROOT, 'src')
REFERENCE = '/tmp/opencode/test'

HEX_RE = re.compile(r'#[0-9a-fA-F]{6}\b')
SOURCE_COLOR_RE = re.compile(r'n17\.[cd]\((\d+)L?\)')
SOURCE_HEX_RE = re.compile(r'0x[fF]{2}([0-9a-fA-F]{6})\b')
RADIUS_RE = re.compile(r'fw5\.b\((\d+)(?:\.\d+)?[fF]?\)')
CSS_RADIUS_RE = re.compile(r'--r-[a-z0-9]+:\s*(\d+)px')
CLASS_ATTR_RE = re.compile(r'className\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{([^}]*)\})')
CLASS_TOKEN_RE = re.compile(r'[A-Za-z][A-Za-z0-9_-]*')
CSS_CLASS_RE = re.compile(r'\.([A-Za-z][A-Za-z0-9_-]*)')

KEY_STRINGS = [
    'Terakhir Ditonton',
    'Selengkapnya',
    'Komentar',
    'Pesan Developer',
    'Jadwal',
    'Riwayat',
    'Subscribed',
    'SocialLine',
    'Public Chat',
    'Leaderboard',
    'Afinitas',
    'Nobar',
    'Pengaturan',
    'Notifikasi',
]
NAV_LABELS = ['Home', 'Jadwal', 'Subscribed', 'Riwayat', 'SocialLine']


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT)


def read(path: str) -> str:
    try:
        with open(path, encoding='utf-8', errors='replace') as handle:
            return handle.read()
    except OSError:
        return ''


def walk(directory: str, suffix: str = '') -> list[str]:
    found: list[str] = []
    for base, _, files in os.walk(directory):
        for name in files:
            if not suffix or name.endswith(suffix):
                found.append(os.path.join(base, name))
    return found


def color_from_argb(value: int) -> tuple[int, int, int]:
    return (value >> 16) & 255, (value >> 8) & 255, value & 255


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def main() -> int:
    if not os.path.isdir(SOURCE):
        print(f'Source dekompilasi tidak ditemukan: {SOURCE}', file=sys.stderr)
        return 2

    source_ui = [os.path.join(DEFPACKAGE, name) for name in ('pz2.java', 'dr2.java')]
    source_ui = [path for path in source_ui if os.path.exists(path)]
    source_text = '\n'.join(read(path) for path in source_ui)

    source_colors: Counter[str] = Counter()
    for match in SOURCE_COLOR_RE.finditer(source_text):
        red, green, blue = color_from_argb(int(match.group(1)))
        source_colors[f'#{red:02x}{green:02x}{blue:02x}'] += 1
    for match in SOURCE_HEX_RE.finditer(source_text):
        source_colors['#' + match.group(1).lower()] += 1

    css_files = walk(STYLES, '.css')
    css_text = '\n'.join(read(path) for path in css_files)
    css_colors = {color.lower() for color in HEX_RE.findall(css_text)}
    for red, green, blue in re.findall(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', css_text):
        css_colors.add(f'#{int(red):02x}{int(green):02x}{int(blue):02x}')

    missing_colors: list[tuple[str, int, str, float]] = []
    css_rgb = {
        color: tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))
        for color in css_colors
    }
    for color, count in source_colors.most_common():
        if color in css_colors:
            continue
        rgb = tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))
        nearest = min(css_rgb, key=lambda candidate: color_distance(rgb, css_rgb[candidate]), default='-')
        delta = color_distance(rgb, css_rgb[nearest]) if nearest in css_rgb else 999.0
        missing_colors.append((color, count, nearest, delta))

    source_radii = sorted({int(value) for value in RADIUS_RE.findall(source_text)})
    css_radii = sorted({int(value) for value in CSS_RADIUS_RE.findall(css_text)})

    source_string_text = read(os.path.join(DEFPACKAGE, 'pz2.java'))
    present_strings = [label for label in KEY_STRINGS if label in source_string_text]
    tsx_text = '\n'.join(read(path) for path in walk(VIEWS, '.tsx'))
    missing_strings = [label for label in present_strings if label.lower() not in tsx_text.lower()]

    shell = read(os.path.join(ROOT, 'src', 'shell', 'Shell.tsx'))
    missing_nav = [label for label in NAV_LABELS if f"'{label}'" not in shell and f'"{label}"' not in shell]

    used_classes: set[str] = set()
    for path in walk(VIEWS, '.tsx'):
        text = read(path)
        for match in CLASS_ATTR_RE.finditer(text):
            blob = match.group(1) or match.group(2) or match.group(3) or ''
            blob = re.sub(r'\$\{[^}]*\}', ' ', blob)
            blob = re.sub(r'([\'\"])/[^\'\"]*\1', ' ', blob)
            used_classes.update(CLASS_TOKEN_RE.findall(blob))
    css_classes = set(CSS_CLASS_RE.findall(css_text))
    noise = {
        'className', 'true', 'false', 'undefined', 'null', 'void', 'function', 'return',
        'const', 'let', 'var', 'if', 'else', 'useState', 'useMemo', 'useEffect', 'map',
        'filter', 'join', 'active', 'on', 'selected', 'current',
    }
    missing_classes = sorted(
        name for name in used_classes
        if name not in css_classes
        and '-' in name
        and name not in noise
        and not name.isupper()
        and not name.endswith('Id')
        and not name.endswith('-')
    )

    fonts = read(os.path.join(STYLES, 'base.css'))
    font_checks = {
        'AniBiRoboto (roboto_regular.ttf)': 'roboto_regular.ttf' in fonts,
        'AniBiRoboto (roboto_medium.ttf)': 'roboto_medium.ttf' in fonts,
        'AniBiDisplay (madsense.otf)': 'madsense.otf' in fonts,
    }

    def count_files(path: str, predicate) -> int:
        if not os.path.isdir(path):
            return 0
        return sum(1 for name in os.listdir(path) if predicate(os.path.join(path, name)))

    rank_assets = count_files(os.path.join(ROOT, 'public', 'anibiplay-ranks'), lambda p: p.endswith('.png'))
    affinity_assets = count_files(os.path.join(ROOT, 'public', 'anibiplay-affinity'), lambda p: p.endswith('.png'))
    game_assets = count_files(os.path.join(ROOT, 'public', 'anibiplay-source', 'games'), lambda p: p.lower().endswith(('.png', '.webp', '.jpg')))
    screenshots = count_files(REFERENCE, lambda p: re.search(r'Screenshot_.*\.jpg$', p, re.I) is not None)

    print('PERBANDINGAN UI ANIBIPLAY -> NANIME')
    print('=' * 46)
    print(f'Source UI      : {", ".join(os.path.basename(path) for path in source_ui)}')
    print(f'Warna source   : {len(source_colors)} unik ({sum(source_colors.values())} pemakaian)')
    print(f'Warna CSS      : {len(css_colors)} unik')
    print(f'Radius source  : {source_radii}')
    print(f'Radius token   : {css_radii}')
    print(f'Kelas CSS      : {len(css_classes)} selector dari {len(css_files)} file')
    print(f'Kelas JSX      : {len(used_classes)} token')
    print(f'Aset           : {screenshots} screenshot, {rank_assets} rank, {affinity_assets} afinitas, {game_assets} game')
    print()

    print('--- WARNA SOURCE YANG BELUM ADA DI CSS ---')
    if not missing_colors:
        print('OK: semua warna source sudah tercakup.')
    else:
        for color, count, nearest, delta in missing_colors[:20]:
            print(f'{color} x{count:<3} terdekat {nearest} (delta {delta:.1f})')
        if len(missing_colors) > 20:
            print(f'... {len(missing_colors) - 20} warna lain')
    print()

    print('--- RADIUS ---')
    missing_radii = [value for value in source_radii if value not in css_radii]
    print('OK: semua radius source ada di token.' if not missing_radii else f'Belum ada: {missing_radii}')
    print()

    print('--- FONT ---')
    for label, ok in font_checks.items():
        print(f'{"OK " if ok else "MISS"} {label}')
    print()

    print('--- LABEL KUNCI ---')
    print(f'Ditemukan di source: {", ".join(present_strings) or "-"}')
    print('Semua label ada di TSX.' if not missing_strings else f'Belum ada di TSX: {", ".join(missing_strings)}')
    print()

    print('--- NAVIGASI BAWAH ---')
    print('OK: 5 label sesuai source.' if not missing_nav else f'Belum sesuai: {", ".join(missing_nav)}')
    print()

    print('--- KELAS JSX TANPA SELECTOR CSS ---')
    if not missing_classes:
        print('OK: tidak ada kelas nyata yang hilang.')
    else:
        print(', '.join(missing_classes))
    print()

    total_issues = (
        len(missing_colors)
        + len(missing_radii)
        + sum(1 for ok in font_checks.values() if not ok)
        + len(missing_strings)
        + len(missing_nav)
        + len(missing_classes)
    )
    print(f'HASIL: {total_issues} temuan')
    return 0 if total_issues == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
