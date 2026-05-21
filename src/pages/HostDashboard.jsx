import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import {
  ClipboardList, CheckCircle2, AlertTriangle,
  X, Loader2, Calendar, Tag, Flag, Star, Image, ShieldAlert
} from 'lucide-react';

export default function HostDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [newStatus, setNewStatus] = useState('Verified');
  const [remark, setRemark] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidencePreview, setEvidencePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Search & Filtering States
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchText, setSearchText] = useState('');

  // Timeline Expanded State
  const [expandedTimeline, setExpandedTimeline] = useState({}); // { [complaintId]: Array }

  useEffect(() => {
    fetchComplaints();
  }, [filterStatus, filterPriority, searchText]);

  const fetchComplaints = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchText) params.search = searchText;

      const res = await API.get('/complaints', { params });
      setComplaints(res.data);
    } catch {
      showToast('Failed to load complaints', 'error');
    } finally {
      setLoading(false);
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
      showToast('Failed to load status logs.', 'error');
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData();
    formData.append('status', newStatus);
    formData.append('remark', remark);

    if (newStatus === 'Assigned' || newStatus === 'In Progress') {
      formData.append('technician_name', technicianName);
    }
    if (newStatus === 'Resolved' && evidenceFile) {
      formData.append('evidence_image', evidenceFile);
    }

    try {
      await API.post(`/complaints/${selectedComplaint.id}/status`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('Status updated successfully!');
      setShowStatusModal(false);
      setRemark('');
      setTechnicianName('');
      setEvidenceFile(null);
      setEvidencePreview(null);
      fetchComplaints();
    } catch (err) {
      console.error(err);
      showToast('Failed to update status', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      'Submitted': 'badge-pending',
      'Pending Verification': 'badge-pending',
      'Verified': 'badge-progress',
      'Assigned': 'badge-progress',
      'In Progress': 'badge-progress',
      'Resolved': 'badge-resolved',
      'Closed': 'badge-resolved',
      'Rejected': 'badge-high',
      'Escalated': 'badge-high'
    };
    return `badge ${map[status] || 'badge-pending'}`;
  };

  const priorityBadge = (p) => {
    const map = { 'High': 'badge-high', 'Critical': 'badge-high', 'Medium': 'badge-medium', 'Low': 'badge-low' };
    return `badge ${map[p] || 'badge-medium'}`;
  };

  const stats = {
    total: complaints.length,
    pending: complaints.filter(c => ['Submitted', 'Pending Verification', 'Verified', 'Assigned'].includes(c.current_status)).length,
    resolved: complaints.filter(c => ['Resolved', 'Closed'].includes(c.current_status)).length,
  };

  return (
    <div className="page-wrapper">
      <div className="container dashboard">
        {toast && (
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        )}

        {/* Header */}
        <div className="dashboard-header animate-fade">
          <h1>Host Panel: {user?.name} 👋</h1>
          <p>Manage complaints assigned to your department.</p>
        </div>

        {/* Stats */}
        <div className="dashboard-stats">
          <div className="stat-card animate-slide-up">
            <div className="stat-icon purple"><ClipboardList size={24} /></div>
            <div className="stat-info">
              <h4>Total Department Complaints</h4>
              <div className="stat-number">{stats.total}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-1">
            <div className="stat-icon amber"><AlertTriangle size={24} /></div>
            <div className="stat-info">
              <h4>Pending Attention</h4>
              <div className="stat-number">{stats.pending}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-2">
            <div className="stat-icon green"><CheckCircle2 size={24} /></div>
            <div className="stat-info">
              <h4>Resolved</h4>
              <div className="stat-number">{stats.resolved}</div>
            </div>
          </div>
        </div>

        {/* Complaints Section */}
        <div className="dashboard-section-header" style={{ marginBottom: '16px' }}>
          <h2>Department Complaints</h2>
        </div>

        {/* Advanced Filters Deck */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', marginBottom: '24px', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '220px' }}>
            <input 
              type="text" 
              placeholder="Search complaints, addresses, details..."
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
            {(searchText || filterStatus || filterPriority) && (
              <button 
                className="btn btn-outline" 
                onClick={() => {
                  setSearchText('');
                  setFilterStatus('');
                  setFilterPriority('');
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
            <ClipboardList size={56} />
            <h3>No Complaints</h3>
            <p>There are no complaints assigned to your department right now.</p>
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
                      <span><Tag size={14} /> Citizen: {c.citizen_name}</span>
                      <span><Flag size={14} /> Village: {c.village_name}</span>
                      <span><Calendar size={14} /> {new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className={statusBadge(c.current_status)}>{c.current_status}</span>
                      <span className={priorityBadge(c.priority)}>{c.priority}</span>
                    </div>
                    {c.current_status !== 'Resolved' && c.current_status !== 'Closed' && c.current_status !== 'Rejected' && (
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '4px 12px', fontSize: '0.8rem', marginTop: '8px' }}
                        onClick={() => { setSelectedComplaint(c); setNewStatus('Verified'); setShowStatusModal(true); }}
                      >
                        Update Status / Assign
                      </button>
                    )}
                  </div>
                </div>
                <div className="complaint-desc">
                  {c.description}
                  {c.technician_name && (
                    <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      👷 <strong>Assigned Officer:</strong> {c.technician_name}
                    </div>
                  )}
                  {c.is_repeat === 1 && (
                    <div style={{ marginTop: '8px', color: 'var(--crimson)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      ⚠️ Repeated Issue Warning
                    </div>
                  )}
                  {c.is_flagged === 1 && (
                    <div style={{ marginTop: '8px', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldAlert size={14} /> AI Suspicion Flagged: {c.ai_flag_reason}
                    </div>
                  )}

                  {/* Timeline Toggle & Display */}
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                      onClick={() => fetchTimeline(c.id)}
                    >
                      ⏳ {expandedTimeline[c.id] ? 'Hide Audit Log' : 'View Audit Timeline'}
                    </button>
                  </div>

                  {expandedTimeline[c.id] && (
                    <div style={{ marginTop: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'left' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>📋 Administrative History & Audit Trail</h4>
                      {expandedTimeline[c.id].length === 0 ? (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>No audit events logged yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid #cbd5e1' }}>
                          {expandedTimeline[c.id].map((t, idx) => (
                            <div key={idx} style={{ position: 'relative' }}>
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

        {/* Status Update Modal */}
        {showStatusModal && selectedComplaint && (
          <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Update Complaint Workflow</h2>
                <button className="modal-close" onClick={() => setShowStatusModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleUpdateStatus}>
                <div className="form-group">
                  <p>Updating: <strong>{selectedComplaint.title}</strong></p>
                </div>
                <div className="form-group">
                  <label className="form-label">Workflow Transition Step</label>
                  <select
                    className="form-select"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="Verified">Verified (Approve Submission)</option>
                    <option value="Assigned">Assigned (Assign Technician)</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved (Complete & Submit Evidence)</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                {(newStatus === 'Assigned' || newStatus === 'In Progress') && (
                  <div className="form-group">
                    <label className="form-label">Technician / Officer Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="E.g., Officer G. Ramesh Babu"
                      value={technicianName}
                      onChange={(e) => setTechnicianName(e.target.value)}
                      required
                    />
                  </div>
                )}

                {newStatus === 'Resolved' && (
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Image size={16} /> Work Completion Evidence Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      className="form-input"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setEvidenceFile(file);
                          setEvidencePreview(URL.createObjectURL(file));
                        }
                      }}
                      required
                    />
                    {evidencePreview && (
                      <img 
                        src={evidencePreview} 
                        alt="Evidence Upload Preview" 
                        style={{ width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '8px', marginTop: '10px' }}
                      />
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Official Remark</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Add official details or instructions regarding this update..."
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={submitting}
                >
                  {submitting ? 'Processing Update...' : 'Confirm Update'}
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
