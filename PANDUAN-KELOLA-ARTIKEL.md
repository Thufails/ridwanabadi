# Menambah artikel tanpa WordPress

Arsip artikel berjalan dari `data/articles.json` dan gambar tersimpan di `assets/articles/`. Editor lokal memudahkan pengisian artikel tanpa membuka atau mengedit JSON secara manual.

## Menulis artikel

1. Buka PowerShell/Terminal di folder proyek `D:\PEUBA\ridwanabadi`.
2. Copas, kemudian jalankan `node scripts/article-editor-server.mjs`.
3. Buka `http://127.0.0.1:4174/kelola-artikel.html`.
4. Isi judul, tanggal, kategori, tag, ringkasan, isi, dan gambar sampul bila ada. Slug dibuat otomatis dari judul dan bisa disunting.
5. Periksa pratinjau, lalu tekan **Simpan artikel**. Artikel langsung masuk arsip lokal; file sampul disalin ke `assets/articles/`.
6. Buka tautan **Lihat artikel** untuk memeriksa halaman detail. Tekan `Ctrl+C` di PowerShell untuk menghentikan editor.

Perubahan ini tersimpan di komputer/proyek lokal, belum otomatis tayang di website publik. Untuk menerbitkannya, sertakan `data/articles.json` dan gambar baru di `assets/articles/` saat memublikasikan proyek seperti biasa.