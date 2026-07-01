import { useState } from 'react';
import { api } from '../lib/api';
import { ChipList, EmptyInline, IconButton, Input, Metric, PageHeader, ProviderLogo, SideFormTray, StatusBadge, providerConfigs } from '../components/common';

export default function Prompts({ data, onChange, workspace }) {
  const prompts = data?.prompts || [];
  const summary = data?.summary || {};
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [activeProvider, setActiveProvider] = useState('gemini');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ promptCategory: 'Manual', promptIntent: 'Manual tracking' });
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');

    try {
      const result = await api('/api/prompts/add', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onChange(result);
      setForm({ promptCategory: 'Manual', promptIntent: 'Manual tracking' });
      setAddOpen(false);
      setMessage('Prompt added.');
    } catch (error) {
      setMessage(error.message);
      setErrors(error.data?.errors || {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="Prompts"
        title="Prompt visibility table"
        subtitle="All generated and manual prompts from the backend database."
        workspace={workspace}
        action={data?.canManage ? <IconButton label="Add prompt" onClick={() => setAddOpen(true)} /> : null}
      />

      <div className="metric-grid">
        <Metric title="Total Prompts" value={summary.total ?? prompts.length} helper="Generated and manual prompts" />
        <Metric title="Checked Prompts" value={summary.checked ?? 0} helper="Prompts sent to Hummingbird AI" />
        <Metric title="Brand Mentioned" value={summary.brandMentioned ?? 0} helper="Exact response contains brand" />
        <Metric title="Citation Ideas" value={summary.citations ?? 0} helper="Recommended citation pages" />
      </div>

      {message ? <div className={Object.keys(errors).length ? 'notice' : 'success-notice'}>{message}</div> : null}

      <div className="table-panel">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Prompt</th>
            <th>Category</th>
            <th>Intent</th>
            <th>Brand Mention</th>
            <th>Competitors</th>
            <th>Citations</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {prompts.map((prompt) => (
            <tr
              key={prompt.id}
              className="clickable-row"
              onClick={() => {
                setSelectedPrompt(prompt);
                setActiveProvider('gemini');
              }}
            >
              <td>{prompt.prompt_order}</td>
              <td>{prompt.prompt_text}</td>
              <td>{prompt.prompt_category || 'NA'}</td>
              <td>{prompt.prompt_intent || 'NA'}</td>
              <td><StatusBadge active={prompt.brand_mentioned}>{prompt.brand_mentioned ? 'Yes' : 'No'}</StatusBadge></td>
              <td><ChipList items={(prompt.competitor_mentions_parsed || []).map((item) => ({
                label: item.competitor_name || item.name || 'Competitor',
                url: item.website_url || item.url || ''
              }))} empty="None" /></td>
              <td>{(prompt.recommended_citations_parsed || []).length}</td>
              <td>{prompt.visibility_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <PromptResponseTray
        prompt={selectedPrompt}
        activeProvider={activeProvider}
        setActiveProvider={setActiveProvider}
        onClose={() => setSelectedPrompt(null)}
      />

      <SideFormTray
        open={addOpen}
        title="Add prompt"
        eyebrow="Manual prompt"
        onClose={() => setAddOpen(false)}
      >
        <form className="tray-form" onSubmit={submit}>
          <Input label="Prompt Text" value={form.promptText} error={errors.promptText} onChange={(value) => update('promptText', value)} />
          <Input label="Category" value={form.promptCategory} optional onChange={(value) => update('promptCategory', value)} />
          <Input label="Intent" value={form.promptIntent} optional onChange={(value) => update('promptIntent', value)} />
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Prompt'}</button>
        </form>
      </SideFormTray>
    </section>
  );
}

function AiResponses({ data }) {
  const responses = data?.responses || [];
  const summary = data?.summary || {};
  const latestResponses = responses.slice(0, 3);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [activeProvider, setActiveProvider] = useState('gemini');

  return (
    <section className="page-content">
      <div className="page-title">
        <p className="eyebrow">AI Responses</p>
        <h1>Exact provider responses</h1>
        <p>Hummingbird AI responses are stored now. ChatGPT, Claude, and Perplexity show NA until keys are connected.</p>
      </div>

      <div className="metric-grid">
        <ProviderMetric title="Hummingbird AI" value={summary.gemini ?? 0} status="Connected" providerKey="gemini" active />
        <ProviderMetric title="ChatGPT" value={summary.chatgpt ?? 0} status="NA · API key missing" />
        <ProviderMetric title="Claude" value={summary.claude ?? 0} status="NA · API key missing" />
        <ProviderMetric title="Perplexity" value={summary.perplexity ?? 0} status="NA · API key missing" />
      </div>

      {latestResponses.length ? (
        <div className="response-card-grid">
          {latestResponses.map((prompt) => (
            <article className="response-card" key={`card-${prompt.id}`}>
              <div className="response-card-head">
                <ProviderLogo providerKey="gemini" />
                <div>
                  <p className="eyebrow">Hummingbird AI response</p>
                  <h2>Prompt #{prompt.prompt_order}</h2>
                </div>
                <StatusBadge active={prompt.brand_mentioned}>{prompt.brand_mentioned ? 'Brand mentioned' : 'No brand mention'}</StatusBadge>
              </div>
              <p className="response-prompt">{prompt.prompt_text}</p>
              <div className="response-exact">{prompt.gemini_response_summary || prompt.ai_response_summary || 'NA'}</div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Prompt</th>
              <th>Brand Mention</th>
              <th>Hummingbird AI Exact Response</th>
              <th>ChatGPT</th>
              <th>Claude</th>
              <th>Perplexity</th>
              <th>Checked</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((prompt) => (
              <tr
                key={prompt.id}
                className="clickable-row"
                onClick={() => {
                  setSelectedPrompt(prompt);
                  setActiveProvider('gemini');
                }}
              >
                <td>{prompt.prompt_order}</td>
                <td>{prompt.prompt_text}</td>
                <td><StatusBadge active={prompt.brand_mentioned}>{prompt.brand_mentioned ? 'Yes' : 'No'}</StatusBadge></td>
                <td className="long-cell">{prompt.gemini_response_summary || prompt.ai_response_summary || 'NA'}</td>
                <td>{prompt.chatgpt_response_summary || 'NA'}</td>
                <td>{prompt.claude_response_summary || 'NA'}</td>
                <td>{prompt.perplexity_response_summary || 'NA'}</td>
                <td>{prompt.last_checked_at || 'Not checked'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!responses.length ? <EmptyInline title="No AI responses yet" text="Run prompt checks from the Prompts tab to populate responses." /> : null}
      </div>

      <PromptResponseTray
        prompt={selectedPrompt}
        activeProvider={activeProvider}
        setActiveProvider={setActiveProvider}
        onClose={() => setSelectedPrompt(null)}
      />
    </section>
  );
}

function PromptResponseTray({ prompt, activeProvider, setActiveProvider, onClose }) {
  const provider = providerConfigs.find((item) => item.key === activeProvider) || providerConfigs[0];
  const response = prompt
    ? (prompt[provider.field] || (provider.key === 'gemini' ? prompt.ai_response_summary : '') || 'NA')
    : 'NA';
  const isOpen = Boolean(prompt);

  return (
    <div className={`response-tray-layer ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
      <button className="response-tray-backdrop" type="button" onClick={onClose} aria-label="Close response viewer" />
      <aside className="response-tray" role="dialog" aria-modal="true" aria-label="AI response viewer">
        {prompt ? (
          <>
            <div className="response-tray-header">
              <div>
                <p className="eyebrow">AI response viewer</p>
                <h2>Prompt #{prompt.prompt_order}</h2>
              </div>
              <button type="button" className="tray-close" onClick={onClose}>×</button>
            </div>

            <div className="tray-prompt-card">
              <small>Selected prompt</small>
              <p>{prompt.prompt_text}</p>
              <div className="tray-meta-row">
                <StatusBadge active={prompt.brand_mentioned}>{prompt.brand_mentioned ? 'Brand mentioned' : 'No brand mention'}</StatusBadge>
                <span>{prompt.visibility_status || 'not_checked'}</span>
              </div>
            </div>

            <div className="provider-tabs" role="tablist" aria-label="AI providers">
              {providerConfigs.map((item) => {
                const providerResponse = prompt[item.field] || (item.key === 'gemini' ? prompt.ai_response_summary : '') || 'NA';
                const hasResponse = providerResponse && providerResponse !== 'NA';
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={activeProvider === item.key ? 'active' : ''}
                    onClick={() => setActiveProvider(item.key)}
                  >
                    <ProviderLogo providerKey={item.key} />
                    <strong>{item.label}</strong>
                    <small>{hasResponse ? 'Response saved' : 'NA'}</small>
                  </button>
                );
              })}
            </div>

            <div className="tray-response-panel">
              <div className="tray-response-head">
                <ProviderLogo providerKey={provider.key} />
                <div>
                  <h3>{provider.label}</h3>
                  <p>{response && response !== 'NA' ? 'Exact saved response' : 'Provider response not available yet'}</p>
                </div>
              </div>
              <div className={response && response !== 'NA' ? 'tray-response-text' : 'tray-response-text empty'}>
                {response && response !== 'NA' ? response : 'NA — API key is not connected for this provider yet.'}
              </div>
            </div>

            <div className="tray-section">
              <h3>Competitors mentioned</h3>
              <ChipList items={(prompt.competitor_mentions_parsed || []).map((item) => ({
                label: item.competitor_name || item.name || 'Competitor',
                url: item.website_url || item.url || ''
              }))} empty="None" />
            </div>

            <div className="tray-section">
              <h3>Citations</h3>
              {(prompt.recommended_citations_parsed || []).length ? (
                <div className="citation-mini-list">
                  {prompt.recommended_citations_parsed.map((citation, index) => (
                    <a href={citation.url || '#'} target="_blank" rel="noreferrer" key={`${citation.url}-${index}`}>
                      <strong>{citation.page_title || citation.source_owner || 'Citation page'}</strong>
                      <small>{citation.url || 'URL not available'}</small>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted">No citation recommendations saved for this prompt.</p>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function ProviderMetric({ title, value, status, providerKey = '', active = false }) {
  const key = providerKey || title.toLowerCase().split(' ')[0];
  return (
    <article className={`provider-card ${active ? 'active' : ''}`}>
      <div className="provider-card-top">
        <ProviderLogo providerKey={key === 'chatgpt' ? 'chatgpt' : key} />
        <StatusBadge active={active}>{status}</StatusBadge>
      </div>
      <h2>{title}</h2>
      <strong>{value}</strong>
      <p>Stored responses</p>
    </article>
  );
}
