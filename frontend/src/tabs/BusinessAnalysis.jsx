import { PageHeader, displayAiSource } from '../components/common';
import businessAnalysisBg from '../assets/dashboard/business-analysis-bg.png';

export default function BusinessAnalysis({ data, workspace }) {
  const analysis = data?.latestCompleted || data?.latest;
  const status = analysis?.analysis_status || 'No analysis yet';
  const lastGenerated = analysis?.updated_at || analysis?.created_at;

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="Business Analysis"
        title="Saved AI business intelligence"
        subtitle="Clean stored intelligence generated once and saved in your database."
        workspace={workspace}
      />

      <article className="analysis-hero-card" style={{ backgroundImage: `url(${businessAnalysisBg})` }}>
        <div className="analysis-hero-copy">
          <h2>{analysis?.business_summary || 'No real business analysis has been generated yet.'}</h2>
          <p className="analysis-hero-timestamp">{analysis ? `Last generated on ${lastGenerated || 'Not available'}` : 'Run Business Analysis after onboarding to create your first saved intelligence profile.'}</p>
        </div>
      </article>

      <div className="analysis-section-grid">
        <article className="analysis-section-card">
          <p className="eyebrow">Market Profile</p>
          <div className="details-grid market-profile-grid">
            <div className="market-detail-card">
              <div className="market-detail-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/><line x1="12" y1="11" x2="12" y2="15"/></svg>
              </div>
              <small>Industry</small>
              <span>{analysis?.industry || analysis?.detected_industry || 'Not added yet'}</span>
            </div>
            <div className="market-detail-card">
              <div className="market-detail-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
              </div>
              <small>Service Area</small>
              <span>{analysis?.service_area || analysis?.service_area_summary || 'Not added yet'}</span>
            </div>
            <div className="market-detail-card">
              <div className="market-detail-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <small>Target Audience</small>
              <span>{analysis?.target_audience || analysis?.target_audience_summary || 'Not added yet'}</span>
            </div>
          </div>
        </article>

        <article className="analysis-section-card">
          <p className="eyebrow">Services &amp; Positioning</p>
          <div className="details-grid one-col services-detail-list">
            <div className="service-detail-item">
              <small>Services</small>
              <span>{analysis?.main_services || analysis?.detected_services || 'Not added yet'}</span>
            </div>
            <div className="service-detail-item">
              <small>Positioning</small>
              <span>{analysis?.positioning_summary || 'Not added yet'}</span>
            </div>
            <div className="service-detail-item">
              <small>Generated Competitors</small>
              <span>{analysis?.known_competitors || 'Not added yet'}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail">
      <small>{label}</small>
      <span>{value || 'Not added yet'}</span>
    </div>
  );
}
