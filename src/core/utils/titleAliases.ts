/**
 * Sinonim judul anime (English ↔ Romaji) dan normalisasi musim.
 * Daftar ini mudah ditambah — cukup tambahkan pasangan pada ARRAY di bawah.
 */

/** Setiap grup berisi judul-judul yang merujuk anime yang sama. */
const ALIAS_GROUPS: string[][] = [
  ['kimetsu no yaiba', 'demon slayer'],
  ['shingeki no kyojin', 'attack on titan', 'snk', 'aot'],
  ['one punch man', 'opm'],
  ['jujutsu kaisen', 'jjk'],
  ['boku no hero academia', 'my hero academia', 'mha'],
  ['shingeki no bahamut', 'rage of bahamut'],
  ['hunter x hunter', 'hxh'],
  ['fullmetal alchemist brotherhood', 'fmab'],
  ['boku no pico', 'boku no pico'],
  ['kimi no na wa', 'your name'],
  ['tenki no ko', 'weathering with you'],
  ['kaguya-sama wa kokurasetai', 'kaguya-sama love is war'],
  ['kono subarashii sekai ni shukufuku wo', 'konosuba'],
  ['yahari ore no seishun love comedy wa machigatteiru', 'oregairu'],
  ['bocchi the rock', 'bocchi the rock!'],
  ['spy x family', 'spy family'],
  ['chainsaw man', 'csm'],
  ['mushoku tensei', 'jobless reincarnation'],
  ['tate no yuusha no nariagari', 'the rising of the shield hero'],
  ['danmachi', 'dungeon ni deai wo motomeru no wa machigatteiru darou ka'],
  ['overlord', 'overlord'],
  ['re zero kara hajimeru isekai seikatsu', 're:zero'],
  ['solo leveling', 'ore dake level up na ken'],
  ['oshi no ko', 'my star'],
  ['frieren', 'sousou no frieren', 'frieren beyond journeys end'],
  ['blue lock', 'blue lock'],
  ['haikyuu', 'haikyuu!!'],
  ['kuroko no basket', 'kuroko no basuke'],
  ['nanatsu no taizai', 'the seven deadly sins'],
  ['tokyo revengers', 'tokyo revengers'],
  ['black clover', 'black clover'],
  ['gintama', 'gintama']
];

/** Peta normalisasi: varian → kunci kanonik. */
const ALIAS_MAP = new Map<string, string>();

const normalizeKey = (s: string): string =>
  String(s || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

ALIAS_GROUPS.forEach((group, i) => {
  const canonical = 'g' + i;
  group.forEach(alias => {
    const key = normalizeKey(alias);
    if (!key) return;
    if (!ALIAS_MAP.has(key)) ALIAS_MAP.set(key, canonical);
  });
});

/**
 * Kunci grup sinonim untuk judul apa pun.
 * Selain kecocokan persis, judul panjang yang MEMUAT salah satu sinonim
 * (mis. "Tenki no Ko: Weathering With You" memuat "tenki no ko") juga
 * dianggap bagian grup yang sama — kuncinya minimal 2 kata agar sinonim
 * pendek tunggal tidak salah menempel.
 */
export function aliasKey(title: string): string {
  const key = normalizeKey(title);
  if (!key) return '';
  const exact = ALIAS_MAP.get(key);
  if (exact) return exact;

  const titleTokens = key.split(' ');
  let best = '';
  let bestSize = 0;
  ALIAS_GROUPS.forEach((group, i) => {
    for (const alias of group) {
      const aKey = normalizeKey(alias);
      const aTokens = aKey.split(' ');
      if (aTokens.length < 2) continue;
      if (!aTokens.every(t => titleTokens.includes(t))) continue;
      if (aTokens.length > bestSize) {
        bestSize = aTokens.length;
        best = 'g' + i;
      }
    }
  });
  return best;
}

/** Semua varian judul (termasuk dirinya) untuk sebuah judul. */
export function aliasesOf(title: string): string[] {
  const g = aliasKey(title);
  if (!g) return [title];
  const idx = Number(g.slice(1));
  const group = ALIAS_GROUPS[idx] || [];
  return [title, ...group];
}

/** Deteksi musim/season dari judul: { base, season } ("Jujutsu Kaisen Season 2" → 2). */
export function splitSeason(title: string): { base: string; season: number } {
  const s = String(title || '');
  let season = 0;
  const patterns = [
    /season\s*(\d+)/i,
    /(\d+)(?:st|nd|rd|th)\s*season/i,
    /part\s*(\d+)/i,
    /\bs(\d+)\b/i,
    /(\d+)\s*(?:nd|rd|th)?\s*season/i
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      season = Number(m[1]) || 0;
      break;
    }
  }
  const base = s
    .replace(/season\s*\d+/i, ' ')
    .replace(/(\d+)(?:st|nd|rd|th)\s*season/i, ' ')
    .replace(/part\s*\d+/i, ' ')
    .replace(/\bs\d+\b/i, ' ')
    .replace(/\b(\d+)(?:nd|rd|th)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { base: base || s, season };
}
