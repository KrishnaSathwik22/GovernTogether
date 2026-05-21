import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Plus, X, Loader2, Calendar, Tag, Flag, FileText, Star, Trophy,
  Upload, Camera, Bell
} from 'lucide-react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import 'swiper/css';

export default function CitizenDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [myVillage, setMyVillage] = useState(null);
  
  const [showModal, setShowModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  // In-App Notifications State
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reopenComplaint, setReopenComplaint] = useState(null);
  const [reopenRemarks, setReopenRemarks] = useState('');

  // Search & Filtering States
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [searchText, setSearchText] = useState('');

  // Timeline & Upvote Support States
  const [expandedTimeline, setExpandedTimeline] = useState({}); // { [complaintId]: Array }
  const [duplicateComplaint, setDuplicateComplaint] = useState(null);

  // Feedback state
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterPriority, filterDept, searchText]);

  const fetchData = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (filterDept) params.department_id = filterDept;
      if (searchText) params.search = searchText;

      const [compRes, deptRes, vilRes, notifRes] = await Promise.all([
        API.get('/complaints', { params }),
        API.get('/departments'),
        API.get(`/villages/${user.village_id}`),
        API.get('/notifications')
      ]);
      setComplaints(compRes.data);
      setDepartments(deptRes.data);
      setMyVillage(vilRes.data);
      setNotifications(notifRes.data);
    } catch (err) {
      console.error(err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notifId) => {
    try {
      await API.post(`/notifications/${notifId}/read`);
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          setLat(latitude);
          setLng(longitude);
          showToast('GPS coordinates locked in!');

          // Dynamic Reverse Geocoding via OpenStreetMap Nominatim API
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
            if (response.ok) {
              const data = await response.json();
              if (data.display_name) {
                setAddress(data.display_name);
                showToast('GIS Address resolved successfully!');
              }
            }
          } catch (err) {
            console.error("OSM Nominatim reverse geocoding failed:", err);
          }
        },
        (error) => {
          showToast('Failed to get location. Please type the address manually.', 'error');
        }
      );
    } else {
      showToast('Geolocation is not supported by this browser.', 'error');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('department_id', departmentId);
    if (subcategory) formData.append('subcategory', subcategory);
    formData.append('address', address);
    if (lat) formData.append('lat', lat);
    if (lng) formData.append('lng', lng);
    
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
      // Must use multipart/form-data for file upload
      const res = await API.post('/complaints', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('Complaint registered and pending verification!');
      setShowModal(false);
      setTitle('');
      setDescription('');
      setDepartmentId('');
      setSubcategory('');
      setAddress('');
      setLat(null);
      setLng(null);
      setImageFile(null);
      setImagePreview(null);
      fetchData(); // Refresh data
    } catch (err) {
      if (err.response?.status === 409) {
          setDuplicateComplaint({
              id: err.response.data.duplicateId,
              title: err.response.data.duplicateTitle
          });
          showToast('Duplicate matching complaint found in your village!', 'info');
      } else if (err.response?.data?.isFake) {
          showToast(`Rejected: ${err.response.data.reason}`, 'error');
      } else {
          showToast(err.response?.data?.error || 'Failed to register complaint', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fetchTimeline = async (complaintId) => {
    if (expandedTimeline[complaintId]) {
      setExpandedTimeline(prev => {
        const next = { ...prev };
        delete next[complaintId];
        return next;
      });
      return;
    }
    try {
      const res = await API.get(`/complaints/${complaintId}/timeline`);
      setExpandedTimeline(prev => ({ ...prev, [complaintId]: res.data }));
    } catch (err) {
      showToast('Failed to load status audit log.', 'error');
    }
  };

  const handleSupport = async (complaintId) => {
    try {
      const res = await API.post(`/complaints/${complaintId}/support`);
      showToast(res.data.message || 'Thank you for supporting this issue!');
      setDuplicateComplaint(null);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to support complaint.', 'error');
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await API.post(`/complaints/${selectedComplaint.id}/feedback`, { rating, comment });
      showToast('Feedback submitted successfully!');
      setShowFeedbackModal(false);
      fetchData(); // Refresh data to update score
    } catch (err) {
      showToast('Failed to submit feedback. You may have already submitted it.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      'Submitted': 'badge-pending',
      'Pending': 'badge-pending',
      'Pending Verification': 'badge-pending',
      'Verified': 'badge-progress',
      'Assigned': 'badge-progress',
      'In Progress': 'badge-progress',
      'Resolved': 'badge-resolved',
      'Closed': 'badge-resolved',
      'Rejected': 'badge-high',
      'Escalated': 'badge-high',
      'Fake': 'badge-high',
      'Invalid': 'badge-high'
    };
    return `badge ${map[status] || 'badge-pending'}`;
  };

  const priorityBadge = (p) => {
    const map = { 'High': 'badge-high', 'Medium': 'badge-medium', 'Low': 'badge-low' };
    return `badge ${map[p] || 'badge-medium'}`;
  };

  const getScoreColor = (score) => {
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#f59e0b';
    if (score >= 60) return '#f97316';
    return '#ef4444';
  };

  const stats = {
    total: complaints.length,
    pending: complaints.filter(c => ['Submitted', 'Pending', 'Pending Verification', 'Verified', 'Assigned'].includes(c.current_status)).length,
    inProgress: complaints.filter(c => ['In Progress', 'Escalated'].includes(c.current_status)).length,
    resolved: complaints.filter(c => ['Resolved', 'Closed'].includes(c.current_status)).length,
  };

  return (
    <div className="page-wrapper">
      <div className="container dashboard">
        {toast && (
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        )}

        {/* Header */}
        <div className="dashboard-header animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Welcome, {user?.name} 👋</h1>
            <p>Track your complaints and make your community better.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {/* In-App Notifications Tray */}
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-outline" 
                style={{ padding: '10px', borderRadius: '50%', minWidth: '40px', position: 'relative', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={18} />
                {notifications.filter(n => n.is_read === 0).length > 0 && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--crimson)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {notifications.filter(n => n.is_read === 0).length}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div style={{ position: 'absolute', right: 0, top: '48px', width: '320px', background: 'white', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', zIndex: 1000, padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>🔔 In-App Alerts</h4>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => setShowNotifications(false)}>Close</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '12px' }}>No new notifications.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => markAsRead(n.id)}
                          style={{ 
                            padding: '10px', 
                            borderRadius: '8px', 
                            background: n.is_read === 0 ? 'rgba(11, 60, 93, 0.05)' : '#f8fafc',
                            borderLeft: n.is_read === 0 ? '4px solid var(--primary-500)' : '4px solid #cbd5e1',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{n.title}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{n.message}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>{new Date(n.created_at).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {myVillage && (
              <div style={{ textAlign: 'right', background: 'white', padding: '12px 24px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trophy size={16} color={getScoreColor(myVillage.governance_index)} />
                  {myVillage.name} Governance Efficiency Index
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: getScoreColor(myVillage.governance_index) }}>
                  {myVillage.governance_index} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 100</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="dashboard-stats">
          <div className="stat-card animate-slide-up">
            <div className="stat-icon purple"><ClipboardList size={24} /></div>
            <div className="stat-info">
              <h4>Total Complaints</h4>
              <div className="stat-number">{stats.total}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-1">
            <div className="stat-icon amber"><Clock size={24} /></div>
            <div className="stat-info">
              <h4>Pending</h4>
              <div className="stat-number">{stats.pending}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-2">
            <div className="stat-icon blue"><AlertTriangle size={24} /></div>
            <div className="stat-info">
              <h4>In Progress</h4>
              <div className="stat-number">{stats.inProgress}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-3">
            <div className="stat-icon green"><CheckCircle2 size={24} /></div>
            <div className="stat-info">
              <h4>Resolved</h4>
              <div className="stat-number">{stats.resolved}</div>
            </div>
          </div>
        </div>

        {/* Complaints Section */}
        <div className="dashboard-section-header" style={{ marginBottom: '16px' }}>
          <h2>Your Complaints</h2>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> New Complaint
          </button>
        </div>

        {/* Advanced Filters Deck */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '24px', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <input 
              type="text" 
              placeholder="Search by keywords, title, address..."
              value={searchText} 
              onChange={(e) => setSearchText(e.target.value)} 
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'white', color: 'var(--text-primary)' }}
            >
              <option value="">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="AI Review Pending">AI Review Pending</option>
              <option value="Verified">Verified</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
              <option value="Rejected">Rejected</option>
              <option value="Escalated">Escalated</option>
            </select>
            <select 
              value={filterPriority} 
              onChange={(e) => setFilterPriority(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'white', color: 'var(--text-primary)' }}
            >
              <option value="">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <select 
              value={filterDept} 
              onChange={(e) => setFilterDept(e.target.value)} 
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'white', color: 'var(--text-primary)' }}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {(searchText || filterStatus || filterPriority || filterDept) && (
              <button 
                className="btn btn-outline" 
                onClick={() => {
                  setSearchText('');
                  setFilterStatus('');
                  setFilterPriority('');
                  setFilterDept('');
                }}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} />
            <p>Loading complaints...</p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="empty-state">
            <FileText size={56} />
            <h3>No Complaints Yet</h3>
            <p>You haven't filed any complaints. Click "New Complaint" to report an issue in your community.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={18} /> File Your First Complaint
            </button>
          </div>
        ) : (
          <div className="complaint-list">
            {complaints.map((c, i) => (
              <div
                className="complaint-card"
                key={c.id}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="complaint-card-top">
                  <div>
                    <h3>{c.title}</h3>
                    <div className="complaint-meta">
                      <span><Tag size={14} /> {c.department_name}</span>
                      <span><Calendar size={14} /> {new Date(c.created_at).toLocaleDateString()}</span>
                      <span style={{ background: 'rgba(11, 60, 93, 0.08)', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: 'var(--primary-700)' }}>
                         👍 {c.support_count || 1} Support(s)
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <span className={statusBadge(c.current_status)}>{c.current_status}</span>
                        <span className={priorityBadge(c.priority)}>{c.priority}</span>
                    </div>
                    {c.current_status === 'Resolved' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={async () => {
                            try {
                              await API.post(`/complaints/${c.id}/status`, { status: 'Closed', remark: 'Citizen accepted resolution.' });
                              showToast('Resolution accepted and complaint closed!');
                              setLoading(true);
                              const res = await API.get('/complaints');
                              setComplaints(res.data);
                              setLoading(false);
                            } catch (err) {
                              showToast('Failed to close complaint.', 'error');
                            }
                          }}
                        >
                          Accept & Close
                        </button>
                        <button 
                          className="btn btn-crimson" 
                          style={{ padding: '4px 12px', fontSize: '0.8rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          onClick={() => { setReopenComplaint(c); setReopenRemarks(''); }}
                        >
                          Reopen Issue
                        </button>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={() => { setSelectedComplaint(c); setShowFeedbackModal(true); }}
                        >
                          <Star size={12} style={{ marginRight: '4px' }}/> Provide Feedback
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="complaint-desc">
                  {c.description}
                  
                  {/* Before / After Evidence Comparison Slider Block */}
                  {(c.file_url || c.resolution_image) && (
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', textAlign: 'left' }}>📸 Before (Citizen Upload)</div>
                        {c.file_url ? (
                          <img 
                            src={c.file_url.startsWith('http') ? c.file_url : `http://localhost:5000${c.file_url}`} 
                            alt="Before issue proof" 
                            style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                          />
                        ) : (
                          <div style={{ height: '140px', background: '#e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b' }}>No before image</div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', textAlign: 'left' }}>✨ After (Host Evidence)</div>
                        {c.resolution_image ? (
                          <img 
                            src={c.resolution_image.startsWith('http') ? c.resolution_image : `http://localhost:5000${c.resolution_image}`} 
                            alt="After completion proof" 
                            style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                          />
                        ) : (
                          <div style={{ height: '140px', background: '#e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>Pending host work...</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Evidence Cryptographic Metadata Verification Panel */}
                  {c.resolution_image_metadata && (
                    <div style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        🛡️ Resolution Cryptographic Verification Ledgers
                      </div>
                      {(() => {
                        try {
                          const meta = JSON.parse(c.resolution_image_metadata);
                          return (
                            <div style={{ fontSize: '0.75rem', color: '#047857', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                              <div><strong>Validated Timestamp:</strong> {new Date(meta.verified_at).toLocaleString()}</div>
                              <div><strong>Image File Size:</strong> {meta.file_size_kb} KB</div>
                              <div><strong>Image MIME Type:</strong> {meta.mime_type}</div>
                              <div><strong>AI Similarity Score:</strong> {meta.ai_similarity_score}</div>
                              <div style={{ gridColumn: 'span 2', marginTop: '4px', borderTop: '1px dashed rgba(16, 185, 129, 0.2)', paddingTop: '4px' }}>
                                <strong>Blockchain Ledger Hash:</strong> <code style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{meta.blockchain_hash}</code>
                              </div>
                            </div>
                          );
                        } catch (e) {
                          return <div style={{ fontSize: '0.75rem', color: 'red' }}>Metadata parsing error.</div>;
                        }
                      })()}
                    </div>
                  )}

                  {/* Audit Timeline Stepper Button */}
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      onClick={() => fetchTimeline(c.id)}
                    >
                      ⏳ {expandedTimeline[c.id] ? 'Hide Audit Log' : 'View Audit Timeline'}
                    </button>
                    {c.assigned_to && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                         👷 Technician: <strong>{c.assigned_to}</strong>
                      </span>
                    )}
                  </div>

                  {/* Vertical Stepper Log Display */}
                  {expandedTimeline[c.id] && (
                    <div style={{ marginTop: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'left' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>📋 Administrative History & Audit Trail</h4>
                      {expandedTimeline[c.id].length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No audit events logged yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid #cbd5e1' }}>
                          {expandedTimeline[c.id].map((t, idx) => (
                            <div key={idx} style={{ position: 'relative' }}>
                              {/* Stepper Dot */}
                              <div style={{ position: 'absolute', left: '-27px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: t.status === 'Escalated' ? 'var(--crimson)' : 'var(--primary-500)', border: '2px solid white', boxShadow: '0 0 4px rgba(0,0,0,0.1)' }}></div>
                              <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{t.status}</span>
                                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', textTransform: 'uppercase', color: '#475569', fontWeight: 'bold' }}>{t.updated_by_role}</span>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.remark}</div>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>{new Date(t.created_at).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Duplicate Complaint Support Overlay */}
        {duplicateComplaint && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal" style={{ maxWidth: '480px', padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚨</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>Matching Active Issue Found</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
                A similar issue titled <strong>"{duplicateComplaint.title}"</strong> has already been reported in your village. 
                Instead of creating a duplicate ticket, you can support/upvote this active complaint to raise its priority and community impact!
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleSupport(duplicateComplaint.id)}
                  style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  👍 Support Active Issue
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={() => setDuplicateComplaint(null)}
                  style={{ padding: '10px 20px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Complaint Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Register New Complaint</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Brief title of the issue"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select
                    className="form-select"
                    value={departmentId}
                    onChange={(e) => {
                      setDepartmentId(e.target.value);
                      setSubcategory(''); // Reset subcategory when department shifts
                    }}
                    required
                  >
                    <option value="" disabled>Select a Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name} (Penalty: -{dept.base_deduction})</option>
                    ))}
                  </select>
                </div>
                {(() => {
                  const deptObj = departments.find(d => Number(d.id) === Number(departmentId));
                  if (deptObj && deptObj.subcategories && deptObj.subcategories.length > 0) {
                    return (
                      <div className="form-group animate-fade">
                        <label className="form-label">Complaint Subcategory</label>
                        <select
                          className="form-select"
                          value={subcategory}
                          onChange={(e) => setSubcategory(e.target.value)}
                          required
                        >
                          <option value="" disabled>Select a Subcategory</option>
                          {deptObj.subcategories.map(sub => (
                            <option key={sub} value={sub}>{sub.replace('_', ' ').toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="form-group">
                  <label className="form-label">Street Name / Landmark</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Near City Hospital, MG Road"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                  <button type="button" className="btn btn-outline" style={{ marginTop: '8px', width: '100%', fontSize: '0.9rem', padding: '8px' }} onClick={getLocation}>
                    {lat && lng ? '✅ Location Captured' : '📍 Use Current GPS Location'}
                  </button>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe the issue in detail..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Upload Image</label>
                  <div className="premium-file-upload">
                    <input
                      type="file"
                      id="complaint-image"
                      accept="image/*"
                      onChange={handleImageChange}
                      required
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="complaint-image" className="upload-dropzone">
                      {imagePreview ? (
                        <div className="upload-preview-container">
                          <img src={imagePreview} alt="Selected preview" className="upload-preview" />
                          <div className="upload-change-overlay">
                            <Camera size={24} />
                            <span>Change Image</span>
                          </div>
                        </div>
                      ) : (
                        <div className="upload-placeholder">
                          <Upload size={32} className="upload-icon" />
                          <h4>Click to Select Image</h4>
                          <p>PNG, JPG or WEBP (Max 5MB)</p>
                        </div>
                      )}
                    </label>
                  </div>
                  <small className="form-help-text">An image is strictly required for verification.</small>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Complaint'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Feedback Modal */}
        {showFeedbackModal && selectedComplaint && (
          <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Provide Feedback</h2>
                <button className="modal-close" onClick={() => setShowFeedbackModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleFeedbackSubmit}>
                <div className="form-group">
                  <p>How satisfied are you with the resolution of: <strong>{selectedComplaint.title}</strong>?</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Rating (1-5)</label>
                  <input
                    type="range"
                    min="1" max="5"
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '8px' }}>
                    {rating} Stars
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Comments (Optional)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Any additional feedback..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Reopen Complaint Modal */}
        {reopenComplaint && (
          <div className="modal-overlay" onClick={() => setReopenComplaint(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Reopen Complaint #{reopenComplaint.id}</h2>
                <button className="modal-close" onClick={() => setReopenComplaint(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!reopenRemarks.trim()) return showToast('Reopen remarks are required.', 'error');
                setSubmitting(true);
                try {
                  await API.post(`/complaints/${reopenComplaint.id}/status`, { 
                    status: 'In Progress', 
                    remark: reopenRemarks 
                  });
                  showToast('Complaint successfully reopened for departmental review!');
                  setReopenComplaint(null);
                  setReopenRemarks('');
                  setLoading(true);
                  const res = await API.get('/complaints');
                  setComplaints(res.data);
                  setLoading(false);
                } catch (err) {
                  showToast('Failed to reopen complaint.', 'error');
                } finally {
                  setSubmitting(false);
                }
              }}>
                <div className="form-group">
                  <p>Provide reasons explaining why the municipal resolution was incomplete or invalid:</p>
                  <textarea
                    className="form-textarea"
                    placeholder="Enter details explaining why this issue should be reopened..."
                    value={reopenRemarks}
                    onChange={(e) => setReopenRemarks(e.target.value)}
                    required
                    style={{ minHeight: '120px' }}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', background: '#dc2626' }}
                  disabled={submitting}
                >
                  {submitting ? 'Processing Reopen...' : 'Confirm Reopen'}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
