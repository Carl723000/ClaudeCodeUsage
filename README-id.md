# Claude Code Usage

🌐 **Bahasa**: [🏠 Main](README.md) | [English](README-en.md) | [繁體中文](README-zh-TW.md) | [简体中文](README-zh-CN.md) | [日本語](README-ja.md) | [한국어](README-ko.md) | **Bahasa Indonesia**

---

**Pelatih penggunaan lokal Claude Code dan Codex di status bar.** Bukan alat billing. Tampilan biaya / kuota Claude tetap ada; Codex Beta menganalisis token dan perilaku sesuai semantik Codex.

> **Apa ini:** monitor status bar VS Code yang membaca log percakapan Claude Code lokal Anda dan menampilkan estimasi penggunaan serta biaya **berbasis token** — plus penasihat AI opsional yang menyarankan cara memperbaiki prompt Anda dan mengurangi pemborosan.

> **ini _Bukanlah_:** alat billing. Semua angka adalah estimasi berdasarkan tarif publik per-juta-token. Rujuk ke akun Anthropic Anda untuk biaya yang sebenarnya.

> Screenshot berasal dari UI berbahasa Inggris. Lihat [README utama](README.md) untuk referensi fitur lengkap.

## Screenshot

### Status bar

![Status bar](images/v2-status-bar-en.png)

Arahkan kursor ke indikator kuota untuk melihat rinciannya:

![Quota tooltip](images/v2-quota-en.png)

Tooltip menampilkan persentase pemakaian, waktu tersisa, dan waktu reset aktual
untuk setiap jendela. Setiap batas mingguan yang diukur oleh paket Anda mendapat
baris tersendiri, termasuk batas khusus model yang namanya diberikan secara
dinamis oleh Anthropic serta kredit penggunaan jika diaktifkan.

### Dashboard

![Dashboard](images/v2-dashboard-en.png)

## Fitur

- **Status bar** — biaya hari ini, biaya sesi saat ini, dan kuota 5-jam / mingguan yang sebenarnya (`5h:N% wk:N%`) dibaca dari sesi OAuth Claude Code sendiri. Tanpa konfigurasi.
- **Tab dashboard** — Hari Ini / Bulan Ini / Sepanjang Waktu, plus **Sesi / Proyek / Konten / Branch**, semuanya bisa diurutkan.
- **Grafik komposisi biaya bertumpuk** dengan sumbu Y dan garis referensi — lihat sekilas berapa banyak dari tiap hari / bulan yang terpakai untuk masukan, keluaran, cache-write, dan cache-read.
- **Tab Konten** — memperkirakan konten mana yang menghabiskan token Anda (prompt Anda vs. hasil tool vs. output / pemikiran asisten).
- **Saran AI** (opsional) — mengirim ringkasan penggunaan plus sampel prompt Anda ke API yang kompatibel dengan OpenAI (DeepSeek V4 Pro secara default) dan menyarankan penulisan ulang yang konkret. Gunakan API key Anda sendiri, atau pratinjau demo statis terlebih dahulu.
- **Harga multi-vendor** — Opus 4.x / Sonnet 4.x / Haiku 4.5 diverifikasi terhadap harga publik Anthropic; tarif referensi untuk OpenAI / Gemini / DeepSeek / Kimi / GLM / Qwen dengan fallback berbasis family model. `Refresh Token Pricing` menarik data LiteLLM langsung.
- **Personalisasi** — bahasa, zona waktu, angka desimal, angka ringkas, pengelompokan proyek, toggle penyegaran otomatis dashboard.

## Codex Beta di v2.3

