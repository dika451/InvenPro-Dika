// InvenPro — Tahap 2: pengelolaan detail inventaris.
const SUPABASE_URL = 'https://jcltzkkonuhloykhlxun.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oxoQtAFyWJH1NCnHp5C3qQ_WmlwiPP8';
const STORAGE_BUCKET = 'foto-barang';
const MAX_PHOTO_SIZE = 3 * 1024 * 1024;

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let dataBarang = [];
let fotoLamaSaatEdit = '';
let dataTransaksi = [];
let profilPengguna = null;
let rolePengguna = null;
const formTransaksi = document.getElementById('form-transaksi');
const formBarang = document.getElementById('form-barang');
const tabelBarang = document.querySelector('#tabel-barang tbody');
const inputSearch = document.getElementById('search-input');
const filterKategori = document.getElementById('filter-kategori');
const inputFoto = document.getElementById('foto-barang');

function setLoginVisible(visible) {
  document.getElementById('login-page').style.display = visible ? 'grid' : 'none';
  document.getElementById('dashboard-page').style.display = visible ? 'none' : 'block';
}

async function cekSesiLogin() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error('Gagal memeriksa sesi:', error.message);
  }

  setLoginVisible(!data.session);

  if (data.session) {
    const profilBerhasil = await muatProfilPengguna();

    if (!profilBerhasil) {
      await supabaseClient.auth.signOut();
      setLoginVisible(true);
      return;
    }

    await initData();
  } else {
    profilPengguna = null;
    rolePengguna = null;

    const menuUsers = document.getElementById('menu-users');
    if (menuUsers) menuUsers.style.display = 'none';
  }
}

document.getElementById('form-login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('login-submit');
  const errorBox = document.getElementById('login-error');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
  errorBox.textContent = '';
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  button.disabled = false;
  button.innerHTML = 'Masuk ke InvenPro <i class="fa-solid fa-arrow-right"></i>';
  if (error) {
    errorBox.textContent = 'Login gagal: ' + error.message;
    return;
  }
  
const profilBerhasil = await muatProfilPengguna();

if (!profilBerhasil) {
  await supabaseClient.auth.signOut();
  errorBox.textContent = 'Profil pengguna tidak ditemukan. Hubungi Admin.';
  return;
}

setLoginVisible(false);
await initData();
tampilkanToast('Berhasil masuk sebagai ' +
  (rolePengguna === 'admin' ? 'Admin' : 'Petugas'));

  });


async function logout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    tampilkanToast('Gagal keluar: ' + error.message);
    return;
  }
  dataBarang = [];
  renderTabel();
  setLoginVisible(true);
  document.getElementById('login-password').value = '';
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatAngka(angka) {
  return Number(angka || 0).toLocaleString('id-ID');
}

function formatRupiah(angka) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number(angka) || 0);
}

function buatKodeBarang() {
  const tanggal = new Date();
  const bagianTanggal = [
    tanggal.getFullYear().toString().slice(-2),
    String(tanggal.getMonth() + 1).padStart(2, '0'),
    String(tanggal.getDate()).padStart(2, '0')
  ].join('');
  const acak = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${bagianTanggal}-${acak}`;
}

async function ambilDataDariSupabase() {
  const { data, error } = await supabaseClient.from('barang').select('*').order('id', { ascending: true });
  if (error) {
    console.error('Error mengambil data:', error);
    tampilkanToast('Data gagal dimuat. Periksa koneksi atau izin database.');
    return null;
  }
  return data || [];
}
// =================================
// SISTEM ACTIVITY LOG
// =================================

async function catatAktivitas(aktivitas, detail = '') {
  try {
    const { data: { user }, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Pengguna tidak ditemukan:', authError);
      return;
    }

    const namaPengguna =
      profilPengguna?.nama || user.email || 'Pengguna';

    const { error } = await supabaseClient
      .from('activity_logs')
      .insert({
        user_id: user.id,
        nama_pengguna: namaPengguna,
        aktivitas: aktivitas,
        detail: detail
      });

    if (error) {
      console.error('Gagal menyimpan activity log:', error);
    }
  } catch (error) {
    console.error('Kesalahan Activity Log:', error);
  }
}

// =================================
// MEMUAT DATA ACTIVITY LOG
// =================================

async function muatActivityLog() {
  if (rolePengguna !== 'admin') return;

  const tbody = document.getElementById('activity-body');
  const count = document.getElementById('activity-count');

  if (!tbody || !count) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">
        Memuat riwayat aktivitas...
      </td>
    </tr>
  `;

  const { data, error } = await supabaseClient
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Gagal memuat Activity Log:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          Gagal memuat riwayat aktivitas.
        </td>
      </tr>
    `;
    return;
  }

  count.textContent = `${data.length} aktivitas`;

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          Belum ada aktivitas.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map((log, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(log.nama_pengguna || 'Pengguna')}</td>
      <td>${escapeHTML(log.aktivitas || '-')}</td>
      <td>${escapeHTML(log.detail || '-')}</td>
      <td>${new Date(log.created_at).toLocaleString('id-ID')}</td>
    </tr>
  `).join('');
}


