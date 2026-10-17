import type { DownloadLink, EpisodeStream, ForcedQuality, QualityLabel, QualitySource, StreamServerRef } from '../types';
import { QUALITY_ORDER } from '../types';
import { qualityRank } from '../utils/qualitySorter';
import { isVideoUrl } from '../utils';

/**
 * QualityNormalizer — menyatukan sumber dari SEMUA penyedia ke empat slot
 * resolusi internal (1080p / 720p / 480p / 360p):
 * jika penyedia A hanya punya 720p dan penyedia B punya 1080p, hasil akhir
 * tetap menampilkan keempat kualitas tanpa teks "tidak tersedia".
 *
 * Slot kualitas yang dipinjam ditandai `approx`; UI pemilihan harus menyaring
 * slot tersebut agar kualitas tak tersedia tidak ditampilkan sebagai nyata.
 */

export interface NormalizeInput {
  /** Stream sukses per penyedia, sudah urut prioritas (indeks 0 = paling utama). */
  streams: { provider: string; stream: EpisodeStream }[];
  /** Tautan unduh gabungan (prioritas sudah diterapkan oleh DownloadAggregator). */
  downloads: DownloadLink[];
}

export interface NormalizeOutput {
  qualities: ForcedQuality[];
  defaultQuality: QualityLabel;
  servers: StreamServerRef[];
}

/** Tebak label kualitas dari teks apa pun ("HD 720p", "SD", "1080p x265", …). */
export function guessQuality(text: string): QualityLabel | null {
  const r = qualityRank(text);
  if (r >= 1080) return '1080p';
  if (r >= 720) return '720p';
  if (r >= 480) return '480p';
  if (r >= 360) return '360p';
  const s = String(text || '').toLowerCase();
  if (/\bhd\b/.test(s)) return '720p';
  if (/\bsd\b/.test(s)) return '480p';
  return null;
}

function distance(a: QualityLabel, b: QualityLabel): number {
  return Math.abs(QUALITY_ORDER.indexOf(a) - QUALITY_ORDER.indexOf(b));
}

export function buildForcedQualities(input: NormalizeInput): NormalizeOutput {
  const real = new Map<QualityLabel, QualitySource>();
  const servers: StreamServerRef[] = [];
  const seenServer = new Set<string>();

  const put = (label: QualityLabel, src: QualitySource) => {
    const prev = real.get(label);
    /* Sumber pertama menang (prioritas provider), kecuali yang pertama bukan file. */
    if (!prev || (prev.kind === 'embed' && src.kind === 'file')) real.set(label, src);
  };

  input.streams.forEach((entry, idx) => {
    const st = entry.stream;
    const provider = entry.provider;

    if (st.playerUrl) {
      const label = guessQuality(st.playerUrl) || guessQuality(st.title || '');
      const kind = isVideoUrl(st.playerUrl) ? 'file' : 'embed';
      if (label) put(label, { url: st.playerUrl, providerRef: provider, label: st.title || label, kind, exact: true });
      const ref = provider + ':main:' + idx;
      if (!seenServer.has(ref)) {
        seenServer.add(ref);
        servers.push({
          ref,
          label: st.title || 'Server Utama',
          url: st.playerUrl,
          providerRef: provider,
          isDefault: idx === 0,
          quality: label || undefined
        });
      }
    }

    (st.servers || []).forEach((s, si) => {
      const ref = provider + ':srv:' + (s.id || si);
      if (seenServer.has(ref)) return;
      seenServer.add(ref);
      servers.push({
        ref,
        label: s.name || 'Server ' + (si + 1),
        url: /^https?:\/\//i.test(s.id || '') ? s.id : '',
        providerRef: provider,
        quality: guessQuality(s.quality || s.name || '') || undefined
      });
    });
  });

  for (const d of input.downloads) {
    const label = guessQuality(d.quality || d.name || '');
    if (!label) continue;
    const playable = isVideoUrl(d.url);
    if (!playable) continue;
    put(label, { url: d.url, providerRef: 'download', label: d.quality || label, kind: 'file', exact: true });
  }

  /* Isi slot yang kosong dengan sumber terdekat agar 4 kualitas selalu ada. */
  const available = QUALITY_ORDER.filter(q => real.has(q));
  const qualities: ForcedQuality[] = QUALITY_ORDER.map(label => {
    const exact = real.get(label);
    if (exact) return { label, source: { ...exact, exact: true }, approx: false };
    if (!available.length) return { label, source: null, approx: false };
    const nearest = available
      .slice()
      .sort((a, b) => distance(a, label) - distance(b, label))[0];
    const borrowed = real.get(nearest)!;
    return { label, source: { ...borrowed, exact: false }, approx: true };
  });

  /* Default: 480p bila tersedia eksplisit, selain itu kualitas terdekat dari daftar nyata. */
  const defaultQuality: QualityLabel = real.has('480p')
    ? '480p'
    : available.length
      ? available.slice().sort((a, b) => distance(a, '480p') - distance(b, '480p'))[0]
      : '480p';

  return { qualities, defaultQuality, servers };
}
