import { LogoChip, ProviderLogo, SettingsIcon, DashboardEmptyBlock, displayAiSource } from '../components/common';

export default function Dashboard({ data, session, workspace, goTo }) {
  const progress = data?.setupProgress || { percentage: 0, completed: [], missing: [] };
  const analysis = data?.businessAnalysis;
  const visibility = data?.visibilitySummary || {};
  const hasRealData = Boolean(visibility.hasRealData);
  const activeProviders = visibility.availableProviderLabels || [];
  const providerRows = visibility.providers || [];
  const brandRanking = visibility.brandRanking || [];
  const topPromptsByBrand = visibility.topPromptsByBrand || [];
  const topPromptsByCitations = visibility.topPromptsByCitations || [];
  const citationsTable = visibility.citationsTable || [];
  const domainCitations = visibility.domainCitations || [];

  const percentOrEmpty = (value) => value === null || value === undefined ? 'No data yet' : `${value}%`;

  return (
    <section className="page-content">
      <div className="page-title page-title-row">
        <div className="title-with-logo">
          <LogoChip name={session.selectedCompanyName} url={session.selectedCompanyLogoUrl} size="large" />
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Welcome, {session.user.fullName}</h1>
            <p>Company: {session.selectedCompanyName} · Role: {session.selectedRoleName}</p>
          </div>
        </div>
        <div className="page-title-actions">{workspace}</div>
      </div>

      <article className="dashboard-hero-card">
        <div>
          <p className="eyebrow">Hummingbird AI overview</p>
          <h2>{hasRealData ? percentOrEmpty(visibility.visibilityScore) : 'Awaiting first AI scan'}</h2>
          <p>
            {hasRealData
              ? `Hummingbird AI analyzed saved responses from available sources: ${activeProviders.join(', ')}. Other providers remain excluded until their API data exists.`
              : 'No provider response data has been saved yet. Hummingbird AI will analyze only real saved provider results when scans are available.'}
          </p>
        </div>
        <div className="dashboard-provider-stack">
          {providerRows.map((provider) => (
            <div className={provider.available ? 'available' : ''} key={provider.key}>
              <ProviderLogo providerKey={provider.key} />
              <span>{provider.label}</span>
              <strong>{provider.available ? `${provider.checked} checks` : 'No data'}</strong>
            </div>
          ))}
        </div>
      </article>

      <div className="dashboard-kpi-grid">
        <DashboardKpi icon="target" title="AI Visibility Score" value={percentOrEmpty(visibility.visibilityScore)} helper="Brand mentioned across checked prompts" muted={!hasRealData} />
        <DashboardKpi icon="checkCircle" title="Brand Mentions" value={visibility.brandMentioned ?? 0} helper={`${visibility.checkedPrompts ?? 0} prompts checked`} />
        <DashboardKpi icon="trend" title="Share of Voice" value={percentOrEmpty(visibility.shareOfVoice)} helper="Brand vs competitor mentions" muted={visibility.shareOfVoice === null || visibility.shareOfVoice === undefined} />
        <DashboardKpi icon="file" title="Citation Coverage" value={percentOrEmpty(visibility.citationCoverage)} helper={`${visibility.citations ?? 0} citations found`} muted={visibility.citationCoverage === null || visibility.citationCoverage === undefined} />
      </div>

      {!hasRealData ? (
        <article className="dashboard-guide-card">
          <div>
            <p className="eyebrow">How to generate dashboard data</p>
            <h2>Your analytics dashboard will fill after prompt checks run.</h2>
            <p>Hummingbird does not use mock numbers. Complete the flow below and this page will populate from saved provider responses, mentions, competitors, citations, and daily refreshes.</p>
          </div>
          <div className="dashboard-guide-steps">
            <button type="button" onClick={() => goTo('business-analysis')}>1. Generate business analysis</button>
            <button type="button" onClick={() => goTo('competitors')}>2. Confirm competitors</button>
            <button type="button" onClick={() => goTo('prompts')}>3. Review prompts and run checks</button>
          </div>
        </article>
      ) : null}

      <div className="dashboard-analytics-grid">
        <DashboardPanel title="Brand coverage over time" action="Me + competitors">
          <MiniTrendChart data={visibility.brandTrend || []} empty="No checked prompt dates yet" />
        </DashboardPanel>

        <DashboardPanel title="Your brand mentions">
          <DashboardSideStat value={visibility.brandMentioned ?? 0} rows={brandRanking.slice(1, 4).map((item) => [item.name, item.mentions])} empty="No competitor mentions yet" />
        </DashboardPanel>
      </div>

      <div className="dashboard-table-grid">
        <DashboardPanel title="Brand ranking" action="Real mentions only">
          <DashboardRankingTable rows={brandRanking} />
        </DashboardPanel>

        <DashboardPanel title="Top prompts by brand mentions">
          <DashboardPromptTable rows={topPromptsByBrand} metricLabel="My mentions" metricKey="mentions" />
        </DashboardPanel>
      </div>

      <DashboardPanel title="Brand visibility index on AI Search" action="Coverage vs mention share">
        <VisibilityIndex rows={brandRanking} />
      </DashboardPanel>

      <DashboardPanel title="Citations">
        <DashboardCitationTable rows={citationsTable} />
      </DashboardPanel>

      <div className="dashboard-analytics-grid">
        <DashboardPanel title="Domain coverage over time" action="Your domain">
          <MiniTrendChart data={visibility.domainTrend || []} empty="No owned-domain citations yet" />
        </DashboardPanel>

        <DashboardPanel title="Domain citations">
          <DashboardSideStat value={visibility.citations ?? 0} rows={domainCitations.slice(0, 4).map((item) => [item.domain, item.citations])} empty="No citation domains yet" />
        </DashboardPanel>
      </div>

      <div className="dashboard-table-grid">
        <DashboardPanel title="Domain citations">
          <DashboardDomainTable rows={domainCitations} />
        </DashboardPanel>

        <DashboardPanel title="Top prompts by website citations">
          <DashboardPromptTable rows={topPromptsByCitations} metricLabel="Citations" metricKey="citations" />
        </DashboardPanel>
      </div>

      <DashboardPanel title="Hummingbird optimization layer" action="Our intelligence">
        <div className="dashboard-insight-grid">
          {(visibility.insights || []).map((insight) => (
            <article className="dashboard-insight-card" key={insight.title}>
              <span>{insight.priority}</span>
              <h3>{insight.title}</h3>
              <p>{insight.text}</p>
            </article>
          ))}
        </div>
      </DashboardPanel>

      <div className="dashboard-body-grid compact">
        <article className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">Setup progress</p>
              <h2>{progress.percentage}% complete</h2>
            </div>
            <span className="pill">{progress.missing.length ? 'In progress' : 'Ready'}</span>
          </div>
          <div className="progress-bar"><span style={{ width: `${progress.percentage}%` }} /></div>
          {progress.missing.length ? <button type="button" onClick={() => goTo('settings')}>Complete setup</button> : null}
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">Business Analysis</p>
              <h2>{analysis?.analysis_status || 'No analysis yet'}</h2>
            </div>
            <span className="soft-pill">{analysis ? displayAiSource(analysis.source_type) : 'No source'}</span>
          </div>
          <p className="dashboard-summary-text">{analysis?.business_summary || 'Generate a business analysis first. The dashboard will use saved database results only.'}</p>
          <button type="button" onClick={() => goTo('business-analysis')}>View analysis</button>
        </article>
      </div>
    </section>
  );
}

