import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Attendance from './pages/Attendance';
import Admin from './pages/Admin';

// Protected Route Component
const ProtectedRoute = ({ children, requireAdmin }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="app-container items-center justify-center"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/" replace />;
  
  return children;
};

function App() {
  useEffect(() => {
    const enterFullscreenOnGesture = () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile && !document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        const elem = document.documentElement;
        try {
          if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(() => {});
          } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
          } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
          }
        } catch (e) {
          console.error('Failed to auto-enter fullscreen:', e);
        }
      }
      // Remove event listeners after first interaction
      document.removeEventListener('click', enterFullscreenOnGesture);
      document.removeEventListener('touchstart', enterFullscreenOnGesture);
    };

    document.addEventListener('click', enterFullscreenOnGesture);
    document.addEventListener('touchstart', enterFullscreenOnGesture);

    return () => {
      document.removeEventListener('click', enterFullscreenOnGesture);
      document.removeEventListener('touchstart', enterFullscreenOnGesture);
    };
  }, []);

  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Attendance />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <Admin />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
