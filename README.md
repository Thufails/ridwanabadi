# Situs Ridwan Abadi

Situs profil, layanan, karya, galeri, dan artikel Ridwan Abadi. Situs memakai halaman HTML/CSS/JavaScript statis untuk tampilan publik, serta Cloudflare Pages Functions untuk login admin dan pengelolaan artikel online.

## Daftar isi

- [Struktur proyek](#struktur-proyek)
- [Menjalankan situs lokal](#menjalankan-situs-lokal)
- [Mengelola artikel lokal](#mengelola-artikel-lokal)
- [Menyiapkan Cloudflare Production](#menyiapkan-cloudflare-production)
- [Deploy ke Cloudflare Pages](#deploy-ke-cloudflare-pages)
- [Mengelola dan menerbitkan artikel online](#mengelola-dan-menerbitkan-artikel-online)
- [Keamanan dan catatan operasional](#keamanan-dan-catatan-operasional)
- [Pemecahan masalah](#pemecahan-masalah)
- [Dokumentasi tambahan](#dokumentasi-tambahan)

## Struktur proyek

| Lokasi | Kegunaan |
|---|---|
| `index.html`, `artikel.html`, `baca-artikel.html`, `galeri.html` | Halaman utama, arsip artikel, detail artikel, dan galeri |
| `css/`, `js/`, `assets/` | Gaya, perilaku halaman, gambar, dan aset situs |
| `data/articles.json` | Arsip artikel yang sudah ada dan dibundel bersama situs |
| `admin/login.html` | Halaman login pengelola |
| `admin/index.html` | Editor WYSIWYG dan pengelolaan draf |
| `admin/login.js`, `admin/admin.js` | Interaksi login dan editor artikel |
| `functions/` | Cloudflare Pages Functions untuk autentikasi, API, D1, dan R2 |
| `migrations/0001_articles.sql` | Skema awal database artikel D1 |
| `scripts/package-cloudflare.mjs` | Membuat keluaran situs Cloudflare di `dist/` |
| `kelola-artikel.html` | Pintu masuk editor: lokal langsung ke editor, Production ke login admin |
| `PANDUAN-KELOLA-ARTIKEL.md` | Panduan ringkas pengaturan dan penggunaan admin artikel |

## Menjalankan situs lokal

### Pratinjau cepat dengan Live Server

Jalankan ekstensi Live Server pada folder proyek dan buka:

```text
http://127.0.0.1:5501/
```

Editor lokal tanpa login tersedia di:

```text
http://127.0.0.1:5501/kelola-artikel.html
```

Mode ini ditujukan untuk mencoba tampilan dan alur penulisan. Draf dan artikel yang diterbitkan hanya tersimpan pada `localStorage` browser yang sama. Data tersebut tidak mengubah `data/articles.json`, Cloudflare D1, atau situs Production. Sampul pada mode ini dibatasi 1 MB. Live Server hanya menyajikan berkas statis, sehingga halaman login admin tidak akan berfungsi melalui Live Server.

### Server lokal dengan login dan API

Server Node lokal menyediakan API login dan penyimpanan artikel lokal. Mode ini memakai `.dev.vars`, menulis artikel ke `data/articles.json`, dan menyimpan sampul di `assets/articles/`.

1. Pastikan Node.js tersedia.
2. Salin `.dev.vars.example` menjadi `.dev.vars` di folder utama proyek.
3. Isi nilai lokal `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `ADMIN_SESSION_SECRET`. Kata sandi harus sedikitnya 8 karakter dan kunci sesi sedikitnya 32 karakter.
4. Jalankan:

   ```powershell
   npm run dev:local
   ```

5. Buka alamat yang dicetak oleh server, secara default:

   ```text
   http://127.0.0.1:4174/admin/login.html
   ```

Server ini hanya mendengarkan di komputer lokal. Hentikan dengan `Ctrl+C`. Jika port 4174 sudah dipakai, atur port lain melalui variabel lingkungan `ARTICLE_EDITOR_PORT` sebelum menjalankan server.

> `.dev.vars.example` hanya berisi contoh. Jangan mengisi kredensial Production di sana dan jangan commit `.dev.vars`; berkas itu sudah dikecualikan oleh `.gitignore`.

## Mengelola artikel lokal

Arsip lama berasal dari `data/articles.json`. Pilih salah satu alur lokal sesuai kebutuhan:

| Alur | Login | Penyimpanan | Alamat |
|---|---|---|---|
| Live Server | Tidak | Browser (`localStorage`) | `http://127.0.0.1:5501/kelola-artikel.html` |
| Server Node lokal | Ya, memakai `.dev.vars` | `data/articles.json` dan `assets/articles/` | `http://127.0.0.1:4174/admin/login.html` |

Keduanya hanya untuk lokal dan tidak menerbitkan apa pun ke internet. Artikel yang dibuat melalui Live Server juga tidak otomatis dipindah ke database Production; salin atau tulis ulang isinya di editor Production setelah situs aktif.

## Menyiapkan Cloudflare Production

Untuk login admin dan penerbitan artikel online, buat proyek **Cloudflare Pages** dan aktifkan Pages Functions dari folder `functions/` di root repository. Situs membutuhkan database D1, bucket R2, dan tiga nilai admin. Tanpa binding dan konfigurasi ini, login atau penyimpanan artikel akan gagal.

### 1. Siapkan D1

Buat database D1, misalnya `ridwanabadi-articles`. Dengan Wrangler, perintahnya:

```powershell
npx wrangler d1 create ridwanabadi-articles
```

Catat nama database yang digunakan. Terapkan skema awal dari root repository:

```powershell
npx wrangler d1 execute ridwanabadi-articles --remote --file=migrations/0001_articles.sql
```

Perintah `--remote` mengubah database Cloudflare yang sebenarnya. Jalankan hanya setelah memastikan nama database benar. SQL membuat tabel `articles` dan indeks status/tanggal.

### 2. Siapkan R2

Buat bucket R2, misalnya:

```powershell
npx wrangler r2 bucket create ridwanabadi-article-images
```

Sampul artikel Production disimpan di bucket ini. API menerima JPG, PNG, atau WebP hingga 5 MB.

### 3. Tambahkan binding di Pages

Di Cloudflare Dashboard, buka **Workers & Pages → proyek Pages → Settings → Bindings**. Tambahkan binding untuk environment **Production**:

| Jenis binding | Nama binding di kode | Hubungkan ke |
|---|---|---|
| D1 database | `ARTICLES_DB` | Database `ridwanabadi-articles` |
| R2 bucket | `ARTICLE_IMAGES` | Bucket `ridwanabadi-article-images` |

Binding harus memakai nama persis seperti tabel. Buat binding Preview secara terpisah jika ingin menguji deployment Preview. Deploy ulang setelah mengubah binding agar Functions menerima konfigurasi terbaru.

### 4. Tambahkan Variables & Secrets

Di **Workers & Pages → proyek Pages → Settings → Variables and Secrets**, pilih environment **Production**, lalu tambahkan:

| Nama | Jenis Cloudflare | Nilai |
|---|---|---|
| `ADMIN_EMAIL` | Variable | Email admin yang akan dipakai saat login |
| `ADMIN_PASSWORD` | Secret | Kata sandi admin, minimal 8 karakter; gunakan kata sandi unik dan kuat |
| `ADMIN_SESSION_SECRET` | Secret | Kunci acak minimal 32 karakter untuk menandatangani sesi |

Buat kunci sesi dengan PowerShell/terminal yang memiliki Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Masukkan hasilnya sebagai `ADMIN_SESSION_SECRET` bertipe **Secret**. Nilai tersebut bukan kata sandi login. Simpan di password manager; jangan taruh nilai rahasia di source code, `README.md`, `.dev.vars.example`, screenshot, atau Git. Sesi berlaku 8 jam; mengganti kunci sesi akan membatalkan sesi admin yang sedang aktif.

Variabel dan Secret Production disimpan di Cloudflare, terpisah dari `.dev.vars` lokal. Bila menggunakan Preview, atur nilai Preview secara sengaja; jangan menganggap nilai Production otomatis berlaku pada Preview. Setelah menambah atau mengubah nilai/binding, jalankan deployment baru agar konfigurasi aktif.

### 5. Lindungi endpoint login

Atur Cloudflare Rate Limiting untuk permintaan:

```text
POST /api/auth/login
```

Batasi percobaan berulang sesuai kebijakan situs. Pengaturan Rate Limiting dilakukan di Cloudflare dan tidak dibuat oleh kode aplikasi ini.

## Deploy ke Cloudflare Pages

### Opsi A: Git integration

Hubungkan repository ke proyek Pages. Atur:

| Pengaturan | Nilai |
|---|---|
| Build command | `npm run build:cloudflare` |
| Build output directory | `dist` |
| Direktori Pages Functions | `functions/` di root repository |

Build menyalin halaman HTML dan folder aset yang dibutuhkan ke `dist/`, serta menghasilkan `dist/_routes.json`. Folder sumber `functions/` harus tetap ada di root repository agar endpoint server dijalankan sebagai Pages Functions.

### Opsi B: deploy dengan Wrangler

Pastikan proyek Pages sudah dibuat di Cloudflare, lalu dari root repository jalankan:

```powershell
npm run build:cloudflare
npx wrangler pages deploy dist --project-name NAMA_PROYEK_PAGES
```

Ganti `NAMA_PROYEK_PAGES` dengan nama proyek Pages milikmu. Perintah ini mengunggah hasil build `dist/`; folder `functions/` di root tetap diperlukan agar Pages Functions ikut dipaketkan. Unggah folder `dist` lewat drag-and-drop Dashboard saja tidak cukup untuk mengaktifkan fungsi backend.

Setelah deployment selesai, buka domain Pages atau domain kustom situs. Uji konfigurasi Production dengan langkah di bagian berikut.

## Mengelola dan menerbitkan artikel online

1. Buka `https://DOMAIN-SITUS/admin/login.html` atau pilih **Kelola Artikel** pada situs online.
2. Login memakai `ADMIN_EMAIL` dan `ADMIN_PASSWORD` Production.
3. Isi judul, slug, kategori, tanggal, ringkasan, deskripsi pencarian, kata kunci, dan isi artikel.
4. Tulis di editor WYSIWYG atau impor Word `.docx`. Gunakan pratinjau sebelum menyimpan. Gambar yang tertanam dalam Word tidak diimpor sebagai sampul; unggah sampul secara terpisah.
5. Pilih **Simpan draf** untuk menyimpan artikel privat atau **Terbitkan** agar masuk arsip publik.

Artikel Production dan statusnya disimpan di D1. Sampul disimpan di R2. Endpoint publik `/api/articles` hanya mengembalikan artikel berstatus `published`; setelah diterbitkan, artikel dapat muncul di arsip situs tanpa mengedit `data/articles.json` atau deploy ulang. Perubahan daftar artikel dapat tertunda karena cache publik hingga beberapa menit. Artikel lama di `data/articles.json` tetap ikut tampil.

Endpoint penting:

| Endpoint | Kegunaan | Akses |
|---|---|---|
| `POST /api/auth/login` | Memeriksa kredensial dan membuat sesi | Publik, wajib HTTPS di Production |
| `POST /api/auth/logout` | Mengakhiri sesi browser | Sesi admin |
| `GET /api/auth/session` | Memeriksa status sesi | Sesi browser |
| `GET /api/articles` | Membaca daftar artikel terbit | Publik; hanya `published` |
| `/api/admin/articles` | Membaca, membuat, memperbarui, atau menghapus draf | Wajib sesi admin |
| `POST /api/admin/images` | Mengunggah sampul artikel | Wajib sesi admin |
| `/api/article-image/{key}` | Menyajikan sampul dari R2 | Publik |

## Keamanan dan catatan operasional

- Middleware melindungi halaman `/admin/*` dan endpoint `/api/admin/*` dengan sesi admin. Halaman login dan aset login tetap publik.
- Cookie sesi ditandatangani menggunakan HMAC, memakai `HttpOnly` dan `SameSite=Strict`, serta `Secure` ketika request memakai HTTPS.
- Login hanya memiliki satu set kredensial admin dari environment; tidak ada pendaftaran akun atau reset kata sandi di aplikasi.
- Terapkan Rate Limiting Cloudflare pada endpoint login. Jangan mengandalkan aplikasi saja untuk membatasi percobaan login.
- Isi HTML artikel dibatasi ke elemen yang didukung editor. Endpoint publik tidak mengembalikan draf.
- `data/articles.json` berisi konten yang dibundel dengan situs; artikel baru Production tidak ditulis ke file ini.
- Jangan pernah menyimpan `ADMIN_PASSWORD` atau `ADMIN_SESSION_SECRET` Production di repository. Jika rahasia terlanjur masuk Git atau dibagikan, segera rotasi di Cloudflare.
- Mode Live Server tanpa login hanya untuk preview lokal. Jangan publikasikan salinan itu sebagai pengganti Pages Functions.

## Pemecahan masalah

| Gejala | Kemungkinan penyebab / tindakan |
|---|---|
| `Unexpected end of JSON input` saat login di Live Server | Live Server tidak menjalankan `/api/auth/login`. Untuk preview tanpa login gunakan `/kelola-artikel.html`; untuk login lokal jalankan `npm run dev:local`. |
| `Login admin belum disiapkan di Cloudflare` atau login merespons 503 | Pastikan tiga nama Variable/Secret benar, terpasang di environment yang tepat, dan deploy ulang. |
| Login gagal dengan email/kata sandi | Pastikan email dan kata sandi sesuai nilai Production; cek spasi yang tidak sengaja. Kata sandi bersifat case-sensitive. |
| Admin terus dialihkan ke login | Periksa Pages Functions sudah aktif, browser menerima cookie, dan domain Production menggunakan HTTPS. Login lagi setelah memastikan binding dan rahasia tersedia. |
| Artikel gagal disimpan atau server menjawab 500 | Pastikan binding D1 bernama `ARTICLES_DB`, tabel sudah dibuat dengan migration, dan deployment memakai Functions. |
| Sampul gagal diunggah | Pastikan binding R2 bernama `ARTICLE_IMAGES`, gunakan JPG/PNG/WebP, dan ukuran file maksimal 5 MB. |
| Artikel terbit belum terlihat | Pastikan statusnya `published`, endpoint publik berfungsi, lalu tunggu cache hingga beberapa menit atau segarkan halaman. Draf memang tidak tampil publik. |
| Port lokal 4174 sudah digunakan | Tutup proses yang menggunakan port tersebut atau jalankan server lokal dengan `ARTICLE_EDITOR_PORT` yang berbeda. |

## Dokumentasi tambahan

- [Panduan kelola artikel](PANDUAN-KELOLA-ARTIKEL.md)
- [Cloudflare Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare Pages Functions: memulai](https://developers.cloudflare.com/pages/functions/get-started/)
- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Perintah Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/)
