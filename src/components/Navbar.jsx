import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AshokaEmblem from './AshokaEmblem';
import { LogOut, LayoutDashboard, Search } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // Search functionality placeholder
    if (searchQuery.trim()) {
      alert(`Searching for: "${searchQuery}" — This feature will be available soon.`);
    }
  };

  return (
    <>
      {/* Tricolor Bar */}
      <div className="tricolor-bar" role="presentation" aria-hidden="true"></div>

      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div className="container">
          {/* Main Nav Row */}
          <div className="navbar-main">
            <Link to="/" className="navbar-brand" aria-label="GovernTogether Home">
              <AshokaEmblem size={44} className="navbar-emblem" />
              <div className="navbar-brand-text">
                <span className="navbar-brand-title">GovernTogether</span>
                <span className="navbar-brand-subtitle">Government of India</span>
              </div>
            </Link>

            <span className="navbar-tagline">
              Empowering Citizens for Collaborative Governance
            </span>

            <div className="navbar-links">
              {user ? (
                <>
                  <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>
                    <LayoutDashboard size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    <span>Dashboard</span>
                  </Link>
                  <button onClick={handleLogout}>
                    <LogOut size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="navbar-login-btn">
                    Login
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search Bar Row */}
          <div className="navbar-search">
            <form className="search-wrapper" onSubmit={handleSearch} role="search" aria-label="Search issues">
              <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search for issues, complaints, or updates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search for issues"
              />
              <button type="submit" className="search-btn">
                Search
              </button>
            </form>
          </div>
        </div>
      </nav>
    </>
  );
}
