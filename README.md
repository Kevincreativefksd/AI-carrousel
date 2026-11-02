# Carousel to PDF

Ubah satu topik (atau artikel) menjadi **carousel PDF editorial 4:5** siap unggah. AI menyusun isi slide, lalu semuanya dirangkai menjadi PDF di dalam browser.

Tidak ada server perantara: seluruh proses berjalan di browser Anda, dan Gemini API key dikirim langsung dari browser ke Google.

---

## Daftar Isi

- [Fitur](#fitur)
- [Cara Kerja](#cara-kerja)
- [Struktur Proyek](#struktur-proyek)
- [Menjalankan](#menjalankan)
- [Mendapatkan API Key](#mendapatkan-api-key)
- [Panduan Penggunaan](#panduan-penggunaan)
- [Pengaturan Lanjutan](#pengaturan-lanjutan)
- [Layout Slide](#layout-slide)
- [Privasi & Keamanan](#privasi--keamanan)
- [Pemecahan Masalah](#pemecahan-masalah)
- [Batasan](#batasan)
- [Deploy](#deploy)

---

## Fitur

- **Topik → carousel** — cukup tulis topik, AI menyusun struktur slide, label kategori, headline, dan isi.
- **Bahan sumber opsional** — tempel artikel/data agar angka dan fakta hanya diambil dari bahan tersebut. Jika dikosongkan, isi dibuat umum dan **tanpa angka spesifik**.
- **5 layout editorial** — Sampul, Teks, Daftar bernomor, Perbandingan, dan Penutup (berterna gelap).
- **Format 4:5 (1080 × 1350 px)** — ukuran yang aman untuk feed Instagram.
- **Sorotan otomatis** — frasa yang dibungkus `**dua bintang**` pada teks akan tampil sebagai sorotan berwarna aksen.
- **Auto-fit teks** — headline dan isi otomatis mengecil bila terlalu panjang agar tidak keluar dari bingkai.
- **Pratinjau bertahap** — slide muncul satu per satu saat dirender, disertai progress bar dan status.
- **Kustomisasi cepat** — nama akun (header), teks footer, nama sumber, warna aksen, dan jumlah slide (5–12).
- **Caption media sosial otomatis** — Gemini membuat caption dari kata kunci dan isi carousel untuk Instagram, TikTok, Facebook, LinkedIn, atau X.
- **Salin caption** — hasil caption dapat disalin dengan satu klik dan diedit sebelum dipublikasikan.
- **Unduh PDF** — otomatis setelah selesai (bisa dimatikan) atau manual lewat tombol **Unduh PDF**.
- **Ingat preferensi** — pengaturan disimpan di `localStorage`; API key hanya disimpan bila Anda mencentang opsi "Ingat API key".
- **Pesan error yang jelas** — API key tidak valid, model tidak ditemukan, kuota habis, filter keamanan, timeout, dan offline ditangani dengan pesan berbahasa Indonesia.

---

## Cara Kerja

`app.js` menjalankan empat tahap (agent) berurutan:

| Tahap | Nama | Teknologi | Tugas |
| --- | --- | --- | --- |
| 1 | **Content Planner** | Gemini API | Menyusun JSON slide berstruktur sesuai skema (`responseSchema`), termasuk layout per slide |
| 2 | **Social Caption Writer** | Gemini API | Membuat caption sesuai platform berdasarkan kata kunci dan isi slide |
| 3 | **Slide Designer** | Canvas 2D | Merender tiap slide 1080 × 1350 px dengan template tipografi dan warna aksen |
| 4 | **PDF Compiler** | jsPDF | Menggabungkan gambar JPEG tiap slide menjadi satu PDF (portrait, ukuran sama) |

Hasil tiap slide dirender ke `<canvas>`, diekspor sebagai JPEG kualitas 0.93, lalu ditempatkan penuh di setiap halaman PDF. Nama berkas dibuat dari slug topik, misalnya `Carousel_Wall_Street_menguji_modal_AI.pdf`.

---

## Struktur Proyek

```
.
├── index.html   # Markup + konfigurasi tema Tailwind + CDN (Tailwind, jsPDF, Google Fonts)
├── style.css    # Komponen kustom (field, tombol, toast, skeleton, slider)
├── app.js       # Seluruh logika: Gemini, canvas renderer, kompilasi PDF, state & event
├── .nojekyll    # Penanda agar GitHub Pages tidak memproses folder dengan Jekyll
└── README.md
```

Tanpa build step, tanpa `node_modules`. Cukup tiga berkas statis.

---

## Menjalankan

Karena semuanya statis, Anda bisa langsung membuka `index.html`. Namun disarankan memakai server lokal agar perilaku `fetch` dan `localStorage` konsisten:

```bash
# Python
python3 -m http.server 8000

# atau Node
npx serve .
```

Lalu buka <http://localhost:8000>.

> **Butuh koneksi internet.** Tailwind, jsPDF, Google Fonts, dan Gemini API semuanya dimuat dari internet. Aplikasi menampilkan peringatan bila Anda sedang offline.

---

## Mendapatkan API Key

1. Buka <https://aistudio.google.com/apikey>.
2. Buat API key (tersedia paket gratis).
3. Tempel key pada kolom **Gemini API key** di halaman aplikasi.

Key dipakai sebagai header `x-goog-api-key` pada permintaan ke `generativelanguage.googleapis.com` dan tidak pernah dikirim ke server lain.

---

## Panduan Penggunaan

1. **Topik carousel** — wajib, minimal 3 karakter. Contoh: `Wall Street menguji balik modal investasi AI`.
2. **Bahan sumber** *(opsional)* — tempel artikel atau data. Bila diisi, model dilarang menambah fakta dari luar bahan.
3. **Gemini API key** — wajib. Gunakan tombol **Tampilkan/Sembunyikan** untuk memeriksa key.
4. Pilih platform pada bagian **Platform caption**.
5. Klik **Generate Carousel**.
6. Tunggu proses: penyusunan isi → pembuatan caption → desain slide per slide → kompilasi PDF.
7. Caption tampil di bawah pratinjau. Klik **Salin caption** untuk menyalinnya.
8. PDF otomatis terunduh (jika opsi aktif) atau klik **Unduh PDF** pada bagian pratinjau.

---

## Pengaturan Lanjutan

Buka bagian **Pengaturan lanjutan** pada formulir:

| Pengaturan | Default | Keterangan |
| --- | --- | --- |
| Nama akun (header slide) | `Zona Ekonomi` | Ditampilkan huruf kapital di kiri atas tiap slide |
| Teks footer | `Ruang Literasi Ekonomi` | Teks kecil di bagian bawah slide |
| Nama sumber | *(kosong)* | Jika diisi, blok **SUMBER** muncul di slide terakhir |
| Jumlah slide | `11` | Dibatasi 5–12 |
| Warna aksen | `#C62828` | Dipakai untuk bar aksen, nomor daftar, dan sorotan teks |
| Model Gemini | `gemini-3.5-flash-lite` | Bisa diganti dengan nama model lain yang tersedia di akun Anda |
| Unduh PDF otomatis | aktif | Matikan bila ingin memeriksa pratinjau dulu |
| Ingat API key | nonaktif | Menyimpan key di `localStorage` browser ini |

Preferensi selain API key selalu disimpan di `localStorage` (`cpg.prefs`).

---

## Layout Slide

| Layout | Nama tampilan | Isi |
| --- | --- | --- |
| `cover` | Sampul | Label kategori, headline maks. 8 kata, 1–2 kalimat pembuka dengan angka kunci |
| `content` | Teks | Headline (klaim/pertanyaan), 2–3 kalimat isi, footnote opsional |
| `list` | Daftar bernomor | Headline + 3–4 poin ringkas |
| `stats` | Perbandingan | Headline + 2–3 baris pembanding (`title` + `detail`) |
| `closing` | Penutup | Pertanyaan terbuka + ajakan berkomentar, tema gelap, blok sumber opsional |

Slide pertama selalu `cover` dan slide terakhir selalu `closing`. Layout yang tidak valid atau kehilangan data pendukung otomatis diturunkan menjadi `content`, sehingga PDF tetap bisa dibuat.

---

## Privasi & Keamanan

- Tidak ada backend, analitik, maupun penyimpanan di sisi server.
- API key dikirim hanya ke `generativelanguage.googleapis.com` melalui HTTPS.
- Key **tidak** disimpan kecuali Anda mencentang "Ingat API key"; jika centang dilepas, key langsung dihapus dari `localStorage`.
- PDF dibuat di memori dan diunduh sebagai blob lokal (object URL dibersihkan setiap kali generate ulang).
- Jangan memakai key dengan kuota/billing penting pada perangkat bersama.

---

## Pemecahan Masalah

| Pesan | Penyebab umum | Solusi |
| --- | --- | --- |
| API key tidak valid | Key salah ketik atau sudah dihapus | Buat key baru di AI Studio |
| API key ditolak atau tidak punya akses ke model ini | Key dibatasi / model tidak tersedia | Ganti nama model di Pengaturan lanjutan |
| Model "…" tidak ditemukan | Nama model tidak dikenal | Isi dengan nama model yang valid untuk akun Anda |
| Kuota Gemini habis atau terlalu banyak permintaan | Rate limit paket gratis | Tunggu sebentar, lalu coba lagi |
| Topik ditolak oleh filter keamanan Gemini | Topik sensitif | Ubah topik atau bahan sumber |
| Gemini tidak merespons tepat waktu | Jaringan lambat / permintaan besar | Coba lagi, atau persingkat bahan sumber |
| Format JSON dari Gemini tidak valid | Respons terpotong | Klik Generate lagi |
| Library jsPDF gagal dimuat | CDN diblokir | Muat ulang halaman, cek pemblokir iklan/jaringan |

---

## Batasan

- Rasio slide tetap 4:5 (1080 × 1350 px) dan tidak dapat diubah dari UI.
- Jumlah slide 5–12; kurang dari 3 slide valid akan dianggap gagal.
- Hanya `**bold**` yang dikenali sebagai format sorotan; markdown lain tidak didukung.
- Tanpa sumber, model diinstruksikan untuk tidak mengarang angka, tanggal, kutipan, atau nama pihak.
- Caption memerlukan satu permintaan Gemini tambahan setelah konten carousel berhasil dibuat.
- Nada netral dan edukatif, tanpa saran investasi, emoji, atau hashtag.
- Teks yang sangat panjang akan diperkecil bertahap; tetap ada batas sebelum terpotong.

---

## Deploy

Karena hanya berisi berkas statis, proyek ini bisa di-hosting di mana saja (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Adanya `.nojekyll` menandakan proyek siap dipasang di **GitHub Pages**:

1. Push semua berkas ke branch `main`.
2. Buka **Settings → Pages**.
3. Pilih source *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. Situs tersedia di `https://<username>.github.io/<repo>/`.

Aplikasi menangani API key di sisi pengguna, jadi tidak perlu variabel environment apa pun.
