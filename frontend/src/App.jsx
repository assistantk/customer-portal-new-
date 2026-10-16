import { useState } from 'react';
import CustomerRegistration from './pages/CustomerRegistration';
import Layout from './components/Layout';

export default function App() {
  const [screen, setScreen] = useState('home');

  return (
    <Layout currentScreen={screen} onNavigate={setScreen}>
      {screen === 'home' && <CustomerRegistration />}
    </Layout>
  );
}
