import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Loader2, Calendar, Tag, User, Flag, Trophy, Shield, X, Eye, MapPin, Brain
} from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [analytics, setAnalytics] = useState({ complaints: { total: 0, pending: 0, resolved: 0 }, villages: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchText, setSearchText] = useState('');

  // Verification Modal State
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [expandedTimeline, setExpandedTimeline] = useState([]); // Timeline logs for the viewed modal
  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const STATUS_OPTIONS = ['Submitted', 'Pending Verification', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Rejected', 'Escalated'];

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterPriority, searchText]);

  const fetchData = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;
      if (searchText) params.search = searchText;

      const [compRes, anaRes] = await Promise.all([
        API.get('/complaints', { params }),
        API.get('/analytics'),
      ]);
      setComplaints(compRes.data);
      setAnalytics(anaRes.data);
    } catch {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filteredComplaints = complaints;

  const runAiAnalysis = async (id) => {
    setAnalyzing(true);
    setAiResult(null);
    try {
      const res = await API.post(`/complaints/${id}/analyze`);
      setAiResult(res.data);
    } catch (err) {
      showToast('AI Analysis failed.', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const fetchTimeline = async (complaintId) => {
    try {
      const res = await API.get(`/complaints/${complaintId}/timeline`);
      setExpandedTimeline(res.data);
    } catch (err) {
      showToast('Failed to load status logs.', 'error');
    }
  };

  const handleStatusUpdate = async (id, status) => {
    setActionLoading(true);
    try {
      await API.post(`/complaints/${id}/status`, { status, remark: 'Verified by Admin' });
      showToast(`Complaint marked as ${status}`);
      setSelectedComplaint(null);
      fetchData();
    } catch (err) {
      showToast('Failed to update status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const exportPDFReport = async () => {
    try {
      showToast('Compiling executive tricolor admin report...');
      const res = await API.get('/admin/reports/export-pdf');
      const printWindow = window.open('', '_blank');
      printWindow.document.write(res.data);
      printWindow.document.close();
    } catch (err) {
      showToast('Failed to export PDF report.', 'error');
    }
  };

  const statusBadge = (status) => {
    const map = {
      'Pending Verification': 'badge-pending',
      'Verified': 'badge-progress',
      'In Progress': 'badge-progress',
      'Resolved': 'badge-resolved',
      'Fake': 'badge-high',
      'Invalid': 'badge-high',
    };
    return `badge ${map[status] || 'badge-pending'}`;
  };

  const priorityBadge = (p) => {
    const map = { 'High': 'badge-high', 'Critical': 'badge-high', 'Medium': 'badge-medium', 'Low': 'badge-low' };
    return `badge ${map[p] || 'badge-medium'}`;
  };

  const getScoreColor = (score) => {
    if (score >= 90) return '#10b981';
    if (score >= 75) return '#f59e0b';
    if (score >= 60) return '#f97316';
    return '#ef4444';
  };

  return (
    <div className="page-wrapper">
      <div className="container dashboard">
        {toast && (
          <div className={`toast toast-${toast.type}`}>{toast.message}</div>
        )}

        {/* Header */}
        <div className="dashboard-header animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1>Admin Dashboard 🏛️</h1>
            <p>Monitor governance performance across all villages and departments.</p>
          </div>
          <button 
            onClick={exportPDFReport}
            className="btn" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '10px 18px', 
              fontWeight: 'bold', 
              background: '#FF9933', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(255, 153, 51, 0.2)',
              transition: 'all 0.2s'
            }}
          >
            📄 Export PDF Report
          </button>
        </div>

        {/* Overview Stats */}
        <div className="dashboard-stats" style={{ marginBottom: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="stat-card animate-slide-up">
            <div className="stat-icon purple"><ClipboardList size={24} /></div>
            <div className="stat-info">
              <h4>Total Complaints</h4>
              <div className="stat-number">{analytics.complaints?.total || 0}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-1">
            <div className="stat-icon amber"><Clock size={24} /></div>
            <div className="stat-info">
              <h4>Active Issues</h4>
              <div className="stat-number">{analytics.complaints?.active || 0}</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-2">
            <div className="stat-icon green"><CheckCircle2 size={24} /></div>
            <div className="stat-info">
              <h4>Resolution Rate</h4>
              <div className="stat-number">{analytics.complaints?.resolved_percent || 0}%</div>
            </div>
          </div>
          <div className="stat-card animate-slide-up-delay-3">
            <div className="stat-icon blue"><Calendar size={24} /></div>
            <div className="stat-info">
              <h4>Avg Resolution Time</h4>
              <div className="stat-number">{analytics.avg_resolution_hours || 24}h</div>
            </div>
          </div>
        </div>

        {/* Exquisite Responsive Analytical Charts Deck */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          {/* Department Complaint Load Chart */}
          <div className="card" style={{ padding: '20px', background: 'white' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', color: 'var(--text-primary)' }}>
              <ClipboardList size={20} color="var(--primary-500)" /> Department Complaint Load
            </h3>
            {analytics.department_load && analytics.department_load.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {analytics.department_load.map((dept, idx) => {
                  const maxCount = Math.max(...analytics.department_load.map(d => d.count)) || 1;
                  const percent = Math.round((dept.count / maxCount) * 100);
                  const colors = ['#0b3c5d', '#328cc1', '#10b981', '#f59e0b', '#ef4444', '#7c3aed'];
                  const currentColor = colors[idx % colors.length];
                  return (
                    <div key={dept.name} style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{dept.name}</span>
                        <span style={{ color: currentColor }}>{dept.count} cases</span>
                      </div>
                      <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${percent}%`, height: '100%', background: currentColor, borderRadius: '4px', transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'left' }}>No department loading parameters initialized.</p>
            )}
          </div>

          {/* Daily Trends Line Chart */}
          <div className="card" style={{ padding: '20px', background: 'white' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', color: 'var(--text-primary)' }}>
              <Calendar size={20} color="var(--primary-500)" /> Daily Complaint Trends
            </h3>
            {analytics.trends && analytics.trends.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '10px 0' }}>
                <svg viewBox="0 0 500 200" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="70" x2="480" y2="70" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="120" x2="480" y2="120" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="40" y1="170" x2="480" y2="170" stroke="#cbd5e1" strokeWidth="2" />
                  
                  {/* Line Chart Draw */}
                  {(() => {
                    const maxVal = Math.max(...analytics.trends.map(t => t.count), 5) || 5;
                    const points = analytics.trends.map((t, idx) => {
                      const x = 40 + (idx * (440 / (analytics.trends.length - 1 || 1)));
                      const y = 170 - ((t.count / maxVal) * 150);
                      return { x, y, label: t.day.substring(5), val: t.count };
                    });

                    const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                    return (
                      <g>
                        {/* Shaded Area Chart */}
                        <path 
                          d={`${pathD} L ${points[points.length - 1].x} 170 L ${points[0].x} 170 Z`} 
                          fill="rgba(11, 60, 93, 0.1)" 
                        />
                        {/* Main Trend Line */}
                        <path 
                          d={pathD} 
                          fill="none" 
                          stroke="var(--primary-500)" 
                          strokeWidth="3" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                        />
                        {/* Points */}
                        {points.map((p, idx) => (
                          <g key={idx}>
                            <circle 
                              cx={p.x} 
                              cy={p.y} 
                              r="5" 
                              fill="white" 
                              stroke="var(--primary-500)" 
                              strokeWidth="2" 
                            />
                            {/* Value label */}
                            <text 
                              x={p.x} 
                              y={p.y - 10} 
                              fontSize="9" 
                              fontWeight="bold" 
                              textAnchor="middle" 
                              fill="var(--text-primary)"
                            >
                              {p.val}
                            </text>
                            {/* Date X Label */}
                            <text 
                              x={p.x} 
                              y="188" 
                              fontSize="8" 
                              fill="var(--text-secondary)" 
                              textAnchor="middle"
                            >
                              {p.label}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No active complaints filed in the past 7 days.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Village Performance Scoring */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-header" style={{ background: 'var(--card-bg)' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Trophy size={20} color="var(--amber)" /> Governance Efficiency Index Across Villages</h3>
            </div>
            {loading ? (
              <div className="empty-state"><Loader2 size={30} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : (
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                  {analytics.villages?.map((v, i) => (
                    <div key={v.name} style={{ 
                      padding: '16px', 
                      borderRadius: '12px', 
                      border: `2px solid ${getScoreColor(v.governance_index)}40`,
                      background: `linear-gradient(to bottom right, ${getScoreColor(v.governance_index)}10, transparent)`
                    }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>{v.name}</h4>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '2rem', fontWeight: '800', color: getScoreColor(v.governance_index) }}>
                          {v.governance_index}
                        </span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ 100 points</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                        {v.governance_index >= 90 ? 'Excellent Governance' : v.governance_index >= 75 ? 'Good Governance' : v.governance_index >= 60 ? 'Needs Improvement' : 'Critical Attention Required'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Complaints Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch', background: 'var(--card-bg)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Shield size={20} /> Complaint Registry ({filteredComplaints.length})</h3>
            
            {/* Advanced Filters Deck */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <input 
                  type="text" 
                  placeholder="Search citizen, department, title, details..."
                  value={searchText} 
                  onChange={(e) => setSearchText(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)} 
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.85rem', background: 'white', color: 'var(--text-primary)' }}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select 
                value={filterPriority} 
                onChange={(e) => setFilterPriority(e.target.value)} 
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.85rem', background: 'white', color: 'var(--text-primary)' }}
              >
                <option value="">All Priorities</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
              {(searchText || filterStatus || filterPriority) && (
                <button 
                  className="btn btn-sm btn-outline" 
                  onClick={() => {
                    setSearchText('');
                    setFilterStatus('');
                    setFilterPriority('');
                  }}
                  style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <Loader2 size={40} style={{ animation: 'spin 1s linear infinite' }} />
              <p>Loading complaints...</p>
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={56} />
              <h3>No Complaints Found</h3>
              <p>There are no complaints matching this filter.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Citizen</th>
                    <th>Village</th>
                    <th>Department</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComplaints.map((c, i) => (
                    <tr key={c.id} style={{ animation: `slideUp 300ms ${i * 50}ms both` }}>
                      <td style={{ fontWeight: 600, color: 'var(--primary-400)' }}>#{c.id}</td>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 200 }}>
                        {c.title}
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={14} /> {c.citizen_name}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Flag size={14} /> {c.village_name}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Tag size={14} /> {c.department_name}
                        </span>
                      </td>
                      <td><span className={priorityBadge(c.priority)}>{c.priority}</span></td>
                      <td><span className={statusBadge(c.current_status)}>{c.current_status}</span></td>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={14} /> {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                         <button className="btn btn-sm btn-outline" onClick={() => { setSelectedComplaint(c); setAiResult(null); setExpandedTimeline([]); fetchTimeline(c.id); }}>
                             <Eye size={14} /> View
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verification Modal */}
        {selectedComplaint && (
          <div className="modal-overlay" onClick={() => setSelectedComplaint(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2>Complaint #{selectedComplaint.id} Details</h2>
                <button className="modal-close" onClick={() => setSelectedComplaint(null)}>
                  <X size={18} />
                </button>
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                  <h3>{selectedComplaint.title}</h3>
                  <p style={{ color: 'var(--text-muted)' }}>{selectedComplaint.description}</p>
              </div>
              
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={16} color="var(--primary-500)" />
                      <strong>Address:</strong> {selectedComplaint.address}
                  </div>
                  {selectedComplaint.lat && selectedComplaint.lng && (
                      <div style={{ marginLeft: '24px' }}>
                          <a href={`https://maps.google.com/?q=${selectedComplaint.lat},${selectedComplaint.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-600)', textDecoration: 'underline' }}>
                              📍 View Exact GPS Location on Maps
                          </a>
                      </div>
                  )}
              </div>

              {selectedComplaint.file_url && (
                  <div style={{ marginBottom: '16px' }}>
                      <img src={`http://localhost:5000${selectedComplaint.file_url}`} alt="Evidence" style={{ width: '100%', borderRadius: '8px', maxHeight: '300px', objectFit: 'contain', background: '#000' }} />
                  </div>
              )}

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Brain size={18} color="var(--purple)" /> AI Vision Verification</h4>
                      <button className="btn btn-sm btn-outline" onClick={() => runAiAnalysis(selectedComplaint.id)} disabled={analyzing}>
                          {analyzing ? 'Analyzing...' : 'Run Analysis'}
                      </button>
                  </div>
                  {aiResult ? (
                      <div style={{ background: aiResult.isVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', color: aiResult.isVerified ? '#047857' : '#b91c1c' }}>
                          <strong>{aiResult.isVerified ? '✅ AI Verified' : '❌ AI Rejected'}</strong>
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>{aiResult.reason}</p>
                      </div>
                  ) : (
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Click run analysis to cross-check the image against the description.</p>
                  )}
              </div>
              {/* Historical Timeline Stepper */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px', textAlign: 'left' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>📋 Administrative History & Audit Trail</h4>
                  {expandedTimeline.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No audit events logged yet.</p>
                  ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid #cbd5e1' }}>
                          {expandedTimeline.map((t, idx) => (
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
              {selectedComplaint.current_status === 'Pending Verification' && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleStatusUpdate(selectedComplaint.id, 'In Progress')} disabled={actionLoading}>
                          ✅ Verify & Move to In Progress
                      </button>
                      <button className="btn btn-secondary" style={{ flex: 1, background: 'var(--red)', color: 'white' }} onClick={() => handleStatusUpdate(selectedComplaint.id, 'Fake')} disabled={actionLoading}>
                          ❌ Mark as Fake
                      </button>
                  </div>
              )}
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
