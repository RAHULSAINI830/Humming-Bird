import { useState } from 'react';
import { HUMMINGBIRD_LOGO, navItems } from '../lib/constants';
import { api } from '../lib/api';

export function BrandLogo({ centered = false }) {
  return (
    <span className={`brand-logo ${centered ? 'centered' : ''}`}>
      <img src={HUMMINGBIRD_LOGO} alt="Hummingbird" />
    </span>
  );
}

export function LoadingScreen() {
  return (
    <main className="loading-screen">
      <section className="loading-stage">
        <div className="loading-orbit" aria-hidden="true">
          <span className="loading-core"><BrandLogo centered /></span>
          <i />
          <i />
          <i />
        </div>
        <div className="loading-copy">
          <p className="eyebrow">Hummingbird AI</p>
          <h1>Preparing your visibility workspace</h1>
          <p>Syncing secure session state, workspace access, and saved intelligence from the backend.</p>
        </div>
        <div className="loading-steps" aria-label="Loading progress">
          <span>Session</span>
          <span>Workspace</span>
          <span>Signals</span>
        </div>
        <div className="loading-bar advanced"><span /></div>
      </section>
    </main>
  );
}

export function SetupGenerationScreen({ session, setupStatus, loading, error, onAction, onLogout }) {
  const steps = setupStatus?.steps || [
    { key: 'analysis', label: 'Business analysis', complete: false, description: 'Analyze company website and business profile.' },
    { key: 'competitors', label: 'Competitor discovery', complete: false, description: 'Discover related companies for comparison.' },
    { key: 'prompts', label: 'Prompt generation', complete: false, description: 'Create buyer-intent AI search prompts.' },
    { key: 'checks', label: 'AI visibility checks', complete: false, description: 'Send prompts to Gemini and save responses.' }
  ];
  const completed = steps.filter((step) => step.complete).length;
  const percent = Math.round((completed / steps.length) * 100);
  const canGenerate = ['Developer', 'Super Admin', 'Business Owner', 'Marketing Manager'].includes(session.selectedRoleName);
  const [competitorForm, setCompetitorForm] = useState({});
  const [promptForm, setPromptForm] = useState({ promptCategory: 'Manual', promptIntent: 'Manual tracking' });
  const analysis = setupStatus?.analysis;
  const competitors = setupStatus?.competitors || [];
  const prompts = setupStatus?.prompts || [];
  const hasAnalysis = Boolean(analysis);
  const hasCompetitors = competitors.length > 0;
  const hasPrompts = prompts.length > 0;
  const hasChecks = (setupStatus?.counts?.checkedPrompts || 0) > 0;

  async function addCompetitor(event) {
    event.preventDefault();
    await onAction('../competitors/add'.replace('../', ''), {
      competitorName: competitorForm.competitorName,
      websiteUrl: competitorForm.websiteUrl,
      notes: competitorForm.notes
    });
    setCompetitorForm({});
  }

  async function addPrompt(event) {
    event.preventDefault();
    await onAction('../prompts/add'.replace('../', ''), {
      promptText: promptForm.promptText,
      promptCategory: promptForm.promptCategory,
      promptIntent: promptForm.promptIntent
    });
    setPromptForm({ promptCategory: 'Manual', promptIntent: 'Manual tracking' });
  }

  return (
    <main className="setup-gate-page">
      <section className="setup-gate-shell">
        <div className="setup-gate-header">
          <a className="sidebar-brand" href="#setup">
            <BrandLogo />
          </a>
          <button type="button" onClick={onLogout}>Logout</button>
        </div>

        <div className="setup-gate-grid">
          <article className="setup-gate-hero">
            <p className="eyebrow">Workspace preparation</p>
            <h1>Building your AI visibility platform</h1>
            <p>
              Before showing the dashboard, Hummingbird generates real business intelligence, competitors,
              prompts, and Gemini visibility checks for <strong>{session.selectedCompanyName}</strong>.
            </p>

            <div className="setup-company-card">
              <LogoChip name={session.selectedCompanyName || 'Company'} url={session.selectedCompanyLogoUrl} size="large" />
              <div>
                <span>Selected workspace</span>
                <strong>{session.selectedCompanyName}</strong>
                <small>{session.selectedRoleName}</small>
              </div>
            </div>

            <div className="setup-progress-track">
              <span style={{ width: `${loading ? Math.max(percent, 18) : percent}%` }} />
            </div>
            <small>{loading ? 'Generating with Gemini… this can take a little while.' : `${percent}% ready`}</small>

            {error ? <div className="notice">{error}</div> : null}

            {canGenerate ? (
              <div className="setup-action-stack">
                {!hasAnalysis ? (
                  <button className="setup-generate-button" type="button" onClick={() => onAction('generate-analysis')} disabled={Boolean(loading)}>
                    {loading === 'generate-analysis' ? 'Generating business analysis…' : 'Generate business analysis'}
                  </button>
                ) : !hasCompetitors ? (
                  <button className="setup-generate-button" type="button" onClick={() => onAction('generate-competitors')} disabled={Boolean(loading)}>
                    {loading === 'generate-competitors' ? 'Discovering competitors…' : 'Confirm analysis & discover competitors'}
                  </button>
                ) : !hasPrompts ? (
                  <button className="setup-generate-button" type="button" onClick={() => onAction('generate-prompts')} disabled={Boolean(loading)}>
                    {loading === 'generate-prompts' ? 'Generating prompts…' : 'Confirm competitors & generate prompts'}
                  </button>
                ) : !hasChecks ? (
                  <button className="setup-generate-button" type="button" onClick={() => onAction('run-checks')} disabled={Boolean(loading)}>
                    {loading === 'run-checks' ? 'Running Gemini checks…' : 'Confirm prompts & run AI checks'}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="info-notice">Your role can view the platform after an authorized user generates setup data.</div>
            )}
          </article>

          <article className="setup-pipeline-card">
            <div className="setup-orbit-loader">
              <span><SettingsIcon name="sparkles" /></span>
              <i />
              <i />
              <i />
            </div>
            <div className="setup-step-list">
              {steps.map((step, index) => (
                <div className={`${step.complete ? 'complete' : ''} ${loading && !step.complete ? 'running' : ''}`} key={step.key}>
                  <b>{step.complete ? '✓' : index + 1}</b>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <section className="setup-review-grid">
          <article className="setup-review-card">
            <div className="setup-review-head">
              <p className="eyebrow">Analysis review</p>
              <span>{hasAnalysis ? 'Ready to confirm' : 'Not generated'}</span>
            </div>
            <h2>{analysis?.detected_industry || 'Business analysis'}</h2>
            <p>{analysis?.business_summary || 'Generate the business analysis first. You will review it before discovering competitors.'}</p>
          </article>

          <article className="setup-review-card">
            <div className="setup-review-head">
              <p className="eyebrow">Competitors review</p>
              <span>{competitors.length} competitors</span>
            </div>
            <div className="setup-review-list">
              {competitors.map((competitor) => (
                <div key={competitor.id}>
                  <strong>{competitor.competitor_name}</strong>
                  <small>{competitor.website_url || 'No URL'}</small>
                  <button type="button" onClick={() => onAction('competitors/remove', { competitorId: competitor.id })} disabled={Boolean(loading)}>Remove</button>
                </div>
              ))}
            </div>
            {hasAnalysis ? (
              <form className="setup-mini-form" onSubmit={addCompetitor}>
                <input placeholder="Competitor name" value={competitorForm.competitorName || ''} onChange={(event) => setCompetitorForm((current) => ({ ...current, competitorName: event.target.value }))} />
                <input placeholder="Website URL" value={competitorForm.websiteUrl || ''} onChange={(event) => setCompetitorForm((current) => ({ ...current, websiteUrl: event.target.value }))} />
                <button type="submit" disabled={Boolean(loading)}>Add competitor</button>
              </form>
            ) : null}
          </article>

          <article className="setup-review-card wide">
            <div className="setup-review-head">
              <p className="eyebrow">Prompt review</p>
              <span>{prompts.length} prompts</span>
            </div>
            <div className="setup-review-list prompts">
              {prompts.map((prompt) => (
                <div key={prompt.id}>
                  <strong>{prompt.prompt_text}</strong>
                  <small>{prompt.prompt_category || 'Prompt'} · {prompt.prompt_intent || 'Intent'}</small>
                  <button type="button" onClick={() => onAction('prompts/remove', { promptId: prompt.id })} disabled={Boolean(loading)}>Remove</button>
                </div>
              ))}
            </div>
            {hasCompetitors ? (
              <form className="setup-mini-form prompt-form" onSubmit={addPrompt}>
                <input placeholder="Add a prompt" value={promptForm.promptText || ''} onChange={(event) => setPromptForm((current) => ({ ...current, promptText: event.target.value }))} />
                <input placeholder="Category" value={promptForm.promptCategory || ''} onChange={(event) => setPromptForm((current) => ({ ...current, promptCategory: event.target.value }))} />
                <input placeholder="Intent" value={promptForm.promptIntent || ''} onChange={(event) => setPromptForm((current) => ({ ...current, promptIntent: event.target.value }))} />
                <button type="submit" disabled={Boolean(loading)}>Add prompt</button>
              </form>
            ) : null}
          </article>
        </section>
      </section>
    </main>
  );
}

export function WorkspaceCard({ session, onChange }) {
  return (
    <div className="workspace-heading-card">
      <LogoChip name={session.selectedCompanyName || 'Company'} url={session.selectedCompanyLogoUrl} />
      <div>
        <small>Workspace</small>
        <select value={session.selectedCompanyId || ''} onChange={onChange}>
          {(session.workspaceCompanies || []).map((company) => (
            <option value={company.company_id} key={company.company_id}>
              {company.company_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function AuthScreen({ mode, setMode, onAuthenticated }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const isSignup = mode === 'signup';

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setFieldErrors({});

    try {
      const path = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const data = await api(path, { method: 'POST', body: JSON.stringify(form) });
      onAuthenticated(data);
    } catch (requestError) {
      setError(requestError.message);
      setFieldErrors(requestError.data?.errors || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="brand-row">
          <BrandLogo />
        </div>
        <h1>{isSignup ? 'Create your workspace.' : 'Welcome back to Hummingbird.'}</h1>
        <p>
          Track AI visibility, prompts, competitor mentions, citations, and business intelligence from one premium workspace.
        </p>
        <div className="hero-stats">
          <span>Gemini-ready</span>
          <span>Workspace access</span>
          <span>Role security</span>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={!isSignup ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={isSignup ? 'active' : ''} onClick={() => setMode('signup')}>Sign Up</button>
        </div>

        <p className="eyebrow">{isSignup ? 'New workspace' : 'Secure access'}</p>
        <h2>{isSignup ? 'Start with your company' : 'Login to your dashboard'}</h2>
        <p className="muted">
          {isSignup
            ? 'Create your Hummingbird workspace. You will become the Business Owner.'
            : 'Use your Hummingbird account to continue your AI visibility workflow.'}
        </p>

        {error ? <div className="error-box">{error}</div> : null}

        <form className="auth-form" onSubmit={submit}>
          {isSignup ? (
            <>
              <FormSection title="Account Details">
                <Input label="Full Name" value={form.fullName} error={fieldErrors.fullName} onChange={(value) => update('fullName', value)} />
                <Input label="Email" type="email" value={form.email} error={fieldErrors.email} onChange={(value) => update('email', value)} />
                <Input label="Password" type="password" value={form.password} error={fieldErrors.password} onChange={(value) => update('password', value)} />
                <Input label="Confirm Password" type="password" value={form.confirmPassword} error={fieldErrors.confirmPassword} onChange={(value) => update('confirmPassword', value)} />
              </FormSection>

              <FormSection title="Company Workspace">
                <Input label="Company Name" value={form.companyName} error={fieldErrors.companyName} onChange={(value) => update('companyName', value)} />
                <Input label="Website URL" value={form.websiteUrl} error={fieldErrors.websiteUrl} onChange={(value) => update('websiteUrl', value)} />
                <Input label="Logo URL" value={form.logoUrl} optional onChange={(value) => update('logoUrl', value)} className="wide" />
              </FormSection>
            </>
          ) : (
            <FormSection title="Login">
              <Input label="Email" type="email" value={form.email} onChange={(value) => update('email', value)} className="wide" />
              <Input label="Password" type="password" value={form.password} onChange={(value) => update('password', value)} className="wide" />
            </FormSection>
          )}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : isSignup ? 'Create Workspace' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  );
}

export function FormSection({ title, children }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

export function Input({ label, type = 'text', value = '', onChange, error, optional = false, className = '' }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const actualType = isPassword && visible ? 'text' : type;

  return (
    <label className={`field ${className} ${isPassword ? 'password-field' : ''}`}>
      <span>{label} {optional ? <small>Optional</small> : <em>Required</em>}</span>
      <span className="input-shell">
        <input type={actualType} value={value || ''} onChange={(event) => onChange(event.target.value)} />
        {isPassword ? (
          <button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M7.4 7.8C5.6 8.8 4.1 10.2 3 12c2.2 3.6 5.2 5.4 9 5.4 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.2 6.7c.6-.1 1.2-.2 1.8-.2 3.8 0 6.8 1.8 9 5.5-.6 1-1.4 1.9-2.2 2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 12s3.3-5.5 9-5.5S21 12 21 12s-3.3 5.5-9 5.5S3 12 3 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </button>
        ) : null}
      </span>
      {error ? <strong>{error}</strong> : null}
    </label>
  );
}

export function PageHeader({ eyebrow, title, subtitle, workspace, action }) {
  return (
    <div className="page-title page-title-row">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="page-title-actions">
        {action}
        {workspace}
      </div>
    </div>
  );
}

export function IconButton({ label, onClick }) {
  return (
    <button type="button" className="icon-add-button" onClick={onClick} aria-label={label} title={label}>
      <span>＋</span>
    </button>
  );
}

export const providerConfigs = [
  { key: 'gemini', label: 'Gemini', field: 'gemini_response_summary', connected: true, logoUrl: 'https://gemini.google.com' },
  { key: 'chatgpt', label: 'ChatGPT', field: 'chatgpt_response_summary', connected: false, logoUrl: 'https://chatgpt.com' },
  { key: 'claude', label: 'Claude', field: 'claude_response_summary', connected: false, logoUrl: 'https://claude.ai' },
  { key: 'perplexity', label: 'Perplexity', field: 'perplexity_response_summary', connected: false, logoUrl: 'https://perplexity.ai' }
];

export function ProviderLogo({ providerKey }) {
  const provider = providerConfigs.find((item) => item.key === providerKey) || providerConfigs[0];
  return (
    <span className={`provider-logo ${provider.key}`}>
      <img src={logoUrlFor(provider.logoUrl)} alt={`${provider.label} logo`} />
    </span>
  );
}

export function SideFormTray({ open, eyebrow, title, children, onClose }) {
  return (
    <div className={`response-tray-layer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <button className="response-tray-backdrop" type="button" onClick={onClose} aria-label={`Close ${title}`} />
      <aside className="response-tray form-tray" role="dialog" aria-modal="true" aria-label={title}>
        {open ? (
          <>
            <div className="response-tray-header">
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2>{title}</h2>
              </div>
              <button type="button" className="tray-close" onClick={onClose}>×</button>
            </div>
            {children}
          </>
        ) : null}
      </aside>
    </div>
  );
}

export function StatusBadge({ active, children }) {
  return <span className={`status-badge ${active ? 'active' : ''}`}>{children}</span>;
}

export function logoUrlFor(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(raw)) return raw;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalized)}&sz=64`;
}

export function LogoChip({ name = 'R', url = '', size = '' }) {
  const [failed, setFailed] = useState(false);
  const source = !failed ? logoUrlFor(url) : '';
  const initial = String(name || 'R').trim().charAt(0).toUpperCase() || 'R';

  return (
    <span className={`logo-chip ${size}`}>
      {source ? <img src={source} alt="" onError={() => setFailed(true)} /> : <span>{initial}</span>}
    </span>
  );
}

export function ChipList({ items, empty }) {
  const cleaned = (items || []).filter(Boolean);
  if (!cleaned.length) return <span className="muted">{empty}</span>;
  return (
    <div className="chip-list">
      {cleaned.map((item, index) => {
        const normalized = typeof item === 'string' ? { label: item, url: '' } : item;
        return (
          <span key={`${normalized.label}-${index}`} title={normalized.label} aria-label={normalized.label}>
            <LogoChip name={normalized.label} url={normalized.url} />
          </span>
        );
      })}
    </div>
  );
}

export function EmptyInline({ title, text }) {
  return (
    <div className="inline-empty">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

export function TablePage({ title, subtitle, children }) {
  return (
    <section className="page-content">
      <div className="page-title">
        <p className="eyebrow">{title}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="table-panel">{children}</div>
    </section>
  );
}

export function ComingSoon({ title }) {
  return (
    <section className="empty-state">
      <BrandLogo centered />
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p>This React page shell is ready. We can move this module from backend logic into frontend components next.</p>
    </section>
  );
}

export function labelForView(view) {
  const item = navItems.find(([, key]) => key === view);
  if (item) return item[0];
  if (view === 'developer') return 'Developer Admin';
  return 'Page';
}

export function DashboardEmptyBlock({ title, text }) {
  return (
    <div className="dashboard-empty-block">
      <SettingsIcon name="clipboard" />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function DashboardPanel({ title, action, children }) {
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

export function Metric({ title, value, helper, icon, compact = false }) {
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

export function SettingsIcon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  };

  const icons = {
    file: <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>,
    checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.2 2.2 4.8-5.4" /></>,
    building: <><path d="M4 21h16" /><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M9 8h1" /><path d="M14 8h1" /><path d="M9 12h1" /><path d="M14 12h1" /><path d="M10 21v-4h4v4" /></>,
    trend: <><path d="M3 17 9 11l4 4 8-8" /><path d="M14 7h7v7" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>,
    image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8" cy="10" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    tag: <><path d="M20.5 13.5 13 21 3 11V3h8z" /><circle cx="8" cy="8" r="1" /></>,
    mapPin: <><path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" /><circle cx="12" cy="10" r="2" /></>,
    flag: <><path d="M5 22V4" /><path d="M5 4h12l-2 5 2 5H5" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    rocket: <><path d="M4.5 16.5c-1.2 1-1.5 3-1.5 3s2-.3 3-1.5c.6-.7.6-1.7 0-2.3s-1.6-.6-1.5.8z" /><path d="M9 15 5 11l5-5c3.3-3.3 7.5-3.6 10-2-1.6 2.5-1.3 6.7-4.6 10z" /><path d="M9 15h4l5-5" /><path d="M9 15v-4l5-5" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5" /><path d="M12 16V8" /><path d="M16 16v-3" /></>,
    clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="M8 12h8" /><path d="M8 16h6" /></>,
    sparkles: <><path d="M12 2 14.5 8.5 21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" /><path d="M19 3v4" /><path d="M21 5h-4" /><path d="M5 17v3" /><path d="M6.5 18.5h-3" /></>
  };

  return <svg {...common}>{icons[name] || icons.file}</svg>;
}
