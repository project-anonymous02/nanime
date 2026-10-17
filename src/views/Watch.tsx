import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { DetailBundle, QualityLabel, StreamBundle } from '../core/types';
import { useApp } from '../state/app';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { ErrorState, Skel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { Tabs } from '../ui/Tabs';
import { watchPath } from '../lib/nav';

/**
 * Halaman pemutar — video TIDAK dirender di sini. GlobalPlayer memegang satu
 * elemen video persisten yang menempel penuh selama berada di /watch/*, dan
 * otomatis menjadi Floating Mini Player saat pengguna pindah halaman.
 */

export function Watch() {
  const { id = '', episode = '' } = useParams();
  const [params] = useSearchParams();
  const titleHint = params.get('title') || '';
  const navigate = useNavigate();

  const mode = useApp(a => a.mode);
  const setMode = useApp(a => a.setMode);
  const quality = usePlayer(s => s.quality);
  const serverRef = usePlayer(s => s.serverRef);

  const [stream, setStream] = useState<StreamBundle | null>(null);
  const [detail, setDetail] = useState<DetailBundle | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('server');

  const reqRef = useRef(0);
  const detailRef = useRef<DetailBundle | null>(null);
  detailRef.current = detail;

  /* ── Muat bundel stream lalu buka sesi pemutar global ── */
  const load = useCallback(async () => {
    const req = ++reqRef.current;
    setError(false);
    setStream(null);
    try {
      const b = await Catalog.stream(id, episode, { title: titleHint });
      if (req !== reqRef.current) return;
      setStream(b);
      const pref = useSettings.getState().defaultQuality as QualityLabel;
      const desired = b.qualities.find(q => q.label === pref)?.source ? pref : b.defaultQuality;
      const st = usePlayer.getState();
      const cur = st.session;
      if (cur && !st.closed && cur.animeId === id && String(cur.episode) === String(b.episode)) {
        /* Kembali dari floating ke /watch: lanjutkan sesi yang sama tanpa jeda. */
        st.patchSession({ title: b.title || titleHint, poster: b.poster, stream: b });
      } else {
        st.open({
          session: {
            animeId: id,
            episode: String(b.episode),
            title: b.title || titleHint,
            poster: b.poster,
            stream: b,
            episodes: detailRef.current?.episodeList || []
          },
          quality: desired
        });
      }
    } catch {
      if (req === reqRef.current) setError(true);
    }
  }, [id, episode, titleHint]);

  useEffect(() => {
    window.scrollTo(0, 0);
    void load();
  }, [load]);

  /* ── Detail (daftar episode + tab info) ── */
  useEffect(() => {
    let alive = true;
    setDetail(null);
    Catalog.detail(id, { title: titleHint })
      .then(d => {
        if (!alive) return;
        setDetail(d);
        const st = usePlayer.getState();
        if (st.session && st.session.animeId === id) st.patchSession({ episodes: d.episodeList });
      })
      .catch(() => {
        if (alive) setDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [id, titleHint]);

  const title = stream?.title || detail?.title || titleHint || 'Memuat…';
  const episodes = detail?.episodeList || [];
  const qualityDef = useMemo(() => stream?.qualities || [], [stream]);
  const primaryProvider = stream?.servers[0]?.providerRef;
  const serverList = (stream?.servers || []).filter(s => mode === 'multi' || s.providerRef === primaryProvider);

  const tabs = useMemo(() => {
    const list = [{ key: 'server', label: 'Server' }];
    if (stream?.downloads.length) list.push({ key: 'download', label: 'Unduh' });
    if (episodes.length) list.push({ key: 'episode', label: 'Episode' });
    if (detail?.synopsis) list.push({ key: 'info', label: 'Info' });
    return list;
  }, [stream?.downloads.length, episodes.length, detail?.synopsis]);

  /* ── Pemilih kualitas & server (delegasi ke store pemutar) ── */
  const pickQuality = (label: QualityLabel) => {
    const st = usePlayer.getState();
    st.setServerRef(null);
    st.setQuality(label);
  };
  const pickServer = (ref: string) => usePlayer.getState().setServerRef(ref);

  if (error) {
    return (
      <>
        <div className="watch-slot" aria-hidden="true" />
        <div style={{ padding: '16px var(--pad-x) 0' }}>
          <button type="button" className="ibtn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <ErrorState onRetry={() => void load()} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Ruang untuk GlobalPlayer yang menempel di atas selama di halaman ini. */}
      <div className="watch-slot" aria-hidden="true" />

      <div style={{ padding: '16px var(--pad-x) 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }} className="clamp-2">
              {title}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
              Episode {stream?.episode ?? episode} • 4 Kualitas
            </p>
          </div>
          <div className="mode-fab" style={{ position: 'static', animation: 'none' }} role="group" aria-label="Mode sumber">
            <button
              type="button"
              className={'mode-opt' + (mode === 'single' ? ' active' : '')}
              onClick={() => setMode('single')}
            >
              SINGLE
            </button>
            <button
              type="button"
              className={'mode-opt' + (mode === 'multi' ? ' active' : '')}
              onClick={() => setMode('multi')}
            >
              MULTI
            </button>
          </div>
        </div>

        <div className="quality-row" style={{ marginTop: 14 }}>
          {qualityDef.map(q => {
            const active = !serverRef && quality === q.label;
            const dot = !q.source ? 'gray' : q.approx ? 'gold' : 'green';
            return (
              <button
                key={q.label}
                type="button"
                className={'quality-btn' + (active ? ' active' : '')}
                disabled={!q.source}
                onClick={() => pickQuality(q.label)}
              >
                <span className={'q-dot ' + dot} />
                {q.label}
              </button>
            );
          })}
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'server' && stream ? (
          <div className="tab-panel" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {serverList.map(s => {
              const active = serverRef === s.ref || (!serverRef && !!s.isDefault);
              return (
                <button
                  key={s.ref}
                  type="button"
                  className={'server-item' + (active ? ' active' : '')}
                  onClick={() => pickServer(s.ref)}
                >
                  <Icon name="server" size={18} />
                  <span className="ellipsis" style={{ flex: 1 }}>
                    {s.label}
                  </span>
                  {serverRef === s.ref ? <Icon name="check" size={16} /> : null}
                </button>
              );
            })}
            {!serverList.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Daftar server mengikuti mode sumber.</p>
            ) : null}
          </div>
        ) : null}

        {tab === 'download' && stream ? (
          <div className="tab-panel" style={{ marginTop: 14 }}>
            {stream.downloads.map(g => (
              <div className="download-group" key={g.quality}>
                <div className="dg-head">
                  <Icon name="downloadCloud" size={18} />
                  <span className="dg-quality">{g.quality}</span>
                </div>
                {g.items.map((d, i) => (
                  <a
                    key={i}
                    className="dl-link"
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    <span className="dl-name ellipsis">{d.name || d.quality || 'Unduh'}</span>
                    <Icon name="download" />
                  </a>
                ))}
              </div>
            ))}
            {!stream.downloads.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Belum ada tautan unduhan untuk episode ini.</p>
            ) : null}
          </div>
        ) : null}

        {tab === 'episode' ? (
          <div className="tab-panel" style={{ marginTop: 14 }}>
            <div className="ep-grid">
              {episodes.map(ep => (
                <button
                  key={ep.num + ep.id}
                  type="button"
                  className={'ep-cell ripple-host' + (String(stream?.episode) === ep.num ? ' current' : '')}
                  onClick={() => navigate(watchPath(id, ep.num, title), { replace: true })}
                >
                  {ep.num}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'info' && detail ? (
          <div className="tab-panel" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div className="hero-meta">
              {[detail.year, detail.type, detail.status, detail.duration, detail.studio].filter(Boolean).map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6 }}>{detail.synopsis}</p>
          </div>
        ) : null}

        {!stream && !error ? (
          <div style={{ marginTop: 18 }}>
            <Skel className="line w80" />
            <Skel className="line w40" style={{ marginTop: 10 }} />
          </div>
        ) : null}
      </div>
    </>
  );
}