// =================================
// SISTEM NOTIFIKASI STOK INVENTARIS
// =================================

function renderNotifikasi() {
  const notificationCount = document.getElementById('notification-count');
  const notificationList = document.getElementById('notification-list');
  const notificationSubtitle = document.getElementById('notification-subtitle');

  if (!notificationCount || !notificationList) return;

  const barangBermasalah = dataBarang.filter((barang) => {
    return Number(barang.stok) <= 5;
  });

  notificationCount.textContent =
    barangBermasalah.length > 99 ? '99+' : barangBermasalah.length;

  if (notificationSubtitle) {
    notificationSubtitle.textContent =
      `${barangBermasalah.length} barang perlu diperiksa`;
  }

  notificationList.textContent = '';

  if (barangBermasalah.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notification-empty';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-circle-check';

    const message = document.createElement('p');
    message.textContent = 'Semua stok barang dalam kondisi aman.';

    empty.append(icon, message);
    notificationList.appendChild(empty);
    return;
  }

  barangBermasalah.forEach((barang) => {
    const stok = Number(barang.stok);
    const habis = stok <= 0;

    const item = document.createElement('div');
    item.className = 'notification-item';

    const icon = document.createElement('div');
    icon.className = `notification-icon ${habis ? 'danger' : 'warning'}`;

    const iconElement = document.createElement('i');
    iconElement.className = habis
      ? 'fa-solid fa-circle-exclamation'
      : 'fa-solid fa-triangle-exclamation';

    icon.appendChild(iconElement);

    const content = document.createElement('div');
    content.className = 'notification-content';

    const title = document.createElement('strong');
    title.textContent = habis ? 'Stok Barang Habis' : 'Stok Barang Menipis';

    const description = document.createElement('p');
    description.textContent =
      `${barang.nama || 'Barang tanpa nama'} — Sisa stok: ${stok}`;

    content.append(title, description);
    item.append(icon, content);
    notificationList.appendChild(item);
  });
}

async function unggahFoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Format foto harus JPG, PNG, atau WEBP.');
  }
  if (file.size > MAX_PHOTO_SIZE) {
    throw new Error('Ukuran foto maksimal 3 MB.');
  }
  const ekstensi = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const namaFile = `${Date.now()}-${crypto.randomUUID()}.${ekstensi}`;
  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(namaFile, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  });
  if (error) {
    if (error.message.toLowerCase().includes('bucket')) {
      throw new Error(`Bucket Storage "${STORAGE_BUCKET}" belum tersedia. Buat bucket terlebih dahulu di Supabase.`);
    }
    throw error;
  }
  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(namaFile);
  return data.publicUrl;
}


async function tambahKeSupabase(payload) {
  const { error } = await supabaseClient
    .from('barang')
    .insert([payload]);

  if (error) {
    console.error(error);
    tampilkanToast('Gagal menyimpan: ' + error.message);
    return false;
  }

  // Catat aktivitas penambahan barang
  await catatAktivitas(
    'Menambahkan Barang',
    `Menambahkan barang ${payload.nama || 'Tanpa Nama'} dengan kode ${payload.kode_barang || '-'}`
  );

  return true;
}


async function updateKeSupabase(id, payload) {
  const { error } = await supabaseClient
    .from('barang')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error(error);
    tampilkanToast('Gagal memperbarui: ' + error.message);
    return false;
  }

  // Catat aktivitas perubahan barang
  await catatAktivitas(
    'Mengedit Barang',
    `Memperbarui data barang ${payload.nama || 'ID ' + id}`
  );

  return true;
}


async function hapusDariSupabase(id) {
  // Ambil data barang sebelum dihapus
  const barangDihapus = dataBarang.find(
    (barang) => String(barang.id) === String(id)
  );

  const { error } = await supabaseClient
    .from('barang')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    tampilkanToast('Gagal menghapus: ' + error.message);
    return false;
  }

  // Catat aktivitas penghapusan
  await catatAktivitas(
    'Menghapus Barang',
    `Menghapus barang ${barangDihapus?.nama || 'ID ' + id}`
  );

  return true;
}

