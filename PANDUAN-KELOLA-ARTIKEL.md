# Mengelola artikel tanpa WordPress

Arsip artikel disimpan di `data/articles.json`, sedangkan sampul lokal berada di `assets/articles/`. Editor ini hanya berjalan di komputer sendiri dan tidak membutuhkan akun atau login. Jangan menjalankan server editor dengan host publik atau membagikan akses port-nya ke jaringan.

## Membuka editor

1. Buka PowerShell/Terminal pada folder proyek `D:\PEUBA\ridwanabadi`.
2. Jalankan `node scripts/article-editor-server.mjs`.
3. Buka alamat lokal yang dicetak server, biasanya `http://127.0.0.1:4174/kelola-artikel.html`.
4. Pilih **Artikel baru** untuk menulis atau pilih tulisan yang sudah ada untuk mengeditnya. Slug artikel lama dikunci agar tautan yang sudah beredar tidak berubah.

## Menulis dan menerbitkan

1. Isi judul, tanggal, kategori, tag, ringkasan, dan konten. Sampul opsional; format yang didukung JPG, PNG, dan WebP dengan ukuran maksimal 5 MB.
2. Periksa panel pratinjau di samping formulir.
3. Status awal artikel baru adalah **Draf**. Simpan draf untuk menyimpan pekerjaan tanpa menampilkannya di halaman publik.
4. Setelah siap, pilih status **Terbit**, lalu simpan/perbarui. Artikel terbit akan masuk ke arsip dan dapat dibuka dari halaman detail lokal.
5. Untuk artikel lama, editor mempertahankan sumber dan alamat lamanya. Mengganti atau menghapus sampul tidak menghapus file lama dari disk, sehingga aset yang mungkin masih dipakai konten lain tetap aman.
6. Hentikan server dengan `Ctrl+C`. Perubahan hanya tersimpan di folder proyek lokal; untuk memublikasikannya, ikutkan perubahan `data/articles.json` dan aset baru saat proses deploy/push proyek.

## Fitur pembaca

- Arsip bisa dicari serta difilter menurut tahun, kategori, dan tag.
- Halaman artikel menunjukkan estimasi waktu baca, daftar isi otomatis untuk tulisan dengan beberapa subjudul, dan rekomendasi artikel terkait.
- Foto galeri dapat dibuka dalam tampilan layar besar, dilengkapi keterangan. Gunakan tombol panah kiri/kanan, `Esc`, atau tombol kontrol yang tersedia.
- Draf tidak dimuat oleh halaman beranda, arsip, maupun halaman detail publik.

## Pemeriksaan sebelum push

Jalankan `node scripts/check-site.mjs` dari folder proyek. Pemeriksaan ini memvalidasi struktur artikel, slug, status, gambar lokal, tautan artikel, serta referensi file dan anchor di halaman HTML. Peringatan menunjukkan konten yang masih berpotensi memakai sumber eksternal/WordPress; kegagalan membuat proses keluar dengan kode non-zero.

Untuk mengetes endpoint editor tanpa mengubah arsip proyek, jalankan `node scripts/test-editor-api.mjs`. Tes memakai folder sementara dan menghapus folder tesnya setelah selesai.
