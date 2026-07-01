import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';
import { DashboardEmptyBlock, DashboardPanel, EmptyInline, PageHeader, SettingsIcon, StatusBadge } from '../components/common';

export default function GeoVisibility({ data, onChange, workspace, geoTab = 'performance' }) {
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [mapMode, setMapMode] = useState('world');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [queryFilter, setQueryFilter] = useState('all');
  const [performanceRange, setPerformanceRange] = useState('28d');
  const [visibleMetrics, setVisibleMetrics] = useState(['clicks', 'impressions']);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const countries = data?.countries || [];
  const queries = data?.queries || [];
  const pages = data?.pages || [];
  const devices = data?.devices || [];
  const searchAppearance = data?.searchAppearance || [];
  const performanceSeries = data?.performanceSeries || [];
  const previousPerformanceSeries = data?.previousPerformanceSeries || [];
  const opportunities = data?.opportunities || {};
  const properties = data?.properties || [];
  const summary = data?.summary || {};
  const kpis = data?.kpis || {};
  const comparison = data?.comparison || {};
  const diagnostics = data?.diagnostics || {};
  const canManage = Boolean(data?.canManage);
  const sortedCountries = [...countries].sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0));
  const activeCountry = sortedCountries.find((country) => normalizedCountryCode(country.country) === selectedCountry) || sortedCountries[0] || null;
  const focusedCountryCode = mapMode === 'country' ? normalizedCountryCode(activeCountry?.country) : '';
  const filteredQueries = filterGeoQueries(queries, queryFilter);
  const filteredPerformanceRows = filterPerformanceRows(performanceSeries, performanceRange);
  const filteredPreviousRows = filterPerformanceRows(previousPerformanceSeries, performanceRange);
  const computedPerformance = computedPerformanceStats(filteredPerformanceRows, filteredPreviousRows, kpis, comparison);

  async function syncGeo() {
    setLoading('sync');
    setMessage('');
    try {
      const result = await api('/api/geo/sync', { method: 'POST', body: '{}' });
      onChange(result);
      setMessage('Search Console data refreshed. Old saved rows for this property were replaced.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading('');
    }
  }

  async function disconnect() {
    const confirmed = window.confirm('Disconnect Google Search Console for this workspace? Saved rows will be hidden until you reconnect. Use Clear saved data if you want to delete them.');
    if (!confirmed) return;
    setLoading('disconnect');
    setMessage('');
    try {
      const result = await api('/api/geo/disconnect', { method: 'POST', body: '{}' });
      onChange(result);
      setMessage('Search Console disconnected.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading('');
    }
  }

  async function clearSavedGeoData() {
    const confirmed = window.confirm('Clear saved GEO data for this selected property? This deletes the stored Search Console rows from the database.');
    if (!confirmed) return;
    setLoading('clear');
    setMessage('');
    try {
      const result = await api('/api/geo/clear', { method: 'POST', body: '{}' });
      onChange(result);
      setMessage('Saved GEO data cleared for this property.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading('');
    }
  }

  async function selectProperty(event) {
    setLoading('property');
    setMessage('');
    try {
      const result = await api('/api/geo/select-property', {
        method: 'POST',
        body: JSON.stringify({ propertyUrl: event.target.value })
      });
      onChange(result);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading('');
    }
  }

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="GEO Visibility"
        title={<span className="title-with-beta">Geographic search presence <span className="beta-badge">Beta</span></span>}
        subtitle="Real country, query, and page data synced from Google Search Console and saved to your database."
        workspace={workspace}
        action={canManage && data?.connected ? (
          <button type="button" className="primary-button slim" onClick={syncGeo} disabled={loading === 'sync'}>
            {loading === 'sync' ? 'Refreshing…' : 'Refresh Search Console'}
          </button>
        ) : null}
      />

      {!data ? <EmptyInline title="Loading GEO data" text="Checking Search Console connection and saved database rows." /> : null}

      {data && !data.connected ? (
        <article className="geo-connect-card">
          <div>
            <p className="eyebrow">Google Search Console</p>
            <h2>Connect a verified website property</h2>
            <p>For accurate GEO data, Hummingbird uses Google Search Console. The user’s Google account must have access to the website property.</p>
          </div>
          {canManage ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                window.localStorage.setItem('hummingbird.activeView', 'geo');
                window.location.href = '/api/google/connect';
              }}
            >
              Connect Google Search Console
            </button>
          ) : (
            <span className="soft-pill">View only</span>
          )}
        </article>
      ) : null}

      {data?.connected ? (
        <>
          <article className="geo-toolbar">
            <div>
              <p className="eyebrow">Connected account</p>
              <h2>{data.connection?.google_email || 'Google account connected'}</h2>
              <p>{summary.lastSyncedAt ? `Last refreshed on ${summary.lastSyncedAt}` : 'No Search Console refresh has been saved yet.'}</p>
              {data?.connected ? (
                <div className="geo-sync-diagnostics">
                  <span>{diagnostics.propertyCount || 0} properties</span>
                  <span>{diagnostics.savedRows?.countries || 0} country rows</span>
                  <span>{diagnostics.savedRows?.queries || 0} query rows</span>
                  <span>{diagnostics.savedRows?.dates || 0} date rows</span>
                </div>
              ) : null}
            </div>
            <div className="geo-toolbar-actions">
              <label>
                Search Console property
                <select value={data.selectedProperty?.site_url || ''} onChange={selectProperty} disabled={!canManage || loading === 'property'}>
                  {properties.map((property) => (
                    <option key={property.site_url} value={property.site_url}>{property.site_url}</option>
                  ))}
                </select>
              </label>
              {canManage ? (
                <>
                  <button type="button" className="ghost-neutral-button" onClick={clearSavedGeoData} disabled={loading === 'clear'}>
                    {loading === 'clear' ? 'Clearing…' : 'Clear saved data'}
                  </button>
                  <button type="button" className="ghost-danger-button" onClick={disconnect} disabled={loading === 'disconnect'}>
                    {loading === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </>
              ) : null}
            </div>
          </article>

          {message ? <div className={message.includes('refreshed') || message.includes('disconnected') || message.includes('cleared') ? 'success-notice' : 'notice'}>{message}</div> : null}

          {geoTab === 'performance' ? (
            <>
              <GeoPerformanceOverview
                rows={filteredPerformanceRows}
                kpis={computedPerformance.kpis}
                comparison={computedPerformance.comparison}
                summary={summary}
                range={performanceRange}
                onRangeChange={setPerformanceRange}
                visibleMetrics={visibleMetrics}
                onToggleMetric={(metric) => setVisibleMetrics((current) => {
                  if (current.includes(metric) && current.length === 1) return current;
                  return current.includes(metric) ? current.filter((item) => item !== metric) : [...current, metric];
                })}
                showFilterPanel={showFilterPanel}
                onToggleFilterPanel={() => setShowFilterPanel((current) => !current)}
              />
              <GeoKpiDeck kpis={computedPerformance.kpis} comparison={computedPerformance.comparison} dateRange={summary.dateRange} compact />
            </>
          ) : null}

          {geoTab === 'queries' ? (
            <>
              <GeoOpportunitySections opportunities={opportunities} />
              <DashboardPanel title="Query analysis" action={`${filteredQueries.length} queries`}>
                <GeoQueryControls value={queryFilter} onChange={setQueryFilter} />
                <GeoQueryTable rows={filteredQueries} detailed />
              </DashboardPanel>
            </>
          ) : null}

          {geoTab === 'pages' ? (
            <div className="dashboard-table-grid">
              <DashboardPanel title="Page performance" action={`${pages.length} URLs`}>
                <GeoPageTable rows={pages} />
              </DashboardPanel>
              <DashboardPanel title="Search appearance" action="Rich result types">
                <GeoSearchAppearanceTable rows={searchAppearance} />
              </DashboardPanel>
            </div>
          ) : null}

          {geoTab === 'countries' ? (
            <>
              <article className="geo-map-card">
                <div className="dashboard-panel-head">
                  <div>
                    <h2>Geographic heat map</h2>
                    <p>{countries.length ? 'Interactive OpenStreetMap view from saved Search Console country rows.' : 'Connect and refresh Search Console to populate the map.'}</p>
                  </div>
                  <div className="geo-map-controls">
                    <div className="geo-mode-toggle">
                      <button type="button" className={mapMode === 'world' ? 'active' : ''} onClick={() => setMapMode('world')}>World</button>
                      <button type="button" className={mapMode === 'country' ? 'active' : ''} onClick={() => setMapMode('country')}>Country</button>
                    </div>
                    <select
                      value={normalizedCountryCode(activeCountry?.country)}
                      onChange={(event) => {
                        setSelectedCountry(event.target.value);
                        setMapMode('country');
                      }}
                      disabled={!sortedCountries.length}
                    >
                      {sortedCountries.length ? sortedCountries.map((country) => (
                        <option key={`${country.country}-${country.id}`} value={normalizedCountryCode(country.country)}>
                          {displayCountryName(country)} · {country.impressions} impressions
                        </option>
                      )) : <option>No synced countries</option>}
                    </select>
                  </div>
                </div>
                <GeoLeafletMap rows={sortedCountries} focusedCountryCode={focusedCountryCode} />
                {mapMode === 'country' && activeCountry ? <GeoCountryFocus country={activeCountry} /> : null}
              </article>
              <DashboardPanel title="Country analytics" action="Map + table">
                <GeoCountryTable rows={countries} />
              </DashboardPanel>
            </>
          ) : null}

          {geoTab === 'technical' ? (
            <div className="dashboard-table-grid">
              <DashboardPanel title="Device analytics" action="Desktop · Mobile · Tablet">
                <GeoDeviceTable rows={devices} />
              </DashboardPanel>
              <DashboardPanel title="Additional SEO data sources" action="Not mocked">
                <GeoUnsupportedMetrics items={data.unsupportedMetrics || []} />
              </DashboardPanel>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function numberFmt(value) {
  if (value === null || value === undefined || value === '') return 'Not connected';
  return Number(value || 0).toLocaleString();
}

function percentFmt(value) {
  if (value === null || value === undefined || value === '') return 'Not connected';
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function positionFmt(value) {
  if (!value) return 'NA';
  return Number(value).toFixed(1);
}

function comparisonFmt(value, inverse = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const actual = inverse ? Number(value) : Number(value);
  const positive = actual > 0;
  return `${positive ? '↑' : actual < 0 ? '↓' : '→'} ${Math.abs(actual).toFixed(1)}%`;
}

function rangeDays(range) {
  if (range === '24h') return 1;
  if (range === '7d') return 7;
  if (range === '28d') return 28;
  if (range === '3m') return 90;
  return 28;
}

function filterPerformanceRows(rows, range) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const days = rangeDays(range);
  return sorted.slice(Math.max(0, sorted.length - days));
}

function aggregatePerformanceRows(rows) {
  const clicks = (rows || []).reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const impressions = (rows || []).reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const weightedPosition = (rows || []).reduce((sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0), 0);

  return {
    totalClicks: clicks,
    totalImpressions: impressions,
    averageCtr: impressions ? clicks / impressions : 0,
    averagePosition: impressions ? weightedPosition / impressions : 0
  };
}

function percentChange(current, previous) {
  if (previous === null || previous === undefined || Number(previous) === 0) return current ? null : 0;
  return ((Number(current || 0) - Number(previous || 0)) / Number(previous)) * 100;
}

function computedPerformanceStats(rows, previousRows, fallbackKpis = {}, fallbackComparison = {}) {
  if (!rows?.length) {
    return { kpis: fallbackKpis, comparison: fallbackComparison };
  }

  const current = aggregatePerformanceRows(rows);
  const previous = aggregatePerformanceRows(previousRows || []);
  const hasPrevious = Boolean(previousRows?.length);

  return {
    kpis: {
      ...fallbackKpis,
      ...current
    },
    comparison: hasPrevious ? {
      clicks: percentChange(current.totalClicks, previous.totalClicks),
      impressions: percentChange(current.totalImpressions, previous.totalImpressions),
      ctr: percentChange(current.averageCtr, previous.averageCtr),
      position: previous.averagePosition ? ((previous.averagePosition - current.averagePosition) / previous.averagePosition) * 100 : null
    } : fallbackComparison
  };
}

function GeoKpiDeck({ kpis, comparison, dateRange, compact = false }) {
  const cards = [
    ['Total Clicks', numberFmt(kpis.totalClicks), comparisonFmt(comparison.clicks), 'Google Search Console'],
    ['Total Impressions', numberFmt(kpis.totalImpressions), comparisonFmt(comparison.impressions), 'Google Search Console'],
    ['Average CTR', percentFmt(kpis.averageCtr), comparisonFmt(comparison.ctr), 'Clicks / impressions'],
    ['Average Position', positionFmt(kpis.averagePosition), comparisonFmt(comparison.position), 'Lower is better'],
    ['Indexed Pages', numberFmt(kpis.indexedPages), null, 'Requires URL Inspection'],
    ['Valid Pages', numberFmt(kpis.validPages), null, 'Requires indexing source'],
    ['Crawled Pages', numberFmt(kpis.crawledPages), null, 'Requires crawl stats'],
    ['Not Indexed Pages', numberFmt(kpis.notIndexedPages), null, 'Requires index coverage'],
    ['Search Traffic Value', numberFmt(kpis.searchTrafficValue), null, 'Optional CPC provider'],
    ['New Pages Indexed', numberFmt(kpis.newPagesIndexed), null, 'Requires index history'],
    ['Lost Indexed Pages', numberFmt(kpis.lostIndexedPages), null, 'Requires index history'],
    ['Search Queries', numberFmt(kpis.searchQueries), null, 'Synced queries'],
    ['Ranking Keywords', numberFmt(kpis.rankingKeywords), null, 'Queries with impressions'],
    ['Mobile Usability Issues', numberFmt(kpis.mobileUsabilityIssues), null, 'Requires mobile API'],
    ['Core Web Vitals', kpis.coreWebVitalsStatus || 'Not connected', null, 'Requires PageSpeed/CrUX'],
    ['SEO Health Score', kpis.seoScore !== undefined ? `${kpis.seoScore}/100` : 'NA', null, dateRange ? `${dateRange.startDate} → ${dateRange.endDate}` : 'Awaiting sync']
  ];

  return (
    <div className={`geo-kpi-grid detailed ${compact ? 'compact' : ''}`}>
      {cards.map(([title, value, change, helper]) => (
        <article className="geo-kpi-card" key={title}>
          <p>{title}</p>
          <strong>{value}</strong>
          <div>
            {change ? <span className={change.includes('↑') ? 'positive' : change.includes('↓') ? 'negative' : ''}>{change}</span> : null}
            <small>{helper}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

const PERFORMANCE_RANGE_OPTIONS = [
  ['24h', '24 hours', 1],
  ['7d', '7 days', 7],
  ['28d', '28 days', 28],
  ['3m', '3 months', 90]
];

const PERFORMANCE_METRICS = {
  clicks: { label: 'Total clicks', shortLabel: 'Clicks', color: '#3b82f6', valueKey: 'totalClicks', formatter: numberFmt },
  impressions: { label: 'Total impressions', shortLabel: 'Impressions', color: '#673ab7', valueKey: 'totalImpressions', formatter: numberFmt },
  ctr: { label: 'Average CTR', shortLabel: 'CTR', color: '#f97316', valueKey: 'averageCtr', formatter: percentFmt },
  position: { label: 'Average position', shortLabel: 'Position', color: '#0f766e', valueKey: 'averagePosition', formatter: positionFmt, inverse: true }
};

function GeoPerformanceOverview({
  rows,
  kpis,
  comparison,
  summary,
  range,
  onRangeChange,
  visibleMetrics,
  onToggleMetric,
  showFilterPanel,
  onToggleFilterPanel
}) {
  const activeRange = PERFORMANCE_RANGE_OPTIONS.find(([key]) => key === range);
  const savedDays = rows?.length || 0;

  return (
    <article className="gsc-performance-card">
      <div className="gsc-filter-bar">
        <div className="gsc-chip-group">
          {PERFORMANCE_RANGE_OPTIONS.map(([key, label]) => (
            <button type="button" key={key} className={range === key ? 'active' : ''} onClick={() => onRangeChange(key)}>
              {range === key ? '✓ ' : ''}{label}
            </button>
          ))}
          <button type="button" onClick={() => onRangeChange('3m')}>More⌄</button>
        </div>
        <div className="gsc-chip-group">
          <button type="button" className="active" title="Current Search Console sync uses Web search rows. Image, video, news, and discover can be added in the backend later.">Search type: Web⌄</button>
          <button type="button" className={showFilterPanel ? 'active' : ''} onClick={onToggleFilterPanel}>＋ Add filter</button>
        </div>
        <span>{summary?.lastSyncedAt ? `Last update: ${summary.lastSyncedAt}` : 'Awaiting first refresh'}</span>
      </div>

      {showFilterPanel ? (
        <div className="gsc-filter-note">
          <SettingsIcon name="clipboard" />
          <div>
            <strong>Real data filters</strong>
            <p>Current saved Search Console rows include Web search performance. Country, query, page, device, and appearance filters are available in their GEO child tabs. More search types need a new sync with that Search Console parameter.</p>
          </div>
        </div>
      ) : null}

      <div className="gsc-metric-row">
        {Object.entries(PERFORMANCE_METRICS).map(([key, metric]) => (
          <GscMetricCard
            key={key}
            active={visibleMetrics.includes(key)}
            color={metric.color}
            label={metric.label}
            value={metric.formatter(kpis[metric.valueKey])}
            change={comparisonFmt(comparison[key], metric.inverse)}
            onClick={() => onToggleMetric(key)}
          />
        ))}
      </div>

      <div className="gsc-chart-context">
        <strong>{activeRange?.[1] || 'Selected range'}</strong>
        <span>{savedDays ? `${savedDays} saved daily rows rendered from the database` : 'No saved daily rows yet'}</span>
      </div>

      <GeoPerformanceChart rows={rows} visibleMetrics={visibleMetrics} />
    </article>
  );
}

function GscMetricCard({ label, value, change, active = false, color, onClick }) {
  return (
    <button type="button" className={`gsc-metric-card ${active ? 'active' : ''}`} style={{ '--metric-color': color }} onClick={onClick}>
      <span>{active ? '☑' : '☐'} {label}</span>
      <strong>{value}</strong>
      {change ? <small>{change}</small> : <small>Compared to previous period</small>}
    </button>
  );
}

function GeoPerformanceChart({ rows, visibleMetrics }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  if (!rows?.length) return <DashboardEmptyBlock title="No performance trend yet" text="Sync Search Console to save daily clicks, impressions, CTR, and position." />;
  const width = 960;
  const height = 390;
  const plot = { left: 54, right: 28, top: 34, bottom: 48 };
  const innerWidth = width - plot.left - plot.right;
  const innerHeight = height - plot.top - plot.bottom;
  const activeMetrics = visibleMetrics.length ? visibleMetrics : ['clicks'];
  const xFor = (index) => rows.length === 1 ? plot.left + innerWidth / 2 : plot.left + (index / (rows.length - 1)) * innerWidth;
  const valueFor = (row, key) => {
    if (key === 'ctr') return Number(row.ctr || 0) * 100;
    return Number(row[key] || 0);
  };
  const domainFor = (key) => {
    const values = rows.map((row) => valueFor(row, key));
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (max === min) return { min: 0, max: max || 1 };
    return { min, max };
  };
  const yFor = (row, key) => {
    const metric = PERFORMANCE_METRICS[key];
    const { min, max } = domainFor(key);
    const value = valueFor(row, key);
    const ratio = (value - min) / (max - min || 1);
    const adjusted = metric.inverse ? ratio : ratio;
    return plot.top + innerHeight - adjusted * innerHeight;
  };
  const pathFor = (key) => rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(2)} ${yFor(row, key).toFixed(2)}`).join(' ');
  const hoverRow = hoverIndex === null ? null : rows[hoverIndex];
  const hoverX = hoverIndex === null ? 0 : xFor(hoverIndex);
  const yTicks = [0, 1, 2, 3, 4];
  const labelStep = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <div className="geo-chart-wrap gsc-chart clean">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Search performance trend">
        <defs>
          <linearGradient id="geoChartFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fff7ed" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={plot.left} y={plot.top} width={innerWidth} height={innerHeight} fill="url(#geoChartFade)" rx="16" />
        {yTicks.map((line) => {
          const y = plot.top + line * (innerHeight / 4);
          return <path key={line} d={`M${plot.left} ${y}H${width - plot.right}`} className="geo-chart-grid" />;
        })}
        <path d={`M${plot.left} ${plot.top}V${height - plot.bottom}H${width - plot.right}`} className="geo-chart-axis" />
        {activeMetrics.map((key) => (
          <path key={key} d={pathFor(key)} fill="none" stroke={PERFORMANCE_METRICS[key].color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {rows.map((row, index) => {
          const x = xFor(index);
          return (
            <g key={row.date || index}>
              <rect
                x={x - Math.max(6, innerWidth / rows.length / 2)}
                y={plot.top}
                width={Math.max(12, innerWidth / rows.length)}
                height={innerHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              {index % labelStep === 0 ? <text x={x} y={height - 14}>{row.date?.slice(5) || row.date}</text> : null}
            </g>
          );
        })}
        {hoverRow ? (
          <g>
            <path d={`M${hoverX} ${plot.top}V${height - plot.bottom}`} className="geo-chart-hover-line" />
            {activeMetrics.map((key) => <circle key={key} cx={hoverX} cy={yFor(hoverRow, key)} r="5" fill={PERFORMANCE_METRICS[key].color} stroke="#fff" strokeWidth="2" />)}
          </g>
        ) : null}
      </svg>
      {hoverRow ? (
        <div className="geo-chart-tooltip">
          <strong>{hoverRow.date}</strong>
          {activeMetrics.map((key) => (
            <span key={key}>
              <i style={{ background: PERFORMANCE_METRICS[key].color }} />
              {PERFORMANCE_METRICS[key].shortLabel}: {key === 'ctr' ? percentFmt(hoverRow.ctr) : key === 'position' ? positionFmt(hoverRow.position) : numberFmt(hoverRow[key])}
            </span>
          ))}
        </div>
      ) : null}
      <div className="geo-chart-legend">
        {activeMetrics.map((key) => <span key={key}><i style={{ background: PERFORMANCE_METRICS[key].color }} />{PERFORMANCE_METRICS[key].shortLabel}</span>)}
        <span>Latest CTR {percentFmt(rows.at(-1)?.ctr)}</span>
        <span>Latest position {positionFmt(rows.at(-1)?.position)}</span>
      </div>
    </div>
  );
}

function filterGeoQueries(rows, filter) {
  return (rows || []).filter((row) => {
    const position = Number(row.position || 0);
    const ctr = Number(row.ctr || 0);
    const impressions = Number(row.impressions || 0);
    if (filter === 'growing') return row.status === 'Growing';
    if (filter === 'declining') return row.status === 'Declining';
    if (filter === 'new') return row.status === 'New';
    if (filter === 'lowCtr') return ctr < 0.02 && impressions >= 50;
    if (filter === 'highImpression') return impressions >= 100;
    if (filter === 'pos1to3') return position <= 3;
    if (filter === 'pos4to10') return position > 3 && position <= 10;
    if (filter === 'pos11to20') return position > 10 && position <= 20;
    return true;
  });
}

function GeoQueryControls({ value, onChange }) {
  const options = [
    ['all', 'All'],
    ['growing', 'Growing'],
    ['declining', 'Declining'],
    ['new', 'New'],
    ['lowCtr', 'Low CTR'],
    ['highImpression', 'High impression'],
    ['pos1to3', 'Position 1–3'],
    ['pos4to10', 'Position 4–10'],
    ['pos11to20', 'Position 11–20']
  ];

  return (
    <div className="geo-filter-row">
      {options.map(([key, label]) => (
        <button type="button" className={value === key ? 'active' : ''} onClick={() => onChange(key)} key={key}>{label}</button>
      ))}
    </div>
  );
}

function GeoOpportunitySections({ opportunities }) {
  return (
    <div className="geo-opportunity-grid">
      <DashboardPanel title="Keyword opportunity finder" action="Positions 8–20">
        <GeoMiniOpportunityTable rows={opportunities.keywordOpportunities || []} type="opportunity" />
      </DashboardPanel>
      <DashboardPanel title="Low CTR opportunities" action="Potential lost clicks">
        <GeoMiniOpportunityTable rows={opportunities.lowCtr || []} type="ctr" />
      </DashboardPanel>
      <DashboardPanel title="Winners" action="Traffic growth">
        <GeoMiniOpportunityTable rows={opportunities.winners || []} type="winner" />
      </DashboardPanel>
      <DashboardPanel title="Losers" action="Needs attention">
        <GeoMiniOpportunityTable rows={opportunities.losers || []} type="loser" />
      </DashboardPanel>
    </div>
  );
}

function GeoMiniOpportunityTable({ rows, type }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No rows yet" text="Sync Search Console and compare periods to fill this section." />;
  return (
    <table className="dashboard-data-table compact-table">
      <thead><tr><th>Query</th><th>Position</th><th>{type === 'ctr' ? 'Lost Clicks' : type === 'opportunity' ? 'Score' : 'Clicks Δ'}</th><th>Action</th></tr></thead>
      <tbody>
        {rows.slice(0, 8).map((row) => (
          <tr key={`${type}-${row.id || row.query}`}>
            <td>{row.query || row.dimension_key}</td>
            <td>{positionFmt(row.position)}</td>
            <td>{type === 'ctr' ? numberFmt(row.potential_lost_clicks) : type === 'opportunity' ? row.opportunity_score : numberFmt(row.click_change)}</td>
            <td>{type === 'ctr' ? 'Rewrite title/meta' : type === 'loser' ? 'Investigate drop' : 'Improve content'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const GEO_COUNTRY_META = {
  ARG: { alpha2: 'AR', name: 'Argentina', lat: -38.4, lng: -63.6 },
  AUS: { alpha2: 'AU', name: 'Australia', lat: -25.3, lng: 133.8 },
  BRA: { alpha2: 'BR', name: 'Brazil', lat: -14.2, lng: -51.9 },
  CAN: { alpha2: 'CA', name: 'Canada', lat: 56.1, lng: -106.3 },
  CHN: { alpha2: 'CN', name: 'China', lat: 35.9, lng: 104.2 },
  DEU: { alpha2: 'DE', name: 'Germany', lat: 51.2, lng: 10.4 },
  ESP: { alpha2: 'ES', name: 'Spain', lat: 40.5, lng: -3.7 },
  FRA: { alpha2: 'FR', name: 'France', lat: 46.2, lng: 2.2 },
  GBR: { alpha2: 'GB', name: 'United Kingdom', lat: 55.4, lng: -3.4 },
  IDN: { alpha2: 'ID', name: 'Indonesia', lat: -0.8, lng: 113.9 },
  IND: { alpha2: 'IN', name: 'India', lat: 20.6, lng: 78.9 },
  ITA: { alpha2: 'IT', name: 'Italy', lat: 41.9, lng: 12.6 },
  JPN: { alpha2: 'JP', name: 'Japan', lat: 36.2, lng: 138.3 },
  MEX: { alpha2: 'MX', name: 'Mexico', lat: 23.6, lng: -102.5 },
  NLD: { alpha2: 'NL', name: 'Netherlands', lat: 52.1, lng: 5.3 },
  PHL: { alpha2: 'PH', name: 'Philippines', lat: 12.9, lng: 121.8 },
  SGP: { alpha2: 'SG', name: 'Singapore', lat: 1.35, lng: 103.8 },
  THA: { alpha2: 'TH', name: 'Thailand', lat: 15.8, lng: 101.0 },
  TUR: { alpha2: 'TR', name: 'Turkey', lat: 39.0, lng: 35.2 },
  UKR: { alpha2: 'UA', name: 'Ukraine', lat: 48.4, lng: 31.2 },
  USA: { alpha2: 'US', name: 'United States', lat: 39.8, lng: -98.6 },
  VNM: { alpha2: 'VN', name: 'Vietnam', lat: 14.1, lng: 108.3 },
  ZAF: { alpha2: 'ZA', name: 'South Africa', lat: -30.6, lng: 22.9 }
};

const GEO_ALPHA2_TO_ALPHA3 = Object.fromEntries(
  Object.entries(GEO_COUNTRY_META).map(([alpha3, meta]) => [meta.alpha2, alpha3])
);

function normalizedCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code.length === 2 ? GEO_ALPHA2_TO_ALPHA3[code] || code : code;
}

function displayCountryName(country) {
  const code = normalizedCountryCode(country?.country);
  const meta = GEO_COUNTRY_META[code];
  return country?.country_label && country.country_label !== code ? country.country_label : meta?.name || code || 'Unknown';
}

function GeoLeafletMap({ rows, focusedCountryCode }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const maxImpressions = Math.max(...(rows || []).map((row) => Number(row.impressions || 0)), 0);
  const plottedRows = (rows || []).map((row) => {
    const code = normalizedCountryCode(row.country);
    const meta = GEO_COUNTRY_META[code] || { name: row.country_label || code || 'Unknown', lat: 0, lng: 0 };
    const intensity = maxImpressions ? Math.max(0.1, Number(row.impressions || 0) / maxImpressions) : 0.1;
    return { ...row, code, meta, intensity };
  });

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    mapRef.current = L.map(mapElementRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true
    }).setView([22, 10], 2);

    L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 8,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapRef.current);
    layerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();

    plottedRows.forEach((row) => {
      const isFocused = !focusedCountryCode || row.code === focusedCountryCode;
      const radius = 7 + row.intensity * 28;
      const marker = L.circleMarker([row.meta.lat, row.meta.lng], {
        radius,
        color: isFocused ? '#000142' : '#ff9d00',
        fillColor: isFocused ? '#ff9d00' : '#ffbf5c',
        fillOpacity: isFocused ? 0.72 : 0.24,
        opacity: isFocused ? 1 : 0.34,
        weight: isFocused ? 3 : 1.5
      });
      marker.bindPopup(`
        <strong>${displayCountryName(row)}</strong><br/>
        ${Number(row.impressions || 0).toLocaleString()} impressions<br/>
        ${Number(row.clicks || 0).toLocaleString()} clicks<br/>
        CTR ${(Number(row.ctr || 0) * 100).toFixed(2)}%
      `);
      marker.addTo(layerRef.current);
    });

    const focusedRow = plottedRows.find((row) => row.code === focusedCountryCode);

    if (focusedRow) {
      mapRef.current.flyTo([focusedRow.meta.lat, focusedRow.meta.lng], 4, { duration: 0.7 });
    } else {
      mapRef.current.flyTo([22, 10], 2, { duration: 0.7 });
    }
  }, [focusedCountryCode, maxImpressions, rows]);

  return (
    <div className="geo-world-map">
      <div ref={mapElementRef} className="geo-leaflet-map" aria-label="World map showing Google Search Console geographic presence" />
      {!plottedRows.length ? (
        <div className="geo-map-empty">
          <SettingsIcon name="globe" />
          <strong>No GEO rows saved yet</strong>
          <span>Click Sync Search Console after connecting a verified property. Hummingbird stores every country row by company workspace.</span>
        </div>
      ) : null}
    </div>
  );
}

function GeoCountryFocus({ country }) {
  return (
    <div className="geo-country-focus">
      <div>
        <small>Selected country</small>
        <strong>{displayCountryName(country)}</strong>
      </div>
      <div><small>Clicks</small><strong>{country.clicks}</strong></div>
      <div><small>Impressions</small><strong>{country.impressions}</strong></div>
      <div><small>CTR</small><strong>{(Number(country.ctr || 0) * 100).toFixed(2)}%</strong></div>
      <div><small>Avg position</small><strong>{Number(country.position || 0).toFixed(1)}</strong></div>
    </div>
  );
}

function GeoCountryTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No country data yet" text="Sync Google Search Console to populate country rows." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Country</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
      <tbody>
        {rows.slice(0, 12).map((row) => (
          <tr key={`${row.country}-${row.id}`}>
            <td>{row.country_label} <span className="muted">({row.country})</span></td>
            <td>{row.clicks}</td>
            <td>{row.impressions}</td>
            <td>{(Number(row.ctr || 0) * 100).toFixed(2)}%</td>
            <td>{Number(row.position || 0).toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoQueryTable({ rows, detailed = false }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No query data yet" text="Sync Google Search Console to populate query and page rows." />;

  return (
    <table className="dashboard-data-table">
      <thead>
        <tr>
          <th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th>
          {detailed ? <><th>Position Δ</th><th>Clicks Δ</th><th>Intent</th><th>Brand</th><th>Trend</th></> : <><th>Country</th><th>Page</th></>}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, detailed ? 18 : 12).map((row) => (
          <tr key={`${row.id}-${row.query}`}>
            <td>{row.query || 'Unknown query'}</td>
            <td>{row.clicks}</td>
            <td>{row.impressions}</td>
            <td>{percentFmt(row.ctr)}</td>
            <td>{positionFmt(row.position)}</td>
            {detailed ? (
              <>
                <td>{row.position_change === null || row.position_change === undefined ? 'New' : Number(row.position_change).toFixed(1)}</td>
                <td>{numberFmt(row.click_change)}</td>
                <td>{row.search_intent || 'Mixed'}</td>
                <td>{row.brand_type || 'Non-brand'}</td>
                <td><StatusBadge active={row.status === 'Growing' || row.status === 'New'}>{row.status || 'Stable'}</StatusBadge></td>
              </>
            ) : (
              <>
                <td>{row.country || 'NA'}</td>
                <td className="url-cell">{row.page || 'NA'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoPageTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No page data yet" text="Sync Search Console to populate page performance rows." />;

  return (
    <table className="dashboard-data-table">
      <thead><tr><th>URL</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th><th>Status</th><th>Page Type</th><th>Tags</th></tr></thead>
      <tbody>
        {rows.slice(0, 18).map((row) => (
          <tr key={row.url}>
            <td className="url-cell">{row.url}</td>
            <td>{row.clicks}</td>
            <td>{row.impressions}</td>
            <td>{percentFmt(row.ctr)}</td>
            <td>{positionFmt(row.position)}</td>
            <td>{row.indexed_status}</td>
            <td>{row.page_type}</td>
            <td>{(row.tags || []).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoDeviceTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No device data yet" text="Sync Search Console to populate desktop, mobile, and tablet rows." />;
  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Device</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg Position</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.dimension_key}>
            <td>{row.dimension_key || 'Unknown'}</td>
            <td>{row.clicks}</td>
            <td>{row.impressions}</td>
            <td>{percentFmt(row.ctr)}</td>
            <td>{positionFmt(row.position)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoSearchAppearanceTable({ rows }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No search appearance data yet" text="Google only returns this when rich result/search appearance rows exist." />;
  return (
    <table className="dashboard-data-table">
      <thead><tr><th>Appearance</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg Position</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.dimension_key}>
            <td>{row.dimension_key || 'Unknown'}</td>
            <td>{row.clicks}</td>
            <td>{row.impressions}</td>
            <td>{percentFmt(row.ctr)}</td>
            <td>{positionFmt(row.position)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GeoUnsupportedMetrics({ items }) {
  return (
    <div className="geo-source-list">
      {(items || []).map((item) => (
        <div key={item}>
          <SettingsIcon name="clipboard" />
          <span>{item}</span>
          <strong>Requires additional Google API/source</strong>
        </div>
      ))}
    </div>
  );
}
