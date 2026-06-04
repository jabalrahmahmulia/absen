import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { Camera, MapPin, LogOut, CheckCircle, RefreshCw, Clock, History, Calendar, X, ArrowLeft, Maximize2, Minimize2, Bell, LogIn, BarChart3, Plane, Wallet, CheckSquare, Users, Building2, Package, Home, Send, User, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { callApi } from '../api';

// Haversine formula
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371000; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return Math.round(R * c);
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
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

export default function Attendance() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  
  // Settings from API
  const [clinicConfig, setClinicConfig] = useState(null);
  const [fetchingSettings, setFetchingSettings] = useState(true);

  // States
  const [location, setLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [locError, setLocError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // History states
  const [activeTab, setActiveTab] = useState('home');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [underDevFeature, setUnderDevFeature] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [unfinishedModalSession, setUnfinishedModalSession] = useState(null);

  useEffect(() => {
    if (user?.nowa) {
      const savedAvatar = localStorage.getItem(`user_avatar_${user.nowa}`);
      if (savedAvatar) {
        setAvatarUrl(savedAvatar);
      }
    }
  }, [user]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 120;
          const MAX_HEIGHT = 120;
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          setAvatarUrl(compressedBase64);
          localStorage.setItem(`user_avatar_${user.nowa}`, compressedBase64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to parse time string
  const parseTimeStr = (ts) => {
    if (!ts) return null;
    const [h, m] = String(ts).split(':').map(Number);
    return { h: h || 0, m: m || 0, totalMinutes: (h || 0) * 60 + (m || 0) };
  };

  // Format duration
  const formatDuration = (totalMinutes) => {
    if (totalMinutes <= 0) return '-';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) return `${h}j ${m}m`;
    return `${m}m`;
  };

  // Get daily recaps list
  const getDailyRecapsList = useCallback(() => {
    if (!history || history.length === 0) return [];
    
    const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const groups = {};

    history.forEach(item => {
      const d = new Date(item.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) {
        groups[key] = { date: d, masuk: null, keluar: null, keterangan: '' };
      }
      if (item.tipe === 'Masuk') {
        if (!groups[key].masuk || new Date(item.timestamp) < new Date(groups[key].masuk)) {
          groups[key].masuk = item.timestamp;
        }
      }
      if (item.tipe === 'Keluar') {
        if (!groups[key].keluar || new Date(item.timestamp) > new Date(groups[key].keluar)) {
          groups[key].keluar = item.timestamp;
        }
      }
      if (item.keterangan) {
        groups[key].keterangan = item.keterangan;
      }
    });

    const rows = [];
    Object.values(groups).forEach(g => {
      const dayOfWeek = g.date.getDay();
      const isSabtu = dayOfWeek === 6;
      const isAhad = dayOfWeek === 0;

      let jamMulai = null;
      let jamSelesai = null;
      let isActive = true;

      if (user?.jadwal && user.jadwal[dayOfWeek]) {
        const dayConfig = user.jadwal[dayOfWeek];
        if (dayConfig.active) {
          jamMulai = parseTimeStr(dayConfig.start);
          jamSelesai = parseTimeStr(dayConfig.end);
        } else {
          isActive = false;
        }
      } else {
        // Fallback to legacy
        if (isAhad) {
          isActive = false;
        } else {
          const jm = isSabtu ? (user?.jamMulaiSabtu || '10:00') : (user?.jamMulai || '17:00');
          const js = isSabtu ? (user?.jamSelesaiSabtu || '17:00') : (user?.jamSelesai || '20:30');
          jamMulai = parseTimeStr(jm);
          jamSelesai = parseTimeStr(js);
        }
      }

      const toleransi = parseInt(user?.toleransi) || 15;

      const formatTimeOnly = (dt) => {
        if (!dt) return '-';
        const dateObj = new Date(dt);
        return dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
      };

      const row = {
        date: g.date,
        hari: HARI[dayOfWeek],
        isOff: !isActive,
        jamMasuk: g.masuk ? new Date(g.masuk) : null,
        jamMasukStr: formatTimeOnly(g.masuk),
        jamKeluar: g.keluar ? new Date(g.keluar) : null,
        jamKeluarStr: formatTimeOnly(g.keluar),
        jadwalMulai: !isActive ? '-' : (jamMulai ? `${String(jamMulai.h).padStart(2, '0')}:${String(jamMulai.m).padStart(2, '0')}` : '-'),
        jadwalSelesai: !isActive ? '-' : (jamSelesai ? `${String(jamSelesai.h).padStart(2, '0')}:${String(jamSelesai.m).padStart(2, '0')}` : '-'),
        durasi: null,
        status: !isActive ? 'Hari Libur' : 'Tepat Waktu',
        lembur: null,
        pulangCepat: null,
        keterangan: g.keterangan || '',
        terlambat: false
      };

      if (row.jamMasuk && row.jamKeluar) {
        const diffMs = row.jamKeluar - row.jamMasuk;
        const durasiMinutes = Math.floor(diffMs / 60000);
        row.durasi = formatDuration(durasiMinutes);

        if (isActive) {
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

          if (jamSelesai) {
            const keluarMinutes = row.jamKeluar.getHours() * 60 + row.jamKeluar.getMinutes();
            if (keluarMinutes > jamSelesai.totalMinutes) {
              const lemburMenit = keluarMinutes - jamSelesai.totalMinutes;
              row.lembur = formatDuration(lemburMenit);
            } else if (keluarMinutes < jamSelesai.totalMinutes) {
              const cepatMenit = jamSelesai.totalMinutes - keluarMinutes;
              row.pulangCepat = formatDuration(cepatMenit);
            }
          }
        }
      } else if (row.jamMasuk) {
        row.status = 'Belum Pulang';
      }

      rows.push(row);
    });

    return rows.sort((a, b) => b.date - a.date);
  }, [history, user]);

  // Find most recent unfinished past shift session
  const getUnfinishedSession = useCallback(() => {
    if (!history || history.length === 0) return null;

    const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const groups = {};
    history.forEach(item => {
      const d = new Date(item.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) {
        groups[key] = { date: d, key, masuk: null, keluar: null };
      }
      if (item.tipe === 'Masuk') {
        if (!groups[key].masuk || new Date(item.timestamp) < new Date(groups[key].masuk)) {
          groups[key].masuk = item.timestamp;
        }
      }
      if (item.tipe === 'Keluar') {
        if (!groups[key].keluar || new Date(item.timestamp) > new Date(groups[key].keluar)) {
          groups[key].keluar = item.timestamp;
        }
      }
    });

    const sortedGroups = Object.values(groups).sort((a, b) => b.date - a.date);

    for (const g of sortedGroups) {
      if (g.masuk && !g.keluar) {
        const dayOfWeek = g.date.getDay();
        const isSabtu = dayOfWeek === 6;
        const isAhad = dayOfWeek === 0;

        let jamSelesaiStr = '20:30';
        let jamMulaiStr = '17:00';
        let isActive = true;

        if (user?.jadwal && user.jadwal[dayOfWeek]) {
          const dayConfig = user.jadwal[dayOfWeek];
          if (dayConfig.active) {
            jamMulaiStr = dayConfig.start;
            jamSelesaiStr = dayConfig.end;
          } else {
            isActive = false;
          }
        } else {
          if (isAhad) {
            isActive = false;
          } else {
            jamMulaiStr = isSabtu ? (user?.jamMulaiSabtu || '10:00') : (user?.jamMulai || '17:00');
            jamSelesaiStr = isSabtu ? (user?.jamSelesaiSabtu || '17:00') : (user?.jamSelesai || '20:30');
          }
        }

        if (!isActive) continue;

        const [schH, schM] = jamSelesaiStr.split(':').map(Number);
        const shiftEnd = new Date(g.date);
        shiftEnd.setHours(schH || 20, schM || 30, 0, 0);

        const now = new Date();
        const isPastShiftEnd = now > shiftEnd;
        const isPastDate = (now.getDate() !== g.date.getDate()) || 
                           (now.getMonth() !== g.date.getMonth()) || 
                           (now.getFullYear() !== g.date.getFullYear());

        if (isPastDate || isPastShiftEnd) {
          return {
            date: g.date,
            dateKey: g.key,
            masukTime: new Date(g.masuk),
            jamMulaiStr,
            jamSelesaiStr,
            hari: HARI[dayOfWeek]
          };
        }
      }
    }

    return null;
  }, [history, user]);

  // Camera state
  const [takingPhotoFor, setTakingPhotoFor] = useState(null); // 'Masuk' | 'Keluar' | null
  
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
  
  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [activeToastNotif, setActiveToastNotif] = useState(null);

  // Ask for browser notification permissions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  const fetchNotifications = useCallback(async (isInitial = false) => {
    if (!user || !user.nowa) return;
    try {
      const res = await callApi({
        action: 'get_notifications',
        nowa: user.nowa
      });
      if (res.notifications) {
        setNotifications(res.notifications);
        
        const lastViewed = localStorage.getItem(`melati_notif_last_viewed_${user.nowa}`) || '0';
        const lastViewedTime = new Date(lastViewed).getTime();
        
        let unread = 0;
        let latestNotif = null;
        
        res.notifications.forEach(n => {
          const notifTime = new Date(n.timestamp).getTime();
          if (notifTime > lastViewedTime) {
            unread++;
            if (!latestNotif || notifTime > new Date(latestNotif.timestamp).getTime()) {
              latestNotif = n;
            }
          }
        });
        
        setUnreadNotifCount(unread);
        
        if (!isInitial && latestNotif && unread > 0) {
          setActiveToastNotif(latestNotif);
          
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(latestNotif.title, {
              body: latestNotif.message,
              icon: '/logo2.png'
            });
          }
          
          setTimeout(() => {
            setActiveToastNotif(prev => (prev && prev.timestamp === latestNotif.timestamp ? null : prev));
          }, 6000);
        }
      }
    } catch(e) {
      console.error('Failed to fetch notifications:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotifications(true);
      const interval = setInterval(() => {
        fetchNotifications(false);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user, fetchNotifications]);

  const markNotificationsAsRead = () => {
    if (!user) return;
    const nowStr = new Date().toISOString();
    localStorage.setItem(`melati_notif_last_viewed_${user.nowa}`, nowStr);
    setUnreadNotifCount(0);
  };
  
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  
  const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Fetch settings from API first
  useEffect(() => {
    const initSettings = async () => {
      try {
        const res = await callApi({ action: 'get_settings' });
        const parseCoord = (val) => parseFloat(String(val || '0').replace('_', '').replace(',', '.'));
        setClinicConfig({
          lat: parseCoord(res.settings.KLINIK_LAT),
          lng: parseCoord(res.settings.KLINIK_LNG),
          max_dist: parseInt(res.settings.MAX_DISTANCE || '100', 10),
          logo: res.settings.KLINIK_LOGO || null
        });
      } catch (err) {
        setLocError('Gagal mengambil pengaturan koordinat dari server. Hubungi Admin.');
      } finally {
        setFetchingSettings(false);
      }
    };
    initSettings();
  }, []);

  // 2. Get user location when activeTab changes to 'absen' or clinicConfig loads
  const getLocation = useCallback(() => {
    if (!clinicConfig) return;
    
    setLocError('');
    setLocation(null);
    setDistance(null);

    if (!navigator.geolocation) {
      setLocError('Geolocation tidak didukung di browser ini.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocation({ lat, lng });
        
        const dist = getDistanceFromLatLonInM(clinicConfig.lat, clinicConfig.lng, lat, lng);
        setDistance(dist);
      },
      (err) => {
        setLocError('Gagal mendapatkan lokasi. Pastikan GPS aktif dan diizinkan.');
      },
      { enableHighAccuracy: true }
    );
  }, [clinicConfig]);

  useEffect(() => {
    if (activeTab === 'absen' && clinicConfig) {
      getLocation();
    }
  }, [activeTab, clinicConfig, getLocation]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await callApi({ action: 'get_report' });
      // Filter hanya riwayat milik user yang sedang login
      const myHistory = res.report.filter(r => r.nama === user.nama);
      setHistory(myHistory);
    } catch (err) {
      console.error('Gagal mengambil riwayat:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user.nama]);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, fetchHistory]);

  useEffect(() => {
    if (activeTab === 'riwayat' || activeTab === 'absen') {
      fetchHistory(); // Selalu fetch history untuk update state disable tombol
    }
  }, [activeTab, fetchHistory]);

  const captureAndSubmit = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    
    try {
      await callApi({
        action: 'attend',
        nama: user.nama,
        nowa: user.nowa,
        tipe: takingPhotoFor,
        jarak: distance,
        koordinat: `${location.lat},${location.lng}`,
        photo: imageSrc
      });
      
      setSuccessMsg(`Berhasil melakukan absen ${takingPhotoFor}!`);
      setTakingPhotoFor(null);
      setShowSuccessModal(true);
      fetchHistory();
    } catch (err) {
      setErrorMsg(err.message);
      // Let the user retry or close
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredHistory = history.filter(item => {
    const d = new Date(item.timestamp);
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
  });

  // Cek apakah sudah absen hari ini
  const todayStr = new Date().toLocaleDateString('id-ID');
  const hasAbsenMasukToday = history.some(item => {
    const d = new Date(item.timestamp).toLocaleDateString('id-ID');
    return d === todayStr && item.tipe === 'Masuk';
  });
  const hasAbsenKeluarToday = history.some(item => {
    const d = new Date(item.timestamp).toLocaleDateString('id-ID');
    return d === todayStr && item.tipe === 'Keluar';
  });

  const isBebasLokasi = user?.role === 'admin' || user?.role === 'user_bebas';
  const isLocationValid = isBebasLokasi || (location && distance !== null && distance <= clinicConfig?.max_dist);

  const getJamKerja = () => {
    const dayOfWeek = currentTime.getDay();
    if (user && user.jadwal && user.jadwal[dayOfWeek]) {
      const dayConfig = user.jadwal[dayOfWeek];
      if (dayConfig.active) {
        return { jm: dayConfig.start, js: dayConfig.end, isActive: true };
      } else {
        return { jm: '', js: '', isActive: false };
      }
    }
    
    // Fallback to legacy
    const isSabtu = dayOfWeek === 6;
    const isMinggu = dayOfWeek === 0;
    if (isMinggu) {
      return { jm: '', js: '', isActive: false };
    }
    const jm = isSabtu ? (user?.jamMulaiSabtu || '10:00') : (user?.jamMulai || '17:00');
    const js = isSabtu ? (user?.jamSelesaiSabtu || '17:00') : (user?.jamSelesai || '20:30');
    return { jm: formatJamKerja(jm, jm), js: formatJamKerja(js, js), isActive: true };
  };

  const checkTimeBounds = () => {
    const { jm, js, isActive } = getJamKerja();
    if (!isActive) {
      return { allowedMasuk: false, allowedKeluar: false, isOffDay: true };
    }
    const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    const parseTimeStr = (ts) => {
      const [h, m] = String(ts).split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const minsMulai = parseTimeStr(jm);
    const minsSelesai = parseTimeStr(js);

    const batasAwal = user?.batasAwalMasuk !== undefined ? user.batasAwalMasuk : 60;
    const batasAkhir = user?.batasAkhirPulang !== undefined ? user.batasAkhirPulang : 240;

    const allowedMasuk = currentMins >= (minsMulai - batasAwal) && currentMins <= minsSelesai;
    const allowedKeluar = currentMins >= minsMulai && currentMins <= (minsSelesai + batasAkhir);

    return { allowedMasuk, allowedKeluar, isOffDay: false };
  };

  const { allowedMasuk, allowedKeluar, isOffDay } = checkTimeBounds();

  const disableMasuk = !isLocationValid || hasAbsenMasukToday || !allowedMasuk || isOffDay;
  const disablePulang = !isLocationValid || hasAbsenKeluarToday || !hasAbsenMasukToday || !allowedKeluar || isOffDay;


  if (fetchingSettings) {
    return (
      <div className="flex flex-col items-center justify-center w-full" style={{ minHeight: '60vh' }}>
        <div className="spinner spinner-primary spinner-lg mb-4"></div>
        <p style={{ color: 'var(--text-muted)' }}>Menyiapkan konfigurasi sistem...</p>
      </div>
    );
  }

  return (
    <>

      <div className="main-content" style={{ paddingBottom: '90px' }}>
        {errorMsg && !takingPhotoFor && <div className="alert alert-error mb-4" style={{ margin: '1rem 1.25rem 0' }}>{errorMsg}</div>}
        {successMsg && !takingPhotoFor && <div className="alert alert-success mb-4" style={{ margin: '1rem 1.25rem 0' }}><CheckCircle size={18} /> {successMsg}</div>}

        {activeTab === 'home' ? (
          <div>
            {/* Header Area */}
            <div className="home-header-bg">
              <div className="home-profile-section">
                <div className="home-profile-left">
                  <label htmlFor="home-avatar-upload" className="avatar-container" style={{ cursor: 'pointer', display: 'block' }} title="Klik untuk ganti foto">
                    <img 
                      src={avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.nama || '')}&backgroundColor=059669,10b981,047857&fontSize=42&fontFamily=Inter`} 
                      alt="Avatar" 
                      className="home-avatar"
                    />
                    <div className="avatar-edit-badge">
                      <Camera size={10} />
                    </div>
                    <input 
                      id="home-avatar-upload" 
                      type="file" 
                      accept="image/*" 
                      onChange={handleAvatarChange} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                  <div>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255, 255, 255, 0.75)', fontWeight: '700', marginBottom: '0.2rem' }}>Melati Dental Care</div>
                    <div className="home-greeting">Assalamu'alaikum,</div>
                    <div className="home-user-name">{user?.nama}</div>
                  </div>
                </div>
                <div className="home-profile-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="home-bell-btn sm-hidden" 
                    onClick={toggleFullscreen} 
                    title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
                  >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                  {user?.role === 'admin' && (
                    <button 
                      className="home-bell-btn" 
                      onClick={() => navigate('/admin')} 
                      title="Dashboard Admin"
                    >
                      <BarChart3 size={20} />
                    </button>
                  )}
                  <button 
                    className="home-bell-btn" 
                    onClick={() => {
                      markNotificationsAsRead();
                      setShowNotifModal(true);
                    }}
                    title="Notifikasi"
                  >
                    <Bell size={20} />
                    {unreadNotifCount > 0 && <span className="home-bell-badge" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Overlapping Presensi Card */}
            <div className="home-presensi-card">
              <div className="home-presensi-flex">
                <div className="home-presensi-left">
                  <div className="home-day-label">
                    {currentTime.toLocaleDateString('id-ID', { weekday: 'long' }).replace('Minggu', 'Ahad')}
                  </div>
                  <div className="home-date-label">
                    {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  
                  <div className="home-type-label">
                    {hasAbsenMasukToday ? 'Presensi Pulang' : 'Presensi Masuk'}
                  </div>
                  <div className="home-time-label">
                    {(() => {
                      const todayAbsenMasuk = history.find(h => {
                        const d = new Date(h.timestamp);
                        const today = new Date();
                        return d.getDate() === today.getDate() &&
                               d.getMonth() === today.getMonth() &&
                               d.getFullYear() === today.getFullYear() &&
                               h.tipe === 'Masuk';
                      });
                      if (todayAbsenMasuk) {
                        const checkTime = new Date(todayAbsenMasuk.timestamp);
                        return checkTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
                      }
                      return getJamKerja().jm;
                    })()}
                  </div>
                </div>
                
                <div className="home-presensi-divider"></div>
                
                <div className="home-presensi-right">
                  <button 
                    className="home-quick-btn masuk"
                    onClick={() => setActiveTab('absen')}
                    style={{
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      color: 'white',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)'
                    }}
                  >
                    <Clock size={18} />
                    <span>Absensi</span>
                  </button>
                </div>
              </div>
              
              <div className="home-status-footer">
                {(() => {
                  const todayAbsenMasuk = history.find(h => {
                    const d = new Date(h.timestamp);
                    const today = new Date();
                    return d.getDate() === today.getDate() &&
                           d.getMonth() === today.getMonth() &&
                           d.getFullYear() === today.getFullYear() &&
                           h.tipe === 'Masuk';
                  });
                  if (todayAbsenMasuk) {
                    const now = new Date();
                    const checkTime = new Date(todayAbsenMasuk.timestamp);
                    const diffMs = now - checkTime;
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    let durationStr = '';
                    if (diffHrs > 0) durationStr += `${diffHrs} jam `;
                    durationStr += `${diffMins} menit`;
                    
                    return `Presensi masuk dilakukan ${durationStr} yang lalu`;
                  }
                  
                  return "Belum melakukan presensi masuk hari ini.";
                })()}
              </div>
            </div>

            {/* Missed checkout alert */}
            {(() => {
              const unfinished = getUnfinishedSession();
              if (unfinished) {
                return (
                  <div 
                    style={{ 
                      margin: '0 1.25rem 1.25rem 1.25rem', 
                      background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', 
                      border: '1px solid #f59e0b',
                      borderRadius: '1.25rem',
                      padding: '1rem 1.25rem',
                      boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Clock size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#92400e' }}>Lupa Absen Pulang!</div>
                        <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: '500', marginTop: '0.1rem', lineHeight: '1.3' }}>
                          Anda belum absen pulang pada hari {unfinished.hari}, {new Date(unfinished.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                      <button 
                        onClick={() => setUnfinishedModalSession(unfinished)}
                        disabled={loading}
                        style={{
                          padding: '0.45rem 1rem',
                          borderRadius: '0.75rem',
                          background: '#d97706',
                          color: 'white',
                          border: 'none',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 10px rgba(217, 119, 6, 0.2)'
                        }}
                      >
                        Selesaikan Absen
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Last 5 Attendance Records (Rekap Jam Kerja) */}
            <div className="home-services-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={16} style={{ color: 'var(--primary)' }} />
                  Rekap Jam Kerja Terakhir
                </h3>
                <button 
                  onClick={() => setActiveTab('riwayat')} 
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Lihat Semua
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {getDailyRecapsList().slice(0, 5).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.75rem', color: 'var(--text-muted)', fontSize: '0.82rem', background: 'var(--surface-hover)', borderRadius: '1rem', border: '1px dashed var(--border)' }}>
                    Belum ada riwayat rekap kerja terdeteksi.
                  </div>
                ) : (
                  getDailyRecapsList().slice(0, 5).map((recap, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        background: 'white', 
                        borderRadius: '1.25rem', 
                        padding: '1rem 1.25rem', 
                        border: '1px solid var(--border)',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.01)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem'
                      }}
                    >
                      {/* Header: Day, Date & Shift */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {recap.hari}, {recap.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.15rem', fontWeight: '500' }}>
                            <Calendar size={11} style={{ color: 'var(--primary)' }} />
                            Jadwal: {recap.jadwalMulai} - {recap.jadwalSelesai}
                          </div>
                        </div>
                        
                        {/* Status Badge */}
                        <span style={{ 
                          fontSize: '0.68rem', 
                          fontWeight: '700', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '0.5rem',
                          background: recap.status === 'Tepat Waktu' ? 'rgba(16, 185, 129, 0.1)' : 
                                      recap.status.includes('Terlambat') ? 'rgba(245, 158, 11, 0.1)' : 
                                      recap.status === 'Belum Pulang' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                          color: recap.status === 'Tepat Waktu' ? 'var(--success)' : 
                                 recap.status.includes('Terlambat') ? '#d97706' : 
                                 recap.status === 'Belum Pulang' ? 'var(--info)' : 'var(--text-muted)'
                        }}>
                          {recap.status}
                        </span>
                      </div>

                      <div style={{ height: '1px', background: 'var(--border)', opacity: 0.5 }}></div>

                      {/* Body: Jam Masuk, Keluar & Durasi */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Masuk</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.2rem' }}>{recap.jamMasukStr}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keluar</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '800', color: recap.keterangan.includes('tidak') ? '#f97316' : 'var(--text-primary)', marginTop: '0.2rem' }}>
                            {recap.jamKeluarStr}
                            {recap.keterangan && <div style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: '600', marginTop: '0.1rem' }}>{recap.keterangan}</div>}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jam Kerja</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--primary)', marginTop: '0.2rem' }}>{recap.durasi || '-'}</div>
                        </div>
                      </div>

                      {/* Footer: Lembur & Pulang Cepat */}
                      {(recap.lembur || recap.pulangCepat) && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.1rem', flexWrap: 'wrap' }}>
                          {recap.lembur && (
                            <span style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: '700', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '0.5rem', 
                              background: 'rgba(59, 130, 246, 0.1)', 
                              color: 'var(--info)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              ⚡ Lembur: {recap.lembur}
                            </span>
                          )}
                          {recap.pulangCepat && (
                            <span style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: '700', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '0.5rem', 
                              background: 'rgba(239, 68, 68, 0.08)', 
                              color: 'var(--error)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              ⚠️ Pulang Cepat: {recap.pulangCepat}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'profil' ? (
          <div style={{ padding: '1.25rem' }}>
            <div className="profile-tab-card">
              <div className="profile-tab-header">
                <label htmlFor="profile-avatar-upload" className="avatar-container" style={{ cursor: 'pointer', display: 'block' }} title="Klik untuk ganti foto">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar" 
                      className="profile-tab-avatar"
                    />
                  ) : (
                    <div className="profile-tab-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: 'white' }}>
                      <User size={38} />
                    </div>
                  )}
                  <div className="avatar-edit-badge profile">
                    <Camera size={12} />
                  </div>
                  <input 
                    id="profile-avatar-upload" 
                    type="file" 
                    accept="image/*" 
                    onChange={handleAvatarChange} 
                    style={{ display: 'none' }} 
                  />
                </label>
                <div className="profile-tab-name">{user?.nama}</div>
                <span className="profile-tab-role">{user?.role}</span>
              </div>
              
              <div className="profile-tab-info-row">
                <span className="profile-tab-info-label">WhatsApp</span>
                <span className="profile-tab-info-value">{user?.nowa ? user.nowa.replace(/^(?:\+62|62)/, '0') : ''}</span>
              </div>
              <div className="profile-tab-info-row" style={{ borderBottom: 'none' }}>
                <span className="profile-tab-info-label">Status</span>
                <span className="profile-tab-info-value" style={{ color: 'var(--primary)' }}>
                  AKTIF
                </span>
              </div>
            </div>
            
            <div className="profile-tab-card" style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '0.5rem 1rem' }}>
              <div 
                className="profile-tab-info-row" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0' }}
                onClick={() => setShowScheduleModal(true)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                    <Calendar size={18} />
                  </div>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Jadwal dan Jam Kerja</span>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
              </div>
              
              <div 
                className="profile-tab-info-row" 
                style={{ borderBottom: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0' }}
                onClick={() => setUnderDevFeature({
                  title: "Reset Password",
                  message: "Fitur reset password mandiri sedang dalam pengembangan. Silakan hubungi admin untuk mereset password Anda saat ini."
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                    <Lock size={18} />
                  </div>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Reset Password</span>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button 
              className="btn btn-danger w-full justify-center" 
              onClick={handleLogout}
              style={{ padding: '0.9rem', borderRadius: '1rem', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 'bold' }}
            >
              <LogOut size={16} /> Keluar dari Aplikasi
            </button>
          </div>
        ) : activeTab === 'absen' ? (
          <div style={{ padding: '0 1.25rem' }}>
            {/* Jam Digital */}
            <div className="text-center mb-6 mt-4">
              <div style={{ fontSize: '3.5rem', fontWeight: '800', lineHeight: '1', color: 'var(--text-primary)' }}>
                {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                {currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }).replace('Minggu', 'Ahad')}
              </div>
            </div>

            {/* Status Lokasi Card */}
            <div className="card glass mb-6 text-center" style={{ padding: '2rem 1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              {locError ? (
                <>
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <MapPin size={32} />
                  </div>
                  <h3 style={{ color: 'var(--error)', marginBottom: '0.5rem' }}>Lokasi Tidak Valid</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{locError}</p>
                  <button className="btn btn-secondary mt-4 mx-auto" onClick={getLocation}><RefreshCw size={16} /> Muat Ulang Lokasi</button>
                </>
              ) : distance === null ? (
                <div style={{ padding: '2rem 0' }}>
                  <div className="spinner spinner-primary spinner-lg mx-auto mb-4"></div>
                  <p style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Mencari lokasi Anda...</p>
                </div>
              ) : isLocationValid ? (
                <>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <CheckCircle size={36} />
                  </div>
                  <h3 style={{ color: 'var(--success)', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Lokasi Valid</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem' }}>
                    Anda berada dalam radius kantor ({distance}m).
                  </p>
                  <div style={{ 
                    fontSize: '0.95rem', 
                    fontWeight: '600', 
                    color: isOffDay ? 'var(--text-muted)' : 'var(--primary)', 
                    background: isOffDay ? 'var(--surface-hover)' : 'rgba(5, 150, 105, 0.1)', 
                    padding: '0.75rem', 
                    borderRadius: '0.5rem', 
                    display: 'inline-block' 
                  }}>
                    {(() => {
                      const { jm, js, isActive } = getJamKerja();
                      if (!isActive) {
                        return 'Hari Ini Libur (Tidak ada jadwal)';
                      }
                      return `Jadwal hari ini (${jm} - ${js})`;
                    })()}
                  </div>
                  <div className="mt-4">
                    <button className="btn btn-ghost mx-auto btn-sm" style={{ color: 'var(--text-muted)' }} onClick={getLocation}><RefreshCw size={14} /> Muat Ulang Lokasi</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--error)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <MapPin size={36} />
                  </div>
                  <h3 style={{ color: 'var(--error)', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Di Luar Jangkauan</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem' }}>
                    Anda berada {distance}m dari klinik. Maksimal jarak adalah {clinicConfig?.max_dist || 100}m.
                  </p>
                  <button className="btn btn-secondary mt-4 mx-auto btn-sm" onClick={getLocation}><RefreshCw size={14} /> Coba Lagi</button>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mb-4">
              <button 
                className={`btn flex-1 justify-center flex-col gap-2 ${!hasAbsenMasukToday && allowedMasuk ? 'pulse-mandatory' : ''}`}
                style={{ 
                  background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', 
                  color: 'white', padding: '1.5rem', borderRadius: '1rem', border: 'none',
                  opacity: disableMasuk ? 0.5 : 1,
                  boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
                  cursor: disableMasuk ? 'not-allowed' : 'pointer'
                }}
                onClick={() => setTakingPhotoFor('Masuk')}
                disabled={disableMasuk}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <LogIn size={24} />
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: '700' }}>
                  {hasAbsenMasukToday ? 'Sudah Masuk' : (!allowedMasuk ? 'Di Luar Jam' : 'Absen Masuk (Wajib)')}
                </span>
              </button>
              
              {allowedKeluar && (
                <button 
                  className="btn flex-1 justify-center flex-col gap-2" 
                  style={{ 
                    background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)', 
                    color: 'white', padding: '1.5rem', borderRadius: '1rem', border: 'none',
                    opacity: disablePulang ? 0.5 : 1,
                    boxShadow: '0 10px 25px -5px rgba(249, 115, 22, 0.4)',
                    cursor: disablePulang ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => setTakingPhotoFor('Keluar')}
                  disabled={disablePulang}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                    <LogOut size={24} />
                  </div>
                  <span style={{ fontSize: '1.2rem', fontWeight: '700' }}>
                    {!hasAbsenMasukToday ? 'Belum Masuk' : (hasAbsenKeluarToday ? 'Sudah Pulang' : 'Pulang')}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : activeTab === 'riwayat' ? (
          <div>
            {/* Professional Sticky Header for Riwayat */}
            <div style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              padding: '1.5rem 1.25rem 1.25rem',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginBottom: '0.3rem' }}>Log Kehadiran</div>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'white', margin: 0, lineHeight: 1.1 }}>Riwayat Absen</h2>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginTop: '0.3rem' }}>
                    {filteredHistory.length} catatan &middot; {MONTHS[filterMonth]} {filterYear}
                  </p>
                </div>
                <div style={{ 
                  background: 'rgba(255,255,255,0.15)', 
                  borderRadius: '50%', 
                  width: '44px', 
                  height: '44px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <History size={20} style={{ color: 'white' }} />
                </div>
              </div>

              {/* Dynamic Month Pill Filter */}
              <div style={{ overflowX: 'auto', paddingBottom: '2px' }}>
                <div style={{ display: 'flex', gap: '0.45rem', width: 'max-content' }}>
                  {MONTHS.map((m, i) => (
                    <button 
                      key={i} 
                      onClick={() => setFilterMonth(i)}
                      style={{
                        padding: '0.35rem 0.9rem',
                        borderRadius: '2rem',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: filterMonth === i ? 'white' : 'rgba(255,255,255,0.15)',
                        color: filterMonth === i ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
                        boxShadow: filterMonth === i ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        transform: filterMonth === i ? 'scale(1.05)' : 'scale(1)',
                        flexShrink: 0
                      }}
                    >
                      {m.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year toggle pills */}
              <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.6rem' }}>
                {yearOptions.map(y => (
                  <button 
                    key={y} 
                    onClick={() => setFilterYear(y)}
                    style={{
                      padding: '0.3rem 0.85rem',
                      borderRadius: '2rem',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: filterYear === y ? 'white' : 'rgba(255,255,255,0.15)',
                      color: filterYear === y ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
                      boxShadow: filterYear === y ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* History List */}
            <div style={{ padding: '1.25rem' }}>
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <div className="spinner spinner-primary"></div>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="card text-center" style={{ padding: '3rem 1.5rem' }}>
                  <Calendar size={48} style={{ margin: '0 auto 1rem', opacity: 0.3, color: 'var(--primary)' }} />
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>Tidak Ada Riwayat</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Belum ada catatan absensi untuk {MONTHS[filterMonth]} {filterYear}.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {filteredHistory.map((item, idx) => {
                    const d = new Date(item.timestamp);
                    const isMasuk = item.tipe === 'Masuk';
                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          background: 'white', 
                          borderRadius: '1.25rem', 
                          padding: '1rem', 
                          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                          border: `1px solid ${isMasuk ? 'rgba(16,185,129,0.12)' : 'rgba(249,115,22,0.12)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          animation: 'fadeInUp 0.3s ease-out'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div style={{ 
                            width: '42px', 
                            height: '42px', 
                            borderRadius: '50%', 
                            background: isMasuk ? 'rgba(16, 185, 129, 0.1)' : 'rgba(249, 115, 22, 0.1)', 
                            color: isMasuk ? 'var(--success)' : '#f97316', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {isMasuk ? <LogIn size={18} /> : <LogOut size={18} />}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary)' }}>Absen {item.tipe}</span>
                              {item.keterangan && (
                                <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#f97316', background: 'rgba(249,115,22,0.08)', padding: '0.1rem 0.4rem', borderRadius: '0.4rem' }}>
                                  {item.keterangan}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500', marginTop: '0.2rem' }}>
                              {d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).replace('Minggu', 'Ahad')}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: isMasuk ? 'var(--success)' : '#f97316' }}>
                            {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '0.15rem' }}>
                            <MapPin size={10} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                              {item.jarak} m
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'rekap' ? (
          <div>
            {/* Professional Sticky Header for Rekap */}
            <div style={{
              background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
              padding: '1.5rem 1.25rem 1.25rem',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginBottom: '0.3rem' }}>Ringkasan Kerja</div>
                  <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'white', margin: 0, lineHeight: 1.1 }}>Rekap Jam Kerja</h2>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginTop: '0.3rem' }}>
                    {getDailyRecapsList().filter(r => new Date(r.date).getMonth() === filterMonth && new Date(r.date).getFullYear() === filterYear).length} hari &middot; {MONTHS[filterMonth]} {filterYear}
                  </p>
                </div>
                <div style={{ 
                  background: 'rgba(255,255,255,0.15)', 
                  borderRadius: '50%', 
                  width: '44px', 
                  height: '44px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <BarChart3 size={20} style={{ color: 'white' }} />
                </div>
              </div>

              {/* Month Pills */}
              <div style={{ overflowX: 'auto', paddingBottom: '2px' }}>
                <div style={{ display: 'flex', gap: '0.45rem', width: 'max-content' }}>
                  {MONTHS.map((m, i) => (
                    <button 
                      key={i} 
                      onClick={() => setFilterMonth(i)}
                      style={{
                        padding: '0.35rem 0.9rem',
                        borderRadius: '2rem',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: filterMonth === i ? 'white' : 'rgba(255,255,255,0.15)',
                        color: filterMonth === i ? '#0f766e' : 'rgba(255,255,255,0.85)',
                        boxShadow: filterMonth === i ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                        transform: filterMonth === i ? 'scale(1.05)' : 'scale(1)',
                        flexShrink: 0
                      }}
                    >
                      {m.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.6rem' }}>
                {yearOptions.map(y => (
                  <button 
                    key={y} 
                    onClick={() => setFilterYear(y)}
                    style={{
                      padding: '0.3rem 0.85rem',
                      borderRadius: '2rem',
                      border: 'none',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: filterYear === y ? 'white' : 'rgba(255,255,255,0.15)',
                      color: filterYear === y ? '#0f766e' : 'rgba(255,255,255,0.85)',
                      boxShadow: filterYear === y ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
                    }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Recap Cards List */}
            <div style={{ padding: '1.25rem' }}>
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <div className="spinner spinner-primary"></div>
                </div>
              ) : (() => {
                const rekapFiltered = getDailyRecapsList().filter(r => 
                  new Date(r.date).getMonth() === filterMonth && new Date(r.date).getFullYear() === filterYear
                );
                return rekapFiltered.length === 0 ? (
                  <div className="card text-center" style={{ padding: '3rem 1.5rem' }}>
                    <BarChart3 size={48} style={{ margin: '0 auto 1rem', opacity: 0.3, color: 'var(--primary)' }} />
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '0.25rem' }}>Tidak Ada Rekap</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Belum ada rekap jam kerja untuk {MONTHS[filterMonth]} {filterYear}.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {rekapFiltered.map((recap, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          background: 'white', 
                          borderRadius: '1.25rem', 
                          padding: '1rem 1.25rem', 
                          border: '1px solid var(--border)',
                          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                              {recap.hari}, {recap.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.15rem', fontWeight: '500' }}>
                              <Calendar size={11} style={{ color: 'var(--primary)' }} />
                              Jadwal: {recap.jadwalMulai} - {recap.jadwalSelesai}
                            </div>
                          </div>
                          <span style={{ 
                            fontSize: '0.68rem', 
                            fontWeight: '700', 
                            padding: '0.2rem 0.55rem', 
                            borderRadius: '0.5rem',
                            background: recap.status === 'Tepat Waktu' ? 'rgba(16, 185, 129, 0.1)' : 
                                        recap.status.includes('Terlambat') ? 'rgba(245, 158, 11, 0.1)' : 
                                        recap.status === 'Belum Pulang' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                            color: recap.status === 'Tepat Waktu' ? 'var(--success)' : 
                                   recap.status.includes('Terlambat') ? '#d97706' : 
                                   recap.status === 'Belum Pulang' ? '#3b82f6' : 'var(--text-muted)'
                          }}>
                            {recap.status}
                          </span>
                        </div>
                        <div style={{ height: '1px', background: 'var(--border)', opacity: 0.5 }}></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Masuk</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '0.2rem' }}>{recap.jamMasukStr}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keluar</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: recap.keterangan?.includes('tidak') ? '#f97316' : 'var(--text-primary)', marginTop: '0.2rem' }}>
                              {recap.jamKeluarStr}
                              {recap.keterangan && <div style={{ fontSize: '0.6rem', color: '#f97316', fontWeight: '600', marginTop: '0.1rem', lineHeight: '1.2' }}>{recap.keterangan}</div>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Jam Kerja</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--primary)', marginTop: '0.2rem' }}>{recap.durasi || '-'}</div>
                          </div>
                        </div>
                        {(recap.lembur || recap.pulangCepat) && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {recap.lembur && (
                              <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ⚡ Lembur: {recap.lembur}
                              </span>
                            )}
                            {recap.pulangCepat && (
                              <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.08)', color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ⚠️ Pulang Cepat: {recap.pulangCepat}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (<div></div>)}
      </div>

      {/* Bottom Navigation Redesign */}
      <div className="home-bottom-navbar">
        <button 
          className={`home-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        
        <button 
          className={`home-nav-item ${activeTab === 'riwayat' ? 'active' : ''}`}
          onClick={() => setActiveTab('riwayat')}
        >
          <History size={20} />
          <span>Riwayat Absen</span>
        </button>
        
        <div 
          className="home-nav-center-btn"
          onClick={() => setActiveTab('absen')}
          title="Absen Sekarang"
        >
          <Clock size={24} />
        </div>
        
        <button 
          className={`home-nav-item ${activeTab === 'rekap' ? 'active' : ''}`}
          onClick={() => setActiveTab('rekap')}
        >
          <BarChart3 size={20} />
          <span>Rekap</span>
        </button>
        
        <button 
          className={`home-nav-item ${activeTab === 'profil' ? 'active' : ''}`}
          onClick={() => setActiveTab('profil')}
        >
          <User size={20} />
          <span>Profil</span>
        </button>
      </div>

      {/* Full Screen Camera View */}
      {takingPhotoFor && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', color: 'white', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
            <button onClick={() => setTakingPhotoFor(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={20} />
            </button>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500' }}>Foto Absen {takingPhotoFor}</h3>
            <div style={{ width: '40px' }}></div> {/* spacer */}
          </div>
          
          {/* Webcam */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "user" }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {errorMsg && (
              <div style={{ position: 'absolute', top: '80px', left: '1rem', right: '1rem', background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}
          </div>
          
          {/* Footer controls */}
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <button 
              onClick={captureAndSubmit}
              disabled={loading}
              style={{ 
                width: '76px', height: '76px', borderRadius: '50%', 
                background: 'white', border: '4px solid rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                transition: 'transform 0.1s',
                transform: loading ? 'scale(0.95)' : 'scale(1)'
              }}
            >
              {loading ? (
                <div className="spinner spinner-primary"></div>
              ) : (
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid black' }}></div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Success PopUp Modal */}
      {showSuccessModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card text-center" style={{ width: '90%', maxWidth: '320px', padding: '2rem', animation: 'scaleIn 0.3s ease-out' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--success)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <CheckCircle size={48} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Absen Berhasil!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Data absensi Anda telah tersimpan.</p>
            
            {successMsg.includes('Masuk') && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '0.5rem', lineHeight: '1.6', fontFamily: 'serif' }} dir="rtl">
                  اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: '1.4' }}>
                  "Ya Allah, sungguh aku memohon kepada-Mu ilmu yang bermanfaat, rezeki yang baik, dan amal yang diterima."
                </p>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 'bold', marginTop: '0.75rem' }}>Selamat Bekerja!</p>
              </div>
            )}

            <button className="btn btn-primary w-full" onClick={() => {
              setShowSuccessModal(false);
              setActiveTab('riwayat');
            }}>Tutup & Lihat Riwayat</button>
          </div>
        </div>
      )}

      {/* Notifications History Modal */}
      {showNotifModal && (
        <div className="modal-overlay" onClick={() => setShowNotifModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} style={{ color: 'var(--primary)' }} />
                Riwayat Notifikasi
              </div>
              <button className="modal-close" onClick={() => setShowNotifModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="notif-list">
              {notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <Bell size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>Belum ada notifikasi untuk Anda</p>
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} className="notif-item">
                    <div className="notif-item-header">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-item-time">
                        {new Date(n.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} {new Date(n.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="notif-item-msg">{n.message}</div>
                  </div>
                ))
              )}
            </div>
            
            <button className="btn btn-secondary w-full mt-4" onClick={() => setShowNotifModal(false)}>Tutup</button>
          </div>
        </div>
      )}

      {/* In-App Sliding Toast Notification Banner */}
      {activeToastNotif && (
        <div className="notification-toast">
          <div style={{ background: 'var(--primary-50)', color: 'var(--primary)', padding: '0.4rem', borderRadius: '50%', display: 'flex' }}>
            <Bell size={16} />
          </div>
          <div className="notification-toast-content">
            <div className="notification-toast-title">{activeToastNotif.title}</div>
            <div className="notification-toast-msg">{activeToastNotif.message}</div>
          </div>
          <button className="notification-toast-close" onClick={() => setActiveToastNotif(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Feature Under Development Modal */}
      {underDevFeature && (
        <div className="modal-overlay" onClick={() => setUnderDevFeature(null)}>
          <div className="modal text-center" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px', padding: '2rem' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(5, 150, 105, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Clock size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>{underDevFeature.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>{underDevFeature.message}</p>
            <button className="btn btn-primary w-full" onClick={() => setUnderDevFeature(null)}>Mengerti</button>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={20} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Jadwal Anda</h3>
              </div>
              <button onClick={() => setShowScheduleModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((dayName, idx) => {
                let isActive = false;
                let start = '';
                let end = '';
                if (user?.jadwal && user.jadwal[idx]) {
                  isActive = user.jadwal[idx].active;
                  start = user.jadwal[idx].start;
                  end = user.jadwal[idx].end;
                } else {
                  if (idx !== 0) {
                    isActive = true;
                    start = formatJamKerja(idx === 6 ? (user?.jamMulaiSabtu || '10:00') : (user?.jamMulai || '17:00'), '17:00');
                    end = formatJamKerja(idx === 6 ? (user?.jamSelesaiSabtu || '17:00') : (user?.jamSelesai || '20:30'), '20:30');
                  }
                }
                const isToday = new Date().getDay() === idx;
                
                return (
                  <div key={idx} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '0.75rem', 
                    borderRadius: '0.75rem', 
                    background: isToday ? 'rgba(16, 185, 129, 0.05)' : 'white',
                    border: isToday ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border)'
                  }}>
                    <span style={{ fontWeight: isToday ? '700' : '600', color: isToday ? 'var(--primary)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
                      {dayName}
                    </span>
                    {isActive ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{start}</span>
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{end}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#f97316', background: 'rgba(249, 115, 22, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '1rem' }}>
                        Libur
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Missed Check-Out Resolution Modal */}
      {unfinishedModalSession && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card text-center" style={{ width: '90%', maxWidth: '360px', padding: '1.75rem', animation: 'scaleIn 0.3s ease-out' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Clock size={32} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Selesaikan Absensi</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
              Anda belum melakukan absen pulang pada hari <strong>{unfinishedModalSession.hari}, {new Date(unfinishedModalSession.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
              <br /><br />
              Sistem akan mencatat waktu pulang Anda secara otomatis pada jam pulang jadwal normal <strong>({unfinishedModalSession.jamSelesaiStr})</strong> dengan keterangan <strong>(tidak absen pulang)</strong>.
            </p>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary flex-1" 
                onClick={() => setUnfinishedModalSession(null)}
                disabled={loading}
                style={{ padding: '0.75rem', borderRadius: '0.75rem', fontSize: '0.9rem', fontWeight: '700' }}
              >
                Batal
              </button>
              <button 
                className="btn flex-1" 
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setErrorMsg('');
                  setSuccessMsg('');
                  try {
                    const targetDate = new Date(unfinishedModalSession.date);
                    const [h, m] = unfinishedModalSession.jamSelesaiStr.split(':').map(Number);
                    targetDate.setHours(h || 20, m || 30, 0, 0);

                    await callApi({
                      action: 'attend',
                      nama: user.nama,
                      nowa: user.nowa,
                      tipe: 'Keluar',
                      jarak: 0,
                      koordinat: '-',
                      keterangan: '(tidak absen pulang)',
                      timestamp: targetDate.toISOString()
                    });

                    setSuccessMsg(`Berhasil menyelesaikan absensi tanggal ${targetDate.toLocaleDateString('id-ID')}!`);
                    setUnfinishedModalSession(null);
                    fetchHistory();
                  } catch (err) {
                    setErrorMsg(err.message || 'Gagal menyelesaikan absensi');
                  } finally {
                    setLoading(false);
                  }
                }}
                style={{ 
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem', 
                  borderRadius: '0.75rem', 
                  fontSize: '0.9rem', 
                  fontWeight: '700',
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.2)'
                }}
              >
                {loading ? <div className="spinner spinner-sm" style={{ borderColor: 'white', margin: '0 auto' }}></div> : 'Ya, Selesaikan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