function DashboardPanel({ title, action, children }) {
  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-head">
        <h2>{title}</h2>
        {action ? <span>{action}</span> : null}
      </div>
      {children}
    </article>
  );
}

function MiniTrendChart({ data, empty }) {
  const max = Math.max(...(data || []).map((item) => item.value), 0);
  const hasData = Boolean(data?.length);

  return (
    <div className="mini-chart">
      <div className={`mini-chart-grid ${hasData ? '' : 'is-empty'}`}>
        {hasData ? data.map((point) => (
          <span
            key={point.date}
            data-tooltip={`${point.date}: ${point.value}`}
            style={{ left: `${data.length === 1 ? 50 : (data.indexOf(point) / (data.length - 1)) * 92 + 4}%`, bottom: `${max ? (point.value / max) * 72 + 12 : 12}%` }}
            title={`${point.date}: ${point.value}`}
          />
        )) : null}
        {!hasData ? <DashboardEmptyOverlay title={empty} text="Run prompt checks to populate this graph with saved AI response data." /> : null}
      </div>
      <div className="mini-chart-footer">
        {hasData ? data.map((point) => <small key={point.date}>{point.date}</small>) : ['Start', 'After scan', 'Trend'].map((label) => <small key={label}>{label}</small>)}
      </div>
    </div>
  );
}

