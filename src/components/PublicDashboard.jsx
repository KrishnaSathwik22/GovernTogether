import React, { useEffect, useState, useRef } from 'react';
import API from '../services/api';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';

const DISTRICT_COORDS = {
  'Hyderabad': [17.3850, 78.4867],
  'Ranga Reddy': [17.1812, 78.4720],
  'Visakhapatnam': [17.6868, 83.2185],
  'Anantapur': [14.6819, 77.6006]
};

export default function PublicDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    const fetchStats = () => {
      API.get('/public/analytics')
        .then(res => {
          setAnalytics(res.data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to load public analytics", err);
          setLoading(false);
        });
    };

    fetchStats();

    // 15-second polling interval for live updates
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (loading || !analytics || !mapContainerRef.current) return;

    // Clear previous Leaflet instance if present
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      // Initialize Leaflet Map centered between Telangana & Andhra Pradesh
      const map = L.map(mapContainerRef.current, {
        center: [16.8, 80.0],
        zoom: 7,
        zoomControl: true,
        scrollWheelZoom: false
      });
      mapInstanceRef.current = map;

      // Add slick dark cartodb tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      // Render district performance markers
      analytics.district_scores?.forEach(district => {
        // Use exact coordinates or seed nearby spreads
        const coords = DISTRICT_COORDS[district.district_name] || [
          16.5 + (Math.random() - 0.5) * 1.5,
          79.5 + (Math.random() - 0.5) * 1.5
        ];
        
        const score = Number(district.avg_score) || 100.0;
        
        // Define color variant: Saffron (warning), Red (low score), Green (excellent score)
        let markerColor = 'var(--green-india, #10b981)';
        let statusLabel = 'Excellent Governance';
        if (score <= 85.0) {
          markerColor = '#ef4444'; // Red
          statusLabel = 'Low Performance - Interventions Needed';
        } else if (score < 95.0) {
          markerColor = 'var(--saffron, #f59e0b)'; // Saffron
          statusLabel = 'Fair Performance - Pending Issues';
        }

        // Beautiful Leaflet vector divIcon marker with soft ambient pulse
        const customIcon = L.divIcon({
          className: 'leaflet-custom-marker',
          html: `
            <div class="marker-container">
              <div class="marker-pulse-ring" style="border-color: ${markerColor}; background-color: ${markerColor}"></div>
              <div class="marker-pin-dot" style="background-color: ${markerColor}; box-shadow: 0 0 10px ${markerColor}"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker(coords, { icon: customIcon }).addTo(map);

        // Bind interactive rich popup details
        const popupContent = `
          <div class="map-popup-card">
            <h4>${district.district_name} District</h4>
            <p class="popup-state">${district.state_name} State</p>
            <div class="popup-divider"></div>
            <div class="popup-score-row">
              <span class="popup-label">Governance Efficiency Index:</span>
              <span class="popup-value" style="color: ${markerColor}">${score.toFixed(1)}%</span>
            </div>
            <div class="popup-status-text" style="color: ${markerColor}">${statusLabel}</div>
          </div>
        `;
        marker.bindPopup(popupContent);
      });
    } catch (e) {
      console.error("Leaflet initialization failed:", e);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [loading, analytics]);

  if (loading) return <div className="loading-state">Loading Live Governance Matrices...</div>;
  if (!analytics) return <div className="error-state">Failed to load live data.</div>;

  const getStatusColor = (score) => {
    if (score >= 95.0) return 'var(--green-india, #10b981)';
    if (score <= 85.0) return '#ef4444';
    return 'var(--saffron, #f59e0b)';
  };

  return (
    <div className="public-dashboard">
      
      {/* 24-HOUR RESOLVED SUMMARY METRIC BAR */}
      <div className="metric-bar">
        <div className="metric-content">
          <div className="metric-pulse"></div>
          <div>
            <h3>{analytics.recent_solved} Complaints Resolved</h3>
            <p>Directly closed across Andhra Pradesh & Telangana within the last 24 hours.</p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        
        {/* INTERACTIVE LEAFLET GIS MAP CONTAINER */}
        <div className="dashboard-panel radar-map-panel">
          <div className="panel-header">
            <h3>Live Governance Efficiency Index Map</h3>
            <span className="live-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 0 rgba(16, 185, 129, 0.4)', animation: 'pulseRadar 1.5s infinite' }}></span>
              REAL-TIME GIS
            </span>
          </div>
          
          <div className="map-view-wrapper">
            <div ref={mapContainerRef} className="leaflet-map-frame"></div>
          </div>
        </div>

        {/* VILLAGES PERFORMANCE LEADERBOARD */}
        <div className="dashboard-panel leaderboard-panel">
          <div className="panel-header">
            <h3>Village Governance Index</h3>
          </div>
          <div className="leaderboard-scroll">
            {analytics.top_villages && analytics.top_villages.map((v, i) => (
              <div key={i} className="leaderboard-item">
                <div className="lb-rank">#{i+1}</div>
                <div className="lb-info">
                  <strong>{v.name}</strong>
                  <span>{v.district_name}</span>
                </div>
                <div className="lb-score" style={{ color: getStatusColor(v.performance_score) }}>
                  {Number(v.performance_score).toFixed(1)}% Index
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* COMPLAINT CATEGORIES INFORMATION GRID */}
      <div className="dashboard-panel instructions-panel">
         <div className="panel-header">
            <h3>Citizen Complaint Categories & Guidelines</h3>
            <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
              Select a category below. Please ensure you are logged in to register a municipal issue.
            </p>
          </div>
          <div className="departments-grid">
            {analytics.departments && analytics.departments.map(dept => (
              <div key={dept.id} className="dept-card">
                <h4>{dept.name}</h4>
                <p>{dept.description}</p>
              </div>
            ))}
          </div>
      </div>

      <style>{`
        @keyframes pulseRadar {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      `}</style>

    </div>
  );
}
