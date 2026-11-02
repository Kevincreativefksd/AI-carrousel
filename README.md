# AI Carousel to PDF Generator (v2, editorial 4:5)

Web app client-side murni (Vanilla JS + Tailwind CDN + jsPDF CDN). Topik dan bahan sumber menjadi carousel PDF bergaya editorial: latar krem, aksen merah, tipografi tebal, rasio 4:5 (1080 x 1350).

## Alur tiga agen

1. **Content Planner**: Gemini menyusun JSON berlayout. Tiap slide punya `layout` (`cover`, `content`, `list`, `stats`, `closing`), `label`, `headline`, dan field sesuai layout (`body`, `items`, `rows`, `footnote`). Angka penting dibungkus `**...**` agar tampil merah.
2. **Slide Designer**: tiap slide digambar di canvas memakai template tipografi (header, nomor halaman, bar aksen, footer "Geser >"). Slide terakhir otomatis bertema gelap.
3. **PDF Compiler**: jsPDF menyusun semua slide menjadi PDF dan mengunduhnya sebagai `Carousel_[Kata_Kunci].pdf`.

## Deploy ke GitHub Pages

1. Push isi folder ini ke repository.
2. **Settings > Pages**, pilih branch `main`, folder `/ (root)`.
3. Buka `https://<username>.github.io/<nama-repo>/`.

## Akurasi fakta

Gemini tidak punya data pasar terkini. Karena itu:
- **Bahan sumber** bersifat opsional. Jika diisi, prompt melarang menambah angka dari luar bahan itu.
- Jika kosong, aplikasi tetap berjalan dan isi dibuat umum tanpa angka spesifik.
- **Nama sumber** juga opsional. Jika kosong, blok "Sumber" tidak ditampilkan di slide terakhir.
- Selalu periksa ulang isi slide sebelum memposting.

## Kustomisasi

- Nama akun, footer, jumlah slide, warna aksen, dan nama sumber ada di **Pengaturan lanjutan** (tersimpan di browser).
- Warna, font, dan posisi ada di `app.js`: `THEMES`, `FONT`, dan objek `LAYOUTS`.
- Nama model ada di `CONFIG.defaultModel`.

## Keamanan API key

Key tidak ada di kode dan hanya dikirim ke Google. Batasi key dengan HTTP referrer ke domain `github.io` Anda di Google AI Studio / Cloud Console.