function DashboardSideStat({ value, rows, empty }) {
  return (
    <div className="dashboard-side-stat">
      <strong>{value}</strong>
      {(rows || []).length ? rows.map(([label, count]) => (
        <p key={label}><span>{label}</span><b>{count}</b></p>
      )) : <small>{empty}</small>}
    </div>
  );
}

function DashboardRankingTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No ranking yet" text="Brand ranking appears after prompts are checked against an AI provider." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>#</th><th>Brand</th><th>Mentions</th><th>Coverage</th><th>Share</th></tr></thead>
      <tbody>
        {rows.slice(0, 10).map((row, index) => (
          <tr key={`${row.name}-${index}`}>
            <td>{index + 1}</td>
            <td><span className={row.type === 'own' ? 'own-brand-dot' : 'competitor-dot'} />{row.name}</td>
            <td>{row.mentions}</td>
            <td>{row.coverage}%</td>
            <td>{row.share}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardPromptTable({ rows, metricLabel, metricKey }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No prompt data yet" text="Prompt rankings appear after AI response checks are saved." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Rank</th><th>Prompt</th><th>{metricLabel}</th></tr></thead>
      <tbody>
        {rows.slice(0, 10).map((row, index) => (
          <tr key={row.id || index}>
            <td>{index + 1}</td>
            <td>{row.prompt}</td>
            <td>{row[metricKey] ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardCitationTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No citations yet" text="Citation tables fill when checked prompts return recommended source pages." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Rank</th><th>URL</th><th>Citation share</th><th>Citations</th></tr></thead>
      <tbody>
        {rows.slice(0, 10).map((row, index) => (
          <tr key={`${row.url}-${index}`}>
            <td>{index + 1}</td>
            <td className="url-cell">{row.url}</td>
            <td>{row.share}%</td>
            <td>{row.citations}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardDomainTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No domain citations yet" text="Domain citation data appears after prompt checks save citation URLs." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Rank</th><th>Domain</th><th>Share</th><th>Citations</th></tr></thead>
      <tbody>
        {rows.slice(0, 10).map((row, index) => (
          <tr key={`${row.domain}-${index}`}>
            <td>{index + 1}</td>
            <td>{row.domain}</td>
            <td>{row.share}%</td>
            <td>{row.citations}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VisibilityIndex({ rows }) {
  const plotted = (rows || []).slice(0, 10);

  return (
    <div className={`visibility-index ${plotted.length ? '' : 'is-empty'}`}>
      <span className="axis horizontal" />
      <span className="axis vertical" />
      {plotted.map((row) => (
        <div
          className={`visibility-dot ${row.type === 'own' ? 'own' : ''}`}
          key={row.name}
          style={{ left: `${Math.min(92, Math.max(4, row.coverage))}%`, bottom: `${Math.min(88, Math.max(8, row.share))}%` }}
          title={`${row.name}: ${row.coverage}% coverage, ${row.share}% share`}
        >
          <LogoChip name={row.name} />
          <small>{row.name}</small>
        </div>
      ))}
      {!plotted.length ? <DashboardEmptyOverlay title="No visibility index yet" text="Run prompt checks to map brand coverage vs mention share." /> : null}
    </div>
  );
}

function DashboardEmptyOverlay({ title, text }) {
  return (
    <div className="dashboard-empty-overlay">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function DashboardKpi({ icon, title, value, helper, muted = false }) {
  return (
    <article className={`dashboard-kpi-card ${muted ? 'muted-card' : ''}`}>
      <span><SettingsIcon name={icon} /></span>
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function Metric({ title, value, helper, icon, compact = false }) {
  return (
    <article className={`metric-card ${compact ? 'compact' : ''}`}>
      <div className="metric-top">
        <p>{title}</p>
        {icon ? <span>{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}
