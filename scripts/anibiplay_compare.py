#!/usr/bin/env python3
"""AniBiPlay <-> Nanime automated comparison.

This tool is intentionally dependency-light and reusable. It inventories both
code bases, extracts the AniBiPlay API/provider contract from the decompiled APK,
checks Nanime's UI/CSS/assets and provider integration, and writes a compact
JSON + Markdown report.

Examples:
    python3 scripts/anibiplay_compare.py all
    python3 scripts/anibiplay_compare.py ui --changed
    python3 scripts/anibiplay_compare.py providers
    python3 scripts/anibiplay_compare.py screenshots
    python3 scripts/anibiplay_compare.py all --fail-on high

Outputs:
    analysis/anibiplay-report.json
    analysis/anibiplay-report.md
    analysis/resolved.json
    .cache/anibiplay-compare/cache.json

The tool never prints or stores secret values. Screenshot metrics are aggregate
signals only (layout/function checks remain authoritative).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Iterable

try:
    from PIL import Image, ImageFilter, ImageStat
except Exception:  # pragma: no cover - optional dependency
    Image = None  # type: ignore

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
STYLES = os.path.join(SRC, 'styles')
PUBLIC = os.path.join(ROOT, 'public')
TESTS = os.path.join(ROOT, 'tests')
OUT_DIR = os.path.join(ROOT, 'analysis')
CACHE_DIR = os.path.join(ROOT, '.cache', 'anibiplay-compare')
CACHE_FILE = os.path.join(CACHE_DIR, 'cache.json')
REPORT_JSON = os.path.join(OUT_DIR, 'anibiplay-report.json')
REPORT_MD = os.path.join(OUT_DIR, 'anibiplay-report.md')
RESOLVED_FILE = os.path.join(OUT_DIR, 'resolved.json')
SCHEMA = 2

REF_CANDIDATES = [
    '/tmp/anibiplay',
    '/tmp/Anibiplay',
]
DECOMPILED_CANDIDATES = [
    '/tmp/anibiplay-decompiled',
    '/tmp/Anibiplay-decompiled',
]
SHOT_CANDIDATES = ['/tmp/opencode/test', os.path.join(ROOT, 'screenshot')]

SEVERITY_ORDER = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
SEVERITY_WEIGHT = {'critical': 20, 'high': 8, 'medium': 3, 'low': 1}

SOURCE_UI_FILES = ['pz2.java', 'dr2.java', 'n17.java']
EXPECTED_NAV = ['Home', 'Jadwal', 'Subscribed', 'Riwayat', 'SocialLine']
EXPECTED_SCREENS = {
    'home': ['home'],
    'jadwal': ['schedule', 'jadwal'],
    'subscribed': ['subscribed', 'favorites'],
    'riwayat': ['history', 'riwayat'],
    'socialline': ['community', 'socialline'],
    'public chat': ['public-chat'],
    'leaderboard': ['leaderboard'],
    'afinitas': ['affinity'],
    'nobar': ['watch-party'],
    'games': ['games', 'anibi-games'],
    'pencarian': ['search'],
    'detail': ['detail'],
    'profil': ['profile'],
    'pengaturan': ['settings'],
    'notifikasi': ['notifications'],
    'komentar': ['comments'],
    'ranking': ['ranking'],
}
KEY_UI_COMPONENTS = {
    'bottom-navigation': ['bottom-nav'],
    'player-overlay': ['player', 'gp-', 'video'],
    'quality-sheet': ['quality', 'sheet'],
    'download-sheet': ['download'],
    'comments': ['comment'],
    'schedule': ['schedule'],
    'profile': ['profile'],
    'notifications': ['notification', 'bell'],
    'search': ['search'],
}
ANIBI_ENDPOINTS = ['home', 'catalog', 'detail/{id}', 'episodemeta/{key}', 'genres/{key}/series', 'topseries', 'jadwal', 'announcement']
ANIBI_INTEGRATIONS = {
    'catalog/search': ['catalog', 'search'],
    'detail merge': ['detail', 'merge'],
    'episode metadata': ['episodemeta', 'episode'],
    'streams': ['stream', 'resolution'],
    'play resolve': ['play', 'resolve'],
    'downloads': ['download', 'link'],
    'schedule': ['jadwal', 'schedule'],
    'genres': ['genres', 'genre'],
    'top series': ['topseries', 'ranking'],
}
NANIME_PROVIDER_FILES = ['registry.ts', 'types.ts', 'factory.ts', 'legacy.ts', 'shared.ts']


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------


def rel(path: str) -> str:
    try:
        return os.path.relpath(path, ROOT)
    except ValueError:
        return path


def find_dir(candidates: Iterable[str]) -> str | None:
    for path in candidates:
        if os.path.isdir(path):
            return path
    return None


def read_text(path: str, limit: int | None = None) -> str:
    try:
        with open(path, encoding='utf-8', errors='replace') as handle:
            return handle.read(limit) if limit else handle.read()
    except OSError:
        return ''


def read_bytes(path: str) -> bytes:
    try:
        with open(path, 'rb') as handle:
            return handle.read()
    except OSError:
        return b''


def walk_files(directory: str, suffixes: tuple[str, ...] | None = None) -> list[str]:
    found: list[str] = []
    if not os.path.isdir(directory):
        return found
    for base, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in {'node_modules', '.git', 'dist', '.cache'}]
        for name in files:
            if suffixes and not name.endswith(suffixes):
                continue
            found.append(os.path.join(base, name))
    return found


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    try:
        with open(path, 'rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        return ''
    return digest.hexdigest()


def stable_id(category: str, kind: str, title: str, locations: Iterable[str] = ()) -> str:
    basis = category + '|' + kind + '|' + title + '|' + '|'.join(sorted(locations)[:3])
    return hashlib.sha1(basis.encode('utf-8')).hexdigest()[:16]


def strip_css_comments(text: str) -> str:
    return re.sub(r'/\*.*?\*/', '', text, flags=re.S)


def strip_ts_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', text)


def norm_title(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()


@dataclass
class Issue:
    id: str
    category: str
    severity: str
    title: str
    detail: str
    locations: list[str] = field(default_factory=list)
    recommendation: str = ''
    kind: str = ''
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'category': self.category,
            'severity': self.severity,
            'title': self.title,
            'detail': self.detail,
            'locations': self.locations[:12],
            'recommendation': self.recommendation,
            'kind': self.kind,
            'status': 'open',
            'data': self.data,
        }


class Issues:
    def __init__(self) -> None:
        self.items: list[Issue] = []
        self.seen: set[str] = set()

    def add(
        self,
        category: str,
        severity: str,
        title: str,
        detail: str,
        recommendation: str,
        kind: str,
        locations: Iterable[str] = (),
        data: dict[str, Any] | None = None,
    ) -> None:
        locs = [rel(p) if os.path.isabs(p) else p for p in locations]
        iid = stable_id(category, kind, title, locs)
        if iid in self.seen:
            return
        self.seen.add(iid)
        self.items.append(Issue(iid, category, severity, title, detail, locs, recommendation, kind, data or {}))


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


class Cache:
    def __init__(self) -> None:
        self.data = self._load()

    def _load(self) -> dict[str, Any]:
        try:
            with open(CACHE_FILE, encoding='utf-8') as handle:
                data = json.load(handle)
            if isinstance(data, dict) and data.get('schema') == SCHEMA:
                return data
        except (OSError, ValueError):
            pass
        return {'schema': SCHEMA, 'entries': {}}

    def key(self, name: str, inputs: Iterable[str]) -> str:
        parts = [name]
        for path in inputs:
            try:
                stat = os.stat(path)
                parts.append(f'{path}:{int(stat.st_mtime)}:{stat.st_size}')
            except OSError:
                parts.append(path + ':missing')
        return hashlib.sha1('|'.join(parts).encode()).hexdigest()

    def get(self, name: str, inputs: Iterable[str], producer):
        digest = self.key(name, inputs)
        entries = self.data.setdefault('entries', {})
        if digest in entries:
            return entries[digest]
        value = producer()
        entries[digest] = value
        # Keep cache bounded; most expensive entries are small.
        if len(entries) > 128:
            for old in list(entries)[:32]:
                entries.pop(old, None)
        return value

    def save(self) -> None:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = CACHE_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as handle:
            json.dump(self.data, handle, ensure_ascii=False)
        os.replace(tmp, CACHE_FILE)


# ---------------------------------------------------------------------------
# Reference index (AniBiPlay)
# ---------------------------------------------------------------------------


@dataclass
class Reference:
    apk: str | None
    decompiled: str | None
    source_files: list[str]
    ui_text: str
    endpoints: list[dict[str, Any]]
    base_url: str
    dto_contracts: dict[str, list[str]]
    route_tuples: list[tuple[str, str]]
    stream_hosts: list[str]
    stream_headers: list[str]
    drawables: list[str]
    screenshots: list[str]
    colors: Counter
    radii: list[int]
    fonts: list[str]
    resource_files: list[str]
    platforms: list[str]
    origins: list[str]


def extract_anibi_reference(cache: Cache) -> Reference:
    apk = find_dir(REF_CANDIDATES)
    decompiled = find_dir(DECOMPILED_CANDIDATES)
    source_files = walk_files(os.path.join(decompiled, 'sources'), ('.java',)) if decompiled else []
    source_files = [p for p in source_files if '/defpackage/' in p or '/com/hxcorp/' in p]
    dto_dir = os.path.join(decompiled or '', 'sources', 'com', 'hxcorp', 'anibiplay', 'data', 'remote', 'dto')

    def build() -> dict[str, Any]:
        sources = walk_files(os.path.join(decompiled, 'sources'), ('.java',)) if decompiled else []
        defpkg = os.path.join(decompiled or '', 'sources', 'defpackage')
        ui_text = '\n'.join(read_text(os.path.join(defpkg, name)) for name in SOURCE_UI_FILES)
        if not ui_text:
            ui_text = '\n'.join(read_text(p) for p in sources if '/defpackage/' in p)
        interface_text = read_text(os.path.join(defpkg, 'go.java'))
        endpoints: list[dict[str, Any]] = []
        for match in re.finditer(r'@hp2\("([^"]+)"\)\s+Object\s+\w+\(([^;]*?)\);', interface_text, re.S):
            path = match.group(1)
            params = sorted(set(re.findall(r'@(?:ik5|gz4)\("([^"]+)"\)', match.group(2))))
            endpoints.append({'path': path, 'params': params})
        base_url = ''
        for dex in ['classes2.dex', 'classes.dex']:
            raw = read_bytes(os.path.join(apk or '', dex)).decode('utf-8', errors='ignore')
            hit = re.search(r'https://[a-z0-9.-]*(?:kisame|anibi|anichin)[a-z0-9./_-]*/api/v\d+/', raw, re.I)
            if hit:
                base_url = hit.group(0)
                break
        contracts: dict[str, list[str]] = {}
        for name in [
            'AnimeDto', 'AnimeListResponseDto', 'SeriesEpisodeDto', 'SeriesEpisodesResponseDto',
            'DetailMergedResponseDto', 'EpisodeMetaResponseDto', 'EpisodeMetaStreamDto',
            'EpisodeStreamDto', 'EpisodeStreamsResponseDto', 'PlayResolveResponseDto',
            'HomeResponseDto', 'HomeSectionAnimeDto', 'ScheduleResponseDto', 'ScheduleAnimeDto',
            'GenreDto', 'GenreListResponseDto', 'TopSeriesResponseDto', 'UserFavoriteEntryDto',
            'UserHistoryEntryDto', 'UserProgressResponseDto',
        ]:
            text = read_text(os.path.join(dto_dir, name + '.java'))
            contracts[name] = sorted(set(re.findall(r'@mf3\(name = "([^"]+)"\)', text)))
        route_tuples: list[tuple[str, str]] = []
        for path in source_files:
            text = read_text(path)
            if '/defpackage/' not in path or len(text) > 200_000:
                continue
            for match in re.finditer(r'new [A-Za-z0-9_$]+\("([^"]{2,180})",\s*"([^"]{2,80})"', text):
                route = match.group(1)
                label = match.group(2)
                if any(token in route for token in ['{', '/', '-']) and ' ' not in route:
                    route_tuples.append((route, label))
        stream_hosts: set[str] = set()
        headers: set[str] = set()
        d25 = read_text(os.path.join(defpkg, 'd25.java'))
        for host in re.findall(r'"((?:[a-z0-9-]+\.)+(?:com|net|co|id|stream|watch|ru|to|cloud))"', d25):
            stream_hosts.add(host)
        for header in re.findall(r'"(User-Agent|Referer|Origin|Accept|Cookie|Accept-Encoding|Connection|Accept-Language)"', d25):
            headers.add(header)
        colors: Counter[str] = Counter()
        for match in re.finditer(r'(?:0x[fF]{2}|n17\.[a-z]\(0xff)([0-9a-fA-F]{6})\b', ui_text):
            colors['#' + match.group(1).lower()] += 1
        radii = sorted({int(v) for v in re.findall(r'fw5\.b\((\d+)(?:\.\d+)?[fF]?\)', ui_text)})
        font_names: set[str] = set()
        for base in [os.path.join(apk or '', 'res', 'font'), os.path.join(PUBLIC, 'anibiplay-source', 'fonts')]:
            if os.path.isdir(base):
                font_names.update(os.path.basename(p) for p in walk_files(base, ('.ttf', '.otf', '.woff', '.woff2')))
        drawables: list[str] = []
        resource_files: list[str] = []
        for base in [os.path.join(apk or '', 'res'), os.path.join(decompiled or '', 'resources')]:
            if os.path.isdir(base):
                resource_files.extend(walk_files(base))
        drawables = [p for p in resource_files if '/drawable' in p and p.lower().endswith(('.png', '.webp', '.jpg', '.xml'))]
        screenshot_dirs = [p for p in SHOT_CANDIDATES if os.path.isdir(p)]
        screenshots: list[str] = []
        for directory in screenshot_dirs:
            screenshots.extend(walk_files(directory, ('.jpg', '.jpeg', '.png')))
        platforms = sorted(set(re.findall(r'source_platform', ui_text))) or ['source_platform']
        origins = sorted(set(re.findall(r'content_origin', ui_text))) or ['content_origin']
        return {
            'base_url': base_url,
            'endpoints': endpoints,
            'contracts': contracts,
            'routeTuples': route_tuples,
            'streamHosts': sorted(stream_hosts),
            'streamHeaders': sorted(headers),
            'drawables': [rel(p) if p.startswith(ROOT) else p for p in drawables],
            'screenshots': screenshots,
            'colors': dict(colors),
            'radii': radii,
            'fonts': sorted(font_names),
            'resourceFiles': [rel(p) if p.startswith(ROOT) else p for p in resource_files],
            'platforms': platforms,
            'origins': origins,
        }

    inputs = ([os.path.join(apk, 'classes2.dex'), os.path.join(apk, 'classes.dex')] if apk else []) + [
        os.path.join(decompiled or '', 'sources', 'defpackage', 'go.java'),
        os.path.join(decompiled or '', 'sources', 'defpackage', 'd25.java'),
    ]
    data = cache.get('anibi-reference', [p for p in inputs if os.path.exists(p)], build)
    return Reference(apk, decompiled, source_files, read_text(os.path.join(decompiled or '', 'sources', 'defpackage', 'pz2.java')),
                     data['endpoints'], data['base_url'], data['contracts'], data['routeTuples'],
                     data['streamHosts'], data['streamHeaders'], data['drawables'], data['screenshots'],
                     Counter(data['colors']), data['radii'], data['fonts'], data['resourceFiles'],
                     data['platforms'], data['origins'])


# ---------------------------------------------------------------------------
# Nanime index (UI + CSS)
# ---------------------------------------------------------------------------


@dataclass
class CssRule:
    selector: str
    declarations: dict[str, str]
    file: str
    line: int


@dataclass
class NanimeIndex:
    ts_files: list[str]
    css_files: list[str]
    css_imports: list[tuple[str, str]]
    css_rules: list[CssRule]
    class_used: Counter
    class_locations: dict[str, str]
    keyframes: set[str]
    animations: list[str]
    routes: list[str]
    nav_labels: list[str]
    imports: list[tuple[str, str]]
    provider_text: str
    package: dict[str, Any]
    version: str


def parse_css_rules(path: str) -> tuple[list[CssRule], set[str], list[str]]:
    text = strip_css_comments(read_text(path))
    rules: list[CssRule] = []
    keyframes: set[str] = set()
    animations: list[str] = []
    # Remove @font-face/@keyframes blocks from normal selector parsing.
    for match in re.finditer(r'@keyframes\s+([A-Za-z0-9_-]+)', text):
        keyframes.add(match.group(1))
    for match in re.finditer(r'(?<![\w-])([a-zA-Z-]+)\s*:\s*([^;{}]+);', text):
        if match.group(1) in {'animation', 'animation-name'}:
            animations.extend(re.findall(r'[A-Za-z][A-Za-z0-9_-]*', match.group(2)))
    # Selector blocks: skip at-rule headers, accept comma separated selectors.
    for match in re.finditer(r'(?m)([^{}@;]+)\{([^{}]*)\}', text):
        header = match.group(1).strip()
        body = match.group(2)
        if not header or header.startswith('%') or header.startswith('from') or header.startswith('to'):
            continue
        if header in {'font-face', 'keyframes', 'media', 'supports'}:
            continue
        if any(header.startswith(prefix) for prefix in ('@', '0%', '100%')):
            continue
        decls: dict[str, str] = {}
        for decl in re.finditer(r'([-a-zA-Z]+)\s*:\s*([^;]+)', body):
            prop = decl.group(1).strip().lower()
            value = re.sub(r'\s+', ' ', decl.group(2).strip())
            if prop:
                decls[prop] = value
        line = text.count('\n', 0, match.start()) + 1
        for selector in header.split(','):
            selector = re.sub(r'\s+', ' ', selector.strip())
            if selector and not selector.startswith('@'):
                rules.append(CssRule(selector, decls, path, line))
    return rules, keyframes, animations


def extract_nanime_index(cache: Cache) -> NanimeIndex:
    ts_files = walk_files(SRC, ('.tsx', '.ts'))
    css_files = walk_files(STYLES, ('.css',))
    app_css = read_text(os.path.join(STYLES, 'app.css'))
    css_imports = []
    for match in re.finditer(r'@import\s+[\'"]([^\'"]+)[\'"]', app_css):
        raw = match.group(1)
        target = os.path.normpath(os.path.join(STYLES, raw)) if raw.startswith('.') else ''
        css_imports.append((raw, target))
    class_used: Counter = Counter()
    class_locations: dict[str, str] = {}
    tsx_text = ''
    for path in ts_files:
        if not path.endswith('.tsx'):
            continue
        text = strip_ts_comments(read_text(path))
        tsx_text += '\n' + text
        for match in re.finditer(r'className\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{([^}]*)\})', text):
            blob = match.group(1) or match.group(2) or match.group(3) or ''
            blob = re.sub(r'\$\{[^}]*\}', ' ', blob)
            blob = re.sub(r'[\'"][^\'"]*[\'"]', ' ', blob)
            for token in re.findall(r'[A-Za-z][A-Za-z0-9_-]*', blob):
                if token in {'className', 'true', 'false', 'undefined', 'null', 'void', 'active', 'index'}:
                    continue
                if token.endswith('-'):
                    continue
                class_used[token] += 1
                class_locations.setdefault(token, rel(path))
    rules: list[CssRule] = []
    keyframes: set[str] = set()
    animations: list[str] = []
    for path in css_files:
        r, k, a = parse_css_rules(path)
        rules.extend(r)
        keyframes |= k
        animations.extend(a)
    routes = sorted(set(re.findall(r'<Route\s+path="([^"]+)"', read_text(os.path.join(SRC, 'App.tsx')))))
    shell = read_text(os.path.join(SRC, 'shell', 'Shell.tsx'))
    nav_labels = re.findall(r"label:\s*'([^']+)'", shell)
    imports: list[tuple[str, str]] = []
    for path in ts_files:
        text = strip_ts_comments(read_text(path))
        for match in re.finditer(r'(?:from\s+|import\s*)["\'](\.{1,2}/[^"\']+)["\']', text):
            imports.append((path, match.group(1)))
    provider_files = walk_files(os.path.join(SRC, 'providers'), ('.ts',))
    provider_text = '\n'.join(read_text(p) for p in provider_files if os.path.basename(p) not in {'legacy.ts'})
    try:
        package = json.loads(read_text(os.path.join(ROOT, 'package.json')))
    except ValueError:
        package = {}
    return NanimeIndex(ts_files, css_files, css_imports, rules, class_used, class_locations,
                       keyframes, sorted(set(animations)), routes, nav_labels, imports,
                       provider_text, package, str(package.get('version') or ''))


# ---------------------------------------------------------------------------
# UI checks
# ---------------------------------------------------------------------------


def source_color_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def analyze_ui(ref: Reference, idx: NanimeIndex, issues: Issues) -> dict[str, Any]:
    css_text = '\n'.join(read_text(p) for p in idx.css_files)
    css_classes = {rule.selector.split()[0].lstrip('.#>+~ ') for rule in idx.css_rules if rule.selector.startswith(('.', '#'))}
    css_all = set(css_classes)
    for rule in idx.css_rules:
        for cls in re.findall(r'\.([A-Za-z][A-Za-z0-9_-]*)', rule.selector):
            css_all.add(cls)

    # 1. Legacy / competing visual systems.
    legacy_hits = []
    for path in idx.css_files:
        text = read_text(path).lower()
        if 'liquid' in text or 'glassmorphism' in text:
            legacy_hits.append(path)
    if legacy_hits:
        issues.add('ui', 'high', 'Legacy Liquid CSS still present',
                   'CSS files still contain Liquid/glassmorphism styling rules.',
                   'Delete the legacy rules and keep the AniBiPlay token layer as the only visual system.',
                   'legacy-css', legacy_hits)
    existing_basenames = {os.path.basename(p) for p in idx.css_files}
    for raw, target in idx.css_imports:
        if target and not os.path.exists(target):
            issues.add('ui', 'critical', f'Missing stylesheet import: {raw}',
                       'app.css imports a stylesheet that does not exist, so rules may silently not apply.',
                       'Fix or remove the import and rebuild.', 'missing-css-import',
                       [os.path.join(STYLES, 'app.css')])
    imported = {os.path.basename(t) for _, t in idx.css_imports if t and os.path.exists(t)}
    orphan = [p for p in idx.css_files if os.path.basename(p) not in imported and os.path.basename(p) != 'app.css']
    if orphan:
        issues.add('ui', 'medium', 'Unimported stylesheets',
                   f'{len(orphan)} CSS file(s) exist but are not imported by app.css: ' + ', '.join(os.path.basename(p) for p in orphan),
                   'Either import deliberate layers or delete dead stylesheets so two visual systems cannot diverge.',
                   'orphan-css', orphan)

    # 2. Class contract between TSX and CSS.
    missing = sorted(name for name in idx.class_used if name not in css_all and '-' in name and not name.isupper())
    if missing:
        severity = 'high' if len(missing) > 8 else 'medium'
        locs = [idx.class_locations.get(name, '') for name in missing if idx.class_locations.get(name)]
        issues.add('ui', severity, f'{len(missing)} JSX classes have no CSS selector',
                   'Classes styled at runtime without a base rule: ' + ', '.join(missing[:40]),
                   'Add selectors in the owning AniBiPlay layer or remove the class tokens.',
                   'missing-css-classes', locs, {'classes': missing[:80]})
    unused = sorted(name for name in css_all if name not in idx.class_used and '-' in name and len(name) > 4)
    if len(unused) > 8:
        issues.add('ui', 'low', f'{len(unused)} CSS classes look unused',
                   'Potential dead selectors: ' + ', '.join(unused[:40]),
                   'Prune dead selectors after verifying dynamic class construction.', 'unused-css',
                   [], {'classes': unused[:80]})

    # 3. Conflicting declarations across files for the same selector/property.
    by_selector: dict[str, list[CssRule]] = defaultdict(list)
    for rule in idx.css_rules:
        by_selector[rule.selector].append(rule)
    conflicts = []
    for selector, rules in by_selector.items():
        if len(rules) < 2:
            continue
        values: dict[str, set[str]] = defaultdict(set)
        for rule in rules:
            for prop, value in rule.declarations.items():
                if prop in {'color', 'background', 'background-color', 'border-radius', 'font-family', 'padding', 'margin'}:
                    values[prop].add(value)
        for prop, vals in values.items():
            if len(vals) > 1:
                conflicts.append((selector, prop, vals, {r.file for r in rules}))
    if conflicts:
        locs = [p for *_, files in conflicts for p in files]
        issues.add('ui', 'medium', f'{len(conflicts)} cross-file style conflicts',
                   'Same selector/property has competing values, e.g. ' +
                   '; '.join(f'{sel} {prop}={sorted(vals)}' for sel, prop, vals, _ in conflicts[:6]),
                   'Consolidate each component into a single owning layer.', 'css-conflicts', sorted(set(locs)))

    # 4. Tokens, palette, radii and fonts.
    css_colors = set(c.lower() for c in re.findall(r'#[0-9a-fA-F]{6}\b', css_text))
    for r, g, b in re.findall(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', css_text):
        css_colors.add(f'#{int(r):02x}{int(g):02x}{int(b):02x}')
    css_rgb = {c: source_color_rgb(c) for c in css_colors}
    missing_colors = []
    for color, count in ref.colors.most_common(40):
        if color in css_colors:
            continue
        rgb = source_color_rgb(color)
        nearest = min(css_rgb, key=lambda c: color_distance(rgb, css_rgb[c]), default='')
        delta = color_distance(rgb, css_rgb[nearest]) if nearest else 999
        if delta > 12:
            missing_colors.append((color, count, nearest, round(delta, 1)))
    if missing_colors:
        issues.add('ui', 'low', f'{len(missing_colors)} source UI colours absent from CSS',
                   'Closest-match deltas: ' + ', '.join(f'{c}(x{n},~{d})' for c, n, _, d in missing_colors[:12]),
                   'Add exact tokens for source colours that are used by ported surfaces.', 'palette',
                   [os.path.join(STYLES, 'tokens.css')], {'colours': missing_colors[:40]})
    css_radii = {int(v) for v in re.findall(r'--r-[a-z0-9]+:\s*(\d+)px', css_text)}
    missing_radii = [r for r in ref.radii if r not in css_radii]
    if missing_radii:
        issues.add('ui', 'low', f'Missing AniBiPlay radii: {missing_radii}',
                   'Source compose radii are not represented in tokens.',
                   'Add radius tokens and use them instead of raw values.', 'radius',
                   [os.path.join(STYLES, 'tokens.css')])
    font_faces = re.findall(r'@font-face\s*\{[^}]*font-family:\s*[\'"]([^\'"]+)[\'"][^}]*src:\s*url\([\'"]?([^\'")]+)', css_text, re.S)
    font_files = {os.path.basename(p) for p in walk_files(os.path.join(PUBLIC, 'anibiplay-source', 'fonts', ''), ('.ttf', '.otf'))}
    for family, url in font_faces:
        name = os.path.basename(url)
        if not os.path.exists(os.path.join(PUBLIC, url.lstrip('/'))):
            issues.add('ui', 'high', f'Missing font file for {family}',
                       f'@font-face points at missing asset {url}.',
                       'Restore the AniBiPlay font asset or change the font stack.', 'font-asset',
                       [os.path.join(STYLES, 'base.css')])
    for needed in ('roboto_regular.ttf', 'roboto_medium.ttf', 'madsense.otf'):
        if needed not in font_files:
            issues.add('ui', 'medium', f'Missing bundled source font {needed}',
                       'AniBiPlay typography cannot match without the original font asset.',
                       'Copy the font from the reference APK fonts folder.', 'font-missing',
                       [os.path.join(PUBLIC, 'anibiplay-source', 'fonts')])

    # 5. Navigation and screens.
    if idx.nav_labels and idx.nav_labels != EXPECTED_NAV:
        issues.add('ui', 'high', 'Bottom navigation labels differ from AniBiPlay',
                   f'Nanime: {idx.nav_labels}; reference: {EXPECTED_NAV}',
                   'Keep the five source tabs and labels; move extras to secondary screens.', 'nav-labels',
                   [os.path.join(SRC, 'shell', 'Shell.tsx')])
    label_text = ' '.join(tuple_[1] for tuple_ in ref.route_tuples).lower()
    route_text = ' '.join(idx.routes).lower()
    missing_screens = []
    for label, keywords in EXPECTED_SCREENS.items():
        if label not in label_text:
            continue
        if not any(k in route_text for k in keywords):
            missing_screens.append(label)
    if missing_screens:
        issues.add('ui', 'medium', 'Reference screens without a Nanime route',
                   'Missing route equivalents: ' + ', '.join(missing_screens),
                   'Add a route or document why the screen is intentionally omitted.', 'missing-screens',
                   [os.path.join(SRC, 'App.tsx')], {'screens': missing_screens})

    # 6. Key UI components and animation states.
    for component, needles in KEY_UI_COMPONENTS.items():
        if not any(n in css_text for n in needles) and not any(n in idx.class_used for n in needles):
            issues.add('ui', 'high', f'Missing reference UI surface: {component}',
                       'No selector or class token was found for this AniBiPlay surface.',
                       'Implement the surface in the AniBiPlay layer and wire it to real state.', 'component-' + component,
                       [SRC])
    expected_animations = {'page/sheet enter': ['page', 'enter', 'up', 'sheet'], 'navigation indicator': ['pop', 'nav'], 'modal/sheet': ['slide', 'sheet']}
    for label, needles in expected_animations.items():
        if idx.keyframes and not any(any(n in name for n in needles) for name in idx.keyframes):
            issues.add('ui', 'low', f'Missing animation class: {label}',
                       'No matching @keyframes was found; interaction may feel different from the source.',
                       'Add a GPU-only keyframe matching the source motion.', 'animation-' + label,
                       [os.path.join(STYLES, 'animations.css')])

    # 7. Assets.
    ref_assets = {}
    for path in ref.drawables + ref.resource_files:
        absolute = path if os.path.isabs(path) else os.path.join(ROOT, path)
        name = os.path.basename(path)
        if name and os.path.isfile(absolute):
            ref_assets.setdefault(name, absolute)
    public_assets = {}
    for path in walk_files(PUBLIC):
        public_assets.setdefault(os.path.basename(path), path)
    missing_assets = sorted(name for name in ref_assets if name not in public_assets)
    if missing_assets:
        issues.add('ui', 'low', f'{len(missing_assets)} reference assets not present in public/',
                   'Examples: ' + ', '.join(missing_assets[:30]),
                   'Copy assets actually used by ported screens; ignore launcher/ad residue.', 'assets-missing',
                   [], {'assets': missing_assets[:80]})
    changed_assets = []
    if Image:
        for name, ref_path in list(ref_assets.items())[:600]:
            local = public_assets.get(name)
            if not local or not name.lower().endswith(('.png', '.webp', '.jpg')):
                continue
            try:
                a = average_hash(ref_path)
                b = average_hash(local)
                if a and b and hamming(a, b) > 18:
                    changed_assets.append(name)
            except Exception:
                pass
    if changed_assets:
        issues.add('ui', 'medium', f'{len(changed_assets)} same-named assets differ visually',
                   'Perceptual hash distance > 18: ' + ', '.join(changed_assets[:30]),
                   'Verify the Nanime asset is the intended source artwork.', 'assets-changed', [], {'assets': changed_assets[:80]})

    return {
        'cssFiles': [rel(p) for p in idx.css_files],
        'cssRules': len(idx.css_rules),
        'cssClasses': len(css_all),
        'jsxClassTokens': len(idx.class_used),
        'missingClasses': missing[:80],
        'unusedClasses': unused[:80],
        'keyframes': sorted(idx.keyframes),
        'routes': idx.routes,
        'navLabels': idx.nav_labels,
        'palette': sorted(css_colors),
        'missingColours': missing_colors[:40],
        'referenceAssets': len(ref_assets),
        'publicAssets': len(public_assets),
    }


# ---------------------------------------------------------------------------
# Image metrics
# ---------------------------------------------------------------------------


def average_hash(path: str) -> int:
    if not Image:
        return 0
    with Image.open(path) as image:
        image = image.convert('L').resize((8, 8))
        pixels = list(image.getdata())
        mean = sum(pixels) / len(pixels)
        value = 0
        for pixel in pixels:
            value = (value << 1) | (1 if pixel >= mean else 0)
        return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def image_metrics(path: str) -> dict[str, Any] | None:
    if not Image:
        return None
    try:
        with Image.open(path) as image:
            image = image.convert('RGB')
            width, height = image.size
            thumb = image.resize((64, 64))
            stat = ImageStat.Stat(thumb)
            mean = tuple(round(v, 2) for v in stat.mean)
            luminance_mean = round(0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2], 2)
            lum = thumb.convert('L')
            lum_stat = ImageStat.Stat(lum)
            edges = lum.filter(ImageFilter.FIND_EDGES)
            edge_mean = round(ImageStat.Stat(edges).mean[0], 2)
            hsv = thumb.convert('HSV')
            sat_mean = round(ImageStat.Stat(hsv).mean[1], 2)
            dark_ratio = round(sum(1 for p in lum.getdata() if p < 40) / (64 * 64), 3)
            quant = thumb.quantize(colors=8, method=Image.Quantize.MEDIANCUT).convert('RGB')
            counts = Counter(quant.getdata())
            total = sum(counts.values()) or 1
            palette = [('#%02x%02x%02x' % color, round(count / total, 3)) for color, count in counts.most_common(8)]
            return {
                'path': path,
                'width': width,
                'height': height,
                'aspect': round(width / height, 3) if height else 0,
                'mean': mean,
                'luminance': luminance_mean,
                'luminanceStd': round(lum_stat.stddev[0], 2),
                'edge': edge_mean,
                'saturation': sat_mean,
                'darkRatio': dark_ratio,
                'palette': palette,
            }
    except Exception:
        return None


def aggregate_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {}
    fields = ['luminance', 'luminanceStd', 'edge', 'saturation', 'darkRatio']
    return {
        'count': len(rows),
        'luminance': round(sum(r['luminance'] for r in rows) / len(rows), 2),
        'luminanceStd': round(sum(r['luminanceStd'] for r in rows) / len(rows), 2),
        'edge': round(sum(r['edge'] for r in rows) / len(rows), 2),
        'saturation': round(sum(r['saturation'] for r in rows) / len(rows), 2),
        'darkRatio': round(sum(r['darkRatio'] for r in rows) / len(rows), 3),
        'aspects': [round(r['aspect'], 2) for r in rows[:20]],
    }


def analyze_screenshots(ref: Reference, issues: Issues, cache: Cache) -> dict[str, Any]:
    if not Image:
        issues.add('screenshot', 'low', 'Pillow unavailable; screenshot metrics skipped',
                   'Install Pillow to enable aggregate screenshot comparison.',
                   'pip install pillow', 'pillow-missing')
        return {'available': False}
    ref_shots = [p for p in ref.screenshots if os.path.isfile(p)]
    nanime_shots = walk_files(os.path.join(ROOT, 'screenshot'), ('.png', '.jpg', '.jpeg'))
    ref_shots = ref_shots[:120]
    metrics_inputs = ref_shots + nanime_shots
    all_metrics = cache.get('screenshot-metrics', metrics_inputs, lambda: {
        p: image_metrics(p) for p in metrics_inputs
    })
    ref_rows = [all_metrics[p] for p in ref_shots if all_metrics.get(p)]
    nanime_rows = [all_metrics[p] for p in nanime_shots if all_metrics.get(p)]
    ref_agg = aggregate_metrics(ref_rows)
    nanime_agg = aggregate_metrics(nanime_rows)
    if ref_rows and nanime_rows:
        deltas = {k: round(nanime_agg[k] - ref_agg[k], 2) for k in ['luminance', 'luminanceStd', 'edge', 'saturation', 'darkRatio']}
        if abs(deltas['luminance']) > 18 or abs(deltas['saturation']) > 18 or abs(deltas['darkRatio']) > 0.2:
            issues.add('screenshot', 'medium', 'Screenshot aggregate diverges from AniBiPlay',
                       f'Deltas (Nanime - reference): {deltas}',
                       'Capture matching screens at the same viewport and inspect the highest-delta surfaces.',
                       'screenshot-aggregate', nanime_shots[:5], {'deltas': deltas})
    elif not ref_rows:
        issues.add('screenshot', 'low', 'No AniBiPlay reference screenshots found',
                   'Screenshot comparison is skipped until reference captures exist.',
                   'Place reference screenshots in /tmp/opencode/test.', 'no-reference-shots')
    return {
        'available': bool(ref_rows and nanime_rows),
        'reference': ref_agg,
        'nanime': nanime_agg,
        'referenceCount': len(ref_rows),
        'nanimeCount': len(nanime_rows),
        'method': 'aggregate luminance/edge/saturation/dark-ratio + palette, not pixel diff',
    }


# ---------------------------------------------------------------------------
# Provider / system checks
# ---------------------------------------------------------------------------


def parse_providers() -> dict[str, Any]:
    registry_path = os.path.join(SRC, 'providers', 'registry.ts')
    registry = read_text(registry_path)
    imports = re.findall(r'import\s*\{\s*([^}]+)\}\s*from\s*[\'"]\./([^\'"]+)[\'"]', registry)
    import_map: dict[str, str] = {}
    for names, module in imports:
        for name in names.split(','):
            import_map[name.strip()] = module.strip()
    list_match = re.search(r'const PROVIDER_LIST[^=]*=\s*\[(.*?)\]', registry, re.S)
    order = re.findall(r'\b([A-Za-z_$][A-Za-z0-9_$]*)\b', list_match.group(1)) if list_match else []
    providers = {}
    for var, module in import_map.items():
        path = os.path.join(SRC, 'providers', module if module.endswith('.ts') else module + '.ts')
        text = read_text(path)
        pattern = re.compile(r'export\s+const\s+' + re.escape(var) + r'\b(.*?)(?=\nexport\s+|\Z)', re.S)
        match = pattern.search(text)
        block = match.group(1) if match else ''
        pid_match = re.search(r'id:\s*[\'"]([^\'"]+)[\'"]', block)
        priority_match = re.search(r'priority:\s*(\d+)', block)
        if not pid_match:
            # factory configs put id/priority in makeHtmlProvider calls inside the block
            config = re.search(r'makeHtmlProvider\(\{(.*?)\}\)', block, re.S)
            if config:
                pid_match = re.search(r'id:\s*[\'"]([^\'"]+)[\'"]', config.group(1))
                priority_match = re.search(r'priority:\s*(\d+)', config.group(1))
        providers[var] = {
            'id': pid_match.group(1) if pid_match else var,
            'priority': int(priority_match.group(1)) if priority_match else None,
            'file': rel(path),
            'active': not bool(re.search(r'active:\s*false', block)),
            'downloadOnly': bool(re.search(r'downloadOnly:\s*true', block)),
            'movieOnly': bool(re.search(r'movieOnly:\s*true', block)),
            'hasDownloads': 'downloads' in block or 'makeDownloadProvider' in text or 'downloads:' in block,
        }
    files = walk_files(os.path.join(SRC, 'providers'), ('.ts',))
    exported = {}
    for path in files:
        text = read_text(path)
        for name in re.findall(r'export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)', text):
            exported.setdefault(name, rel(path))
    unregistered = sorted(name for name in exported if name not in import_map and name not in {
        'getProvider', 'allProviders', 'searchProviders', 'orderedProviders', 'streamingProviders',
        'streamingPriority', 'downloadProviders', 'markHealth', 'providerHealth', 'autoProviderId',
        'pickHealthy', 'PROVIDER_LIST'
    } and not name.startswith('make') and name not in {'shared'}
    )
    registered_files = {p['file'] for p in providers.values()}
    provider_files = [rel(p) for p in files if os.path.basename(p) not in NANIME_PROVIDER_FILES]
    disconnected_files = sorted(p for p in provider_files if p not in registered_files and not p.endswith(('types.ts', 'shared.ts')))
    interface_text = read_text(os.path.join(SRC, 'providers', 'types.ts'))
    required_methods = ['home', 'search', 'detail', 'episodes', 'stream']
    missing_methods = [m for m in required_methods if not re.search(r'\b' + m + r'\s*\(', interface_text)]
    return {
        'order': [providers.get(v, {'id': v})['id'] for v in order if v in providers],
        'providers': providers,
        'importMap': import_map,
        'unregistered': unregistered,
        'disconnectedFiles': disconnected_files,
        'missingInterfaceMethods': missing_methods,
        'registryText': registry,
    }


def analyze_providers(ref: Reference, idx: NanimeIndex, issues: Issues) -> dict[str, Any]:
    info = parse_providers()
    providers = info['providers']
    order = info['order']
    by_id = {p['id']: p for p in providers.values()}
    active = [p for p in providers.values() if p['active']]
    streaming = [p for p in active if not p['downloadOnly'] and not p['movieOnly']]
    download_only = [p['id'] for p in active if p['downloadOnly']]
    priorities = [p['priority'] for p in providers.values() if p['priority'] is not None]

    if len(order) < 3:
        issues.add('provider', 'high', 'Provider registry is unexpectedly small',
                   f'Only {len(order)} providers are registered: {order}',
                   'Restore verified adapters; do not fabricate unavailable ones.', 'registry-size',
                   [os.path.join(SRC, 'providers', 'registry.ts')])
    expected_download_only = {'nekopoi'}
    bad_roles = [p['id'] for p in active if (p['id'] in expected_download_only) != p['downloadOnly']]
    if bad_roles:
        issues.add('provider', 'high', 'Provider role flags changed',
                   'Role mismatch for: ' + ', '.join(bad_roles),
                   'Restore the documented download-only roles.', 'provider-roles',
                   [os.path.join(SRC, 'providers', 'registry.ts')])
    if info['disconnectedFiles']:
        issues.add('provider', 'high', 'Provider files are not registered',
                   'These adapters exist but are not wired into registry: ' + ', '.join(info['disconnectedFiles']),
                   'Register each verified adapter or delete it; do not leave disconnected providers.', 'disconnected-providers',
                   [os.path.join(SRC, 'providers', 'registry.ts')])
    if info['missingInterfaceMethods']:
        issues.add('provider', 'critical', 'Provider interface is incomplete',
                   'Missing methods: ' + ', '.join(info['missingInterfaceMethods']),
                   'Restore the contract before adding providers.', 'provider-interface',
                   [os.path.join(SRC, 'providers', 'types.ts')])

    text_all = read_text(os.path.join(SRC, 'providers', 'registry.ts')) + '\n' + idx.provider_text
    capabilities = {
        'search normalization': ['SearchEngine', 'normalize'],
        'matching/dedup': ['EpisodeMatcher', 'mergeEpisodes', 'titleAliases', 'fuzzyMatch'],
        'priority/fallback': ['FallbackEngine', 'streamingPriority', 'markHealth'],
        'stream resolution': ['StreamExtractor', 'resolveMediaUrl', 'verifyDirectMedia'],
        'download resolution': ['DownloadAggregator', 'downloads'],
        'playback integration': ['PlayerOverlay', 'AdaptiveVideo', 'hls'],
    }
    missing_caps = []
    for label, needles in capabilities.items():
        haystack = text_all + '\n' + '\n'.join(read_text(p) for p in walk_files(SRC, ('.ts', '.tsx')))
        if not any(n in haystack for n in needles):
            missing_caps.append(label)
    if missing_caps:
        issues.add('provider', 'high', 'Missing integration capabilities',
                   'Not detected: ' + ', '.join(missing_caps),
                   'Restore the corresponding service and wire it through Catalog.', 'capabilities', [SRC])

    # AniBiPlay contract comparison.
    endpoints = [e['path'] for e in ref.endpoints]
    adapter_candidates = [p for p in walk_files(SRC, ('.ts',)) if re.search(r'anibi', os.path.basename(p), re.I)]
    adapter_text = '\n'.join(read_text(p) for p in adapter_candidates)
    adapter_present = bool(adapter_candidates)
    if not adapter_present:
        issues.add('provider', 'critical', 'AniBiPlay provider adapter missing',
                   f'No adapter for the AniBiPlay v2 API ({ref.base_url or "base URL not found"}) exists. '
                   f'Reference endpoints: {", ".join(endpoints) or "not extracted"}.',
                   'Implement the adapter against the same contract, with normalized cards/detail/streams and graceful auth failure.',
                   'anibi-adapter-missing', [os.path.join(SRC, 'providers')])
    else:
        missing_endpoints = [path for path in endpoints if path.split('/')[0] not in adapter_text]
        if missing_endpoints:
            issues.add('provider', 'high', 'AniBiPlay adapter omits API endpoints',
                       'Missing: ' + ', '.join(missing_endpoints),
                       'Implement or explicitly document unsupported endpoints.', 'anibi-endpoints',
                       adapter_candidates)
        for label, needles in ANIBI_INTEGRATIONS.items():
            if not any(n in adapter_text.lower() for n in needles):
                issues.add('provider', 'high', f'AniBiPlay integration missing: {label}',
                           'The reference contract exposes this capability but the adapter does not implement it.',
                           'Port the corresponding AniBiPlay data flow, not just the fetch.', 'anibi-integration-' + label,
                           adapter_candidates)
    if not ref.endpoints:
        issues.add('provider', 'medium', 'AniBiPlay API contract not extracted',
                   'The decompiled sources did not expose endpoints; check /tmp/AniBiplay-decompiled.',
                   'Restore the reference directory before changing provider priorities.', 'no-anibi-contract')

    secret_hits = []
    secret_pattern = re.compile(r'(?:api[_-]?key|secret|token|password)\s*[:=]\s*[\'"][A-Za-z0-9_\-]{16,}[\'"]', re.I)
    for path in walk_files(SRC, ('.ts', '.tsx', '.json')):
        if re.search(secret_pattern, read_text(path)):
            secret_hits.append(rel(path))
    if secret_hits:
        names = [os.path.basename(p) for p in secret_hits]
        issues.add('system', 'critical', 'Hard-coded credential-like values in source',
                   f'Potential secrets in {", ".join(names)} (values intentionally not printed).',
                   'Move secrets to .env/CI secrets and rotate exposed values.', 'secrets', secret_hits)
    placeholder_hits = []
    for path in walk_files(os.path.join(SRC, 'core'), ('.ts',)) + walk_files(os.path.join(SRC, 'providers'), ('.ts',)):
        text = read_text(path)
        if re.search(r'\bTODO\b|\bFIXME\b|throw new Error\([\'"]not implemented', text, re.I):
            placeholder_hits.append(rel(path))
    if placeholder_hits:
        issues.add('system', 'medium', 'Placeholder code paths remain',
                   'TODO/FIXME/not-implemented markers in: ' + ', '.join(placeholder_hits[:20]),
                   'Implement or remove placeholders before claiming parity.', 'placeholders', placeholder_hits)
    broken_imports = []
    for source, spec in idx.imports:
        base = os.path.normpath(os.path.join(os.path.dirname(source), spec))
        candidates = [base] + [base + ext for ext in ('.ts', '.tsx', '.js', '.jsx', '.css', '.json')] + [os.path.join(base, 'index.ts'), os.path.join(base, 'index.tsx')]
        if not any(os.path.exists(p) for p in candidates):
            broken_imports.append(f'{rel(source)} -> {spec}')
    if broken_imports:
        issues.add('system', 'critical', 'Broken module imports',
                   'Unresolvable imports: ' + '; '.join(broken_imports[:20]),
                   'Fix paths before building.', 'broken-imports', [SRC])

    matrix = []
    for label, needles in ANIBI_INTEGRATIONS.items():
        matrix.append({
            'capability': label,
            'reference': label,
            'nanime': 'present' if any(n in (' '.join(read_text(p) for p in walk_files(SRC, ('.ts', '.tsx')))).lower() for n in needles) else 'missing',
        })
    return {
        'order': order,
        'providerCount': len(providers),
        'activeCount': len(active),
        'streamingCount': len(streaming),
        'downloadOnly': download_only,
        'priorities': info['providers'],
        'anibiBaseUrl': ref.base_url,
        'anibiEndpoints': endpoints,
        'anibiDtoContracts': ref.dto_contracts,
        'anibiStreamHosts': ref.stream_hosts,
        'anibiAdapter': adapter_candidates,
        'matrix': matrix,
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def load_json(path: str, default):
    try:
        with open(path, encoding='utf-8') as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return default


def apply_resolution(open_issues: list[Issue]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    resolved_doc = load_json(RESOLVED_FILE, {'resolved': []})
    resolved = {item['id']: item for item in resolved_doc.get('resolved', []) if isinstance(item, dict) and item.get('id')}
    previous = load_json(REPORT_JSON, {})
    previous_open = {i.get('id') for i in previous.get('issues', []) if isinstance(i, dict)}
    current = {i.id for i in open_issues}
    reopened = []
    # Reopen regressions.
    for iid in list(resolved):
        if iid in current:
            reopened.append(iid)
            resolved.pop(iid, None)
    # Auto-resolve issues that were open in the previous report and are now gone.
    now = int(time.time() * 1000)
    for iid in previous_open - current:
        if iid not in resolved:
            of = next((i for i in previous.get('issues', []) if i.get('id') == iid), None)
            resolved[iid] = {
                'id': iid,
                'title': (of or {}).get('title', iid),
                'category': (of or {}).get('category', 'unknown'),
                'resolvedAt': now,
                'evidence': 'Not detected in the latest automated comparison.',
            }
    return open_issues_dicts(open_issues), list(resolved.values()), reopened


def open_issues_dicts(items: list[Issue]) -> list[dict[str, Any]]:
    rows = []
    for item in items:
        row = item.as_dict()
        rows.append(row)
    return rows


def write_report(ref: Reference, idx: NanimeIndex, ui: dict[str, Any], shots: dict[str, Any],
                 providers: dict[str, Any], issues: Issues) -> dict[str, Any]:
    os.makedirs(OUT_DIR, exist_ok=True)
    open_rows, resolved, reopened = apply_resolution(issues.items)
    open_rows.sort(key=lambda row: (SEVERITY_ORDER.get(row['severity'], 9), row['category'], row['title']))
    summary = dict(Counter(row['severity'] for row in open_rows))
    weight = sum(SEVERITY_WEIGHT.get(row['severity'], 0) for row in open_rows)
    report = {
        'schemaVersion': SCHEMA,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'repo': {
            'root': ROOT,
            'version': idx.version,
            'uiStack': 'React + Vite + Capacitor',
        },
        'references': {
            'apk': ref.apk,
            'decompiled': ref.decompiled,
            'apiBaseUrl': ref.base_url,
            'endpoints': ref.endpoints,
            'screenshotCount': len(ref.screenshots),
            'drawableCount': len(ref.drawables),
        },
        'summary': {
            'open': len(open_rows),
            'weighted': weight,
            'bySeverity': summary,
            'resolved': len(resolved),
            'reopened': len(reopened),
        },
        'issues': open_rows,
        'resolved': sorted(resolved, key=lambda i: i.get('resolvedAt', 0), reverse=True),
        'reopened': reopened,
        'metrics': {
            'ui': ui,
            'screenshots': shots,
            'providers': providers,
        },
        'limitations': [
            'AniBiPlay is a decompiled Compose/Media3 APK; comparisons are capability-based, not line-by-line.',
            'Screenshot metrics are aggregate colour/edge/luminance signals, not a pixel diff; matching screens must be captured at the same viewport.',
            'The AniBiPlay v2 backend needs app auth; the adapter must fail gracefully when credentials/token are absent.',
            'The upstream platform/origin catalogue is server-side and is not fabricated in Nanime.',
        ],
    }
    tmp = REPORT_JSON + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, REPORT_JSON)
    with open(RESOLVED_FILE + '.tmp', 'w', encoding='utf-8') as handle:
        json.dump({'schema': SCHEMA, 'resolved': sorted(resolved, key=lambda i: i.get('resolvedAt', 0), reverse=True)}, handle, ensure_ascii=False, indent=2)
    os.replace(RESOLVED_FILE + '.tmp', RESOLVED_FILE)
    write_markdown(report)
    return report


def write_markdown(report: dict[str, Any]) -> None:
    lines = [
        '# AniBiPlay ↔ Nanime comparison',
        '',
        f'Generated: {report["generatedAt"]}  ',
        f'Open: **{report["summary"]["open"]}** · resolved: {report["summary"]["resolved"]} · weight: {report["summary"]["weighted"]}',
        '',
        '## Highest-impact open issues',
        '',
    ]
    for row in report['issues'][:25]:
        loc = ', '.join(row['locations'][:2]) or '-'
        lines.append(f'- **[{row["severity"]}]** {row["title"]} — `{loc}`')
        lines.append(f'  - {row["detail"]}')
        lines.append(f'  - Fix: {row["recommendation"]}')
    if not report['issues']:
        lines.append('No open issues detected.')
    lines += [
        '',
        '## Reference contract',
        '',
        f'- Base URL: `{report["references"]["apiBaseUrl"] or "not found"}`',
        f'- Endpoints: ' + ', '.join(e['path'] for e in report['references']['endpoints']),
        '',
        '## Provider registry',
        '',
        f'- Order: {", ".join(report["metrics"]["providers"]["order"])}',
        f'- Active/streaming/download-only: {report["metrics"]["providers"]["activeCount"]}/'
        f'{report["metrics"]["providers"]["streamingCount"]}/'
        f'{len(report["metrics"]["providers"]["downloadOnly"])}',
        '',
        '## Recently resolved',
        '',
    ]
    for row in report['resolved'][:15]:
        lines.append(f'- {row["title"]}')
    if not report['resolved']:
        lines.append('- none yet')
    lines += [
        '',
        '## Limitations',
        '',
        *[f'- {item}' for item in report['limitations']],
        '',
        '_Generated by `scripts/anibiplay_compare.py`._',
    ]
    with open(REPORT_MD + '.tmp', 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines) + '\n')
    os.replace(REPORT_MD + '.tmp', REPORT_MD)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(args: argparse.Namespace) -> int:
    cache = Cache()
    ref = extract_anibi_reference(cache)
    idx = extract_nanime_index(cache)
    issues = Issues()
    ui: dict[str, Any] = {}
    shots: dict[str, Any] = {}
    providers: dict[str, Any] = {}
    if args.command in {'all', 'ui'}:
        ui = analyze_ui(ref, idx, issues)
    if args.command in {'all', 'screenshots'}:
        shots = analyze_screenshots(ref, issues, cache)
    if args.command in {'all', 'providers'}:
        providers = analyze_providers(ref, idx, issues)
    report = write_report(ref, idx, ui, shots, providers, issues)
    cache.save()

    print(f'AniBiPlay compare: {report["summary"]["open"]} open, {report["summary"]["resolved"]} resolved, weight {report["summary"]["weighted"]}')
    for row in report['issues'][:12]:
        print(f'  [{row["severity"]:<8}] {row["title"]}')
    print(f'JSON: {rel(REPORT_JSON)}')
    print(f'MD:   {rel(REPORT_MD)}')
    if args.fail_on:
        threshold = SEVERITY_ORDER[args.fail_on]
        if any(SEVERITY_ORDER.get(row['severity'], 9) <= threshold for row in report['issues']):
            return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['all', 'ui', 'providers', 'screenshots'], nargs='?', default='all')
    parser.add_argument('--fail-on', choices=list(SEVERITY_ORDER), help='exit non-zero when an issue at this severity or higher is open')
    parser.add_argument('--changed', action='store_true', help='reuse cached reference/screenshot metrics (default behaviour)')
    args = parser.parse_args()
    return run(args)


if __name__ == '__main__':
    raise SystemExit(main())
