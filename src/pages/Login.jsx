import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { callApi } from '../api';

export default function Login() {
  const [nowa, setNowa] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logo, setLogo] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Fetch settings to get the logo
    callApi({ action: 'get_settings' })
      .then(res => {
        if (res.settings && res.settings.KLINIK_LOGO) {
          setLogo(res.settings.KLINIK_LOGO);
        }
      })
      .catch(console.error);

    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await callApi({
        action: 'login',
        nowa,
        password
      });

      login(result.user);
      
      // Request fullscreen programmatically on user interaction
      try {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(() => {});
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } catch (f) {
        // ignore fullscreen blocker
      }
      
      if (result.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="card glass login-card">
        <div className="login-brand">
          <img 
            src={logo ? (logo.includes('/d/') ? `https://drive.google.com/thumbnail?id=${logo.split('/d/')[1].split('/')[0]}&sz=w400` : logo) : '/logo2.png'} 
            alt="Klinik Logo" 
            style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '1rem', borderRadius: '12px' }} 
          />
          <h2>Melati Dental Care</h2>
          <p className="login-tagline">Sistem Absensi Karyawan</p>
          <p className="login-time">
            {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' • '}
            {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nomor WhatsApp</label>
            <input 
              type="text" 
              className="form-input" 
              value={nowa}
              onChange={(e) => setNowa(e.target.value)}
              placeholder="08123456789"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full justify-center"
            disabled={isLoading}
          >
            {isLoading ? <div className="spinner"></div> : (
              <>
                <LogIn size={20} />
                Masuk
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
