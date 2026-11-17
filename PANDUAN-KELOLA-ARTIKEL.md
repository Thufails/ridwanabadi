# Login admin dan penerbitan artikel

Ruang admin mengikuti alur Sinergi Group: login email/kata sandi, editor WYSIWYG, impor/ekspor Word, pratinjau, daftar draf, dan tombol terbit. Artikel dan foto baru disimpan di Cloudflare D1 dan R2, sehingga perubahan tersedia lintas perangkat. Arsip `data/articles.json` tetap menjadi sumber artikel lama.

## Menyiapkan Cloudflare

Proyek Pages menggunakan build command `npm run build:cloudflare` dan output directory `dist`. Folder `functions/` tetap berada di root repository agar Pages Functions aktif.

1. Buat database D1, misalnya `ridwanabadi-articles`. Jalankan SQL dalam `migrations/0001_articles.sql` melalui D1 Console, atau dari terminal dengan Wrangler:

   ```powershell
   npx wrangler d1 execute ridwanabadi-articles --remote --file=migrations/0001_articles.sql
   ```

2. Di **Workers & Pages → proyek Pages → Settings → Bindings**, tambahkan binding D1 bernama `ARTICLES_DB` dan pilih database tadi.
3. Buat bucket R2, misalnya `ridwanabadi-article-images`. Tambahkan binding R2 bernama `ARTICLE_IMAGES` ke bucket tersebut.
4. Di **Settings → Variables and Secrets**, environment **Production**, tambahkan:

   | Nama | Jenis | Isi |
   |---|---|---|
   | `ADMIN_EMAIL` | Variable | Email admin pilihan pemilik |
   | `ADMIN_PASSWORD` | Secret | Kata sandi admin, minimal 8 karakter |
   | `ADMIN_SESSION_SECRET` | Secret | Kunci sesi acak minimal 32 karakter |

   Buat kunci sesi di PowerShell/terminal dengan Node.js:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Kunci ini bukan kata sandi login. Simpan nilainya di Cloudflare dan jangan commit atau kirim melalui chat. Gunakan kunci tersendiri untuk situs Ridwan Abadi. Sesi berlaku 8 jam; merotasi kunci akan mengeluarkan sesi admin yang aktif.

5. Hubungkan repository ke Cloudflare Pages atau jalankan deployment baru. Atur build command `npm run build:cloudflare` dan output directory `dist`. Jangan deploy folder admin tanpa Pages Functions.
6. Atur Cloudflare Rate Limiting untuk `POST /api/auth/login` guna membatasi percobaan login.

## Menggunakan ruang admin

- Buka `/admin/login.html`, lalu login dengan email dan kata sandi yang telah diatur di Cloudflare.
- Isi judul, slug, kategori, tanggal, ringkasan, deskripsi pencarian, kata kunci, dan sampul bila ada. Sampul JPG/PNG/WebP maksimal 5 MB.
- Tulis langsung di editor atau impor berkas Word `.docx`. Gaya `Title`, `Heading 1`, dan `Heading 2` dipetakan menjadi judul dan subjudul. Gambar yang tertanam di dokumen Word tidak diimpor; pilih sampul secara terpisah.
- Gunakan **Pratinjau** sebelum menyimpan. **Simpan draf** menyimpan ke D1 dan bisa dibuka kembali dari perangkat lain. **Terbitkan** menampilkan artikel di arsip publik tanpa perlu mengedit `articles.json` atau deploy ulang.
- Artikel lama yang sudah ada di `data/articles.json` tetap tampil di situs. Editor admin dipakai untuk artikel baru dan draf yang dibuat lewat ruang admin.

## Pengembangan lokal

`kelola-artikel.html` mengarahkan ke halaman login Cloudflare. Login hanya berfungsi saat Pages Functions berjalan; Live Server biasa tidak menyediakan autentikasi. Untuk pengembangan lokal gunakan Wrangler Pages dengan binding D1/R2 lokal. Salin `.dev.vars.example` menjadi `.dev.vars`, isi kredensial lokal sendiri, dan jangan commit file `.dev.vars`.

## Penyimpanan dan keamanan

- Sesi dibuat server-side dan disimpan sebagai cookie `HttpOnly`, `SameSite=Strict`, serta `Secure` pada HTTPS.
- Endpoint `/api/admin/*` memerlukan sesi valid. Endpoint publik hanya mengembalikan artikel berstatus `published`.
- Isi artikel dibatasi ke HTML yang didukung editor; foto disimpan privat di binding R2 dan disajikan melalui endpoint gambar situs.
- Halaman admin dan API admin tidak boleh dilayani sebagai berkas statis tanpa `functions/_middleware.js` dan konfigurasi routing `_routes.json`.
