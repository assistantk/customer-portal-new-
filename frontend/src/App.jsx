import { useState, useEffect } from 'react';
import CustomerRegistration from './pages/CustomerRegistration';
import VerificationScreen from './pages/VerificationScreen';
import Login from './pages/Login';
import Layout from './components/Layout';
import { checkSession, logoutUser } from './services/authService';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [screen, setScreen] = useState('home');

  useEffect(() => {
    let isMounted = true;

    async function verifyAuth() {
      try {
        const res = await checkSession();
        if (isMounted && res && res.authenticated && res.data) {
          setCurrentUser(res.data);
        } else if (isMounted) {
          setCurrentUser(null);
        }
      } catch (_) {
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    }

    verifyAuth();

    const handleAuthExpired = () => {
      setCurrentUser(null);
    };

    window.addEventListener('auth-expired', handleAuthExpired);
    return () => {
      isMounted = false;
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, []);

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData);
    setScreen('home');
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('Logout error:', err);
    }
    setCurrentUser(null);
    setScreen('home');
  };

  if (checking) {
    return (
      <div className="auth-loading-screen">
        <Loader2 size={36} className="auth-loading-spinner" />
        <p style={{ fontSize: '14px', color: '#475569', fontWeight: 500 }}>
          Verifying session credentials…
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Layout
      currentScreen={screen}
      onNavigate={setScreen}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      {screen === 'home' && <CustomerRegistration />}
      {screen === 'verification' && <VerificationScreen />}
    </Layout>
  );
}