- Catatan penggunaan Codex hanya ditemukan dari `sessions/**/*.jsonl` dan `archived_sessions/**/*.jsonl`; file kredensial, database, dan file tak dikenal tetap dikecualikan. Secara terpisah, ekstensi hanya melakukan streaming terhadap `$CODEX_HOME/session_index.jsonl` untuk memetakan `id` ke `thread_name` bagi judul thread yang sebenarnya. Jalur absolut dalam judul disamarkan dan judul hanya disimpan di memori. Setiap baris JSONL penggunaan di-stream dan diparse sementara hanya untuk mengambil metadata penggunaan dan struktur dalam daftar izin; field prompt, respons, perintah, dan argumen alat tidak diperiksa atau dipakai untuk analisis, serta tidak pernah disimpan atau dipersistenkan.
- **Diproses** = input + output, **Penggunaan tanpa cache** = Input tanpa cache + output, **cached input** tetap bagian dari input, dan reasoning bagian dari output. Biaya Codex dalam dolar tidak diestimasi; Claude / Codex / Compare mempertahankan makna penghitungan tiap penyedia secara terpisah.
- Beralih ke Codex tetap memakai struktur Hari Ini / Bulan Ini / Sepanjang Waktu / Sesi / Proyek / Konten / Settings yang sudah ada, dengan label yang disesuaikan pada makna Codex. Kedua penyedia memakai render function, HTML class, grafik, tabel, jarak, dan aturan responsif yang sama; rekomendasi Codex memakai bukti struktural 30 hari yang telah diindeks.
- Tugas utama memakai judul thread nyata terbaru setelah jalur disamarkan. Baris tugas anak memprioritaskan judul thread nyatanya sendiri; jika tidak ada, baris memakai nama panggilan yang dilaporkan sambil menampilkan judul induk / tugas utama. Jika informasi itu juga tidak ada, baris memakai nama pengganti netral yang dilokalkan. Nama proyek memakai nama repositori Git, atau nama folder di luar Git. Ekstensi tidak mengarang Branches atau Workflows yang tidak dapat dihitung secara andal.
- Nilai 7 dan 30 hari dihitung dari potongan harian berdasarkan tanggal kejadian dalam zona waktu yang dikonfigurasi. Migrasi atau cakupan yang belum lengkap ditandai **sebagian**. Batas adalah snapshot log lokal yang **terakhir diamati**, bukan data langganan atau tagihan waktu nyata.
- Setiap rekomendasi hanya menampilkan pengamatan, bukti yang mudah dibaca, dan tindakan bersyarat bila agregat struktural 30 hari yang telah diindeks mendukungnya. Tanpa bukti, tidak ada saran umum.
- Indeks persisten menyimpan kunci pseudonim dengan salt khusus mesin; agregat numerik dan struktural; serta metadata proyek, direktori, agen, model, effort, peran, waktu, dan kualitas yang telah disanitasi. Indeks tidak pernah menyimpan ID mentah, jalur lengkap atau URL repositori, judul thread, maupun isi percakapan.
- Tab Settings bersama hanya menampilkan kontrol umum dan kontrol yang berlaku untuk Codex saat Codex dipilih. Pengumpulan Codex dan rekomendasi Codex lokal dapat dinonaktifkan secara terpisah; jeda watcher latar dapat diatur (default 30 detik, tersedia Off dan interval lebih panjang).
## Instalasi

Cari **`Claude Code Usage`** di tampilan Extensions (`Ctrl+Shift+X`), atau:

```
ext install GrowthJack.claude-code-usage
```

Juga tersedia di [Open VSX Registry](https://open-vsx.org/extension/GrowthJack/claude-code-usage) untuk Cursor / Windsurf.

## Konfigurasi

Buka Settings (`Ctrl+,`) dan cari **`Claude Code Usage`**. Semua pengaturan bersifat opsional. Yang paling berguna:

- `language` — bahasa UI (`auto` / `en` / `de-DE` / `zh-TW` / `zh-CN` / `ja` / `ko` / `pt-BR` / `id`).
- `timezone` — zona waktu IANA untuk tampilan tanggal (mis. `Asia/Jakarta`).
- `usageLimitTracking` — tampilkan indikator kuota 5 jam / mingguan yang sebenarnya.
- `showScopedWeekly` — secara opsional tambahkan batas mingguan khusus model yang
  saat ini benar-benar dinamai oleh Anthropic ke status bar.
- `showCost` / `showContext` — nyalakan/matikan item biaya dan indikator pengisian jendela konteks (seperti `/context`) di status bar.
- Setiap item status bar ini bisa dimatikan sendiri — atur `usageLimitTracking`, `showCost`, atau `showContext` ke `false` untuk menyembunyikan salah satunya saja.
- `advice.apiKey` — API key untuk fitur saran AI (kompatibel dengan OpenAI).
- `dashboardAutoRefresh` — nyalakan/matikan penyegaran otomatis dashboard (bisa juga di-toggle di header dashboard).

Lihat [tabel pengaturan lengkap di README utama](README.md#configuration).

## Pemecahan masalah

**"No Claude Code Data"** — pastikan Claude Code sudah terpasang dan pernah dipakai minimal sekali; periksa pengaturan `dataDirectory` (deteksi otomatis mencari di `~/.claude/projects`).

**Kuota menampilkan `5h:--% wk:--%`** — login ke Claude Code sekali; extension ini membaca `~/.claude/.credentials.json` secara baca-saja.

**Riwayat penggunaan bulan-bulan lama hilang** — Claude Code menghapus log yang lebih lama dari `cleanupPeriodDays` (default 30). Untuk menyimpan lebih lama, atur `{ "cleanupPeriodDays": 365 }` di `~/.claude/settings.json`. Log yang sudah terhapus tidak bisa dipulihkan.

**Jumlah token lebih rendah dari dashboard provider Anda** — beberapa proxy / dynamic workflow menulis catatan per-agent ke sub-direktori yang mungkin tidak lengkap. Pengeluaran sebenarnya ada di halaman billing provider Anda. Atribusi workflow native sedang direncanakan.

## Kredit

Fork dari [`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage). Berlisensi MIT. Kontribusi komunitas dicatat di [CHANGELOG.md](CHANGELOG.md). Banyak perubahan kode disusun dengan bantuan [Claude Code](https://claude.com/claude-code).

Kredit alat pengembangan: pemeliharaan repositori menggunakan [Claude Code](https://claude.com/claude-code) dan [OpenAI Codex](https://developers.openai.com/codex/). Kredit alat ini dipisahkan dari kontributor manusia; Codex tidak ditambahkan ke daftar kontributor manusia Release Drafter dan tidak diberi identitas `Co-Authored-By` yang dibuat-buat.

**Issue, PR, dan ide sangat kami sambut** — begitulah proyek ini berkembang.

## Lisensi

[MIT](LICENSE)
