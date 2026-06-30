import { EmptyInline, Metric, PageHeader } from '../components/common';

export default function Citations({ data, workspace }) {
  const citations = data?.citations || [];
  const summary = data?.summary || {};

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="Citations"
        title="Citation recommendations"
        subtitle="Pages recommended by prompt checks for brand and competitor visibility."
        workspace={workspace}
      />

      <div className="mini-metric-grid">
        <Metric title="Total Citations" value={summary.total ?? citations.length} helper="Recommended source pages" />
        <Metric title="Prompts With Citations" value={summary.promptsWithCitations ?? 0} helper="Prompts producing citation ideas" />
      </div>

      <div className="table-panel">
        <table>
          <thead><tr><th>Prompt #</th><th>Prompt</th><th>Page</th><th>URL</th><th>Owner</th><th>Why Recommended</th></tr></thead>
          <tbody>
            {citations.map((citation) => (
              <tr key={citation.id}>
                <td>{citation.prompt_order}</td>
                <td>{citation.prompt_text}</td>
                <td>{citation.page_title}</td>
                <td>{citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.url}</a> : 'NA'}</td>
                <td>{citation.source_owner || 'Unknown'}</td>
                <td className="long-cell">{citation.why_recommended || 'NA'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!citations.length ? <EmptyInline title="No citations yet" text="Run prompt checks from the Prompts tab to generate citation recommendations." /> : null}
      </div>
    </section>
  );
}
