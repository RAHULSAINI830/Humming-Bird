import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';
import { DashboardEmptyBlock, EmptyInline, PageHeader, StatusBadge } from '../components/common';

export default function GeoVisibility({ data, onChange, workspace }) {
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [mapMode, setMapMode] = useState('world');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [queryFilter, setQueryFilter] = useState('all');
  const [geoTab, setGeoTab] = useState('performance');
  const countries = data?.countries || [];
  const queries = data?.queries || [];
  const pages = data?.pages || [];
  const devices = data?.devices || [];
  const searchAppearance = data?.searchAppearance || [];
  const performanceSeries = data?.performanceSeries || [];
  const opportunities = data?.opportunities || {};
  const properties = data?.properties || [];
  const summary = data?.summary || {};
  const kpis = data?.kpis || {};
  const comparison = data?.comparison || {};
  const canManage = Boolean(data?.canManage);
  const sortedCountries = [...countries].sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0));
  const activeCountry = sortedCountries.find((country) => normalizedCountryCode(country.country) === selectedCountry) || sortedCountries[0] || null;
  const focusedCountryCode = mapMode === 'country' ? normalizedCountryCode(activeCountry?.country) : '';
  const filteredQueries = filterGeoQueries(queries, queryFilter);

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
        title="Geographic search presence"
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
            <button type="button" className="primary-button" onClick={() => { window.location.href = '/api/google/connect'; }}>
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

          <GeoSubTabs active={geoTab} onChange={setGeoTab} />

          {geoTab === 'performance' ? (
            <>
              <GeoPerformanceOverview rows={performanceSeries} kpis={kpis} comparison={comparison} summary={summary} />
              <GeoKpiDeck kpis={kpis} comparison={comparison} dateRange={summary.dateRange} compact />
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

function GeoSubTabs({ active, onChange }) {
  const tabs = [
    ['performance', 'Performance', 'Clicks, impressions, CTR'],
    ['queries', 'Queries', 'Keywords and opportunities'],
    ['pages', 'Pages', 'URLs and search appearance'],
    ['countries', 'Countries', 'Map and markets'],
    ['technical', 'Technical', 'Devices and extra sources']
  ];

  return (
    <div className="geo-subtabs">
      {tabs.map(([key, label, helper]) => (
        <button type="button" key={key} className={active === key ? 'active' : ''} onClick={() => onChange(key)}>
          <strong>{label}</strong>
          <span>{helper}</span>
        </button>
      ))}
    </div>
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

function GeoPerformanceOverview({ rows, kpis, comparison, summary }) {
  return (
    <article className="gsc-performance-card">
      <div className="gsc-filter-bar">
        <div className="gsc-chip-group">
          {['24 hours', '7 days', '28 days'].map((item) => <button type="button" key={item}>{item}</button>)}
          <button type="button" className="active">✓ 3 months</button>
          <button type="button">More⌄</button>
        </div>
        <div className="gsc-chip-group">
          <button type="button">Search type: Web⌄</button>
          <button type="button">＋ Add filter</button>
        </div>
        <span>{summary?.lastSyncedAt ? `Last update: ${summary.lastSyncedAt}` : 'Awaiting first refresh'}</span>
      </div>

      <div className="gsc-metric-row">
        <GscMetricCard active tone="blue" label="Total clicks" value={numberFmt(kpis.totalClicks)} change={comparisonFmt(comparison.clicks)} />
        <GscMetricCard active tone="purple" label="Total impressions" value={numberFmt(kpis.totalImpressions)} change={comparisonFmt(comparison.impressions)} />
        <GscMetricCard label="Average CTR" value={percentFmt(kpis.averageCtr)} change={comparisonFmt(comparison.ctr)} />
        <GscMetricCard label="Average position" value={positionFmt(kpis.averagePosition)} change={comparisonFmt(comparison.position)} />
      </div>

      <GeoPerformanceChart rows={rows} gsc />
    </article>
  );
}

function GscMetricCard({ label, value, change, active = false, tone = '' }) {
  return (
    <div className={`gsc-metric-card ${active ? 'active' : ''} ${tone}`}>
      <span>{active ? '☑' : '☐'} {label}</span>
      <strong>{value}</strong>
      {change ? <small>{change}</small> : <small>Compared to previous period</small>}
    </div>
  );
}

function GeoPerformanceChart({ rows, gsc = false }) {
  if (!rows?.length) return <DashboardEmptyBlock title="No performance trend yet" text="Sync Search Console to save daily clicks, impressions, CTR, and position." />;
  const width = 860;
  const height = gsc ? 360 : 260;
  const metrics = [
    ['clicks', 'Clicks', '#ff9d00'],
    ['impressions', 'Impressions', '#000142']
  ];
  const max = Math.max(...rows.flatMap((row) => [Number(row.clicks || 0), Number(row.impressions || 0)]), 1);
  const pointsFor = (key) => rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * (width - 60) + 30;
    const y = height - 30 - (Number(row[key] || 0) / max) * (height - 70);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className={`geo-chart-wrap ${gsc ? 'gsc-chart' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Search performance trend">
        <path d={`M30 25V${height - 30}H835`} className="geo-chart-axis" />
        {[0, 1, 2, 3, 4].map((line) => <path key={line} d={`M30 ${55 + line * ((height - 95) / 4)}H835`} className="geo-chart-grid" />)}
        {metrics.map(([key, label, color]) => (
          <polyline key={key} points={pointsFor(key)} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {rows.map((row, index) => {
          const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * (width - 60) + 30;
          return index % Math.ceil(rows.length / 7 || 1) === 0 ? <text key={row.date} x={x} y={height - 8}>{row.date?.slice(5) || row.date}</text> : null;
        })}
      </svg>
      <div className="geo-chart-legend">
        <span><i style={{ background: '#ff9d00' }} />Clicks</span>
        <span><i style={{ background: '#000142' }} />Impressions</span>
        <span>CTR {percentFmt(rows.at(-1)?.ctr)}</span>
        <span>Avg position {positionFmt(rows.at(-1)?.position)}</span>
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
