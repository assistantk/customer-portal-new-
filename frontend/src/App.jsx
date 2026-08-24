import { useState } from 'react';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import CustomerRegistration from './pages/CustomerRegistration';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login'); // 'login' | 'signup'

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

  return <CustomerRegistration />;
}
