import type { DownloadLink, EpisodeStream, ForcedQuality, QualityLabel, QualitySource, StreamServerRef } from '../types';
import { QUALITY_ORDER } from '../types';
import { qualityRank } from '../utils/qualitySorter';
import { isVideoUrl } from '../utils';

/**
 * QualityNormalizer — menyatukan sumber yang benar-benar berhasil divalidasi
 * ke label kualitas (1080p / 720p / 480p / 360p).
 *
 * Hanya kualitas yang benar-benar disediakan sumber yang diekspos; tidak ada
 * slot yang dikarang atau dipinjam dari label lain. `approx` dipertahankan
 * untuk kompatibilitas tipe, tetapi hasil normalisasi selalu `exact`.
 */

export interface NormalizeInput {
  /** Stream sukses per penyedia, sudah urut prioritas (indeks 0 = paling utama). */
  streams: { provider: string; stream: EpisodeStream }[];
  /** Tautan unduh gabungan (prioritas sudah diterapkan oleh DownloadAggregator). */
  downloads: DownloadLink[];
}

export interface NormalizeOutput {
  qualities: ForcedQuality[];
  defaultQuality: QualityLabel | null;
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
      const directMedia = st.sourceKind === 'direct-media' || (!st.sourceKind && isVideoUrl(st.playerUrl));
      const primary = (st.servers || []).find(server => server.id === st.playerUrl);
      const label = directMedia
        ? guessQuality(st.playerUrl) || guessQuality(primary?.quality || '') || guessQuality(st.title || '')
        : null;
      if (label) put(label, { url: st.playerUrl, providerRef: provider, label: primary?.quality || label, kind: 'file', exact: true });
      const ref = provider + ':main:' + idx;
      if (!primary && !seenServer.has(ref)) {
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
      const label = guessQuality(s.quality || s.name || '') || guessQuality(s.id || '');
      const directMedia = st.sourceKind === 'direct-media' || isVideoUrl(s.id || '');
      if (label && directMedia) {
        put(label, {
          url: s.id,
          providerRef: provider,
          label: s.quality || s.name || label,
          kind: 'file',
          exact: true
        });
      }
      servers.push({
        ref,
        label: s.name || 'Server ' + (si + 1),
        url: /^https?:\/\//i.test(s.id || '') ? s.id : '',
        providerRef: provider,
        quality: label || undefined
      });
    });
  });

  // Downloads are kept separate and must never be presented as playback media.
  void input.downloads;

  /* Only expose a quality when a provider actually supplied a source for it. */
  const available = QUALITY_ORDER.filter(q => real.has(q));
  const qualities: ForcedQuality[] = available.map(label => ({ label, source: { ...real.get(label)!, exact: true }, approx: false }));

  /* Prefer 480p; otherwise choose an actually present quality near it. */
  const defaultQuality: QualityLabel | null = real.has('480p')
    ? '480p'
    : available.length
      ? available.slice().sort((a, b) => distance(a, '480p') - distance(b, '480p'))[0]
      : null;

  return { qualities, defaultQuality, servers };
}
