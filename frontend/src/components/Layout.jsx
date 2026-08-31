import { useState } from 'react';
import { Home, CheckSquare, Menu } from 'lucide-react';
import crisLogo from '../assets/cris-logo.png';
import '../styles/layout.css';

export default function Layout({ currentScreen, onNavigate, children }) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(true);

    const toggleDrawer = () => {
        setIsDrawerOpen(!isDrawerOpen);
    };

    return (
        <div className="app-layout">
            <header>
                <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button 
                        className="drawer-toggle-btn" 
                        onClick={toggleDrawer}
                        aria-label="Toggle Navigation"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
                    <span>CUSTOMER REGISTRATION PORTAL</span>
                </div>
                <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
            </header>

            <div className="layout-body">
                <aside className={`drawer ${isDrawerOpen ? 'open' : 'collapsed'}`}>
                    <div className="drawer-nav">
                        <button 
                            className={`drawer-item ${currentScreen === 'home' ? 'active' : ''}`}
                            onClick={() => onNavigate('home')}
                        >
                            <Home size={18} /> Home
                        </button>
                        <button 
                            className={`drawer-item ${currentScreen === 'verification' ? 'active' : ''}`}
                            onClick={() => onNavigate('verification')}
                        >
                            <CheckSquare size={18} /> Verification Screen
                        </button>
                    </div>
                </aside>

                <div className="layout-main-content">
                    {children}
                    <footer>Copyright©2026. Designed and Developed by Centre for Railway Information Systems (CRIS)</footer>
                </div>
            </div>
        </div>
    );
}
