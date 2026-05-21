import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AshokaEmblem from '../components/AshokaEmblem';
import API from '../services/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [villages, setVillages] = useState([]);

  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedMandal, setSelectedMandal] = useState('');
  const [villageId, setVillageId] = useState('');
  
  const [otp, setOtp] = useState('');
  const [showOtpStep, setShowOtpStep] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await API.get('/locations/states');
        setStates(res.data);
      } catch (err) {
        console.error('Failed to fetch states');
      }
    };
    fetchStates();
  }, []);

  const handleStateChange = async (e) => {
    const stateId = e.target.value;
    setSelectedState(stateId);
    setSelectedDistrict('');
    setSelectedMandal('');
    setVillageId('');
    setDistricts([]);
    setMandals([]);
    setVillages([]);
    
    if (stateId) {
        try {
            const res = await API.get(`/locations/states/${stateId}/districts`);
            setDistricts(res.data);
        } catch (err) {
            console.error('Failed to fetch districts');
        }
    }
  };

  const handleDistrictChange = async (e) => {
    const districtId = e.target.value;
    setSelectedDistrict(districtId);
    setSelectedMandal('');
    setVillageId('');
    setMandals([]);
    setVillages([]);
    
    if (districtId) {
        try {
            const res = await API.get(`/locations/districts/${districtId}/mandals`);
            setMandals(res.data);
        } catch (err) {
            console.error('Failed to fetch mandals');
        }
    }
  };

  const handleMandalChange = async (e) => {
    const mandalId = e.target.value;
    setSelectedMandal(mandalId);
    setVillageId('');
    setVillages([]);
    
    if (mandalId) {
        try {
            const res = await API.get(`/locations/mandals/${mandalId}/villages`);
            setVillages(res.data);
        } catch (err) {
            console.error('Failed to fetch villages');
        }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!villageId) {
      setError('Please select a village');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/auth/register', { name, email, password, village_id: villageId });
      if (res.data.otp) {
          setSuccess(`Account created! OTP sent to email. [Testing Code: ${res.data.otp}]`);
      } else {
          setSuccess(`Account created! An OTP has been sent to your email.`);
      }
      if (res.data.previewUrl) {
          setPreviewUrl(res.data.previewUrl);
      }
      setShowOtpStep(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await API.post('/auth/verify-otp', { email, otp });
      setSuccess('Email verified successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="tricolor-bar" aria-hidden="true"></div>

      <div className="auth-card" style={{ maxWidth: '500px' }}>
        <div className="auth-header">
          <Link to="/" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} aria-label="GovernTogether Home">
            <AshokaEmblem size={56} />
          </Link>
          <h1>{showOtpStep ? 'Verify Your Account' : 'Create Your Account'}</h1>
          <p>{showOtpStep ? `Enter the 6-digit code sent to ${email}` : 'Join GovernTogether and shape your community'}</p>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9rem' }}>{success}</div>}

        {!showOtpStep ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="register-name">Full Name</label>
              <input id="register-name" type="text" className="form-input" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="register-email">Email Address</label>
              <input id="register-email" type="email" className="form-input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="register-password">Password</label>
              <input id="register-password" type="password" className="form-input" placeholder="Create a strong password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-state">State</label>
                  <select id="register-state" className="form-select" value={selectedState} onChange={handleStateChange} required>
                    <option value="" disabled>Select State</option>
                    {states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-district">District</label>
                  <select id="register-district" className="form-select" value={selectedDistrict} onChange={handleDistrictChange} required disabled={!selectedState}>
                    <option value="" disabled>Select District</option>
                    {districts.map(dist => <option key={dist.id} value={dist.id}>{dist.name}</option>)}
                  </select>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-mandal">Mandal / Sub-district</label>
                  <select id="register-mandal" className="form-select" value={selectedMandal} onChange={handleMandalChange} required disabled={!selectedDistrict}>
                    <option value="" disabled>Select Mandal</option>
                    {mandals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-village">Village / Ward</label>
                  <select id="register-village" className="form-select" value={villageId} onChange={(e) => setVillageId(e.target.value)} required disabled={!selectedMandal}>
                    <option value="" disabled>Select Village</option>
                    {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
            </div>

            <button type="submit" className="btn btn-saffron" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="form-label" htmlFor="register-otp">Verification Code</label>
              <input id="register-otp" type="text" className="form-input" placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '8px' }} />
            </div>
            
            {previewUrl && (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ color: 'var(--amber)', fontWeight: 'bold' }}>TESTING MODE:</span> No real SMTP configured.<br/>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>
                        Click here to view the email and get the OTP
                    </a>
                </div>
            )}

            <button type="submit" className="btn btn-saffron" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => setShowOtpStep(false)}>
              Back to Register
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
