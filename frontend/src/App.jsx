import { useState } from 'react';
import Login from './pages/Login';
import CustomerRegistration from './pages/CustomerRegistration';

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  return <CustomerRegistration />;
}
