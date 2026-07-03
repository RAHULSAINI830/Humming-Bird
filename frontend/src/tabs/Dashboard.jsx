import { useState } from 'react';
import { LogoChip, DashboardEmptyBlock } from '../components/common';
import aiVisibilityBg from '../assets/dashboard/ai-visibility-bg.png';
import aiVisibilityIcon from '../assets/dashboard/ai-visibility-icon.png';
import citationCoverageBg from '../assets/dashboard/citation-coverage-bg.png';
import citationCoverageIcon from '../assets/dashboard/citation-coverage-icon.png';
import overviewCardBg from '../assets/dashboard/overview-card-bg.png';
import shareOfVoiceBg from '../assets/dashboard/share-of-voice-bg.png';
import shareOfVoiceIcon from '../assets/dashboard/share-of-voice-icon.png';

export default function Dashboard({ data, session, workspace, goTo }) {
  const company = data?.company || data?.companyProfile || {};
  const visibility = data?.visibilitySummary || {};
  const hasRealData = Boolean(visibility.hasRealData);
  const displayVisibility = visibility;
  const activeProviders = displayVisibility.availableProviderLabels || [];
  const brandRanking = visibility.brandRanking || [];
  const topPromptsByBrand = visibility.topPromptsByBrand || [];
  const topPromptsByCitations = visibility.topPromptsByCitations || [];
  const citationsTable = visibility.citationsTable || [];
  const domainCitations = visibility.domainCitations || [];
  const checkedPrompts = displayVisibility.checkedPrompts ?? 0;
  const ownBrand = brandRanking.find((item) => item.type === 'own') || brandRanking[0];
  const competitorRows = brandRanking.filter((item) => item.type !== 'own');
  const responseRunCount = Number(displayVisibility.responseRunCount || displayVisibility.brandTrend?.length || displayVisibility.domainTrend?.length || 0);
  const responseWindowLabel = responseRunCount ? `Last ${Math.min(7, responseRunCount)} responses` : 'Last 7 responses';
  const engineLabel = activeProviders.length ? activeProviders.join(', ') : 'All engines';

  const percentOrEmpty = (value) => value === null || value === undefined ? 'No data yet' : `${value}%`;

  return (
    <section className="page-content dashboard-overview-page">
      <div className="overview-dashboard-header">
        <div className="overview-title-block">
          <h1>Welcome, <span>{session.user.fullName}</span></h1>
          <p>Company: {session.selectedCompanyName} · Role: <strong>{session.selectedRoleName}</strong></p>
        </div>
        <div className="overview-header-actions">
          <button type="button" className="overview-export-button" onClick={() => window.print()}>
            Export Overview
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button type="button" className="overview-notification-button" aria-label="Notifications" title="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 7-3 8.7 0 .8.7 1.3 1.5 1.3h15c.8 0 1.5-.5 1.5-1.3 0-1.7-3-1.7-3-8.7Z" />
              <path d="M9.8 21a2.4 2.4 0 0 0 4.4 0" />
            </svg>
          </button>
          <LogoChip name={session.user.fullName} />
        </div>
      </div>

      <div className="overview-client-row">
        <div className="overview-client-mini">
          <LogoChip name={session.selectedCompanyName} url={session.selectedCompanyLogoUrl} />
          <div>
            <strong>{session.selectedCompanyName}</strong>
            <span>{company.website_url || 'Website not added'}</span>
          </div>
        </div>
        <div className="overview-selected-client">
          <span>Selected Client</span>
          {workspace}
        </div>
      </div>

      <div className="overview-filter-bar">
        <p>Report based on {checkedPrompts} prompts. Showing {checkedPrompts} filtered prompts.</p>
        <div className="overview-filter-controls">
          <button type="button" title="Based on saved AI response refresh runs">{responseWindowLabel}</button>
          <button type="button">All Tags</button>
          <button type="button">{engineLabel}</button>
          <button type="button">All markets</button>
        </div>
      </div>

      <div className="overview-hero-grid">
        <article className="overview-ai-card" style={{ '--overview-card-bg': `url(${overviewCardBg})` }}>
          <div>
            <p className="eyebrow">Hummingbird AI overview</p>
            <strong>{percentOrEmpty(displayVisibility.visibilityScore)}</strong>
            <small>
              {hasRealData
                ? `Hummingbird AI analyzed saved responses from available sources${activeProviders.length ? `: ${activeProviders.join(', ')}` : ''}.`
                : 'Run prompt checks to calculate visibility from saved AI responses.'}
            </small>
          </div>
        </article>

        <DashboardKpi variant="ai-visibility" title="AI Visibility Score" value={percentOrEmpty(displayVisibility.visibilityScore)} helper="Brand mentioned across checked prompts" muted={false} />
        <DashboardKpi variant="share-of-voice" title="Share of Voice" value={percentOrEmpty(displayVisibility.shareOfVoice)} helper="Brand vs competitor mentions" muted={false} />
        <DashboardKpi variant="citation-coverage" title="Citation Coverage" value={percentOrEmpty(displayVisibility.citationCoverage)} helper={`${displayVisibility.citations ?? 0} citations found`} muted={false} />
        <span className="overview-grid-separator overview-grid-separator-1" aria-hidden="true" />
        <span className="overview-grid-separator overview-grid-separator-2" aria-hidden="true" />
        <span className="overview-grid-separator overview-grid-separator-3" aria-hidden="true" />
      </div>

      <div className="overview-analytics-row">
        <span className="overview-grid-separator overview-grid-separator-analytics" aria-hidden="true" />
        <DashboardPanel title="Brand Coverage Over Time" action="Me + top competitors">
          <BrandCoverageChart rows={brandRanking} trend={displayVisibility.brandTrend || []} />
        </DashboardPanel>

        <div className="overview-insights-column">
          <OverviewInsightCard
            title="Your Brand Mentions"
            value={displayVisibility.brandMentioned ?? 0}
            subtitle={`${checkedPrompts} prompts checked`}
            rows={[
              { brand: ownBrand || { name: session.selectedCompanyName, website_url: company.website_url, logo_url: company.logo_url }, count: displayVisibility.brandMentioned ?? 0, delta: hasRealData ? '+12%' : '—' },
              ...competitorRows.slice(0, 2).map((item) => ({ brand: item, count: item.mentions, delta: `${item.coverage ?? 0}%` }))
            ]}
          />
          <OverviewInsightCard
            title="Average Brand Position"
            value={displayVisibility.averagePosition ?? 0}
            subtitle="Position trend"
            rows={[
              { brand: ownBrand || { name: session.selectedCompanyName, website_url: company.website_url, logo_url: company.logo_url }, count: displayVisibility.averagePosition ?? 0, delta: hasRealData ? '+4' : '—' },
              ...competitorRows.slice(0, 2).map((item) => ({ brand: item, count: item.position ?? 0, delta: `${item.share ?? 0}%` }))
            ]}
          />
        </div>
      </div>

      <div className="dashboard-table-grid overview-table-grid">
        <DashboardPanel title="Brand Ranking" action="All brands">
          <DashboardRankingTable rows={brandRanking} onReport={() => goTo?.('competitors')} />
        </DashboardPanel>

        <span className="overview-grid-separator overview-grid-separator-table" aria-hidden="true" />

        <DashboardPanel title="Top Prompts by Brand Mentions">
          <DashboardPromptTable rows={topPromptsByBrand} metricLabel="Mentions" metricKey="mentions" onReport={() => goTo?.('prompts')} />
        </DashboardPanel>
      </div>

      <div className="dashboard-table-grid overview-table-grid">
        <DashboardPanel title="Brand Visibility index on AI Search" action="Coverage vs mention share">
          <VisibilityIndex rows={brandRanking} />
        </DashboardPanel>

        <span className="overview-grid-separator overview-grid-separator-table" aria-hidden="true" />

        <DashboardPanel title="Citations">
          <DashboardCitationTable rows={citationsTable} onReport={() => goTo?.('citations')} />
        </DashboardPanel>
      </div>

      <div className="dashboard-table-grid overview-table-grid overview-domain-grid">
        <DashboardPanel title="Domain Coverage Over Time" action="Your domain">
          <DomainCoverageChart data={displayVisibility.domainTrend || []} brandName={session.selectedCompanyName} />
        </DashboardPanel>

        <span className="overview-grid-separator overview-grid-separator-table" aria-hidden="true" />

        <DashboardPanel title="Domain Citations">
          <DomainCitationsCard rows={domainCitations} onReport={() => goTo?.('citations')} />
        </DashboardPanel>
      </div>

      <div className="dashboard-table-grid overview-table-grid">
        <DashboardPanel title="Top Prompts by Website Citations">
          <DashboardPromptTable rows={topPromptsByCitations} metricLabel="Citations" metricKey="citations" onReport={() => goTo?.('citations')} />
        </DashboardPanel>

        <span className="overview-grid-separator overview-grid-separator-table" aria-hidden="true" />

        <DashboardPanel title="Citation Opportunities">
          <DashboardPromptTable rows={topPromptsByCitations} metricLabel="Citations" metricKey="citations" onReport={() => goTo?.('citations')} />
        </DashboardPanel>
      </div>
    </section>
  );
}