function renderTabel() {
  tabelBarang.innerHTML = '';
  const keyword = inputSearch.value.trim().toLocaleLowerCase('id');
  const kategoriTerpilih = filterKategori.value;
  const dataTerfilter = dataBarang.filter((barang) => {
    const cocokCari = [barang.nama, barang.kode_barang, barang.lokasi]
      .some((nilai) => String(nilai || '').toLocaleLowerCase('id').includes(keyword));
    return cocokCari && (kategoriTerpilih === 'Semua' || barang.kategori === kategoriTerpilih);
  });

  if (dataTerfilter.length === 0) {
    tabelBarang.innerHTML = '<tr><td colspan="11" class="empty-state"><i class="fa-regular fa-folder-open"></i><br>Belum ada barang yang sesuai.</td></tr>';
  } else {
    dataTerfilter.forEach((barang, index) => {
      const kategoriClass = barang.kategori === 'Elektronik' ? 'badge-elektronik' : barang.kategori === 'ATK' ? 'badge-atk' : 'badge-furnitur';
      const stok = Number(barang.stok) || 0;
      const kondisiClass = barang.kondisi === 'Baik' ? 'condition-good' : barang.kondisi === 'Rusak' ? 'condition-bad' : 'condition-repair';
      const foto = barang.foto_url
        ? `<img class="item-photo" src="${escapeHTML(barang.foto_url)}" alt="Foto ${escapeHTML(barang.nama)}" loading="lazy">`
        : '<span class="photo-placeholder"><i class="fa-regular fa-image"></i></span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><span class="item-code">${escapeHTML(barang.kode_barang || '—')}</span></td>
        <td>${foto}</td>
        <td class="item-name">${escapeHTML(barang.nama)}</td>
        <td><span class="category-badge ${kategoriClass}">${escapeHTML(barang.kategori)}</span></td>
        <td><strong>${formatAngka(stok)}</strong></td>
        <td>${formatRupiah(barang.harga)}</td>
        <td>${escapeHTML(barang.lokasi || '—')}</td>
        <td><span class="condition-badge ${kondisiClass}">${escapeHTML(barang.kondisi || 'Baik')}</span></td>
        <td><span class="stock-status ${stok < 5 ? 'stock-low' : 'stock-ok'}">${stok < 5 ? 'Stok menipis' : 'Tersedia'}</span></td>
        <td><div class="action-group">
          <button class="aksi-btn btn-edit" type="button"
  data-action="edit"
  data-id="${escapeHTML(barang.id)}"
  aria-label="Edit ${escapeHTML(barang.nama)}">
  <i class="fa-solid fa-pen"></i>
</button>

${rolePengguna === 'admin' ? `
  <button class="aksi-btn btn-hapus" type="button"
    data-action="delete"
    data-id="${escapeHTML(barang.id)}"
    aria-label="Hapus ${escapeHTML(barang.nama)}">
    <i class="fa-solid fa-trash"></i>
  </button>
` : ''}
</div></td>`;
tabelBarang.appendChild(tr);
});
  }
  document.getElementById('data-count').textContent = `${dataTerfilter.length} data`;
  document.getElementById('table-summary').textContent = `Menampilkan ${dataTerfilter.length} dari ${dataBarang.length} barang`;
  updateStatistik();
}

function updateStatistik() {
  document.getElementById('total-barang').textContent = formatAngka(dataBarang.length);
  const totalStok = dataBarang.reduce((total, barang) => total + (Number(barang.stok) || 0), 0);
  const stokMenipis = dataBarang.filter((barang) => Number(barang.stok) < 5).length;
  document.getElementById('total-stok').textContent = formatAngka(totalStok);
  document.getElementById('stok-menipis').textContent = formatAngka(stokMenipis);
}

formBarang.addEventListener('submit', async (event) => {
  event.preventDefault();
  const idEdit = document.getElementById('edit-id').value;
  const nama = document.getElementById('nama-barang').value.trim();
  const stok = Number(document.getElementById('stok-barang').value);
  const kategori = document.getElementById('kategori-barang').value;
  const harga = Number(document.getElementById('harga-barang').value || 0);
  const lokasi = document.getElementById('lokasi-barang').value.trim();
  const tanggalMasuk = document.getElementById('tanggal-masuk').value || new Date().toISOString().slice(0, 10);
  const kondisi = document.getElementById('kondisi-barang').value || 'Baik';
  const fileFoto = inputFoto.files[0];

  if (!nama || !kategori || !Number.isInteger(stok) || stok < 1 || !Number.isFinite(harga) || harga < 0) {
    tampilkanToast('Periksa kembali nama, kategori, stok, dan harga barang.');
    return;
  }

  const submitButton = document.getElementById('btn-submit');
  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    let fotoUrl = fotoLamaSaatEdit;
    if (fileFoto) fotoUrl = await unggahFoto(fileFoto);

    const payload = {
      nama, kategori, stok, harga, lokasi,
      tanggal_masuk: tanggalMasuk,
      kondisi,
      foto_url: fotoUrl || null
    };
    if (!idEdit) payload.kode_barang = buatKodeBarang();

    const berhasil = idEdit
      ? await updateKeSupabase(idEdit, payload)
      : await tambahKeSupabase(payload);

    if (!berhasil) return;
    resetForm();
    await initData();
    tampilkanToast(idEdit ? 'Data barang berhasil diperbarui.' : 'Barang berhasil ditambahkan.');
  } catch (error) {
    console.error('Gagal menyimpan data barang:', error);
    tampilkanToast(error.message || 'Terjadi kesalahan saat menyimpan barang.');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = document.getElementById('edit-id').value
      ? '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan'
      : '<i class="fa-solid fa-plus"></i> Tambah Barang';
  }
});

function tampilkanPreviewFoto(url) {
  const preview = document.getElementById('foto-preview');
  if (!url) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `<img src="${escapeHTML(url)}" alt="Pratinjau foto barang"><span>Foto saat ini</span>`;
}

function editBarang(id) {
  const barang = dataBarang.find((item) => String(item.id) === String(id));
  if (!barang) return;
  document.getElementById('edit-id').value = barang.id;
  document.getElementById('nama-barang').value = barang.nama || '';
  document.getElementById('stok-barang').value = barang.stok;
  document.getElementById('kategori-barang').value = barang.kategori || '';
  document.getElementById('harga-barang').value = barang.harga ?? 0;
  document.getElementById('lokasi-barang').value = barang.lokasi || '';
  document.getElementById('tanggal-masuk').value = barang.tanggal_masuk || '';
  document.getElementById('kondisi-barang').value = barang.kondisi || 'Baik';
  fotoLamaSaatEdit = barang.foto_url || '';
  inputFoto.value = '';
  tampilkanPreviewFoto(fotoLamaSaatEdit);
  document.getElementById('form-title').textContent = 'Edit Data Barang';
  document.getElementById('btn-submit').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';
  document.getElementById('btn-cancel').style.display = 'block';
  document.getElementById('inventory').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  formBarang.reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('tanggal-masuk').value = new Date().toISOString().slice(0, 10);
  document.getElementById('harga-barang').value = '0';
  document.getElementById('kondisi-barang').value = 'Baik';
  fotoLamaSaatEdit = '';
  tampilkanPreviewFoto('');
  document.getElementById('form-title').textContent = 'Tambah Barang';
  document.getElementById('btn-submit').innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Barang';
  document.getElementById('btn-cancel').style.display = 'none';
}

async function hapusBarang(id) {
  const barang = dataBarang.find((item) => String(item.id) === String(id));
  if (!confirm(`Hapus barang "${barang?.nama || 'ini'}" dari inventaris?`)) return;
  const berhasil = await hapusDariSupabase(id);
  if (!berhasil) return;
  await initData();
  tampilkanToast('Barang berhasil dihapus.');
}

tabelBarang.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit') editBarang(id);
  if (action === 'delete') hapusBarang(id);
});

function tampilkanToast(pesan) {
  const toast = document.getElementById('toast');
  toast.querySelector('span').textContent = pesan;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

inputSearch.addEventListener('input', renderTabel);
filterKategori.addEventListener('change', renderTabel);
inputFoto.addEventListener('change', () => {
  const file = inputFoto.files[0];
  if (!file) return tampilkanPreviewFoto(fotoLamaSaatEdit);
  const url = URL.createObjectURL(file);
  const preview = document.getElementById('foto-preview');
  preview.hidden = false;
  preview.innerHTML = `<img src="${url}" alt="Pratinjau foto baru"><span>Foto baru dipilih</span>`;
});

function renderPilihanBarang() {
  const select = document.getElementById('transaksi-barang');
  const pilihanSebelumnya = select.value;
  select.innerHTML = '<option value="">Pilih barang</option>' + dataBarang.map((barang) =>
    `<option value="${escapeHTML(barang.id)}">${escapeHTML(barang.nama)} — stok: ${formatAngka(barang.stok)}</option>`
  ).join('');
  if (dataBarang.some((barang) => String(barang.id) === pilihanSebelumnya)) select.value = pilihanSebelumnya;
}

async function ambilRiwayatTransaksi() {
  const { data, error } = await supabaseClient.from('transaksi_stok')
    .select('id, barang_id, nama_barang, jenis, jumlah, keterangan, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) {
    console.error('Gagal mengambil riwayat transaksi:', error);
    tampilkanToast('Riwayat transaksi belum dapat dimuat. Pastikan SQL Tahap 3 sudah dijalankan.');
    return null;
  }
  return data || [];
}

function renderRiwayatTransaksi() {
  const body = document.getElementById('transaksi-body');
  body.innerHTML = '';
  if (!dataTransaksi.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada transaksi.</td></tr>';
  } else {
    dataTransaksi.forEach((item, index) => {
      const tanggal = item.created_at ? new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      const masuk = item.jenis === 'masuk';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${index + 1}</td><td>${escapeHTML(tanggal)}</td><td class="item-name">${escapeHTML(item.nama_barang || 'Barang dihapus')}</td><td><span class="transaction-badge ${masuk ? 'transaction-in' : 'transaction-out'}">${masuk ? 'Stok Masuk' : 'Stok Keluar'}</span></td><td><strong class="${masuk ? 'quantity-in' : 'quantity-out'}">${masuk ? '+' : '−'}${formatAngka(item.jumlah)}</strong></td><td>${escapeHTML(item.keterangan || '—')}</td>`;
      body.appendChild(tr);
    });
  }
  document.getElementById('transaction-count').textContent = `${dataTransaksi.length} transaksi`;
  document.getElementById('transaction-summary').textContent = `Menampilkan ${dataTransaksi.length} transaksi terbaru`;
}

