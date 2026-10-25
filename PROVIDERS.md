# Catatan Provider Nanime

Registry final berisi tiga sumber (lihat `src/providers/registry.ts`):

| # | Provider | Domain | Peran | Stream | Unduhan | Catatan |
|---|----------|--------|-------|--------|---------|---------|
| 1 | Otakudesu | otakudesu.blog | Utama | Ajax nonce → media langsung | Episode + batch | Parser lama `src/core/scraper.ts` dipertahankan |
| 2 | Samehadaku | samehadaku.li | Pelengkap | Iframe embed | `parseSoraDownloads` | Domain berganti-ganti; butuh header Referer |
| 3 | Animeku | ww2.animeku.lol | Fallback terakhir | Embed `putarin.xyz` | Tidak ada | Tema `aku-*`; detail `/{slug}/`, play `/play/…` |

Aturan perilaku:

- Pencarian katalog: Otakudesu → Samehadaku → Animeku, berhenti pada hasil
  relevan pertama. Tidak ada pemanggilan semua provider lalu penyaringan.
- Home/jadwal/rekomendasi hanya memakai tiga provider resmi di atas.
- Fallback detail bersifat lazy: provider berikutnya dipanggil hanya bila ada
  bagian yang kosong (sinopsis, genre, poster, atau episode yang diklaim tapi
  belum ada). Data yang sudah lengkap tidak ditimpa.
- Unduhan diambil dari halaman episode sumber (Otakudesu dan Samehadaku);
  Animeku tidak menyediakan tautan unduhan.
- Pemutar utama menampilkan halaman episode Otakudesu langsung; mirror tiap
  kualitas tetap tersedia sebagai pilihan sumber alternatif.
- Scraping live hanya berjalan di APK Android (`CapacitorHttp`); browser web
  dibatasi CORS. Kegagalan provider ditangani dengan fallback diam-diam.

Integrasi provider lain (Oploverz, Kuramanime, Kusonime, Anichin, Animasu,
Anitoki, NontonAnime, Moeclip, Kuronime, Doronime, Ylnime, AnimeIndo,
Nimegami, Sakunime, SamehadakuHow, Moenime, Alqanime, Anoboy, Gomunime,
Lendrive, Animekuindo, AnimekuOnline) sudah dihapus dari registry, adapter,
parser, dan tes.
