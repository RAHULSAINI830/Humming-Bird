import { PageHeader, SettingsIcon } from '../components/common';

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

      <article className="analysis-hero-card">
        <div className="analysis-hero-copy">
          <div className="analysis-hero-meta">
            <span className={`pill status-${String(status).toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
            <span className="soft-pill">{analysis?.source_type ? `Stored result · ${analysis.source_type}` : 'Stored result'}</span>
          </div>
          <h2>{analysis?.business_summary || 'No real business analysis has been generated yet.'}</h2>
          <p>{analysis ? `◷ Last generated on ${lastGenerated || 'Not available'}` : 'Run Business Analysis after onboarding to create your first saved intelligence profile.'}</p>
        </div>
        <div className="analysis-orbit-visual" aria-hidden="true">
          <span><SettingsIcon name="sparkles" /></span>
          <i />
          <i />
          <i />
        </div>
      </article>

      <div className="analysis-section-grid">
        <article className="analysis-section-card">
          <p className="eyebrow">Market Profile</p>
          <div className="details-grid one-col">
            <Detail label="Industry" value={analysis?.industry || analysis?.detected_industry} />
            <Detail label="Service Area" value={analysis?.service_area || analysis?.service_area_summary} />
            <Detail label="Target Audience" value={analysis?.target_audience || analysis?.target_audience_summary} />
          </div>
        </article>

        <article className="analysis-section-card">
          <p className="eyebrow">Services & Positioning</p>
          <div className="details-grid one-col">
            <Detail label="Services" value={analysis?.main_services || analysis?.detected_services} />
            <Detail label="Positioning" value={analysis?.positioning_summary} />
            <Detail label="Generated Competitors" value={analysis?.known_competitors} />
          </div>
        </article>

        <article className="analysis-section-card">
          <p className="eyebrow">Record Details</p>
          <div className="details-grid one-col">
            <Detail label="Source Type" value={analysis?.source_type} />
            <Detail label="Created Date" value={analysis?.created_at} />
            <Detail label="Updated Date" value={analysis?.updated_at} />
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