function BrandCoverageChart({ rows, trend }) {
  const allRows = rows || [];
  const ownBrand = allRows.find((row) => row.type === 'own');
  const fallbackBrands = [
    ...(ownBrand ? [ownBrand] : []),
    ...allRows.filter((row) => row.type !== 'own').slice(0, ownBrand ? 4 : 5)
  ];
  const colors = ['#ff1010', '#4b16ff', '#00bf16', '#f80693', '#14c8b8'];
  const points = (trend || []).slice(-7);
  const fallbackPoints = fallbackBrands.length ? [{ date: 'Latest', brands: fallbackBrands }] : [];
  const chartPoints = points.length ? points : fallbackPoints;
  const brandNames = [];
  chartPoints.forEach((point) => {
    (point.brands || fallbackBrands).forEach((brand) => {
      if (brand?.name && !brandNames.includes(brand.name)) {
        brandNames.push(brand.name);
      }
    });
  });
  const visibleBrandNames = brandNames.slice(0, 5);
  const brandByName = new Map();
  [...fallbackBrands, ...chartPoints.flatMap((point) => point.brands || [])].forEach((brand) => {
    if (brand?.name && !brandByName.has(brand.name)) {
      brandByName.set(brand.name, brand);
    }
  });
  const colorForBrand = (name) => colors[Math.max(0, visibleBrandNames.indexOf(name)) % colors.length];
  const hasCoverageData = chartPoints.some((point) => (point.brands || []).length || Number(point.value || 0) > 0);

  return (
    <div className="brand-coverage-chart">
      <div className="brand-chart-y-axis" aria-hidden="true">
        {[40, 30, 20, 10, 0].map((value) => <span key={value}>{value}</span>)}
      </div>
      <span className="brand-chart-y-label" aria-hidden="true">Brand Coverage %</span>
      <div className="brand-chart-plot">
        {chartPoints.map((point, index) => {
          const sourceSegments = (point.brands?.length ? point.brands : fallbackBrands).filter((item) => visibleBrandNames.includes(item.name));
          const segments = sourceSegments.map((item) => ({
            ...item,
            color: colorForBrand(item.name),
            value: Math.max(0, Number(item.value ?? item.coverage ?? item.share ?? item.mentions ?? 0))
          }));
          const total = segments.reduce((sum, item) => sum + item.value, 0);
          return (
            <div className="brand-chart-column" key={`${point.runId || point.date || index}`}>
              <div className="brand-chart-stack" style={{ height: `${Math.max(4, Math.min(92, total * 2.1))}%` }}>
                {segments.map((item) => {
                  const segmentHeight = total ? Math.max(4, (item.value / total) * 100) : 0;
                  return (
                    <span
                      key={`${point.runId || point.date || index}-${item.name}`}
                      style={{ height: `${segmentHeight}%`, borderTopColor: item.color }}
                      title={`${item.name}: ${item.value}%`}
                    />
                  );
                })}
              </div>
              {segments.length ? (
                <div className="brand-chart-tooltip" aria-hidden="true">
                  {segments.map((item) => (
                    <p key={item.name}><LogoChip name={item.name} url={brandLogoUrl(item)} /><span>{item.name}</span><b>{item.value}%</b></p>
                  ))}
                </div>
              ) : null}
              <small>{point.date || `Run ${index + 1}`}</small>
            </div>
          );
        })}
        {!hasCoverageData ? <DashboardEmptyOverlay title="No coverage data yet" text="Run prompt checks to build this chart from saved AI responses." /> : null}
      </div>
      {visibleBrandNames.length ? (
        <div className="brand-chart-legend">
          {visibleBrandNames.map((name) => (
            <span key={name}>
              <LogoChip name={name} url={brandLogoUrl(brandByName.get(name))} />
              <i style={{ background: colorForBrand(name) }} />
              <b>{name}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OverviewInsightCard({ title, value, subtitle, rows }) {
  return (
    <article className="overview-insight-card">
      <div className="overview-insight-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <strong>{value}</strong>
      </div>
      <div className="overview-insight-list">
        {(rows || []).slice(0, 3).map((row) => {
          const brand = row.brand || { name: row.name };
          const name = brand.name || 'Brand';

          return (
          <p key={`${title}-${name}`}>
            <LogoChip name={name} url={brandLogoUrl(brand)} />
            <span>{name}</span>
            <b>{row.count}</b>
            <em>{row.delta}</em>
          </p>
          );
        })}
      </div>
    </article>
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

function DomainCoverageChart({ data, brandName }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const points = data?.length ? data.slice(0, 7) : [];
  const max = Math.max(...points.map((item) => Number(item.value || 0)), 1);
  const width = 760;
  const height = 260;
  const padLeft = 62;
  const padRight = 20;
  const padY = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padY * 2;
  const maxLimit = Math.ceil(max / 10) * 10;
  const ticks = [];
  for (let i = maxLimit; i >= 0; i -= 10) {
    ticks.push(i);
  }
  const coordinates = points.map((point, index) => {
    const x = padLeft + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
    const y = padY + plotH - (Number(point.value || 0) / maxLimit) * plotH;
    return { ...point, x, y };
  });
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
  const focusIndex = hoverIndex !== null ? hoverIndex : (coordinates.length ? coordinates.length - 1 : 0);
  const focus = coordinates[focusIndex];

  return (
    <div className="domain-coverage-chart">
      {points.length ? (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Domain coverage over time">
            {ticks.map((tick) => {
              const y = padY + plotH - (tick / maxLimit) * plotH;
              return <g key={tick}><line x1={0} x2={width} y1={y} y2={y} /><text x={18} y={y + 4}>{tick}</text></g>;
            })}
            {coordinates.map((point) => <line key={`v-${point.date}`} className="domain-grid-vertical" x1={point.x} x2={point.x} y1={0} y2={height} />)}
            <polyline className="domain-shadow-line" points={line} />
            <polyline className="domain-main-line" points={line} />
            {focus ? (
              <g className="domain-focus-point">
                <line x1={focus.x} x2={focus.x} y1={0} y2={height} />
                <circle cx={focus.x} cy={focus.y} r="12" />
                <circle cx={focus.x} cy={focus.y} r="6" />
                <foreignObject x={focus.x - 42} y={focus.y - 44} width="92" height="28">
                  <div className="domain-tooltip">{brandName || 'Brand'} <b>{focus.value}</b></div>
                </foreignObject>
              </g>
            ) : null}
            {coordinates.map((point, idx) => {
              const colW = plotW / (points.length - 1 || 1);
              const rectX = point.x - colW / 2;
              return (
                <rect
                  key={`hover-${point.date}`}
                  x={rectX}
                  y={0}
                  width={colW}
                  height={height}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              );
            })}
          </svg>
          <div className="domain-chart-footer" style={{ position: 'relative', height: '24px', padding: 0 }}>
            {coordinates.map((point) => (
              <small
                className={point === focus ? 'active' : ''}
                key={point.date}
                style={{
                  position: 'absolute',
                  left: `${(point.x / width) * 100}%`,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap'
                }}
              >
                {point.date}
              </small>
            ))}
          </div>
        </>
      ) : (
        <DashboardEmptyBlock title="No domain coverage yet" text="Run prompt checks to populate domain citation trend data." />
      )}
    </div>
  );
}

function DomainCitationsCard({ rows, onReport }) {
  const validRows = (rows || []).filter((row) => row.domain && row.domain.includes('.') && !row.domain.includes(' '));
  const total = validRows.reduce((sum, item) => sum + Number(item.citations || 0), 0);
  if (!validRows.length) return <DashboardEmptyBlock title="No domain citations yet" text="Domain citation data appears after prompt checks save citation URLs." />;

  return (
    <div className="domain-citations-card">
      <div className="domain-citations-total"><strong>{total}</strong><span>Citations</span></div>
      <div className="domain-citations-list">
        {validRows.slice(0, 4).map((row) => (
          <p key={row.domain}>
            <LogoChip name={row.domain} url={`https://${row.domain}`} />
            <span>{row.domain}</span>
            <b>{row.citations}</b>
          </p>
        ))}
      </div>
      <button type="button" className="overview-table-report-button" onClick={onReport}>View Full Report</button>
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

function DashboardRankingTable({ rows, onReport }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No ranking yet" text="Brand ranking appears after prompts are checked against an AI provider." />;

  return (
    <>
      <table className="dashboard-data-table overview-data-table">
        <thead><tr><th>#</th><th>Brand</th><th>Sentiment</th><th>Mentions</th><th>Coverage</th><th>Share</th></tr></thead>
        <tbody>
          {rows.slice(0, 10).map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td>{index + 1}</td>
              <td className="overview-brand-cell"><LogoChip name={row.name} url={brandLogoUrl(row)} /><span>{row.name}</span></td>
              <td><span className={`overview-sentiment-pill ${row.mentions ? 'positive' : 'neutral'}`}>{row.mentions ? `+${row.mentions}` : 'N/A'}</span></td>
              <td>{row.mentions}</td>
              <td>{row.coverage}%</td>
              <td>{row.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="overview-table-report-button" onClick={onReport}>View Full Report</button>
    </>
  );
}

function DashboardPromptTable({ rows, metricLabel, metricKey, onReport }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No prompt data yet" text="Prompt rankings appear after AI response checks are saved." />;

  return (
    <>
      <table className="dashboard-data-table overview-data-table">
        <thead><tr><th>Rank</th><th>Prompt</th><th>{metricLabel}</th></tr></thead>
        <tbody>
          {rows.slice(0, 10).map((row, index) => {
            const value = row[metricKey] ?? row.share ?? row.coverage ?? row.mentions ?? 0;
            return (
              <tr key={row.id || index}>
                <td>{index + 1}</td>
                <td>{row.prompt}</td>
                <td>{metricLabel.toLowerCase().includes('share') ? `${value}%` : value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="overview-table-report-button" onClick={onReport}>View Full Report</button>
    </>
  );
}

function DashboardCitationTable({ rows, onReport }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No citations yet" text="Citation tables fill when checked prompts return recommended source pages." />;

  return (
    <div className="overview-table-with-report">
      <table className="dashboard-data-table overview-data-table">
        <thead><tr><th>Rank</th><th>URL</th><th>Citation share</th><th>Citation</th></tr></thead>
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
      <button type="button" className="overview-table-report-button" onClick={onReport}>View Full Report</button>
    </div>
  );
}

function DashboardDomainTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No domain citations yet" text="Domain citation data appears after prompt checks save citation URLs." />;

  return (
    <>
      <table className="dashboard-data-table overview-data-table">
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
      <button type="button" className="overview-table-report-button">View Full Report</button>
    </>
  );
}

function VisibilityIndex({ rows }) {
  const plotted = (rows || []).slice(0, 8);
  const max = Math.max(...plotted.map((row) => Number(row.coverage || row.share || row.mentions || 0)), 1);

  return (
    <div className={`visibility-index ${plotted.length ? '' : 'is-empty'}`}>
      {plotted.length ? <div className="visibility-index-date">23 June 2026</div> : null}
      {plotted.map((row, index) => {
        const value = Number(row.coverage || row.share || row.mentions || 0);
        const width = Math.max(18, Math.min(94, (value / max) * 92));
        return (
          <div className="visibility-rank-row" key={`${row.name}-${index}`}>
            <div className="visibility-rank-track">
              <span className="visibility-rank-fill" style={{ width: `${width}%` }}>
                <span className="visibility-rank-label"><LogoChip name={row.name} url={brandLogoUrl(row)} />{row.name}</span>
                <b>{index + 1}</b>
              </span>
            </div>
          </div>
        );
      })}
      {!plotted.length ? <DashboardEmptyOverlay title="No visibility index yet" text="Run prompt checks to map brand coverage vs mention share." /> : null}
    </div>
  );
}

function brandLogoUrl(brand) {
  if (!brand) return '';

  if (typeof brand === 'string') {
    return /^https?:\/\//i.test(brand) || brand.includes('.') ? brand : '';
  }

  return brand.logo_url || brand.website_url || brand.url || '';
}

function DashboardEmptyOverlay({ title, text }) {
  return (
    <div className="dashboard-empty-overlay">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

const kpiAssets = {
  'ai-visibility': {
    bg: aiVisibilityBg,
    icon: aiVisibilityIcon
  },
  'share-of-voice': {
    bg: shareOfVoiceBg,
    icon: shareOfVoiceIcon
  },
  'citation-coverage': {
    bg: citationCoverageBg,
    icon: citationCoverageIcon
  }
};

function DashboardKpi({ variant, title, value, helper, muted = false }) {
  const asset = kpiAssets[variant] || kpiAssets['ai-visibility'];

  return (
    <article className={`dashboard-kpi-card overview-kpi-card overview-kpi-card-${variant} ${muted ? 'muted-card' : ''}`}>
      <img className="overview-kpi-icon-img" src={asset.icon} alt="" aria-hidden="true" />
      <p>{title}</p>
      <strong>{value}</strong>
      <img className={`overview-kpi-bg-img ${variant}`} src={asset.bg} alt="" aria-hidden="true" />
      <div className="overview-kpi-foot">
        <small>{helper}</small>
      </div>
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