formTransaksi.addEventListener('submit', async (event) => {
  event.preventDefault();
  const barangId = document.getElementById('transaksi-barang').value;
  const jenis = document.getElementById('transaksi-jenis').value;
  const jumlah = Number(document.getElementById('transaksi-jumlah').value);
  const keterangan = document.getElementById('transaksi-keterangan').value.trim();
  if (!barangId || !['masuk', 'keluar'].includes(jenis) || !Number.isInteger(jumlah) || jumlah < 1) {
    tampilkanToast('Periksa kembali barang, jenis transaksi, dan jumlah.');
    return;
  }
  const button = document.getElementById('btn-transaksi');
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
  try {
    const { error } = await supabaseClient.rpc('proses_transaksi_stok', {
      p_barang_id: barangId,
      p_jenis: jenis,
      p_jumlah: jumlah,
      p_keterangan: keterangan || null
    });
    
if (error) throw error;

// Catat aktivitas transaksi stok
const barangTransaksi = dataBarang.find(
  (barang) => String(barang.id) === String(barangId)
);

const namaBarang = barangTransaksi?.nama || 'Barang';

await catatAktivitas(
  jenis === 'masuk' ? 'Stok Masuk' : 'Stok Keluar',
  `${jenis === 'masuk' ? 'Menambahkan' : 'Mengurangi'} stok ${namaBarang} sebanyak ${jumlah} unit. Keterangan: ${keterangan || '-'}`
);

formTransaksi.reset();
await initData();

    tampilkanToast(jenis === 'masuk' ? 'Stok masuk berhasil dicatat.' : 'Stok keluar berhasil dicatat.');
  } catch (error) {
    console.error('Transaksi stok gagal:', error);
    const pesan = error.message || 'Terjadi kesalahan saat memproses transaksi.';
    tampilkanToast(pesan.includes('Stok tidak mencukupi') ? pesan : `Transaksi gagal: ${pesan}`);
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fa-solid fa-check"></i> Simpan Transaksi';
  }
});


