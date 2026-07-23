import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, FileText, UserPlus, LogOut, ArrowLeft, Settings, Save,
  Clock, Calendar, Filter, Edit3, X, ChevronDown, BarChart3,
  AlertTriangle, CheckCircle, Timer, MapPin, Upload, Maximize2, Minimize2, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { callApi } from '../api';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(':').map(Number);
  return { h, m, totalMinutes: h * 60 + m };
}

function formatJamKerja(val, defaultVal) {
  if (!val) return defaultVal;
  const s = String(val).trim();
  if (s.includes('1899-12-30')) {
    try {
      const d = new Date(s);
      // Koreksi offset historis LMT Indonesia (+07:07:12 -> +07:00:00) yang sering terjadi di Google Sheets
      d.setMinutes(d.getMinutes() + 7);
      d.setSeconds(d.getSeconds() + 12);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      return s;
    }
  }
  return s;
}

function formatDuration(totalMinutes) {
  if (totalMinutes <= 0) return '-';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}j`;
  return `${h}j ${m}m`;
}

function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getSelectedSitesLabel(selectedStr) {
  if (!selectedStr) return 'Pilih Site Absen...';
  if (selectedStr === 'Semua') return 'Semua Lokasi';
  return selectedStr;
}

const INITIAL_SCHEDULE = {
  1: { active: true, start: '07:00', end: '17:00' },
  2: { active: true, start: '07:00', end: '17:00' },
  3: { active: true, start: '07:00', end: '17:00' },
  4: { active: true, start: '07:00', end: '17:00' },
  5: { active: true, start: '07:00', end: '17:00' },
  6: { active: true, start: '07:00', end: '17:00' },
  0: { active: false, start: '07:00', end: '17:00' }
};

export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('report');

  // Data
  const [users, setUsers] = useState([]);
  const [report, setReport] = useState([]);
  const [settings, setSettings] = useState({ KLINIK_LAT: '', KLINIK_LNG: '', MAX_DISTANCE: '', KLINIK_LOGO: '', SITES_JSON: '[]' });
  const [logoBase64, setLogoBase64] = useState(null);
  const [sites, setSites] = useState([]);
  const [newSite, setNewSite] = useState({ name: '', lat: '', lng: '', radius: '50' });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.msFullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    try {
      if (!isFullscreen) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(() => {});
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch(e) {
      console.error(e);
    }
  };

  // UI state
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notifRecipient, setNotifRecipient] = useState('Semua');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  // Filters
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterUser, setFilterUser] = useState('Semua');

  // Add user form
  const [newNama, setNewNama] = useState('');
  const [newNowa, setNewNowa] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newToleransi, setNewToleransi] = useState(15);
  const [newStatus, setNewStatus] = useState('pegawai');
  const [newRole, setNewRole] = useState('user');
  const [newDepartemen, setNewDepartemen] = useState('');
  const [newBatasAwalMasuk, setNewBatasAwalMasuk] = useState(60);
  const [newBatasAkhirPulang, setNewBatasAkhirPulang] = useState(240);
  const [newLokasiAbsen, setNewLokasiAbsen] = useState('Semua');
  const [addingUser, setAddingUser] = useState(false);
  const [newJadwal, setNewJadwal] = useState(INITIAL_SCHEDULE);

  // Edit user modal
  const [editingUser, setEditingUser] = useState(null);
  const [editJadwal, setEditJadwal] = useState(INITIAL_SCHEDULE);
  const [editToleransi, setEditToleransi] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDepartemen, setEditDepartemen] = useState('');
  const [editBatasAwalMasuk, setEditBatasAwalMasuk] = useState(60);
  const [editBatasAkhirPulang, setEditBatasAkhirPulang] = useState(240);
  const [editLokasiAbsen, setEditLokasiAbsen] = useState('Semua');
  const [savingUser, setSavingUser] = useState(false);
  
  // Custom dropdown and speed states
  const [refreshing, setRefreshing] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const [showEditSiteDropdown, setShowEditSiteDropdown] = useState(false);

  // Manual attendance input states
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualUserNowa, setManualUserNowa] = useState('');
  const [manualType, setManualType] = useState('Masuk');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTime, setManualTime] = useState(new Date().toTimeString().split(' ')[0].substring(0, 5));
  const [manualKeterangan, setManualKeterangan] = useState('Lupa Absen');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [popupNotif, setPopupNotif] = useState(null);

  // Click outside listener for custom dropdowns
  useEffect(() => {
    const handleOutsideClick = () => {
      setShowSiteDropdown(false);
      setShowEditSiteDropdown(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // ─── Data Fetching (Optimized with In-Memory Caching) ────────
  const fetchAllData = async (force = false) => {
    const isFirstLoad = report.length === 0 && users.length === 0;
    if (isFirstLoad || force) {
      if (isFirstLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
    }
    try {
      const [reportRes, usersRes, settingsRes] = await Promise.all([
        callApi({ action: 'get_report' }),
        callApi({ action: 'get_users' }),
        callApi({ action: 'get_settings' })
      ]);
      
      setReport(reportRes.report || []);
      setUsers(usersRes.users || []);
      
      if (settingsRes.settings) {
        const s = {
          KLINIK_LAT: String(settingsRes.settings.KLINIK_LAT || '').replace('_', ''),
          KLINIK_LNG: String(settingsRes.settings.KLINIK_LNG || '').replace('_', ''),
          MAX_DISTANCE: settingsRes.settings.MAX_DISTANCE || '100',
          KLINIK_LOGO: settingsRes.settings.KLINIK_LOGO || '',
          SITES_JSON: settingsRes.settings.SITES_JSON || '[]'
        };
        setSettings(s);
        try {
          const parsedSites = JSON.parse(s.SITES_JSON);
          if (Array.isArray(parsedSites) && parsedSites.length > 0) {
            setSites(parsedSites);
          } else if (s.KLINIK_LAT) {
            const parseCoord = (val) => parseFloat(String(val || '0').replace('_', '').replace(',', '.'));
            setSites([{ id: 'legacy', name: 'Site Utama', lat: parseCoord(s.KLINIK_LAT), lng: parseCoord(s.KLINIK_LNG), radius: parseInt(s.MAX_DISTANCE || '100', 10) }]);
          } else {
            setSites([]);
          }
        } catch(e) {
          setSites([]);
        }
      }
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Memuat Data', message: err.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // ─── Filtered Report Data ──────────────────────────────────
  const filteredReport = useMemo(() => {
    return report.filter(item => {
      const d = new Date(item.timestamp);
      if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return false;
      if (filterUser !== 'Semua' && item.nama !== filterUser) return false;
      return true;
    });
  }, [report, filterMonth, filterYear, filterUser]);

  // ─── Report Stats ──────────────────────────────────────────
  const reportStats = useMemo(() => {
    const masuk = filteredReport.filter(r => r.tipe === 'Masuk').length;
    const keluar = filteredReport.filter(r => r.tipe === 'Keluar').length;
    const sakit = filteredReport.filter(r => r.tipe === 'Sakit').length;
    const izin = filteredReport.filter(r => r.tipe === 'Izin').length;
    const alpa = filteredReport.filter(r => r.tipe === 'Alpa').length;
    const distances = filteredReport
      .map(r => parseFloat(r.jarak))
      .filter(d => !isNaN(d));
    const avgJarak = distances.length > 0
      ? (distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(1)
      : '0';
    return { masuk, keluar, sakit, izin, alpa, avgJarak };
  }, [filteredReport]);

  // ─── Recap Data ────────────────────────────────────────────
  const recapData = useMemo(() => {
    // Build user lookup
    const userMap = {};
    users.forEach(u => {
      userMap[u.nama] = u;
    });

    // Filter report by month/year/user
    const filtered = report.filter(item => {
      const d = new Date(item.timestamp);
      if (d.getMonth() !== filterMonth || d.getFullYear() !== filterYear) return false;
      if (filterUser !== 'Semua' && item.nama !== filterUser) return false;
      return true;
    });

    // Group by nama + date
    const groups = {};
    filtered.forEach(item => {
      const d = new Date(item.timestamp);
      const key = `${item.nama}|${dateToKey(d)}`;
      if (!groups[key]) {
        groups[key] = { nama: item.nama, date: d, masuk: null, keluar: null, statusAbsen: null };
      }
      if (item.tipe === 'Masuk') {
        // Keep earliest masuk
        if (!groups[key].masuk || new Date(item.timestamp) < new Date(groups[key].masuk)) {
          groups[key].masuk = item.timestamp;
        }
      }
      if (item.tipe === 'Keluar') {
        // Keep latest keluar
        if (!groups[key].keluar || new Date(item.timestamp) > new Date(groups[key].keluar)) {
          groups[key].keluar = item.timestamp;
        }
      }
      if (['Sakit', 'Izin', 'Alpa'].includes(item.tipe)) {
        groups[key].statusAbsen = item.tipe;
      }
    });

    const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    const rows = [];
    Object.values(groups).forEach(g => {
      const userInfo = userMap[g.nama] || {};
      const dayOfWeek = g.date.getDay(); // 0=Minggu, 6=Sabtu
      const isSabtu = dayOfWeek === 6;
      const isMinggu = dayOfWeek === 0;

      // Pilih jadwal sesuai hari
      let jamMulai = null;
      let jamSelesai = null;
      let isActive = true;

      if (userInfo.jadwal && userInfo.jadwal[dayOfWeek]) {
        const dayConfig = userInfo.jadwal[dayOfWeek];
        if (dayConfig.active) {
          jamMulai = parseTime(dayConfig.start);
          jamSelesai = parseTime(dayConfig.end);
        } else {
          isActive = false;
        }
      } else {
        // Fallback to legacy
        if (isMinggu) {
          isActive = false;
        } else {
          const jm = isSabtu ? (userInfo.jamMulaiSabtu || '10:00') : (userInfo.jamMulai || '17:00');
          const js = isSabtu ? (userInfo.jamSelesaiSabtu || '17:00') : (userInfo.jamSelesai || '20:30');
          jamMulai = parseTime(jm);
          jamSelesai = parseTime(js);
        }
      }

      const toleransi = parseInt(userInfo.toleransi) || 0;

      const row = {
        nama: g.nama,
        tanggal: g.date,
        hari: HARI[dayOfWeek],
        isMinggu: !isActive,
        jamMasuk: g.masuk ? new Date(g.masuk) : null,
        jamKeluar: g.keluar ? new Date(g.keluar) : null,
        jadwalMulai: !isActive ? '-' : (jamMulai ? formatJamKerja(jamMulai.h + ':' + String(jamMulai.m).padStart(2, '0'), '') : '-'),
        jadwalSelesai: !isActive ? '-' : (jamSelesai ? formatJamKerja(jamSelesai.h + ':' + String(jamSelesai.m).padStart(2, '0'), '') : '-'),
        durasi: null,
        durasiMinutes: 0,
        status: !isActive ? 'Hari Libur' : '-',
        lembur: null,
        lemburMinutes: 0,
        pulangCepat: null,
        pulangCepatMinutes: 0,
        terlambat: false
      };

      if (g.statusAbsen) {
        row.status = g.statusAbsen;
      } else if (row.jamMasuk && row.jamKeluar) {
        const diffMs = row.jamKeluar - row.jamMasuk;
        const durasiMinutes = Math.floor(diffMs / 60000);
        row.durasiMinutes = durasiMinutes;
        row.durasi = formatDuration(durasiMinutes);

        if (isActive) {
          // Late check
          if (jamMulai) {
            const masukMinutes = row.jamMasuk.getHours() * 60 + row.jamMasuk.getMinutes();
            const batasMinutes = jamMulai.totalMinutes + toleransi;
            if (masukMinutes > batasMinutes) {
              const terlambatMenit = masukMinutes - jamMulai.totalMinutes;
              row.status = `Terlambat ${terlambatMenit}m`;
              row.terlambat = true;
            } else {
              row.status = 'Tepat Waktu';
            }
          }

          // Overtime / early leave
          if (jamSelesai) {
            const keluarMinutes = row.jamKeluar.getHours() * 60 + row.jamKeluar.getMinutes();
            if (keluarMinutes > jamSelesai.totalMinutes) {
              const lemburMenit = keluarMinutes - jamSelesai.totalMinutes;
              row.lemburMinutes = lemburMenit;
              row.lembur = formatDuration(lemburMenit);
            } else if (keluarMinutes < jamSelesai.totalMinutes) {
              const cepatMenit = jamSelesai.totalMinutes - keluarMinutes;
              row.pulangCepatMinutes = cepatMenit;
              row.pulangCepat = formatDuration(cepatMenit);
            }
          }
        }
      } else if (row.jamMasuk && !row.jamKeluar) {
        row.status = !isActive ? 'Hari Libur' : 'Belum Pulang';
      }

      rows.push(row);
    });

    // Sort by date desc, then nama
    rows.sort((a, b) => b.tanggal - a.tanggal || a.nama.localeCompare(b.nama));
    return rows;
  }, [report, users, filterMonth, filterYear, filterUser]);

  // ─── Recap Stats ───────────────────────────────────────────
  const recapStats = useMemo(() => {
    const totalHariKerja = recapData.length;
    const totalJamKerja = recapData.reduce((sum, r) => sum + r.durasiMinutes, 0);
    const totalLembur = recapData.reduce((sum, r) => sum + r.lemburMinutes, 0);
    const hariTerlambat = recapData.filter(r => r.terlambat).length;
    const totalSakit = recapData.filter(r => r.status === 'Sakit').length;
    const totalIzin = recapData.filter(r => r.status === 'Izin').length;
    const totalAlpa = recapData.filter(r => r.status === 'Alpa').length;
    return {
      totalHariKerja,
      totalJamKerja: formatDuration(totalJamKerja),
      totalLembur: formatDuration(totalLembur),
      hariTerlambat,
      totalSakit,
      totalIzin,
      totalAlpa
    };
  }, [recapData]);

  // ─── Employee names for filter ─────────────────────────────
  const employeeNames = useMemo(() => {
    return users.filter(u => u.role !== 'admin').map(u => u.nama);
  }, [users]);

  // ─── Year options ──────────────────────────────────────────
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1];
  }, []);

  const renderWeeklySchedule = (schedule, setSchedule) => {
    const days = [
      { id: 1, name: 'Senin' },
      { id: 2, name: 'Selasa' },
      { id: 3, name: 'Rabu' },
      { id: 4, name: 'Kamis' },
      { id: 5, name: 'Jumat' },
      { id: 6, name: 'Sabtu' },
      { id: 0, name: 'Ahad' }
    ];

    const handleToggle = (dayId) => {
      setSchedule(prev => ({
        ...prev,
        [dayId]: {
          ...prev[dayId],
          active: !prev[dayId].active
        }
      }));
    };

    const handleTimeChange = (dayId, field, val) => {
      setSchedule(prev => ({
        ...prev,
        [dayId]: {
          ...prev[dayId],
          [field]: val
        }
      }));
    };

    return (
      <div className="weekly-schedule-grid">
        <div className="schedule-header">
          <div>Hari</div>
          <div style={{ textAlign: 'center' }}>Aktif</div>
          <div>Jam Kerja</div>
        </div>
        {days.map(d => {
          const dayConfig = schedule[d.id] || { active: false, start: '08:00', end: '17:00' };
          return (
            <div key={d.id} className={`schedule-row ${dayConfig.active ? 'active' : 'inactive'}`}>
              <div className="day-name">{d.name}</div>
              <div className="day-active-chk">
                <input
                  type="checkbox"
                  checked={dayConfig.active}
                  onChange={() => handleToggle(d.id)}
                />
              </div>
              <div className="day-times">
                <input
                  type="time"
                  className="form-input time-small"
                  value={dayConfig.start}
                  onChange={e => handleTimeChange(d.id, 'start', e.target.value)}
                  disabled={!dayConfig.active}
                  required={dayConfig.active}
                />
                <span className="time-separator">s/d</span>
                <input
                  type="time"
                  className="form-input time-small"
                  value={dayConfig.end}
                  onChange={e => handleTimeChange(d.id, 'end', e.target.value)}
                  disabled={!dayConfig.active}
                  required={dayConfig.active}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderUserScheduleSummary = (userRow) => {
    if (userRow.jadwal) {
      const days = [
        { id: 1, name: 'Sen' },
        { id: 2, name: 'Sel' },
        { id: 3, name: 'Rab' },
        { id: 4, name: 'Kam' },
        { id: 5, name: 'Jum' },
        { id: 6, name: 'Sab' },
        { id: 0, name: 'Min' }
      ];

      const activeDays = days.filter(d => userRow.jadwal[d.id] && userRow.jadwal[d.id].active);

      if (activeDays.length === 0) {
        return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Libur / Tidak ada jadwal</span>;
      }

      const groups = {};
      activeDays.forEach(d => {
        const times = `${userRow.jadwal[d.id].start} - ${userRow.jadwal[d.id].end}`;
        if (!groups[times]) {
          groups[times] = [];
        }
        groups[times].push(d.name);
      });

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
          {Object.entries(groups).map(([times, dayNames]) => (
            <div key={times} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ 
                background: 'var(--primary-50)', 
                color: 'var(--primary)', 
                padding: '1px 5px', 
                borderRadius: '4px', 
                fontWeight: 600,
                fontSize: '0.7rem'
              }}>
                {dayNames.join(', ')}
              </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{times}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem' }}>
        <div><span style={{ fontWeight: 600 }}>Sen-Jum:</span> {formatJamKerja(userRow.jamMulai, '17:00')} - {formatJamKerja(userRow.jamSelesai, '20:30')}</div>
        <div><span style={{ fontWeight: 600 }}>Sabtu:</span> {formatJamKerja(userRow.jamMulaiSabtu, '10:00')} - {formatJamKerja(userRow.jamSelesaiSabtu, '17:00')}</div>
      </div>
    );
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      await callApi({
        action: 'add_user',
        nama: newNama,
        nowa: newNowa,
        password: newPassword,
        jamMulai: newJadwal[1].start,
        jamSelesai: newJadwal[1].end,
        jamMulaiSabtu: newJadwal[6].start,
        jamSelesaiSabtu: newJadwal[6].end,
        toleransi: newToleransi,
        status: newStatus,
        role: newRole,
        departemen: newDepartemen,
        batasAwalMasuk: newBatasAwalMasuk,
        batasAkhirPulang: newBatasAkhirPulang,
        lokasiAbsen: newLokasiAbsen,
        jadwal: newJadwal
      });
      setNewNama('');
      setNewNowa('');
      setNewPassword('');
      setNewToleransi(15);
      setNewStatus('pegawai');
      setNewRole('user');
      setNewDepartemen('');
      setNewLokasiAbsen('Semua');
      setNewBatasAwalMasuk(60);
      setNewBatasAkhirPulang(240);
      setNewJadwal(INITIAL_SCHEDULE);
      setPopupNotif({ type: 'success', title: 'Karyawan Ditambahkan', message: 'Karyawan baru berhasil ditambahkan!' });
      fetchAllData(true);
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Menambah Karyawan', message: err.message });
    } finally {
      setAddingUser(false);
    }
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setEditToleransi(u.toleransi || 15);
    setEditStatus(u.status || 'pegawai');
    setEditRole(u.role || 'user');
    setEditDepartemen(u.departemen || '');
    setEditLokasiAbsen(u.lokasiAbsen || 'Semua');
    setEditBatasAwalMasuk(u.batasAwalMasuk !== undefined ? u.batasAwalMasuk : 60);
    setEditBatasAkhirPulang(u.batasAkhirPulang !== undefined ? u.batasAkhirPulang : 240);
    
    if (u.jadwal) {
      setEditJadwal(u.jadwal);
    } else {
      const jm = formatJamKerja(u.jamMulai, '17:00');
      const js = formatJamKerja(u.jamSelesai, '20:30');
      const jms = formatJamKerja(u.jamMulaiSabtu, '10:00');
      const jss = formatJamKerja(u.jamSelesaiSabtu, '17:00');
      setEditJadwal({
        1: { active: true, start: jm, end: js },
        2: { active: true, start: jm, end: js },
        3: { active: true, start: jm, end: js },
        4: { active: true, start: jm, end: js },
        5: { active: true, start: jm, end: js },
        6: { active: true, start: jms, end: jss },
        0: { active: false, start: '08:00', end: '17:00' }
      });
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await callApi({
        action: 'update_user',
        nowa: editingUser.nowa,
        nama: editingUser.nama,
        jamMulai: editJadwal[1].start,
        jamSelesai: editJadwal[1].end,
        jamMulaiSabtu: editJadwal[6].start,
        jamSelesaiSabtu: editJadwal[6].end,
        toleransi: editToleransi,
        status: editStatus,
        role: editRole,
        departemen: editDepartemen,
        lokasiAbsen: editLokasiAbsen,
        batasAwalMasuk: editBatasAwalMasuk,
        batasAkhirPulang: editBatasAkhirPulang,
        jadwal: editJadwal
      });
      setEditingUser(null);
      setPopupNotif({ type: 'success', title: 'Data Diperbarui', message: 'Data karyawan berhasil diperbarui!' });
      fetchAllData(true);
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Memperbarui Data', message: err.message });
    } finally {
      setSavingUser(false);
    }
  };

  const handleManualAttendanceSubmit = async (e) => {
    e.preventDefault();
    if (!manualUserNowa) {
      setPopupNotif({ type: 'error', title: 'Karyawan Belum Dipilih', message: 'Silakan pilih karyawan terlebih dahulu.' });
      return;
    }
    
    const selectedUser = users.find(u => String(u.nowa) === String(manualUserNowa));
    if (!selectedUser) {
      setPopupNotif({ type: 'error', title: 'Karyawan Tidak Ditemukan', message: 'Karyawan yang dipilih tidak dapat ditemukan di database.' });
      return;
    }
    
    setSubmittingManual(true);
    
    try {
      const [year, month, day] = manualDate.split('-').map(Number);
      const [hours, minutes] = manualTime.split(':').map(Number);
      const datetime = new Date(year, month - 1, day, hours, minutes);
      
      await callApi({
        action: 'attend',
        nama: selectedUser.nama,
        nowa: selectedUser.nowa,
        tipe: manualType,
        jarak: 0,
        koordinat: 'Manual',
        photo: null,
        keterangan: `Input Manual oleh Admin (${manualKeterangan})`,
        timestamp: datetime.toISOString()
      });
      
      setPopupNotif({ type: 'success', title: 'Absen Manual Berhasil', message: `Berhasil menambahkan data absen manual untuk ${selectedUser.nama}!` });
      setShowManualModal(false);
      setManualUserNowa('');
      setManualType('Masuk');
      setManualDate(new Date().toISOString().split('T')[0]);
      setManualTime(new Date().toTimeString().split(' ')[0].substring(0, 5));
      setManualKeterangan('Lupa Absen');
      
      fetchAllData(true);
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Menyimpan Absen', message: err.message });
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleSaveEditSite = (e) => {
    e.preventDefault();
    if (!editingSite.name || !editingSite.lat || !editingSite.lng || !editingSite.radius) {
      setPopupNotif({ type: 'error', title: 'Input Tidak Lengkap', message: 'Mohon lengkapi semua field lokasi absen.' });
      return;
    }
    setSites(sites.map(s => s.id === editingSite.id ? {
      ...editingSite,
      lat: parseFloat(String(editingSite.lat).replace(',', '.')),
      lng: parseFloat(String(editingSite.lng).replace(',', '.')),
      radius: parseInt(editingSite.radius, 10)
    } : s));
    setEditingSite(null);
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    const sanitizedSettings = {
      ...settings,
      KLINIK_LAT: '_' + (sites.length > 0 ? String(sites[0].lat).replace(',', '.') : ''),
      KLINIK_LNG: '_' + (sites.length > 0 ? String(sites[0].lng).replace(',', '.') : ''),
      MAX_DISTANCE: sites.length > 0 ? sites[0].radius : '100',
      SITES_JSON: JSON.stringify(sites)
    };
    try {
      await callApi({
        action: 'save_settings',
        settings: sanitizedSettings,
        logoBase64: logoBase64
      });
      setLogoBase64(null); // reset file state after success
      setSettings({
        ...sanitizedSettings,
        KLINIK_LAT: sanitizedSettings.KLINIK_LAT.replace('_', ''),
        KLINIK_LNG: sanitizedSettings.KLINIK_LNG.replace('_', '')
      });
      setPopupNotif({ type: 'success', title: 'Pengaturan Disimpan', message: 'Pengaturan lokasi berhasil disimpan!' });
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Menyimpan Pengaturan', message: err.message });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      setPopupNotif({ type: 'error', title: 'Input Tidak Lengkap', message: 'Judul dan pesan notifikasi wajib diisi.' });
      return;
    }
    setSendingNotif(true);
    try {
      await callApi({
        action: 'send_notification',
        recipient: notifRecipient,
        title: notifTitle,
        message: notifMessage
      });
      setNotifTitle('');
      setNotifMessage('');
      setPopupNotif({ type: 'success', title: 'Notifikasi Terkirim', message: 'Notifikasi berhasil dikirim ke karyawan!' });
    } catch (err) {
      setPopupNotif({ type: 'error', title: 'Gagal Mengirim Notifikasi', message: err.message });
    } finally {
      setSendingNotif(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ─── Filter Bar Component ─────────────────────────────────
  const renderFilterBar = () => (
    <div className="filter-bar">
      <span className="filter-label"><Filter size={14} /> Filter:</span>
      <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
        {MONTHS.map((m, i) => (
          <option key={i} value={i}>{m}</option>
        ))}
      </select>
      <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
        {yearOptions.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select value={filterUser} onChange={e => setFilterUser(e.target.value)}>
        <option value="Semua">Semua Karyawan</option>
        {employeeNames.map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  );

  // ─── Tab: Laporan Absensi ──────────────────────────────────
  const renderReport = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '1.25rem' }}>
        {renderFilterBar()}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowManualModal(true)}
          style={{ padding: '0.65rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 'bold' }}
        >
          <Clock size={16} /> + Input Absen Manual
        </button>
      </div>

      <div className="stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        <div className="stat-card">
          <div className="stat-value">{reportStats.masuk}</div>
          <div className="stat-label">Absen Masuk</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{reportStats.keluar}</div>
          <div className="stat-label">Absen Keluar</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#0284c7' }}>{reportStats.sakit}</div>
          <div className="stat-label">Sakit</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{reportStats.izin}</div>
          <div className="stat-label">Izin</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--error)' }}>{reportStats.alpa}</div>
          <div className="stat-label">Alpa</div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Nama</th>
              <th>Tipe</th>
              <th>Jarak</th>
              <th>Foto</th>
            </tr>
          </thead>
          <tbody>
            {filteredReport.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center" style={{ padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <Calendar size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <br />Tidak ada data absensi untuk periode ini
                </td>
              </tr>
            ) : (
              filteredReport.map((item, idx) => {
                const d = new Date(item.timestamp);
                return (
                  <tr key={idx}>
                    <td>
                      <div style={{ fontWeight: '500' }}>{d.toLocaleDateString('id-ID')}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ fontWeight: '500' }}>{item.nama}</td>
                    <td>
                      <span className={`badge ${item.tipe === 'Masuk' ? 'badge-success' : 'badge-error'}`}>
                        {item.tipe}
                      </span>
                    </td>
                    <td>
                      {item.jarak} m
                      {item.koordinat && (
                        <a 
                          href={`https://www.google.com/maps?q=${item.koordinat}`} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none' }}
                        >
                          <MapPin size={12} style={{ display: 'inline', marginRight: '2px' }}/>
                          Peta
                        </a>
                      )}
                    </td>
                    <td>
                      {item.fotoUrl ? (
                        <a
                          href={item.fotoUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--secondary)', textDecoration: 'none', fontWeight: '500' }}
                        >
                          Lihat Foto
                        </a>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─── Tab: Rekap Jam Kerja ──────────────────────────────────
  const renderRecap = () => (
    <div>
      {renderFilterBar()}

      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-value">{recapStats.totalHariKerja}</div>
          <div className="stat-label">Total Hari Kerja</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recapStats.totalJamKerja}</div>
          <div className="stat-label">Total Jam Kerja</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recapStats.totalLembur}</div>
          <div className="stat-label">Total Lembur</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recapStats.hariTerlambat}</div>
          <div className="stat-label">Hari Terlambat</div>
        </div>
        <div className="stat-card stat-info">
          <div className="stat-value">{recapStats.totalSakit}</div>
          <div className="stat-label">Sakit</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="stat-value">{recapStats.totalIzin}</div>
          <div className="stat-label">Izin</div>
        </div>
        <div className="stat-card stat-error">
          <div className="stat-value">{recapStats.totalAlpa}</div>
          <div className="stat-label">Alpa</div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Hari</th>
              <th>Tanggal</th>
              <th>Jadwal</th>
              <th>Jam Masuk</th>
              <th>Jam Keluar</th>
              <th>Durasi Kerja</th>
              <th>Status</th>
              <th>Lembur</th>
              <th>Pulang Cepat</th>
            </tr>
          </thead>
          <tbody>
            {recapData.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center" style={{ padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <BarChart3 size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <br />Tidak ada data rekap untuk periode ini
                </td>
              </tr>
            ) : (
              recapData.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{row.nama}</td>
                  <td>
                    <span className={`badge ${row.isMinggu ? 'badge-error' : row.hari === 'Sabtu' ? 'badge-info' : 'badge-neutral'}`}>
                      {row.hari}
                    </span>
                  </td>
                  <td>{row.tanggal.toLocaleDateString('id-ID')}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {row.isMinggu ? <span style={{ color: 'var(--text-muted)' }}>Libur</span> : `${row.jadwalMulai} - ${row.jadwalSelesai}`}
                  </td>
                  <td>
                    {row.jamMasuk
                      ? row.jamMasuk.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </td>
                  <td>
                    {row.jamKeluar
                      ? row.jamKeluar.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                      : '-'}
                  </td>
                  <td>{row.durasi || '-'}</td>
                  <td>
                    {row.status === 'Tepat Waktu' ? (
                      <span className="badge badge-success">
                        <CheckCircle size={12} /> {row.status}
                      </span>
                    ) : row.status === 'Sakit' ? (
                      <span className="badge badge-info">
                        🩺 {row.status}
                      </span>
                    ) : row.status === 'Izin' ? (
                      <span className="badge" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                        ✉️ {row.status}
                      </span>
                    ) : row.status === 'Alpa' ? (
                      <span className="badge badge-error">
                        ⚠️ {row.status}
                      </span>
                    ) : row.status === 'Belum Pulang' ? (
                      <span className="badge badge-warning">
                        <Timer size={12} /> {row.status}
                      </span>
                    ) : row.terlambat ? (
                      <span className="badge badge-error">
                        <AlertTriangle size={12} /> {row.status}
                      </span>
                    ) : (
                      <span className="badge badge-neutral">{row.status}</span>
                    )}
                  </td>
                  <td>
                    {row.lembur ? (
                      <span className="badge badge-info">{row.lembur}</span>
                    ) : '-'}
                  </td>
                  <td>
                    {row.pulangCepat ? (
                      <span className="badge badge-warning">{row.pulangCepat}</span>
                    ) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─── Tab: Karyawan ─────────────────────────────────────────
  const renderUsers = () => (
    <div>
      <div className="table-container mb-6">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Username (No WA)</th>
              <th>Jam Kerja</th>
              <th>Toleransi</th>
              <th>Jabatan</th>
              <th>Site Absen</th>
              <th>Status</th>
              <th>Role</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center" style={{ padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  Belum ada data karyawan
                </td>
              </tr>
            ) : (
              users.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '500' }}>{item.nama}</td>
                  <td>{item.nowa}</td>
                  <td>
                    {renderUserScheduleSummary(item)}
                  </td>
                  <td>{item.toleransi || 15} menit</td>
                  <td>{item.departemen || '-'}</td>
                  <td>{item.lokasiAbsen || 'Semua'}</td>
                  <td>
                    <span className={`badge ${
                      String(item.status).toLowerCase() === 'pegawai' ? 'badge-info' :
                      String(item.status).toLowerCase() === 'magang' ? 'badge-warning' :
                      String(item.status).toLowerCase() === 'freelance' ? 'badge-success' : 'badge-neutral'
                    }`}>
                      {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : '-'}
                    </span>
                  </td>
                  <td>
                    {item.role === 'admin' ? (
                      <span className="badge badge-success">Admin</span>
                    ) : 'User'}
                  </td>
                  <td>
                    {item.role !== 'admin' && (
                      <button className="edit-btn" onClick={() => openEditModal(item)}>
                        <Edit3 size={13} /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mb-4" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <UserPlus size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Tambah Karyawan Baru
      </h3>
      <form onSubmit={handleAddUser}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          {/* Card 1: Informasi Akun */}
          <div style={{ background: 'var(--surface-hover)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-dark)', borderBottom: '1px solid var(--border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} /> Informasi Akun Karyawan
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Nama Lengkap</label>
                <input
                  type="text"
                  className="form-input"
                  value={newNama}
                  onChange={e => setNewNama(e.target.value)}
                  placeholder="Nama karyawan"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Username (Nomor HP)</label>
                <input
                  type="text"
                  className="form-input"
                  value={newNowa}
                  onChange={e => setNewNowa(e.target.value)}
                  placeholder="0812..."
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Password</label>
                <input
                  type="text"
                  className="form-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Password login"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Jabatan</label>
                <input
                  type="text"
                  className="form-input"
                  value={newDepartemen}
                  onChange={e => setNewDepartemen(e.target.value)}
                  placeholder="Contoh: IT"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                >
                  <option value="pegawai">Pegawai</option>
                  <option value="magang">Magang</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                <label className="form-label">Role Akun</label>
                <select
                  className="form-input"
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                >
                  <option value="user">User Biasa</option>
                  <option value="user_bebas">User Bebas Lokasi</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Konfigurasi Absensi */}
          <div style={{ background: 'var(--surface-hover)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-dark)', borderBottom: '1px solid var(--border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} /> Konfigurasi Absensi & Lokasi
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2', position: 'relative' }}>
                <label className="form-label">Site Absen</label>
                <div 
                  className="form-input flex justify-between items-center cursor-pointer" 
                  onClick={e => { e.stopPropagation(); setShowSiteDropdown(!showSiteDropdown); }}
                  style={{ minHeight: '42px', paddingRight: '12px' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
                    {getSelectedSitesLabel(newLokasiAbsen)}
                  </span>
                  <ChevronDown size={16} style={{ transform: showSiteDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                {showSiteDropdown && (
                  <div className="dropdown-panel glass" onClick={e => e.stopPropagation()} style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    marginTop: '4px',
                    padding: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', hover: 'background: var(--surface-hover)', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={newLokasiAbsen === 'Semua'}
                        onChange={e => {
                          if (e.target.checked) {
                            setNewLokasiAbsen('Semua');
                          } else {
                            setNewLokasiAbsen(sites[0] ? sites[0].name : '');
                          }
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>Semua Lokasi</span>
                    </label>
                    <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                    {sites.map(s => {
                      const isSelected = newLokasiAbsen === 'Semua' || newLokasiAbsen.split(',').map(item => item.trim().toLowerCase()).includes(s.name.toLowerCase());
                      return (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: newLokasiAbsen === 'Semua' ? 'not-allowed' : 'pointer', opacity: newLokasiAbsen === 'Semua' ? 0.6 : 1, fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={newLokasiAbsen === 'Semua'}
                            onChange={e => {
                              const currentSites = newLokasiAbsen.split(',').map(item => item.trim()).filter(Boolean);
                              let nextSites;
                              if (e.target.checked) {
                                nextSites = [...currentSites, s.name];
                              } else {
                                nextSites = currentSites.filter(name => name.toLowerCase() !== s.name.toLowerCase());
                              }
                              const nextVal = nextSites.join(', ');
                              setNewLokasiAbsen(nextVal || 'Semua');
                            }}
                          />
                          <span>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Toleransi (menit)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newToleransi}
                  onChange={e => setNewToleransi(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                {/* empty block to align layout */}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Batas Awal Masuk (mnt)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newBatasAwalMasuk}
                  onChange={e => setNewBatasAwalMasuk(Number(e.target.value))}
                  placeholder="60"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Batas Akhir Pulang (mnt)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newBatasAkhirPulang}
                  onChange={e => setNewBatasAkhirPulang(Number(e.target.value))}
                  placeholder="240"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Penjadwalan Mingguan */}
        <div style={{ background: 'var(--surface-hover)', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-dark)', borderBottom: '1px solid var(--border)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Penjadwalan Kerja Mingguan
          </h4>
          {renderWeeklySchedule(newJadwal, setNewJadwal)}
        </div>

        <button type="submit" className="btn btn-primary" disabled={addingUser} style={{ width: '100%', maxWidth: '240px' }}>
          {addingUser ? (
            <div className="spinner"></div>
          ) : (
            <><UserPlus size={18} /> Tambah Karyawan</>
          )}
        </button>
      </form>
    </div>
  );

  // ─── Tab: Pengaturan ───────────────────────────────────────
  const handleAddSite = () => {
    if (!newSite.name || !newSite.lat || !newSite.lng || !newSite.radius) {
      setPopupNotif({ type: 'error', title: 'Input Tidak Lengkap', message: 'Mohon lengkapi semua field lokasi absen.' });
      return;
    }
    setSites([...sites, { ...newSite, id: 'site_' + Date.now() }]);
    setNewSite({ name: '', lat: '', lng: '', radius: '50' });
  };

  const handleRemoveSite = (id) => {
    setPopupNotif({
      type: 'confirm',
      title: 'Hapus Lokasi',
      message: 'Yakin ingin menghapus site ini?',
      onConfirm: () => setSites(sites.filter(s => s.id !== id))
    });
  };

  const renderSettings = () => (
    <div>
      <h3 className="mb-2">
        <Settings size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Pengaturan Titik Absensi
      </h3>
      <p className="form-label mb-6">
        Daftarkan titik koordinat lokasi absensi (Sites). Karyawan akan diizinkan absen jika berada dalam radius jarak yang ditentukan dari salah satu lokasi yang diizinkan untuk mereka. (Site pertama pada list ini akan menjadi Site Utama).
      </p>

      <form onSubmit={handleSaveSettings}>
        <div className="flex flex-col gap-4">
          {sites.map((s, idx) => (
            <div key={s.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-hover)' }}>
              <div className="flex justify-between items-center mb-2">
                <strong>{idx + 1}. {s.name}</strong>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--primary)' }} onClick={() => setEditingSite(s)}>
                    <Edit3 size={15} />
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--error)' }} onClick={() => handleRemoveSite(s.id)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Lat: {s.lat}, Lng: {s.lng}, Radius: {s.radius}m
              </div>
            </div>
          ))}

          {/* Form Add New Site */}
          <div style={{ padding: '1rem', border: '1px dashed var(--primary)', borderRadius: 'var(--radius-lg)' }}>
            <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>+ Tambah Lokasi Absen Baru</h4>
            <div className="flex flex-wrap gap-2 mb-2">
              <div className="form-group mb-0" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Nama Lokasi</label>
                <input type="text" className="form-input" value={newSite.name} onChange={e => setNewSite({...newSite, name: e.target.value})} placeholder="Contoh: Site Ringroad" />
              </div>
              <div className="form-group mb-0" style={{ flex: '1 1 100px' }}>
                <label className="form-label">Radius (Meter)</label>
                <input type="number" className="form-input" value={newSite.radius} onChange={e => setNewSite({...newSite, radius: e.target.value})} placeholder="50" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <div className="form-group mb-0" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Latitude</label>
                <input type="text" className="form-input" value={newSite.lat} onChange={e => setNewSite({...newSite, lat: e.target.value})} placeholder="3.57..." />
              </div>
              <div className="form-group mb-0" style={{ flex: '1 1 120px' }}>
                <label className="form-label">Longitude</label>
                <input type="text" className="form-input" value={newSite.lng} onChange={e => setNewSite({...newSite, lng: e.target.value})} placeholder="98.67..." />
              </div>
            </div>
            <button type="button" className="btn btn-sm mt-2" style={{ background: 'var(--primary-50)', color: 'var(--primary)' }} onClick={handleAddSite}>
              Tambah ke Daftar
            </button>
          </div>



          <button type="submit" className="btn btn-primary mt-2" disabled={savingSettings}>
            {savingSettings ? <div className="spinner spinner-sm"></div> : <Save size={18} />}
            Simpan Pengaturan
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      <h3 className="mb-2">
        <Upload size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        📢 Kirim Notifikasi PWA
      </h3>
      <p className="form-label mb-6">
        Kirimkan pesan/pengumuman penting kepada karyawan. Notifikasi ini akan langsung memicu push notification di layar handphone karyawan (jika diinstal).
      </p>

      <form onSubmit={handleSendNotification}>
        <div className="flex flex-col gap-4 max-w-md">
          <div className="form-group mb-0">
            <label className="form-label">Penerima Notifikasi</label>
            <select
              className="form-input"
              value={notifRecipient}
              onChange={e => setNotifRecipient(e.target.value)}
            >
              <option value="Semua">Semua Karyawan</option>
              {users.filter(u => u.role !== 'admin').map((u, i) => (
                <option key={i} value={u.nowa}>{u.nama} ({u.nowa})</option>
              ))}
            </select>
          </div>

          <div className="form-group mb-0">
            <label className="form-label">Judul Pesan</label>
            <input
              type="text"
              className="form-input"
              value={notifTitle}
              onChange={e => setNotifTitle(e.target.value)}
              placeholder="Contoh: Pengumuman Libur"
              required
            />
          </div>

          <div className="form-group mb-0">
            <label className="form-label">Isi Pesan / Pengumuman</label>
            <textarea
              className="form-input"
              rows="4"
              value={notifMessage}
              onChange={e => setNotifMessage(e.target.value)}
              placeholder="Tulis pesan pengumuman Anda di sini..."
              style={{ resize: 'vertical' }}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary mt-2" disabled={sendingNotif}>
            {sendingNotif ? <div className="spinner spinner-sm"></div> : <Save size={18} />}
            Kirim Notifikasi
          </button>
        </div>
      </form>
    </div>
  );

  // ─── Tabs config ───────────────────────────────────────────
  const tabs = [
    { id: 'report', label: 'Laporan Absensi', icon: FileText },
    { id: 'recap', label: 'Rekap Jam Kerja', icon: BarChart3 },
    { id: 'users', label: 'Karyawan', icon: Users },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="text-gradient">Dashboard Admin</h2>
          <p className="form-label" style={{ marginBottom: 0 }}>YP Jabal Rahmah Mulia — Sistem Absensi</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="btn btn-ghost" 
            onClick={toggleFullscreen} 
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ padding: '0.5rem 1rem' }}>
            <ArrowLeft size={16} /> Absen
          </button>
          <button className="btn btn-danger" onClick={handleLogout} style={{ padding: '0.5rem 1rem' }}>
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </div>

      <div className="main-content">

      {/* Tab Navigation */}
      <div className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
        <button
          className="tab-btn"
          onClick={() => fetchAllData(true)}
          disabled={refreshing}
          style={{ flex: '0 0 auto', padding: '0.7rem', width: '42px', minWidth: '42px', marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Refresh Data"
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>


      {/* Content Card */}
      <div className="card glass">
        {loading ? (
          <div className="flex justify-center" style={{ padding: '3rem 1rem' }}>
            <div className="spinner spinner-primary"></div>
          </div>
        ) : activeTab === 'report' ? (
          renderReport()
        ) : activeTab === 'recap' ? (
          renderRecap()
        ) : activeTab === 'users' ? (
          renderUsers()
        ) : (
          renderSettings()
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0 }}>
                <Edit3 size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                Edit Karyawan
              </h3>
              <button
                className="edit-btn"
                onClick={() => setEditingUser(null)}
                style={{ padding: '0.4rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="form-label mb-4" style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)' }}>
              {editingUser.nama}
            </p>

            <form onSubmit={handleUpdateUser}>
              <p className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>📅 Penjadwalan Kerja Mingguan</p>
              {renderWeeklySchedule(editJadwal, setEditJadwal)}
              <div className="form-group">
                <label className="form-label">Toleransi Terlambat (menit)</label>
                <input
                  type="number"
                  className="form-input"
                  value={editToleransi}
                  onChange={e => setEditToleransi(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                >
                  <option value="pegawai">Pegawai</option>
                  <option value="magang">Magang</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Jabatan</label>
                <input
                  type="text"
                  className="form-input"
                  value={editDepartemen}
                  onChange={e => setEditDepartemen(e.target.value)}
                  placeholder="Contoh: IT"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role Akun</label>
                <select
                  className="form-input"
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                >
                  <option value="user">User Biasa</option>
                  <option value="user_bebas">User Bebas Lokasi</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-4">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Batas Awal Masuk (mnt)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editBatasAwalMasuk}
                    onChange={e => setEditBatasAwalMasuk(Number(e.target.value))}
                    placeholder="60"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Batas Akhir Pulang (mnt)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editBatasAkhirPulang}
                    onChange={e => setEditBatasAkhirPulang(Number(e.target.value))}
                    placeholder="240"
                  />
                </div>
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Site Absen</label>
                <div 
                  className="form-input flex justify-between items-center cursor-pointer" 
                  onClick={e => { e.stopPropagation(); setShowEditSiteDropdown(!showEditSiteDropdown); }}
                  style={{ minHeight: '42px', paddingRight: '12px' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
                    {getSelectedSitesLabel(editLokasiAbsen)}
                  </span>
                  <ChevronDown size={16} style={{ transform: showEditSiteDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                {showEditSiteDropdown && (
                  <div className="dropdown-panel glass" onClick={e => e.stopPropagation()} style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    marginTop: '4px',
                    padding: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', hover: 'background: var(--surface-hover)', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={editLokasiAbsen === 'Semua'}
                        onChange={e => {
                          if (e.target.checked) {
                            setEditLokasiAbsen('Semua');
                          } else {
                            setEditLokasiAbsen(sites[0] ? sites[0].name : '');
                          }
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>Semua Lokasi</span>
                    </label>
                    <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                    {sites.map(s => {
                      const isSelected = editLokasiAbsen === 'Semua' || editLokasiAbsen.split(',').map(item => item.trim().toLowerCase()).includes(s.name.toLowerCase());
                      return (
                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: editLokasiAbsen === 'Semua' ? 'not-allowed' : 'pointer', opacity: editLokasiAbsen === 'Semua' ? 0.6 : 1, fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={editLokasiAbsen === 'Semua'}
                            onChange={e => {
                              const currentSites = editLokasiAbsen.split(',').map(item => item.trim()).filter(Boolean);
                              let nextSites;
                              if (e.target.checked) {
                                nextSites = [...currentSites, s.name];
                              } else {
                                nextSites = currentSites.filter(name => name.toLowerCase() !== s.name.toLowerCase());
                              }
                              const nextVal = nextSites.join(', ');
                              setEditLokasiAbsen(nextVal || 'Semua');
                            }}
                          />
                          <span>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="btn btn-primary" disabled={savingUser} style={{ flex: 1 }}>
                  {savingUser ? <div className="spinner"></div> : <><Save size={16} /> Simpan</>}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingUser(null)}
                  style={{ flex: 1 }}
                >
                  <X size={16} /> Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Attendance Input Modal */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: 'var(--primary)' }} />
                Input Absen Manual
              </h3>
              <button
                className="edit-btn"
                onClick={() => setShowManualModal(false)}
                style={{ padding: '0.4rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleManualAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pilih Karyawan</label>
                <select
                  className="form-input"
                  value={manualUserNowa}
                  onChange={e => setManualUserNowa(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Karyawan --</option>
                  {users.filter(u => u.role !== 'admin').map((u, i) => (
                    <option key={i} value={u.nowa}>{u.nama} ({u.departemen || 'Umum'})</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipe Presensi</label>
                <select
                  className="form-input"
                  value={manualType}
                  onChange={e => setManualType(e.target.value)}
                  required
                >
                  <option value="Masuk">Masuk</option>
                  <option value="Keluar">Keluar</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                  <option value="Alpa">Alpa (Mangkir)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tanggal</label>
                  <input
                    type="date"
                    className="form-input"
                    value={manualDate}
                    onChange={e => setManualDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Waktu / Jam</label>
                  <input
                    type="time"
                    className="form-input"
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Keterangan / Alasan</label>
                <input
                  type="text"
                  className="form-input"
                  value={manualKeterangan}
                  onChange={e => setManualKeterangan(e.target.value)}
                  placeholder="Contoh: Lupa Absen / Dinas Luar"
                  required
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button type="submit" className="btn btn-primary" disabled={submittingManual} style={{ flex: 1 }}>
                  {submittingManual ? <div className="spinner"></div> : <><Save size={16} /> Simpan Absen</>}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowManualModal(false)}
                  style={{ flex: 1 }}
                >
                  <X size={16} /> Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Site Modal */}
      {editingSite && (
        <div className="modal-overlay" onClick={() => setEditingSite(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={18} style={{ color: 'var(--primary)' }} />
                Edit Lokasi Absen
              </h3>
              <button className="edit-btn" onClick={() => setEditingSite(null)} style={{ padding: '0.4rem' }}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEditSite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nama Lokasi</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editingSite.name} 
                  onChange={e => setEditingSite({ ...editingSite, name: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Radius (Meter)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={editingSite.radius} 
                  onChange={e => setEditingSite({ ...editingSite, radius: e.target.value })} 
                  required 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Latitude</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingSite.lat} 
                    onChange={e => setEditingSite({ ...editingSite, lat: e.target.value })} 
                    required 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Longitude</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editingSite.lng} 
                    onChange={e => setEditingSite({ ...editingSite, lng: e.target.value })} 
                    required 
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-2">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  <Save size={16} /> Simpan Perubahan
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingSite(null)} style={{ flex: 1 }}>
                  <X size={16} /> Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Popup Notification & Confirmation Modal */}
      {popupNotif && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => {
          if (popupNotif.type !== 'confirm') {
            setPopupNotif(null);
          }
        }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px', borderRadius: 'var(--radius-xl)', padding: '1.75rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: popupNotif.type === 'success' ? 'var(--success-bg)' : popupNotif.type === 'error' ? 'var(--error-bg)' : 'var(--primary-50)',
              color: popupNotif.type === 'success' ? 'var(--success)' : popupNotif.type === 'error' ? 'var(--error)' : 'var(--primary)',
              marginBottom: '4px'
            }}>
              {popupNotif.type === 'success' ? <CheckCircle size={36} /> : <AlertTriangle size={36} />}
            </div>
            
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {popupNotif.title}
            </h3>
            
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {popupNotif.message}
            </p>
            
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '8px' }}>
              {popupNotif.type === 'confirm' ? (
                <>
                  <button 
                    type="button" 
                    className="btn btn-danger" 
                    onClick={() => {
                      if (popupNotif.onConfirm) popupNotif.onConfirm();
                      setPopupNotif(null);
                    }}
                    style={{ flex: 1, padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                  >
                    Ya, Hapus
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={() => setPopupNotif(null)}
                    style={{ flex: 1, padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={() => setPopupNotif(null)}
                  style={{ width: '100%', padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}
                >
                  Tutup
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
