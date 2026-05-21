import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Zap, Mail, Phone, MapPin } from 'lucide-react';
import AshokaEmblem from '../components/AshokaEmblem';
import Navbar from '../components/Navbar';
import PublicDashboard from '../components/PublicDashboard';

const LandingPage = () => {
  const revealRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    revealRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      revealRefs.current.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, []);

  const addRevealRef = (el) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="landing-page">
      <Navbar />
      
      {/* ===== HERO SECTION ===== */}
      <section className="landing-hero" aria-label="Hero section">
        <div className="landing-hero-overlay"></div>
        <div className="container">
          <div className="hero-content">
            <AshokaEmblem size={100} className="hero-emblem" />
            
            <div className="hero-badge reveal" ref={addRevealRef}>
              <Zap size={14} fill="currentColor" />
              Public Information Portal
            </div>

            <h1 className="hero-title reveal" ref={addRevealRef}>
              Centralized Civic Action,<br />
              <span className="gradient-text">Transparent Governance</span>
            </h1>

            <p className="hero-subtitle reveal" ref={addRevealRef}>
              Official portal for citizen grievance redressal and regional performance tracking across Andhra Pradesh and Telangana.
            </p>

            <div className="hero-actions reveal" ref={addRevealRef}>
              <Link to="/register" className="btn btn-saffron">
                File a Complaint
                <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="btn btn-outline">
                Check Progress
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PUBLIC DASHBOARD (Map, Leaderboard, Instructions) ===== */}
      <section className="public-dashboard-section">
        <div className="container">
           <PublicDashboard />
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer" role="contentinfo">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-column footer-about">
              <div className="footer-logo">
                <AshokaEmblem size={40} />
                <span className="footer-logo-text" style={{color: 'white'}}>GovernTogether</span>
              </div>
              <p style={{color: 'rgba(255,255,255,0.7)'}}>
                A Government of India digital initiative empowering every citizen to participate in transparent and collaborative governance. Building a Digital India, together.
              </p>
            </div>

            <div className="footer-column">
              <h4 style={{color: 'white'}}>Quick Links</h4>
              <ul className="footer-links">
                <li><Link to="/register" style={{color: 'rgba(255,255,255,0.7)'}}>Register Issue</Link></li>
                <li><Link to="/login" style={{color: 'rgba(255,255,255,0.7)'}}>Track Complaint</Link></li>
                <li><Link to="/features" style={{color: 'rgba(255,255,255,0.7)'}}>Platform Features</Link></li>
                <li><Link to="/faq" style={{color: 'rgba(255,255,255,0.7)'}}>FAQs</Link></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4 style={{color: 'white'}}>Contact Us</h4>
              <ul className="footer-links">
                <li style={{color: 'rgba(255,255,255,0.7)'}}><Mail size={16} style={{marginRight: 8}}/> support@governtogether.gov.in</li>
                <li style={{color: 'rgba(255,255,255,0.7)'}}><Phone size={16} style={{marginRight: 8}}/> 1800-111-555 (Toll Free)</li>
                <li style={{color: 'rgba(255,255,255,0.7)'}}><MapPin size={16} style={{marginRight: 8}}/> MeitY, New Delhi, India</li>
              </ul>
            </div>
          </div>

          <div style={{borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem'}}>
            <p>&copy; 2026 GovernTogether — Government of India. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
