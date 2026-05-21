import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AshokaEmblem from '../components/AshokaEmblem';
import API from '../services/api';

export default function LoginPage() {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { email, password });
      login(res.data.user, res.data.token);
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.requiresVerification) {
        setError('Your account is not verified. Please check your console for the OTP and use the Register page to verify.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      const res = await API.post('/auth/forgot-password', { email });
      if (res.data.otp) {
        setSuccessMessage(`Reset code sent! [Testing Code: ${res.data.otp}]`);
      } else {
        setSuccessMessage('A reset code has been sent to your email.');
      }
      setView('reset');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    try {
      await API.post('/auth/reset-password', { email, otp: resetOtp, newPassword });
      setSuccessMessage('Password reset successful! You can now log in.');
      setView('login');
      setPassword('');
      setResetOtp('');
      setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Tricolor bar at very top */}
      <div className="tricolor-bar" aria-hidden="true"></div>

      <div className="auth-card">
        <div className="auth-header">
          <Link to="/" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} aria-label="GovernTogether Home">
            <AshokaEmblem size={56} />
          </Link>
          
          {view === 'login' && (
            <>
              <h1>Welcome Back</h1>
              <p>Sign in to GovernTogether to continue</p>
            </>
          )}
          
          {view === 'forgot' && (
            <>
              <h1>Reset Password</h1>
              <p>Enter your email to request a reset code</p>
            </>
          )}
          
          {view === 'reset' && (
            <>
              <h1>Choose New Password</h1>
              <p>Enter your reset code and dynamic new password</p>
            </>
          )}
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {successMessage && <div className="auth-success" role="alert" style={{ background: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 500 }}>{successMessage}</div>}

        {view === 'login' && (
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-12px', marginBottom: '16px' }}>
              <button 
                type="button" 
                onClick={() => { setView('forgot'); setError(''); setSuccessMessage(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-saffron"
              style={{ width: '100%' }}
              disabled={loading}
              id="login-submit"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotPasswordSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email">Email Address</label>
              <input
                id="forgot-email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <button
              type="submit"
              className="btn btn-saffron"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Sending code...' : 'Request Reset OTP'}
            </button>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <button 
                type="button" 
                onClick={() => { setView('login'); setError(''); setSuccessMessage(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleResetPasswordSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-otp">Verification Code</label>
              <input
                id="reset-otp"
                type="text"
                className="form-input"
                placeholder="6-digit code"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value)}
                required
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '4px' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reset-password">New Password</label>
              <input
                id="reset-password"
                type="password"
                className="form-input"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              className="btn btn-saffron"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Reset Password'}
            </button>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <button 
                type="button" 
                onClick={() => { setView('login'); setError(''); setSuccessMessage(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Back to Login
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  );
}
