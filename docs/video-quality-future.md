# Rancangan kualitas video untuk implementasi mendatang

Nanime saat ini tidak menyediakan pemutar video. Pilihan kualitas juga tidak tampil di UI. Implementasi berikut baru boleh dimulai setelah jalur media mempunyai sumber yang sah, layanan server, kapasitas, dan pengujian perangkat.

## Model kualitas

Setiap varian harus menyimpan label keluaran, resolusi keluaran, resolusi sumber, codec, container, bitrate, audio/subtitle yang tersedia, provider asal, dan apakah varian itu file asli atau hasil transcoding. UI masa depan hanya boleh menampilkan `1080p`, `720p`, `480p`, `360p`, serta `Auto` bila tersedia. Katalog varian menggabungkan sumber dari provider yang telah diverifikasi untuk anime dan episode yang sama.

Label resolusi menjelaskan ukuran frame keluaran, bukan tingkat detail sumber. Jika sumber asli 720p ditranscode ke 1080p, varian harus diberi provenance `upscaled` dan tidak boleh disebut detail asli 1080p. Transcoding mengubah encoding/container/bitrate; upscaling menambah ukuran frame tetapi tidak memulihkan detail yang tidak ada.

## Infrastruktur yang diperlukan

- Pekerja server terpisah dari Android/WebView, menggunakan FFmpeg versi yang dipatok dan dipantau.
- Antrean pekerjaan, batas konkurensi, batas ukuran/durasi, timeout, retry terbatas, dan penghentian pekerjaan.
- Penyimpanan objek untuk hasil sementara dan permanen, URL bertanda tangan, TTL, serta job pembersihan yang dapat diaudit.
- Cache kunci berbasis hash sumber, parameter encoding, dan versi pipeline agar hasil sama tidak dibuat berulang kali.
- Telemetri waktu kerja, ukuran output, kegagalan decoder, throughput, biaya, dan kapasitas disk.
- Validasi MIME, codec, manifest, range request, audio, subtitle, dan pemutaran ulang di Chrome Android serta Android WebView.

FFmpeg tidak dijalankan pada perangkat Android pengguna. Perangkat hanya memilih varian yang sudah tersedia dan kompatibel. Jika varian yang diminta tidak tersedia, sistem memilih varian asli terdekat dengan status fallback yang jelas; UI tidak mengubah label secara kosmetik.

## Syarat sumber dan akses

Sebelum memproses media pihak ketiga, Nanime harus memastikan lisensi atau izin eksplisit mencakup pengunduhan, penyimpanan, transcoding, distribusi ulang, dan subtitle. Sumber yang memerlukan login, cookie privat, proteksi akses, atau pemintas pembatasan tidak diproses. Halaman download dan halaman embed tidak dianggap sebagai file video.

## Gate sebelum rilis

Aktifkan fitur hanya setelah tersedia bukti hak pemrosesan, infrastruktur terukur, pembatasan biaya, mekanisme purge, laporan keamanan, dan uji playback di perangkat nyata. Tanpa bukti tersebut, status kualitas/transcoding tetap `NOT IMPLEMENTED`.
