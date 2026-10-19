import { useState } from 'react';
import { Home, CheckSquare, Menu, User, LogOut } from 'lucide-react';
import crisLogo from '../assets/cris-logo.png';  /* Header CRIS branding */
import irLogo from '../assets/rail.png';          /* Watermark background */
import '../styles/layout.css';

export default function Layout({ currentScreen, onNavigate, currentUser, onLogout, children }) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const toggleDrawer = () => {
        setIsDrawerOpen(!isDrawerOpen);
    };

    return (
        <div className="app-layout">
            {/* ── Global watermark layer: sits behind everything ── */}
            <div
                className="ir-watermark"
                style={{ backgroundImage: `url(${irLogo})` }}
                aria-hidden="true"
            />
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
                <div className="header-right">
                    {currentUser && (
                        <div className="header-user-badge">
                            <User size={15} />
                            <span className="header-user-name" title={currentUser.userId}>
                                {currentUser.userName || currentUser.userId}
                            </span>
                            <span className={`header-role-pill ${currentUser.userRole?.toLowerCase() === 'admin' ? 'role-admin' : 'role-user'}`}>
                                {currentUser.userRole || 'USER'}
                            </span>
                            <button
                                type="button"
                                className="header-logout-btn"
                                onClick={onLogout}
                                title="Sign out"
                                aria-label="Sign out"
                            >
                                <LogOut size={14} />
                                <span>Logout</span>
                            </button>
                        </div>
                    )}
                    <div className="cris"><img src={crisLogo} alt="CRIS – making IT happen" /></div>
                </div>
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

                    {currentUser && (
                        <div className="drawer-footer">
                            <div className="drawer-user-card">
                                <div className="drawer-user-info">
                                    <span className="drawer-user-title">{currentUser.userName || currentUser.userId}</span>
                                    <span className="drawer-user-sub">ID: {currentUser.userId}</span>
                                </div>
                                <span className={`drawer-role-tag ${currentUser.userRole?.toLowerCase() === 'admin' ? 'role-admin' : 'role-user'}`}>
                                    {currentUser.userRole || 'USER'}
                                </span>
                            </div>
                            <button className="drawer-item drawer-logout-item" onClick={onLogout}>
                                <LogOut size={18} /> Logout
                            </button>
                        </div>
                    )}
                </aside>

                <div className="layout-main-content">
                    {children}
                    <footer>Copyright©2026. Designed and Developed by Centre for Railway Information Systems (CRIS)</footer>
                </div>
            </div>
        </div>
    );
}
