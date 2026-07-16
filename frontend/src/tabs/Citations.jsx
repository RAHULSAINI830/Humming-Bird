import { EmptyInline, Metric, PageHeader } from '../components/common';

function safeDomain(url) {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function sourceInitial(name) {
  return String(name || 'S').trim().slice(0, 1).toUpperCase();
}

function topSources(citations) {
  const bySource = new Map();

  citations.forEach((citation) => {
    const label = citation.source_owner || safeDomain(citation.url) || 'Unknown source';
    const current = bySource.get(label) || {
      label,
      domain: safeDomain(citation.url),
      count: 0,
      prompts: new Set()
    };

    current.count += 1;
    current.prompts.add(citation.prompt_id);
    bySource.set(label, current);
  });

  return Array.from(bySource.values())
    .map((source) => ({ ...source, prompts: source.prompts.size }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);
}

export default function Citations({ data, workspace }) {
  const citations = data?.citations || [];
  const summary = data?.summary || {};
  const sources = topSources(citations);
  const uniqueDomains = new Set(citations.map((citation) => safeDomain(citation.url)).filter(Boolean)).size;

  return (
    <section className="page-content citations-page">
      <PageHeader
        eyebrow="Citations"
        title="Citation intelligence"
        subtitle="Source pages Hummingbird found from saved AI responses, brand mentions, competitor mentions, and prompt checks."
        workspace={workspace}
      />

      <div className="metric-grid citations-metric-grid">
        <Metric title="Total Citations" value={summary.total ?? citations.length} helper="Saved source recommendations" />
        <Metric title="Prompts With Citations" value={summary.promptsWithCitations ?? 0} helper="Prompts producing citation ideas" />
        <Metric title="Unique Domains" value={uniqueDomains} helper="Different source domains found" />
        <Metric title="Top Sources" value={sources.length} helper="Highest repeated citation owners" />
      </div>

      <div className="citations-layout-grid">
        <article className="citations-insight-card">
          <div>
            <p className="eyebrow">Citation map</p>
            <h2>Where answer engines may pull proof from</h2>
            <p>
              These are the pages and domains appearing as citation opportunities in saved prompt checks.
              Use them to understand which brand, competitor, and third-party pages need stronger content support.
            </p>
          </div>
          <div className="citation-orb" aria-hidden="true">
            <span />
            <i />
            <i />
          </div>
        </article>

        <article className="citations-source-card">
          <div className="citations-section-head">
            <div>
              <p className="eyebrow">Top citation owners</p>
              <h2>Repeated sources</h2>
            </div>
            <span>{sources.length} sources</span>
          </div>
          <div className="citation-source-list">
            {sources.map((source) => (
              <div key={source.label}>
                <b>{sourceInitial(source.label)}</b>
                <span>
                  <strong>{source.label}</strong>
                  <small>{source.domain || 'No domain'} · {source.prompts} prompt{source.prompts === 1 ? '' : 's'}</small>
                </span>
                <em>{source.count}</em>
              </div>
            ))}
            {!sources.length ? <EmptyInline title="No source owners yet" text="Run prompt checks to discover citation owners." /> : null}
          </div>
        </article>
      </div>

      <div className="table-panel citations-table-panel">
        <div className="citations-section-head table-head">
          <div>
            <p className="eyebrow">Citation records</p>
            <h2>Saved source recommendations</h2>
          </div>
          <span>{citations.length} rows</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Source page</th>
              <th>Domain</th>
              <th>Owner</th>
              <th>Why recommended</th>
            </tr>
          </thead>
          <tbody>
            {citations.map((citation) => {
              const domain = safeDomain(citation.url);

              return (
                <tr key={citation.id}>
                  <td>
                    <div className="citation-prompt-cell">
                      <b>#{citation.prompt_order}</b>
                      <span>{citation.prompt_text}</span>
                    </div>
                  </td>
                  <td>
                    <div className="citation-page-cell">
                      <strong>{citation.page_title}</strong>
                      {citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">Open source ↗</a> : <small>NA</small>}
                    </div>
                  </td>
                  <td>{domain ? <span className="citation-domain-pill">{domain}</span> : 'NA'}</td>
                  <td>{citation.source_owner || 'Unknown'}</td>
                  <td className="long-cell">{citation.why_recommended || 'NA'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!citations.length ? <EmptyInline title="No citations yet" text="Run prompt checks from the Prompts tab to generate citation recommendations." /> : null}
      </div>
    </section>
  );
}
