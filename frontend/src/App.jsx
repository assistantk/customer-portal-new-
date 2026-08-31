import { useState } from 'react';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import CustomerRegistration from './pages/CustomerRegistration';
import VerificationScreen from './pages/VerificationScreen';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login'); // 'login' | 'signup'
  const [screen, setScreen] = useState('home'); // 'home' | 'verification'

  // if (!user) {
  //   if (page === 'signup') {
  //     return <SignUp onNavigateLogin={() => setPage('login')} />;
  //   }
  //   return (
  //     <Login
  //       onLoginSuccess={setUser}
  //       onNavigateSignUp={() => setPage('signup')}
  //     />
  //   );
  // }

  return (
    <Layout currentScreen={screen} onNavigate={setScreen}>
      {screen === 'home' && <CustomerRegistration />}
      {screen === 'verification' && <VerificationScreen />}
    </Layout>
  );
}
