import { useState } from 'react';
import { api } from '../lib/api';
import { EmptyInline, Input, Metric, PageHeader, ProviderLogo, providerConfigs } from '../components/common';

export default function PromptResearch({ data, onChange, workspace, goTo }) {
  const prompts = data?.prompts || [];
  const researchHistory = data?.researchHistory || [];
  const promptLimit = data?.limits?.prompts;
  const canManage = Boolean(data?.canManage);
  const [researching, setResearching] = useState(false);
  const [including, setIncluding] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState({});
  const [form, setForm] = useState({
    providerName: 'gemini',
    maxPrompts: '10',
    goal: '',
    serviceFocus: '',
    audience: '',
    locationFocus: '',
    buyerStage: 'Decision / comparison',
    notes: ''
  });

  const remaining = Math.max(0, Number(promptLimit?.remaining ?? 30));
  const used = Number(promptLimit?.used ?? prompts.length);
  const limit = Number(promptLimit?.limit ?? used + remaining);
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const selectedPrompts = suggestions.filter((prompt) => selected[prompt.id]);
  const selectedProvider = providerConfigs.find((provider) => (provider.key === 'chatgpt' ? 'openai' : provider.key) === form.providerName) || providerConfigs[0];
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const requestedPromptCount = remaining > 0
    ? Math.max(1, Math.min(Number(form.maxPrompts || remaining) || remaining, remaining))
    : 0;

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggle(id) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  async function researchPrompts(event) {
    event.preventDefault();

    if (!canManage) {
      setMessage('Your role can view prompts but cannot research or add new prompts.');
      return;
    }

    if (remaining <= 0) {
      setMessage('Prompt limit reached. Ask a Developer to increase this workspace prompt limit.');
      return;
    }

    setResearching(true);
    setErrors({});
    setMessage('');

    try {
      const result = await api('/api/prompts/research', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          maxPrompts: requestedPromptCount
        })
      });

      setSuggestions(result.suggestions || []);
      setSelected({});

      if (result.limits && data) {
        onChange({ ...data, limits: result.limits, researchHistory: result.researchHistory || data.researchHistory || [] });
      }

      setMessage(`Prompt research found ${(result.suggestions || []).length} candidate prompts.`);
    } catch (error) {
      setMessage(error.message);
      setErrors(error.data?.errors || {});

      if (error.data?.limits && data) {
        onChange({ ...data, limits: error.data.limits });
      }
    } finally {
      setResearching(false);
    }
  }

  async function includeSelectedPrompts() {
    if (!selectedPrompts.length) {
      setMessage('Select at least one researched prompt to include.');
      return;
    }

    if (selectedPrompts.length > remaining) {
      setMessage(`Only ${remaining} prompt slots are remaining for this workspace.`);
      return;
    }

    setIncluding(true);
    setMessage('');

    try {
      const result = await api('/api/prompts/research/include', {
        method: 'POST',
        body: JSON.stringify({
          providerName: form.providerName,
          prompts: selectedPrompts
        })
      });

      onChange(result);
      setSuggestions([]);
      setSelected({});
      const addedCount = Number(result.addedPrompts || selectedPrompts.length);

      if (result.visibilityError) {
        setMessage(`${addedCount} researched prompt${addedCount === 1 ? '' : 's'} added. ${result.visibilityError}`);
      } else if (result.refreshRun) {
        const partial = result.failedBatches ? ` ${result.failedBatches} batch${result.failedBatches === 1 ? '' : 'es'} had provider issues.` : '';
        setMessage(`${addedCount} researched prompt${addedCount === 1 ? '' : 's'} added and AI responses generated.${partial}`);
      } else {
        setMessage(`${addedCount} researched prompt${addedCount === 1 ? '' : 's'} added to the prompt table.`);
      }

      if (typeof goTo === 'function') {
        window.setTimeout(() => goTo('prompts'), 650);
      }
    } catch (error) {
      setMessage(error.message);

      if (error.data?.limits && data) {
        onChange({ ...data, limits: error.data.limits });
      }
    } finally {
      setIncluding(false);
    }
  }

  async function includeHistoryPrompt(prompt) {
    if (!canManage) {
      setMessage('Your role can view prompt research history but cannot add prompts.');
      return;
    }

    if (remaining <= 0) {
      setMessage('Prompt limit reached. Ask a Developer to increase this workspace prompt limit.');
      return;
    }

    setIncluding(true);
    setMessage('');

    try {
      const result = await api('/api/prompts/research/include', {
        method: 'POST',
        body: JSON.stringify({
          providerName: prompt.provider_name || form.providerName,
          prompts: [{
            ...prompt,
            history_id: prompt.history_id || prompt.id
          }]
        })
      });

      onChange(result);
      const addedCount = Number(result.addedPrompts || 0);
      const linkedCount = Number(result.linkedHistoryPrompts || 0);

      if (!addedCount && linkedCount) {
        setMessage('That prompt was already in the prompt table, so the history item was marked as added.');
        return;
      }

      if (result.visibilityError) {
        setMessage(`${addedCount} historical prompt${addedCount === 1 ? '' : 's'} added. ${result.visibilityError}`);
      } else if (result.refreshRun) {
        const partial = result.failedBatches ? ` ${result.failedBatches} batch${result.failedBatches === 1 ? '' : 'es'} had provider issues.` : '';
        setMessage(`${addedCount} historical prompt${addedCount === 1 ? '' : 's'} added and AI responses generated.${partial}`);
      } else {
        setMessage(`${addedCount} historical prompt${addedCount === 1 ? '' : 's'} added to the prompt table.`);
      }

      if (typeof goTo === 'function') {
        window.setTimeout(() => goTo('prompts'), 650);
      }
    } catch (error) {
      setMessage(error.message);

      if (error.data?.limits && data) {
        onChange({ ...data, limits: error.data.limits });
      }
    } finally {
      setIncluding(false);
    }
  }

  return (
    <section className="page-content prompt-research-page">
      <PageHeader
        eyebrow="Prompt Research"
        title="Prompt research studio"
        subtitle="Turn a buyer, service, or market focus into high-value AI search prompts before adding them to the workspace."
        workspace={workspace}
      />

      <article className="prompt-research-hero">
        <div>
          <p className="eyebrow">Research workflow</p>
          <h2>Find the next prompts worth tracking</h2>
          <p>Aimate uses the saved business profile, existing prompts, and your brief to suggest non-duplicate prompts that fit the remaining workspace capacity.</p>
          <div className="prompt-research-steps">
            <span><b>1</b> Answer the brief</span>
            <span><b>2</b> Choose a model</span>
            <span><b>3</b> Review candidates</span>
            <span><b>4</b> Include selected</span>
          </div>
        </div>
        <div className="prompt-capacity-orb">
          <span>{remaining}</span>
          <strong>slots left</strong>
          <div className="prompt-capacity-ring" style={{ '--usage': `${usagePercent}%` }} />
        </div>
      </article>

      <div className="metric-grid prompt-research-metrics">
        <Metric title="Prompt Capacity" value={`${used}/${limit}`} helper="Prompts used in this workspace" />
        <Metric title="Remaining Slots" value={remaining} helper="Maximum new prompts you can include" />
        <Metric title="Candidates" value={suggestions.length} helper="Research results from selected model" />
        <Metric title="History" value={researchHistory.length} helper="Saved research candidates" />
      </div>

      {message ? <div className={message.toLowerCase().includes('found') || message.toLowerCase().includes('added') ? 'success-notice' : 'notice'}>{message}</div> : null}

      <div className="prompt-research-layout">
        <article className="prompt-research-workbench">
          <div className="dashboard-panel-head">
            <div>
              <p className="eyebrow">Research brief</p>
              <h2>Tell Aimate what prompt set you need</h2>
            </div>
            <span>{remaining} slots left</span>
          </div>

          <form className="prompt-research-page-form" onSubmit={researchPrompts}>
            <div className="research-limit-card">
              <span>Available prompt slots</span>
              <strong>{remaining}</strong>
              <small>Research can only return prompts you still have room to add.</small>
            </div>

            <label className="prompt-research-count-card">
              <span>
                <strong>Prompts to research</strong>
                <small>Choose how many of your remaining slots you want to use for this research run.</small>
              </span>
              <input
                type="number"
                min="1"
                max={Math.max(1, remaining)}
                value={form.maxPrompts}
                disabled={remaining <= 0}
                onChange={(event) => update('maxPrompts', event.target.value)}
                onBlur={() => update('maxPrompts', String(requestedPromptCount || 1))}
              />
              <em>Max {remaining}</em>
            </label>

            <div className="prompt-model-picker">
              <div>
                <span>Selected model</span>
                <strong><ProviderLogo providerKey={selectedProvider.key} /> {selectedProvider.label}</strong>
              </div>
              <div className="prompt-model-grid">
                {providerConfigs.map((provider) => {
                  const value = provider.key === 'chatgpt' ? 'openai' : provider.key;
                  return (
                    <button
                      type="button"
                      key={provider.key}
                      className={form.providerName === value ? 'active' : ''}
                      onClick={() => update('providerName', value)}
                    >
                      <ProviderLogo providerKey={provider.key} />
                      <span>{provider.label}</span>
                    </button>
                  );
                })}
              </div>
              {errors.providerName ? <strong>{errors.providerName}</strong> : null}
            </div>

            <Input label="Research Goal" value={form.goal} error={errors.goal} onChange={(value) => update('goal', value)} />
            <Input label="Service / Topic Focus" value={form.serviceFocus} error={errors.serviceFocus} onChange={(value) => update('serviceFocus', value)} />
            <Input label="Target Buyer" value={form.audience} error={errors.audience} onChange={(value) => update('audience', value)} />
            <Input label="Location / Market Focus" value={form.locationFocus} optional onChange={(value) => update('locationFocus', value)} />
            <Input label="Buyer Stage" value={form.buyerStage} optional onChange={(value) => update('buyerStage', value)} />

            <label className="field">
              <span>Extra Notes <small>Optional</small></span>
              <span className="input-shell textarea-shell">
                <textarea value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} rows={5} />
              </span>
            </label>

            <button className="primary-button" type="submit" disabled={researching || remaining <= 0 || !canManage}>
              {researching ? 'Researching prompts…' : `Research ${requestedPromptCount} prompt${requestedPromptCount === 1 ? '' : 's'}`}
            </button>
          </form>
        </article>

        <article className="prompt-research-results-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="eyebrow">Candidate prompts</p>
              <h2>Review and include</h2>
            </div>
            <span>{selectedCount}/{Math.min(requestedPromptCount || remaining, remaining)} selected</span>
          </div>

          {suggestions.length ? (
            <div className="prompt-research-results-list">
              {suggestions.map((prompt, index) => (
                <label className={`prompt-research-card ${selected[prompt.id] ? 'selected' : ''}`} key={prompt.id}>
                  <input type="checkbox" checked={Boolean(selected[prompt.id])} onChange={() => toggle(prompt.id)} />
                  <i>{index + 1}</i>
                  <span>
                    <strong>{prompt.prompt_text}</strong>
                    <small>{prompt.prompt_category} · {prompt.prompt_intent}</small>
                    <em>{prompt.why_recommended}</em>
                  </span>
                  <b>{prompt.priority}</b>
                </label>
              ))}

              <button className="primary-button" type="button" onClick={includeSelectedPrompts} disabled={including || selectedCount === 0 || selectedCount > remaining}>
                {including ? 'Including prompts…' : `Include ${selectedCount || ''} selected prompt${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          ) : (
            <EmptyInline
              title="No research results yet"
              text="Fill the research brief, choose a model, and generate prompt candidates. Selected prompts will be added to the main Prompts table."
            />
          )}
        </article>
      </div>

      <div className="prompt-research-provider-strip">
        {providerConfigs.map((provider) => (
          <span key={provider.key}>
            <ProviderLogo providerKey={provider.key} />
            {provider.label}
          </span>
        ))}
      </div>

      <article className="prompt-research-history-panel">
        <div className="dashboard-panel-head">
          <div>
            <p className="eyebrow">Research history</p>
            <h2>Saved prompt ideas</h2>
          </div>
          <span>{researchHistory.length} saved</span>
        </div>

        {researchHistory.length ? (
          <div className="prompt-research-history-list">
            {researchHistory.map((prompt) => {
              const isIncluded = prompt.status === 'included';
              const provider = providerConfigs.find((item) => (item.key === 'chatgpt' ? 'openai' : item.key) === prompt.provider_name);
              const createdAt = prompt.created_at ? new Date(prompt.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved';

              return (
                <div className={`prompt-research-history-card ${isIncluded ? 'included' : ''}`} key={prompt.id}>
                  <div className="prompt-research-history-meta">
                    <span>
                      <ProviderLogo providerKey={provider?.key || prompt.provider_name || 'gemini'} />
                      {provider?.label || prompt.provider_name || 'Aimate'}
                    </span>
                    <b>{isIncluded ? 'Added' : 'Candidate'}</b>
                  </div>
                  <strong>{prompt.prompt_text}</strong>
                  <small>{prompt.prompt_category || 'Prompt Research'} · {prompt.prompt_intent || 'Buyer-intent tracking'}</small>
                  {prompt.why_recommended ? <em>{prompt.why_recommended}</em> : null}
                  <div className="prompt-research-history-actions">
                    <span>{createdAt}</span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => includeHistoryPrompt(prompt)}
                      disabled={!canManage || including || isIncluded || remaining <= 0}
                    >
                      {isIncluded ? 'Already added' : 'Add back'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyInline
            title="No research history yet"
            text="Run prompt research once and Aimate will keep every suggested prompt here, even if you do not add it immediately."
          />
        )}
      </article>
    </section>
  );
}
