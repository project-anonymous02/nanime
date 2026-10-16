# Catatan Verifikasi Provider Nanime

Semua pemeriksaan dilakukan langsung (curl) pada 16 Oktober 2026 dari lingkungan pengembangan.
Status "terverifikasi" berarti: halaman diakses, struktur HTML diperiksa, dan (bila memungkinkan)
endpoint pencarian/detail/episode/sumber diuji langsung. Fixture HTML nyata disimpan di `tests/fixtures/`.

## Terimplementasi & terverifikasi

| # | Provider | Domain | Diperiksa | Akses | Struktur | Cari | Detail/EP | Sumber tonton | Catatan |
|---|----------|--------|-----------|-------|----------|------|-----------|---------------|---------|
| 1 | Otakudesu | otakudesu.blog | 2026-10-16 | 200 | venz/episodelist/infozinkle/mirrorstream | ya | ya | ajax nonce | Parser lama dipertahankan & diuji |
| 2 | Oploverz | oploverz.am | 2026-10-16 | 200 | bsx/eplister/infox/thumbook | ya | ya | select.mirror (oplz token) | Parser lama dipertahankan |
| 3 | Kuramanime | kuramanime.ing | 2026-10-16 | 200 | animestream theme | ya | ya | #player source | Parser lama dipertahankan |
| 4 | Kusonime | kusonime.com | 2026-10-16 | 200 | kover/venz (download only) | ya | ya | hanya link unduh | Sumber movie; tanpa stream |
| 5 | Anichin | ani-chin.id | 2026-10-16 | 200 | animestream theme | ya (`/?s=`) | ya | JSON API `/api/theme/episode/servers?episodeId=` → `/api/theme/episode/source?get=hash` | Donghua; stream berupa embed (OK.ru, Dailymotion, Rumble). Parser baru. |
| 6 | Lendrive | lendrive.web.id | 2026-10-16 | 200 | identik keluarga Oploverz (bsx/tt/eplister/infox/thumbook/genxed) | ya (`/?s=`) | ya | iframe embed di halaman episode | Parser baru (adaptasi parser Oploverz) |
| 7 | Samehadaku | samehadaku.li | 2026-10-16 | 200 | animestream theme | ya (`/?s=`) | ya | iframe embed langsung (blogger token, `data-litespeed-src`) | Domain lama (.boo/.ninja/.cyou/.link) mati. Parser baru. |

Catatan Samehadaku: domain aktif berganti-ganti. `samehadaku.today` adalah agregator Next.js
dengan API publik terbatas (`/api/search?q=`), tetapi sumber WordPress sesungguhnya adalah
`samehadaku.li` (tema animestream). Parser ditujukan untuk `samehadaku.li`.

## Tidak dapat diimplementasikan (diverifikasi mati/pindah)

| # | Provider | Hasil pemeriksaan | Keputusan |
|---|----------|-------------------|-----------|
| 8 | Doronime | doronime.xyz & .site mati; doronime.me = parked domain (halaman iklan) | Dilewati. Health-check fallback ke provider lain. |
| 9 | Anixlife | anixlife.com/.net, anix.life, anixsite.com semuanya tidak merespons (000) | Dilewati. |
| 10 | Kazefuri | kazefuri.web.id hidup tetapi kini situs berita/blog (bukan katalog streaming); kazefuri.com mati | Dilewati. |
| — | Moenime | moenime.com hidup tetapi portal unduh lawas di balik Cloudflare; tidak ditemukan server streaming di halaman | Dilewati. |
| — | Donghua (sumber terpisah) | Anichin (ani-chin.id) di atas sudah menjadi sumber donghua utama | Tidak perlu sumber tambahan. |

Jadi: **7 provider terverifikasi & terimplementasi** (4 lama dipertahankan + 3 baru),
3 provider target tidak dapat diimplementasikan karena situsnya sudah tidak berfungsi.
Setiap kegagalan provider ditangani dengan fallback otomatis ke provider lain.