// Tahap 4 — laporan inventaris
let dataLaporanTransaksi = [];
let dataLaporanTerfilter = [];

function tanggalLokalISO(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

async function ambilSemuaTransaksiUntukLaporan() {
  const { data, error } = await supabaseClient.from('transaksi_stok')
    .select('id, barang_id, nama_barang, jenis, jumlah, keterangan, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Gagal mengambil data laporan:', error);
    tampilkanToast('Data laporan gagal dimuat: ' + error.message);
    return null;
  }
  return data || [];
}

function formatTanggalLaporan(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function renderLaporanBarang() {
  const body = document.getElementById('report-inventory-body');
  if (!body) return;
  const sorted = [...dataBarang].sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
  body.innerHTML = '';
  if (!sorted.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada data barang.</td></tr>';
  } else {
    sorted.forEach((barang, index) => {
      const stok = Number(barang.stok) || 0;
      const harga = Number(barang.harga) || 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${index + 1}</td><td>${escapeHTML(barang.kode_barang || '—')}</td><td class="item-name">${escapeHTML(barang.nama || '')}</td><td>${escapeHTML(barang.kategori || '—')}</td><td><strong>${formatAngka(stok)}</strong></td><td>${formatRupiah(harga)}</td><td>${formatRupiah(stok * harga)}</td>`;
      body.appendChild(tr);
    });
  }
  document.getElementById('report-inventory-count').textContent = `${sorted.length} barang`;
  const nilaiTotal = sorted.reduce((sum, item) => sum + (Number(item.stok) || 0) * (Number(item.harga) || 0), 0);
  document.getElementById('report-total-items').textContent = formatAngka(sorted.length);
  document.getElementById('report-stock-value').textContent = formatRupiah(nilaiTotal);
}

function renderGrafikLaporan(masuk, keluar) {
  const chart = document.getElementById('report-chart');
  const max = Math.max(masuk, keluar, 1);
  if (masuk === 0 && keluar === 0) {
    chart.innerHTML = '<div class="report-chart-empty">Belum ada transaksi pada periode ini.</div>';
    return;
  }
  const heightIn = Math.max(8, Math.round((masuk / max) * 180));
  const heightOut = Math.max(8, Math.round((keluar / max) * 180));
  chart.innerHTML = `
    <div class="chart-column"><div class="chart-value">${formatAngka(masuk)}</div><div class="chart-bar chart-bar-in" style="height:${heightIn}px"></div><strong>Stok Masuk</strong></div>
    <div class="chart-column"><div class="chart-value">${formatAngka(keluar)}</div><div class="chart-bar chart-bar-out" style="height:${heightOut}px"></div><strong>Stok Keluar</strong></div>`;
}

function terapkanFilterLaporan() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  if (start && end && start > end) {
    tampilkanToast('Tanggal awal tidak boleh melewati tanggal akhir.');
    return;
  }
  dataLaporanTerfilter = dataLaporanTransaksi.filter((item) => {
    const tanggal = item.created_at ? tanggalLokalISO(new Date(item.created_at)) : '';
    return (!start || tanggal >= start) && (!end || tanggal <= end);
  });
  const masuk = dataLaporanTerfilter.filter((item) => item.jenis === 'masuk').reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);
  const keluar = dataLaporanTerfilter.filter((item) => item.jenis === 'keluar').reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);
  document.getElementById('report-total-in').textContent = formatAngka(masuk);
  document.getElementById('report-total-out').textContent = formatAngka(keluar);
  document.getElementById('report-transaction-count').textContent = `${dataLaporanTerfilter.length} transaksi`;
  document.getElementById('report-summary').textContent = `Menampilkan ${dataLaporanTerfilter.length} transaksi`;
  renderGrafikLaporan(masuk, keluar);

  const body = document.getElementById('report-transactions-body');
  body.innerHTML = '';
  if (!dataLaporanTerfilter.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Tidak ada transaksi pada periode ini.</td></tr>';
  } else {
    dataLaporanTerfilter.forEach((item, index) => {
      const masukItem = item.jenis === 'masuk';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${index + 1}</td><td>${escapeHTML(formatTanggalLaporan(item.created_at))}</td><td class="item-name">${escapeHTML(item.nama_barang || 'Barang dihapus')}</td><td><span class="transaction-badge ${masukItem ? 'transaction-in' : 'transaction-out'}">${masukItem ? 'Stok Masuk' : 'Stok Keluar'}</span></td><td><strong>${masukItem ? '+' : '−'}${formatAngka(item.jumlah)}</strong></td><td>${escapeHTML(item.keterangan || '—')}</td>`;
      body.appendChild(tr);
    });
  }
}

async function muatLaporanInventaris() {
  renderLaporanBarang();
  const semua = await ambilSemuaTransaksiUntukLaporan();
  if (semua === null) return;
  dataLaporanTransaksi = semua;
  terapkanFilterLaporan();
}



function exportLaporanCSV() {
  if (typeof XLSX === 'undefined') {
    tampilkanToast('Library Excel belum berhasil dimuat. Periksa koneksi internet.');
    return;
  }

  const data = dataLaporanTerfilter.map((item, index) => [
    index + 1,
    formatTanggalLaporan(item.created_at),
    item.nama_barang || 'Barang dihapus',
    item.jenis === 'masuk' ? 'Stok Masuk' : 'Stok Keluar',
    Number(item.jumlah) || 0,
    item.keterangan || ''
  ]);

  const rows = [
    ['LAPORAN INVENTARIS INVENPRO'],
    ['Tanggal Ekspor', formatTanggalLaporan(new Date().toISOString())],
    [],
    ['No', 'Tanggal', 'Nama Barang', 'Jenis Transaksi', 'Jumlah', 'Keterangan'],
    ...data
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Judul laporan
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }
  ];

  // Lebar setiap kolom
  ws['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 28 },
    { wch: 20 },
    { wch: 12 },
    { wch: 35 }
  ];

  // Tinggi baris
  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 10 },
    { hpt: 28 }
  ];

  const border = {
    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
    right: { style: 'thin', color: { rgb: 'D1D5DB' } }
  };

  // Format judul
  ws['A1'].s = {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center' }
  };

  // Format informasi tanggal
  ['A2', 'B2'].forEach(cell => {
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: cell === 'A2', color: { rgb: '374151' } },
        alignment: { vertical: 'center' }
      };
    }
  });

  // Format header tabel
  for (let c = 0; c < 6; c++) {
    const cell = XLSX.utils.encode_cell({ r: 3, c });
    ws[cell].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border
    };
  }

  // Format isi tabel
  for (let r = 4; r < rows.length; r++) {
    for (let c = 0; c < 6; c++) {
      const cell = XLSX.utils.encode_cell({ r, c });

      ws[cell].s = {
        font: { color: { rgb: '374151' } },
        fill: {
          fgColor: {
            rgb: r % 2 === 0 ? 'EFF6FF' : 'FFFFFF'
          }
        },
        alignment: {
          vertical: 'center',
          horizontal: c === 0 || c === 4 ? 'center' : 'left',
          wrapText: true
        },
        border
      };
    }
  }

  // Filter tabel
  if (rows.length > 4) {
    ws['!autofilter'] = {
      ref: `A4:F${rows.length}`
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan Inventaris');

  XLSX.writeFile(
    wb,
    `Laporan-InvenPro-${tanggalLokalISO()}.xlsx`
  );

  tampilkanToast('Laporan Excel berhasil dibuat.');
}



function cetakLaporanPDF() {
  window.print();
}

document.getElementById('btn-filter-report')?.addEventListener('click', terapkanFilterLaporan);
document.getElementById('btn-reset-report')?.addEventListener('click', () => {
  document.getElementById('report-start').value = '';
  document.getElementById('report-end').value = '';
  terapkanFilterLaporan();
});
document.getElementById('btn-export-csv')?.addEventListener('click', exportLaporanCSV);
document.getElementById('btn-print-report')?.addEventListener('click', cetakLaporanPDF);


async function muatProfilPengguna() {
  const { data: { user }, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !user) {
    profilPengguna = null;
    rolePengguna = null;
    console.error('Gagal mengambil pengguna:', authError);
    return false;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, nama, email, role')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    profilPengguna = null;
    rolePengguna = null;
    console.error('Gagal mengambil profil:', error);
    return false;
  }

  profilPengguna = data;
  rolePengguna = data.role;

  // Perbarui profil pada topbar
const namaProfil = data.nama || data.email || 'Pengguna';
const roleProfil = data.role === 'admin' ? 'Administrator' : 'Petugas';

const avatar = document.getElementById('profile-avatar');
const nama = document.getElementById('profile-name');
const role = document.getElementById('profile-role');

if (avatar) {
  avatar.textContent = namaProfil.charAt(0).toUpperCase();
}

if (nama) {
  nama.textContent = namaProfil;
}

if (role) {
  role.textContent = roleProfil;
}

// Perbarui informasi pada dropdown profil
const dropdownAvatar = document.getElementById('dropdown-avatar');
const dropdownNama = document.getElementById('dropdown-name');
const dropdownEmail = document.getElementById('dropdown-email');

if (dropdownAvatar) {
  dropdownAvatar.textContent = namaProfil.charAt(0).toUpperCase();
}

if (dropdownNama) {
  dropdownNama.textContent = namaProfil;
}

if (dropdownEmail) {
  dropdownEmail.textContent = data.email || '';
}

  // Atur menu Manajemen Pengguna khusus Admin
const menuUsers = document.getElementById('menu-users');

if (menuUsers) {
  menuUsers.style.display =
    rolePengguna === 'admin' ? 'flex' : 'none';
}

// Atur menu Activity Log khusus Admin
const menuActivity = document.getElementById('menu-activity');

if (menuActivity) {
  menuActivity.style.display =
    rolePengguna === 'admin' ? 'flex' : 'none';
}

  console.log('Profil pengguna:', profilPengguna);
  console.log('Role pengguna:', rolePengguna);

  return true;
}


async function muatDaftarPengguna() {
  if (rolePengguna !== 'admin') return;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, nama, email, role')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Gagal memuat daftar pengguna:', error);
    tampilkanToast('Gagal memuat daftar pengguna');
    return;
  }

  const tbody = document.getElementById('user-table-body');
  const count = document.getElementById('user-count');

  count.textContent = `${data.length} pengguna`;

  tbody.innerHTML = data.map((user, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${user.nama || '-'}</td>
      <td>${user.email || '-'}</td>
      <td>${user.role === 'admin' ? 'Admin' : 'Petugas'}</td>
      <td>
        ${
          user.id !== profilPengguna.id
            ? `<button
                type="button"
                class="btn"
                onclick="ubahRolePengguna('${user.id}', '${user.role}')">
                Jadikan ${user.role === 'admin' ? 'Petugas' : 'Admin'}
              </button>`
            : 'Akun sendiri'
        }
      </td>
    </tr>
  `).join('');
}


async function ubahRolePengguna(userId, roleSaatIni) {
  if (rolePengguna !== 'admin') {
    tampilkanToast('Hanya Admin yang dapat mengubah hak akses');
    return;
  }

  const roleBaru = roleSaatIni === 'admin' ? 'petugas' : 'admin';

  const konfirmasi = confirm(
    `Apakah Anda yakin ingin mengubah hak akses menjadi ${roleBaru.toUpperCase()}?`
  );

  if (!konfirmasi) return;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ role: roleBaru })
    .eq('id', userId);

  if (error) {
    console.error('Gagal mengubah role:', error);
    tampilkanToast('Gagal mengubah hak akses');
    return;
  }

  tampilkanToast('Hak akses berhasil diubah');
  await muatDaftarPengguna();
}


async function initData() {
  const hasil = await ambilDataDariSupabase();

  if (hasil !== null) {
    dataBarang = hasil;
    renderNotifikasi();
    renderTabel();
    renderPilihanBarang();

    const riwayat = await ambilRiwayatTransaksi();

    if (riwayat !== null) {
      dataTransaksi = riwayat;
      renderRiwayatTransaksi();
    }

    await muatLaporanInventaris();
    await muatDaftarPengguna();
  }
}

const pageSections = document.querySelectorAll('.page-section');
const menuItems = document.querySelectorAll('.menu-item[data-scroll]');

function tampilkanHalaman(pageId, button) {
  // Tampilkan hanya halaman yang dipilih
  pageSections.forEach((section) => {
    section.classList.toggle('active-page', section.id === pageId);
  });

  // Tandai menu yang sedang aktif
  menuItems.forEach((item) => {
    item.classList.toggle('active', item === button);
  });

  // Perbarui judul topbar sesuai halaman
const judulHalaman = {
  overview: ['OVERVIEW', 'Dashboard'],
  inventory: ['INVENTORY MANAGEMENT', 'Data Barang'],
  transactions: ['STOCK MANAGEMENT', 'Transaksi Stok'],
  reports: ['INVENTORY REPORTS', 'Laporan Inventaris'],
  users: ['USER MANAGEMENT', 'Manajemen Pengguna'],
  activity: ['SYSTEM MONITORING', 'Activity Log']
};

const judul = judulHalaman[pageId];

if (judul) {
  document.getElementById('topbar-eyebrow').textContent = judul[0];
  document.getElementById('topbar-title').textContent = judul[1];
}
  // Tutup sidebar pada tampilan HP
  document.getElementById('sidebar')?.classList.remove('open');
}

// Navigasi setiap menu
menuItems.forEach((button) => {
  button.addEventListener('click', async () => {
    const pageId = button.dataset.scroll;

    tampilkanHalaman(pageId, button);

    // Muat Activity Log saat halaman dibuka
    if (pageId === 'activity' && rolePengguna === 'admin') {
      await muatActivityLog();
    }
  });
});

// Tampilkan Dashboard saat pertama kali dibuka
// =================================
// INTERAKSI DROPDOWN NOTIFIKASI
// =================================

const notificationToggle = document.getElementById('notification-toggle');
const notificationDropdown = document.getElementById('notification-dropdown');

if (notificationToggle && notificationDropdown) {
  notificationToggle.addEventListener('click', (event) => {
    event.stopPropagation();

    notificationDropdown.hidden = !notificationDropdown.hidden;

    notificationToggle.setAttribute(
      'aria-expanded',
      String(!notificationDropdown.hidden)
    );
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.notification-wrap')) {
      notificationDropdown.hidden = true;
      notificationToggle.setAttribute('aria-expanded', 'false');
    }
  });
}
// Interaksi dropdown profil
const profileToggle = document.getElementById('profile-toggle');
const profileDropdown = document.getElementById('profile-dropdown');
const profileLogout = document.getElementById('profile-logout');

if (profileToggle && profileDropdown) {
  profileToggle.addEventListener('click', () => {
    profileDropdown.hidden = !profileDropdown.hidden;

    profileToggle.setAttribute(
      'aria-expanded',
      String(!profileDropdown.hidden)
    );
  });

  // Tutup dropdown ketika klik di luar profil
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.profile-menu-wrap')) {
      profileDropdown.hidden = true;
      profileToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

// Tombol Logout pada dropdown
if (profileLogout) {
  profileLogout.addEventListener('click', () => {
    logout();
  });
}
const menuDashboard = document.querySelector('.menu-item[data-scroll="overview"]');
tampilkanHalaman('overview', menuDashboard);

document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('today-label').textContent = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date());
document.getElementById('year-label').textContent = new Date().getFullYear();
document.getElementById('tanggal-masuk').value = new Date().toISOString().slice(0, 10);

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) setLoginVisible(true);
});
cekSesiLogin();
