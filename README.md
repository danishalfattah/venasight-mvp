# VenaSight MVP

VenaSight adalah purwarupa (MVP) sistem pemindaian kardiovaskular optis berbasis rPPG (remote Photoplethysmography). Aplikasi ini memungkinkan pengukuran detak jantung (BPM) dan variabilitas detak jantung (HRV) hanya menggunakan kamera webcam biasa tanpa sensor tambahan.

Sistem ini dikembangkan menggunakan **Next.js** untuk frontend dan **FastAPI** (Python) untuk backend, serta memanfaatkan algoritma POS (Plane-Orthogonal-to-Skin) dari `rPPG-Toolbox`.

## 🌟 Fitur Utama
- **Real-time Face Tracking:** Memandu posisi wajah pengguna ke area pindaian yang optimal (jarak dan pencahayaan).
- **Pengukuran BPM (Detak Jantung):** Ekstraksi rPPG menggunakan FFT windowing.
- **Estimasi HRV (Variabilitas Jantung):** Menggunakan perhitungan RMSSD dengan *cubic-spline upsampling* untuk resolusi tingkat lanjut.
- **Desain Premium:** Antarmuka responsif dengan gaya desain *light theme* modern.

---

## 🛠️ Persyaratan Sistem (Prerequisites)

Sebelum menjalankan aplikasi, pastikan komputer Anda telah terinstal:
- [Node.js](https://nodejs.org/) (versi 18+)
- [Python](https://www.python.org/downloads/) (versi 3.9 - 3.11)
- [Git](https://git-scm.com/)

---

## 🚀 Cara Menjalankan Aplikasi

Project ini terdiri dari dua bagian: **Backend (Python)** dan **Frontend (Next.js)**. Keduanya harus dijalankan secara bersamaan di terminal yang terpisah.

### 1. Menjalankan Backend (FastAPI)

Buka terminal (disarankan menggunakan Git Bash atau Command Prompt) dan ikuti langkah berikut:

```bash
# 1. Masuk ke folder backend
cd backend

# 2. Buat Virtual Environment (hanya perlu dilakukan sekali)
python -m venv venv

# 3. Aktifkan Virtual Environment
# Untuk Windows (Command Prompt):
venv\Scripts\activate
# Untuk Windows (Git Bash):
source venv/Scripts/activate
# Untuk Mac/Linux:
source venv/bin/activate

# 4. Install semua dependensi
pip install -r requirements.txt

# 5. Download rPPG-Toolbox (Submodul wajib)
git clone https://github.com/ubicomplab/rPPG-Toolbox.git

# 6. Jalankan server FastAPI
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*Backend akan berjalan di `http://localhost:8000`*

### 2. Menjalankan Frontend (Next.js)

Buka tab terminal baru (biarkan terminal backend tetap berjalan), lalu ikuti langkah berikut:

```bash
# 1. Masuk ke folder frontend
cd frontend

# 2. Install dependensi Node.js
npm install

# 3. Jalankan development server
npm run dev
```
*Frontend akan berjalan di `http://localhost:3000`*

---

## 📸 Cara Menggunakan

1. Buka browser dan akses **`http://localhost:3000`**.
2. Berikan izin akses kamera saat diminta oleh browser.
3. Posisikan wajah Anda tepat di dalam bingkai oval hingga indikator menyala hijau ("Posisi Sempurna").
4. Tekan tombol **Space (Spasi)** atau klik **Mulai Scan**.
5. **Duduk tenang dan jangan bergerak** selama 20 detik. Pastikan cahaya ruangan terang dan merata dari depan.
6. Hasil BPM dan estimasi HRV Anda akan muncul di layar setelah pemrosesan selesai.

---

## ⚠️ Catatan Penting
Aplikasi ini berstatus purwarupa (MVP) untuk tujuan inovasi (seperti kompetisi Gemastik) dan edukasi. Tingkat akurasi sangat dipengaruhi oleh spesifikasi webcam (FPS), pencahayaan ruangan, dan pergerakan pengguna. **Aplikasi ini tidak ditujukan sebagai pengganti alat diagnosis medis profesional.**
