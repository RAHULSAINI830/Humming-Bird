import { useEffect, useState } from 'react';

const HUMMINGBIRD_LOGO = '/app/Himmingbird%20ai%20full%20logo.svg';

const navItems = [
  ['Dashboard', 'dashboard', '◆'],
  ['Business Analysis', 'business-analysis', '▤'],
  ['What’s Next', 'aeo-recommendations', '↗'],
  ['Competitors', 'competitors', '◎'],
  ['Prompts', 'prompts', '✦'],
  ['Citations', 'citations', '◇'],
  ['Users', 'users', '◌'],
  ['Settings', 'settings', '⚙']
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.data = data;
    throw error;
  }

  return data;
}

function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [status, setStatus] = useState('loading');
  const [activeView, setActiveView] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [businessAnalysis, setBusinessAnalysis] = useState(null);
  const [aeoRecommendations, setAeoRecommendations] = useState(null);
  const [promptsData, setPromptsData] = useState({ prompts: [], summary: null });
  const [competitorsData, setCompetitorsData] = useState({ competitors: [] });
  const [citationsData, setCitationsData] = useState({ citations: [], summary: null });
  const [settingsData, setSettingsData] = useState(null);
  const [usersData, setUsersData] = useState({ users: [], company: null });
  const [developerData, setDeveloperData] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api('/api/session')
      .then((data) => {
        setSession(data);
        setStatus('ready');
      })
      .catch(() => setStatus('guest'));
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;

    if (activeView === 'dashboard') {
      api('/api/dashboard').then(setDashboard).catch((error) => setNotice(error.message));
    }

    if (activeView === 'business-analysis') {
      api('/api/business-analysis').then(setBusinessAnalysis).catch((error) => setNotice(error.message));
    }

    if (activeView === 'aeo-recommendations') {
      api('/api/aeo-recommendations').then(setAeoRecommendations).catch((error) => setNotice(error.message));
    }

    if (activeView === 'prompts') {
      api('/api/prompts').then(setPromptsData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'competitors') {
      api('/api/competitors').then(setCompetitorsData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'citations') {
      api('/api/citations').then(setCitationsData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'settings') {
      api('/api/settings').then(setSettingsData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'users') {
      api('/api/users').then(setUsersData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'developer') {
      api('/api/developer').then(setDeveloperData).catch((error) => setNotice(error.message));
    }
  }, [activeView, status]);

  useEffect(() => {
    if (status !== 'ready' || !session?.selectedCompanyId || session.isDeveloper) {
      return;
    }

    setSetupStatus(null);
    api('/api/setup/status')
      .then(setSetupStatus)
      .catch((error) => setSetupError(error.message));
  }, [status, session?.selectedCompanyId, session?.isDeveloper]);

  async function handleLogout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    setSession(null);
    setStatus('guest');
    setDashboard(null);
  }

  async function handleWorkspaceChange(event) {
    const data = await api('/api/workspace/select', {
      method: 'POST',
      body: JSON.stringify({ companyId: Number(event.target.value) })
    });
    setSession(data);
    setSetupStatus(null);
    setDashboard(null);
    setActiveView('dashboard');
  }

  async function handleSetupAction(action, payload = {}) {
    setSetupLoading(action);
    setSetupError('');

    try {
      const result = await api(`/api/setup/${action}`, { method: 'POST', body: JSON.stringify(payload) });
      setSetupStatus(result);
      if (result.ready) {
        const dashboardResult = await api('/api/dashboard');
        setDashboard(dashboardResult);
        setActiveView('dashboard');
      }
    } catch (error) {
      setSetupError(error.message);
    } finally {
      setSetupLoading(false);
    }
  }

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'guest') {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        onAuthenticated={(data) => {
          setSession(data);
          setStatus('ready');
          setActiveView('dashboard');
        }}
      />
    );
  }

  if (!session.isDeveloper && session.selectedCompanyId && (!setupStatus || !setupStatus.ready)) {
    return (
      <SetupGenerationScreen
        session={session}
        setupStatus={setupStatus}
        loading={setupLoading}
        error={setupError}
        onAction={handleSetupAction}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#dashboard" onClick={() => setActiveView('dashboard')}>
          <BrandLogo />
        </a>

        <nav className="sidebar-nav">
          {session.isDeveloper ? (
            <button type="button" onClick={() => setActiveView('developer')} className={activeView === 'developer' ? 'active' : ''}>
              <span>▰</span> Developer Admin
            </button>
          ) : null}
          {navItems.map(([label, view, icon]) => (
            <button
              type="button"
              key={view}
              onClick={() => setActiveView(view)}
              className={activeView === view ? 'active' : ''}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-panel">
            <p>Selected role</p>
            <strong>{session.selectedRoleName || 'No role selected'}</strong>
          </div>

          <div className="sidebar-user-card">
            <div className="sidebar-user-top">
              <LogoChip name={session.user.fullName || 'User'} />
              <div>
                <strong>{session.user.fullName}</strong>
                <small>{session.user.email}</small>
              </div>
            </div>
            <button type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </aside>

      <section className="main-area">
        {notice ? <div className="notice">{notice}</div> : null}

        {activeView === 'dashboard' ? <Dashboard data={dashboard} session={session} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} goTo={setActiveView} /> : null}
        {activeView === 'business-analysis' ? <BusinessAnalysis data={businessAnalysis} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'aeo-recommendations' ? <AeoRecommendations data={aeoRecommendations} onChange={setAeoRecommendations} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} goTo={setActiveView} /> : null}
        {activeView === 'competitors' ? <Competitors data={competitorsData} onChange={setCompetitorsData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'prompts' ? <Prompts data={promptsData} onChange={setPromptsData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'citations' ? <Citations data={citationsData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'users' ? <Users data={usersData} onChange={setUsersData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'settings' ? <Settings data={settingsData} onChange={setSettingsData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'developer' ? <DeveloperAdmin data={developerData} onChange={setDeveloperData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
      </section>
    </main>
  );
}

function BrandLogo({ centered = false }) {
  return (
    <span className={`brand-logo ${centered ? 'centered' : ''}`}>
      <img src={HUMMINGBIRD_LOGO} alt="Hummingbird" />
    </span>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-page">
      <section className="loading-card">
        <BrandLogo centered />
        <h1>Loading Hummingbird</h1>
        <p>Connecting the React frontend to the backend API.</p>
        <div className="loading-bar"><span /></div>
      </section>
    </main>
  );
}

function SetupGenerationScreen({ session, setupStatus, loading, error, onAction, onLogout }) {
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

function WorkspaceCard({ session, onChange }) {
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

function AuthScreen({ mode, setMode, onAuthenticated }) {
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

function FormSection({ title, children }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

function Input({ label, type = 'text', value = '', onChange, error, optional = false, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label} {optional ? <small>Optional</small> : <em>Required</em>}</span>
      <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} />
      {error ? <strong>{error}</strong> : null}
    </label>
  );
}

function PageHeader({ eyebrow, title, subtitle, workspace, action }) {
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

function IconButton({ label, onClick }) {
  return (
    <button type="button" className="icon-add-button" onClick={onClick} aria-label={label} title={label}>
      <span>＋</span>
    </button>
  );
}

function Dashboard({ data, session, workspace, goTo }) {
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
          <p className="eyebrow">Unified Visibility</p>
          <h2>{hasRealData ? percentOrEmpty(visibility.visibilityScore) : 'Awaiting first AI scan'}</h2>
          <p>
            {hasRealData
              ? `Combined score from real available provider data only: ${activeProviders.join(', ')}.`
              : 'No provider response data has been saved yet. Hummingbird will combine only real provider results when scans are available.'}
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
            <p>Hummingbird does not use mock numbers. Complete the flow below and this page will populate from saved AI responses, mentions, competitors, and citations.</p>
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
            <span className="soft-pill">{analysis?.source_type || 'No source'}</span>
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

function DashboardEmptyBlock({ title, text }) {
  return (
    <div className="dashboard-empty-block">
      <SettingsIcon name="clipboard" />
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

function AeoRecommendations({ data, onChange, workspace, goTo }) {
  const latest = data?.latest;
  const summary = data?.summary || {};
  const prerequisites = data?.prerequisites || {};
  const priorities = latest?.priorities || [];
  const actions = latest?.action_plan || [];
  const opportunities = latest?.content_opportunities || [];
  const evidence = latest?.evidence || [];
  const completePrereqs = [
    prerequisites.analysisCompleted,
    (prerequisites.competitors || 0) > 0,
    (prerequisites.prompts || 0) > 0,
    (prerequisites.checkedPrompts || 0) > 0
  ].filter(Boolean).length;
  const readiness = Math.round((completePrereqs / 4) * 100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function generatePlan() {
    setLoading(true);
    setMessage('');

    try {
      const result = await api('/api/aeo-recommendations/generate', {
        method: 'POST',
        body: '{}'
      });
      onChange(result);
      setMessage('What’s Next plan generated from saved Gemini analysis.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-content aeo-page">
      <PageHeader
        eyebrow="What’s Next"
        title="What to focus on next"
        subtitle="A real AEO growth plan generated from saved analysis, prompt checks, competitor mentions, and citations."
        workspace={workspace}
        action={data?.canGenerate ? (
          <button className="primary-button compact-action" type="button" onClick={generatePlan} disabled={loading}>
            {loading ? 'Generating…' : latest ? 'Regenerate plan' : 'Generate plan'}
          </button>
        ) : null}
      />

      {message ? <div className={message.includes('generated') ? 'success-notice' : 'notice'}>{message}</div> : null}
      {loading ? (
        <div className="aeo-loading-layer">
          <div className="aeo-loading-card">
            <span><SettingsIcon name="sparkles" /></span>
            <h2>Building your next-best actions</h2>
            <p>Hummingbird is reading saved analysis, prompt checks, competitor gaps, and citation signals with Gemini.</p>
            <div className="loading-bar"><span /></div>
          </div>
        </div>
      ) : null}

      {!latest ? (
        <article className="aeo-empty-card">
          <div>
            <p className="eyebrow">Ready when your tracking data is ready</p>
            <h2>Generate a real AEO focus plan after checks are saved.</h2>
            <p>Hummingbird will use your stored Gemini business analysis, checked prompts, competitor mentions, and citation recommendations. No mock data is used.</p>
            <div className="aeo-readiness">
              <div>
                <span>Data readiness</span>
                <strong>{readiness}%</strong>
              </div>
              <div className="progress-bar"><span style={{ width: `${readiness}%` }} /></div>
            </div>
          </div>
          <div className="aeo-prereq-grid">
            <AeoPrereq label="Business analysis" done={prerequisites.analysisCompleted} value={prerequisites.analysisCompleted ? 'Complete' : 'Needed'} />
            <AeoPrereq label="Competitors" done={(prerequisites.competitors || 0) > 0} value={prerequisites.competitors || 0} />
            <AeoPrereq label="Prompts" done={(prerequisites.prompts || 0) > 0} value={prerequisites.prompts || 0} />
            <AeoPrereq label="Checked prompts" done={(prerequisites.checkedPrompts || 0) > 0} value={prerequisites.checkedPrompts || 0} />
          </div>
          <div className="aeo-empty-actions">
            {data?.canGenerate ? <button className="primary-button" type="button" onClick={generatePlan} disabled={loading}>{loading ? 'Generating plan…' : 'Generate What’s Next'}</button> : null}
            <button type="button" onClick={() => goTo('prompts')}>Review prompt checks</button>
          </div>
        </article>
      ) : (
        <>
          <article className="aeo-hero-card">
            <div className="aeo-hero-copy">
              <div className="analysis-hero-meta">
                <span className="pill status-completed">Stored result</span>
                <span className="soft-pill">{latest.source_type || 'gemini'} · {latest.updated_at || latest.created_at}</span>
              </div>
              <p className="aeo-hero-kicker">Recommended focus</p>
              <h2>{latest.focus_summary}</h2>
            </div>
            <div className="aeo-hero-side">
              <div className="aeo-compass" aria-hidden="true">
                <span><SettingsIcon name="target" /></span>
                <i />
                <i />
                <i />
                <b>Focus map</b>
              </div>
              <div className="aeo-score-row">
                <AeoMiniMetric label="Visibility score" value={summary.visibilityScore === null || summary.visibilityScore === undefined ? 'No data' : `${summary.visibilityScore}%`} />
                <AeoMiniMetric label="Brand mentions" value={summary.brandMentioned ?? 0} />
                <AeoMiniMetric label="Competitor mentions" value={summary.competitorMentions ?? 0} />
                <AeoMiniMetric label="Citation ideas" value={summary.citations ?? 0} />
              </div>
            </div>
          </article>

          <div className="aeo-section-intro">
            <div>
              <p className="eyebrow">Where to focus</p>
              <h2>Priority moves ranked by Gemini from your saved data</h2>
            </div>
            <span>{priorities.length} focus areas</span>
          </div>

          <div className="aeo-priority-grid">
            {priorities.map((priority, index) => (
              <article className="aeo-priority-card" key={`${priority.title}-${index}`}>
                <div className="aeo-card-top">
                  <span>0{index + 1}</span>
                  <div>
                    <b>{priority.impact} impact</b>
                    <small>{priority.effort} effort</small>
                  </div>
                </div>
                <p className="eyebrow">{priority.focus_area}</p>
                <h3>{priority.title}</h3>
                <p>{priority.why_it_matters}</p>
                <blockquote>{priority.evidence}</blockquote>
              </article>
            ))}
          </div>

          <div className="aeo-main-grid">
            <article className="aeo-plan-card">
              <div className="aeo-card-heading">
                <div>
                  <p className="eyebrow">How to focus</p>
                  <h2>Execution plan</h2>
                </div>
                <span>{actions.length} actions</span>
              </div>
              <div className="aeo-timeline">
                {actions.map((action, index) => (
                  <div className="aeo-timeline-item" key={`${action.step}-${index}`}>
                    <span>{action.priority}</span>
                    <div>
                      <h3>{action.step}</h3>
                      <p>{action.how_to_do_it}</p>
                      <small>{action.expected_outcome}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="aeo-evidence-card">
              <div className="aeo-card-heading">
                <div>
                  <p className="eyebrow">Why these steps</p>
                  <h2>Evidence from saved data</h2>
                </div>
              </div>
              {evidence.map((item, index) => (
                <div className="aeo-evidence-row" key={`${item.metric}-${index}`}>
                  <SettingsIcon name={index % 2 ? 'chart' : 'checkCircle'} />
                  <div>
                    <strong>{item.metric}</strong>
                    <p>{item.finding}</p>
                  </div>
                </div>
              ))}
            </article>
          </div>

          <article className="aeo-content-card">
            <div className="dashboard-panel-head">
              <div>
                <p className="eyebrow">Content opportunities</p>
                <h2>Pages/prompts to improve AEO visibility</h2>
              </div>
              <span>{opportunities.length} opportunities</span>
            </div>
            <div className="table-panel embedded">
              <table>
                <thead><tr><th>Topic</th><th>Target prompt</th><th>Page type</th><th>Reason</th></tr></thead>
                <tbody>
                  {opportunities.map((item, index) => (
                    <tr key={`${item.topic}-${index}`}>
                      <td><strong>{item.topic}</strong></td>
                      <td>{item.target_prompt}</td>
                      <td>{item.page_type}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function AeoPrereq({ label, value, done }) {
  return (
    <div className={done ? 'complete' : ''}>
      <SettingsIcon name={done ? 'checkCircle' : 'clipboard'} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AeoMiniMetric({ label, value }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function BusinessAnalysis({ data, workspace }) {
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

function Competitors({ data, onChange, workspace }) {
  const competitors = data?.competitors || [];
  const [form, setForm] = useState({});
  const [addOpen, setAddOpen] = useState(false);
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
      const result = await api('/api/competitors/add', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onChange(result);
      setForm({});
      setAddOpen(false);
      setMessage('Competitor added.');
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
        eyebrow="Competitors"
        title="Competitor landscape"
        subtitle="Company competitors saved in the backend database."
        workspace={workspace}
        action={data?.canManage ? <IconButton label="Add competitor" onClick={() => setAddOpen(true)} /> : null}
      />

      {message ? <div className={Object.keys(errors).length ? 'notice' : 'success-notice'}>{message}</div> : null}

      <div className="table-panel">
        <table>
          <thead><tr><th>Name</th><th>Website</th><th>Source</th><th>Status</th></tr></thead>
          <tbody>
            {competitors.map((competitor) => (
              <tr key={competitor.id}>
                <td>
                  <div className="entity-cell">
                    <LogoChip name={competitor.competitor_name} url={competitor.website_url} />
                    <strong>{competitor.competitor_name}</strong>
                  </div>
                </td>
                <td>{competitor.website_url || 'NA'}</td>
                <td>{competitor.source_type || 'NA'}</td>
                <td>{competitor.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SideFormTray
        open={addOpen}
        title="Add competitor"
        eyebrow="Manual competitor"
        onClose={() => setAddOpen(false)}
      >
        <form className="tray-form" onSubmit={submit}>
          <Input label="Competitor Name" value={form.competitorName} error={errors.competitorName} onChange={(value) => update('competitorName', value)} />
          <Input label="Website URL" value={form.websiteUrl} optional onChange={(value) => update('websiteUrl', value)} />
          <Input label="Notes" value={form.notes} optional onChange={(value) => update('notes', value)} />
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Competitor'}</button>
        </form>
      </SideFormTray>
    </section>
  );
}

function Prompts({ data, onChange, workspace }) {
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
        <Metric title="Checked Prompts" value={summary.checked ?? 0} helper="Prompts sent to Gemini" />
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
        <p>Gemini responses are stored now. ChatGPT, Claude, and Perplexity show NA until keys are connected.</p>
      </div>

      <div className="metric-grid">
        <ProviderMetric title="Gemini" value={summary.gemini ?? 0} status="Connected" active />
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
                  <p className="eyebrow">Gemini response</p>
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
              <th>Gemini Exact Response</th>
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

const providerConfigs = [
  { key: 'gemini', label: 'Gemini', field: 'gemini_response_summary', connected: true, logoUrl: 'https://gemini.google.com' },
  { key: 'chatgpt', label: 'ChatGPT', field: 'chatgpt_response_summary', connected: false, logoUrl: 'https://chatgpt.com' },
  { key: 'claude', label: 'Claude', field: 'claude_response_summary', connected: false, logoUrl: 'https://claude.ai' },
  { key: 'perplexity', label: 'Perplexity', field: 'perplexity_response_summary', connected: false, logoUrl: 'https://perplexity.ai' }
];

function ProviderLogo({ providerKey }) {
  const provider = providerConfigs.find((item) => item.key === providerKey) || providerConfigs[0];
  return (
    <span className={`provider-logo ${provider.key}`}>
      <img src={logoUrlFor(provider.logoUrl)} alt={`${provider.label} logo`} />
    </span>
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

function SideFormTray({ open, eyebrow, title, children, onClose }) {
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

function ProviderMetric({ title, value, status, active = false }) {
  const key = title.toLowerCase().split(' ')[0];
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

function Citations({ data, workspace }) {
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

function Settings({ data, onChange, workspace }) {
  const company = data?.company;
  const users = data?.users || [];
  const progress = data?.setupProgress || {};
  const promptsSummary = data?.promptsSummary || {};
  const competitors = data?.competitors || [];
  const analysisStatus = data?.analysis?.analysis_status || 'Not started';
  const canManage = Boolean(data?.canManage);
  const healthProgress = company?.onboarding_completed ? 100 : progress.percentage || 0;
  const [message, setMessage] = useState('');
  const [removingUserId, setRemovingUserId] = useState(null);

  if (!data) {
    return <EmptyInline title="Loading settings" text="Fetching company, user, and workspace data." />;
  }

  async function removeUser(user) {
    const confirmed = window.confirm(`Remove ${user.full_name} from ${company?.company_name || 'this company'}?`);

    if (!confirmed) {
      return;
    }

    setRemovingUserId(user.user_id);
    setMessage('');

    try {
      const result = await api('/api/users/remove', {
        method: 'POST',
        body: JSON.stringify({ userId: user.user_id })
      });
      onChange({ ...data, users: result.users || [] });
      setMessage('User removed from this company.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        subtitle="Company profile, onboarding state, users, and saved workspace data from the backend."
        workspace={workspace}
      />

      <article className="settings-identity-card">
        <div className="settings-company-main">
          <LogoChip name={company?.company_name || 'Company'} url={company?.logo_url} />
          <div>
            <p className="eyebrow">Company Identity</p>
            <h2>{company?.company_name || 'Company'}</h2>
            {company?.website_url ? (
              <a href={company.website_url} target="_blank" rel="noreferrer">{company.website_url} ↗</a>
            ) : (
              <span>Website URL not added yet</span>
            )}
          </div>
        </div>
        <span className="settings-onboard-pill"><span />{company?.onboarding_completed ? 'Onboarded' : `${progress.percentage || 0}% ready`}</span>
      </article>

      <div className="settings-metric-grid">
        <SettingsMetric icon="file" title="Prompts" value={promptsSummary.total ?? 0} helper="Total saved prompts" />
        <SettingsMetric icon="checkCircle" title="Prompt Checks" value={promptsSummary.checked ?? 0} helper="Completed checks" />
        <SettingsMetric icon="building" title="Competitors" value={competitors.length} helper="Tracked companies" />
        <SettingsMetric icon="trend" title="Analysis" value={analysisStatus} helper="Saved AI status" />
      </div>

      <div className="settings-body-grid">
        <article className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div>
              <p className="eyebrow">Company Profile</p>
              <h2>Identity and AI-generated business data</h2>
            </div>
            <span className="soft-pill">Database saved</span>
          </div>
          <div className="settings-profile-grid">
            <SettingsDetailTile icon="globe" label="Website URL" value={company?.website_url} />
            <SettingsDetailTile icon="image" label="Logo URL" value={company?.logo_url} />
            <SettingsDetailTile icon="tag" label="Industry" value={company?.industry} />
            <SettingsDetailTile icon="mapPin" label="Service Area" value={company?.service_area} />
            <SettingsDetailTile icon="flag" label="Target Country" value={company?.target_country} />
            <SettingsDetailTile icon="briefcase" label="Main Services" value={company?.main_services} />
            <SettingsDetailTile icon="users" label="Known Competitors" value={company?.known_competitors} />
            <SettingsDetailTile icon="target" label="Target Audience" value={company?.target_audience} />
          </div>
        </article>

        <article className="settings-card settings-health-card">
          <p className="eyebrow">Workspace Health</p>
          <h2>{company?.onboarding_completed ? 'Ready for tracking' : 'Setup in progress'}</h2>
          <div className="settings-progress-wrap">
            <div className="settings-progress-line">
            <span style={{ width: `${healthProgress}%` }} />
            </div>
            <strong>{healthProgress}%</strong>
          </div>
          <div className="settings-status-list">
            <SettingsHealthRow icon="rocket" label="Onboarding" value={company?.onboarding_completed ? 'Complete' : 'Incomplete'} success={company?.onboarding_completed} />
            <SettingsHealthRow icon="chart" label="Business Analysis" value={analysisStatus} success={analysisStatus === 'completed'} />
            <SettingsHealthRow icon="clipboard" label="Prompts Checked" value={promptsSummary.checked ?? 0} />
            <SettingsHealthRow icon="building" label="Tracked Competitors" value={competitors.length} purple />
          </div>
        </article>
      </div>

      <div className="table-panel settings-table settings-access-card">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Access Overview</p>
            <h2>Workspace users</h2>
          </div>
          <span className="soft-pill">{users.length} users</span>
        </div>
        {message ? <div className={message.includes('removed') ? 'success-notice' : 'notice'}>{message}</div> : null}
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Access Status</th><th>Added Date</th>{canManage ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.access_id}>
                <td>{user.full_name}</td>
                <td>{user.email}</td>
                <td>{user.role_name}</td>
                <td><StatusBadge active={user.access_status === 'active'}>{user.access_status}</StatusBadge></td>
                <td>{user.added_date}</td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      className="danger-action-button"
                      onClick={() => removeUser(user)}
                      disabled={removingUserId === user.user_id}
                    >
                      {removingUserId === user.user_id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsMetric({ icon, title, value, helper }) {
  return (
    <article className="settings-metric-card">
      <span className="settings-metric-icon"><SettingsIcon name={icon} /></span>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

function SettingsDetailTile({ icon, label, value }) {
  return (
    <div className="settings-detail-tile">
      <span><SettingsIcon name={icon} /></span>
      <div>
        <small>{label}</small>
        <strong>{value || 'Not added yet'}</strong>
      </div>
    </div>
  );
}

function SettingsHealthRow({ icon, label, value, success = false, purple = false }) {
  return (
    <div className={`settings-health-row ${success ? 'success' : ''} ${purple ? 'purple' : ''}`}>
      <span><SettingsIcon name={icon} /></span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsIcon({ name }) {
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

function Users({ data, onChange, workspace }) {
  const users = data?.users || [];
  const company = data?.company;
  const [form, setForm] = useState({ status: 'active', roleName: data?.assignableRoles?.[0] || 'Marketing Manager' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const canManage = Boolean(data?.canManage);
  const roles = data?.assignableRoles || [];
  const statuses = data?.statuses || ['active', 'inactive'];

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');

    try {
      const result = await api('/api/users/add', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      onChange({ ...data, users: result.users || [] });
      setForm({ status: 'active', roleName: roles[0] || 'Marketing Manager' });
      setMessage('User added to this company.');
    } catch (error) {
      setMessage(error.message);
      setErrors(error.data?.errors || {});
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(user) {
    const confirmed = window.confirm(`Remove ${user.full_name} from ${company?.company_name || 'this company'}? This will only remove company access.`);

    if (!confirmed) {
      return;
    }

    setRemovingUserId(user.user_id);
    setMessage('');
    setErrors({});

    try {
      const result = await api('/api/users/remove', {
        method: 'POST',
        body: JSON.stringify({ userId: user.user_id })
      });
      onChange({ ...data, users: result.users || [] });
      setMessage('User removed from this company.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <section className="page-content">
      <div className="page-title page-title-row">
        <div className="title-with-logo">
          <LogoChip name={company?.company_name || 'Company'} url={company?.logo_url} size="large" />
          <div>
            <p className="eyebrow">User Management</p>
            <h1>Company users</h1>
            <p>Users with access to {company?.company_name || 'this workspace'}.</p>
          </div>
        </div>
        <div className="page-title-actions">{workspace}</div>
      </div>

      <div className="metric-grid">
        <Metric title="Total Users" value={users.length} helper="Users connected to this company" />
        <Metric title="Active Access" value={users.filter((user) => user.access_status === 'active').length} helper="Can access workspace" />
        <Metric title="Business Owners" value={users.filter((user) => user.role_name === 'Business Owner').length} helper="Owner-level users" />
        <Metric title="Read Only" value={users.filter((user) => user.role_name === 'Read-Only Analyst').length} helper="View-only access" />
      </div>

      {message ? <div className={Object.keys(errors).length ? 'notice' : 'success-notice'}>{message}</div> : null}

      {canManage ? (
        <article className="panel add-user-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Invite / Add User</p>
              <h2>Add user to this company</h2>
              <p className="muted">Business Owners can add client roles. Developers and Super Admins can assign elevated roles.</p>
            </div>
          </div>
          <form className="add-user-form" onSubmit={submit}>
            <Input label="Full Name" value={form.fullName} error={errors.fullName} onChange={(value) => update('fullName', value)} />
            <Input label="Email" type="email" value={form.email} error={errors.email} onChange={(value) => update('email', value)} />
            <Input label="Password" type="password" value={form.password} error={errors.password} onChange={(value) => update('password', value)} />
            <Input label="Confirm Password" type="password" value={form.confirmPassword} error={errors.confirmPassword} onChange={(value) => update('confirmPassword', value)} />
            <label className="field">
              <span>Role <em>Required</em></span>
              <select value={form.roleName || roles[0] || ''} onChange={(event) => update('roleName', event.target.value)}>
                {roles.map((role) => <option value={role} key={role}>{role}</option>)}
              </select>
              {errors.roleName ? <strong>{errors.roleName}</strong> : null}
            </label>
            <label className="field">
              <span>Status <em>Required</em></span>
              <select value={form.status || 'active'} onChange={(event) => update('status', event.target.value)}>
                {statuses.map((status) => <option value={status} key={status}>{status}</option>)}
              </select>
              {errors.status ? <strong>{errors.status}</strong> : null}
            </label>
            <button className="primary-button add-user-button" type="submit" disabled={saving}>
              {saving ? 'Adding user…' : 'Add User'}
            </button>
          </form>
        </article>
      ) : (
        <div className="info-notice">Your role can view company users, but cannot add or manage them.</div>
      )}

      <div className="table-panel">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Account Status</th><th>Access Status</th><th>Added Date</th>{canManage ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.access_id}>
                <td>
                  <div className="entity-cell">
                    <LogoChip name={user.full_name} />
                    <strong>{user.full_name}</strong>
                  </div>
                </td>
                <td>{user.email}</td>
                <td><span className="role-pill">{user.role_name}</span></td>
                <td><StatusBadge active={user.user_status === 'active'}>{user.user_status}</StatusBadge></td>
                <td><StatusBadge active={user.access_status === 'active'}>{user.access_status}</StatusBadge></td>
                <td>{user.added_date}</td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      className="danger-action-button"
                      onClick={() => removeUser(user)}
                      disabled={removingUserId === user.user_id}
                    >
                      {removingUserId === user.user_id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length ? <EmptyInline title="No users yet" text="Users added to this company will appear here." /> : null}
      </div>
    </section>
  );
}

function DeveloperAdmin({ data, onChange, workspace }) {
  const stats = data?.stats || {};
  const companies = data?.companies || [];
  const users = data?.users || [];
  const accessRecords = data?.accessRecords || [];
  const [message, setMessage] = useState('');
  const [deletingCompanyId, setDeletingCompanyId] = useState(null);
  const [removingAccessId, setRemovingAccessId] = useState(null);

  if (!data) {
    return <EmptyInline title="Loading Developer Admin" text="Fetching platform-wide companies, users, and access records." />;
  }

  async function deleteSelectedCompany(company) {
    const confirmed = window.confirm(`Delete ${company.company_name}? This will permanently remove the company workspace, access records, analyses, prompts, competitors, and related data.`);

    if (!confirmed) return;

    setDeletingCompanyId(company.company_id);
    setMessage('');

    try {
      const result = await api('/api/developer/companies/delete', {
        method: 'POST',
        body: JSON.stringify({ companyId: company.company_id })
      });
      onChange(result);
      setMessage(`${company.company_name} was deleted.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDeletingCompanyId(null);
    }
  }

  async function removeWorkspaceAccess(record) {
    const confirmed = window.confirm(`Remove ${record.full_name}'s ${record.role_name} access from ${record.company_name}?`);

    if (!confirmed) return;

    setRemovingAccessId(record.access_id);
    setMessage('');

    try {
      const result = await api('/api/developer/access/remove', {
        method: 'POST',
        body: JSON.stringify({ accessId: record.access_id })
      });
      onChange(result);
      setMessage(`${record.full_name}'s access was removed.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRemovingAccessId(null);
    }
  }

  return (
    <section className="page-content">
      <PageHeader
        eyebrow="Internal developer access"
        title="Developer Admin"
        subtitle="Platform-level visibility across companies, users, workspaces, and access records."
        workspace={workspace}
      />

      <article className="developer-hero-card">
        <div className="developer-hero-copy">
          <span className="developer-mode-pill">Developer Mode</span>
          <h2>Platform control center</h2>
          <p>Internal developer access — not visible to clients. Manage global companies, users, and workspace access safely from one place.</p>
          {message ? <div className={message.includes('deleted') || message.includes('removed') ? 'success-notice' : 'notice'}>{message}</div> : null}
        </div>
        <div className="developer-hero-stats">
          <div><span>Companies</span><strong>{stats.companies ?? 0}</strong></div>
          <div><span>Users</span><strong>{stats.users ?? 0}</strong></div>
          <div><span>Access</span><strong>{stats.accessRecords ?? 0}</strong></div>
          <div><span>Active</span><strong>{stats.activeCompanies ?? 0}</strong></div>
        </div>
      </article>

      <article className="developer-section-card">
        <div className="developer-section-head">
          <div>
            <p className="eyebrow">All Companies</p>
            <h2>Workspace directory</h2>
          </div>
          <span className="soft-pill">{companies.length} companies</span>
        </div>
        <table className="dashboard-data-table developer-table">
          <thead>
            <tr><th>Company</th><th>Website</th><th>Industry</th><th>Onboarding</th><th>Users</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id}>
                <td><div className="entity-cell"><LogoChip name={company.company_name} url={company.logo_url || company.website_url} /><strong>{company.company_name}</strong></div></td>
                <td className="url-cell">{company.website_url || 'Not added'}</td>
                <td>{company.industry || 'Not added'}</td>
                <td><StatusBadge active={Boolean(company.onboarding_completed)}>{company.onboarding_completed ? 'Completed' : 'Incomplete'}</StatusBadge></td>
                <td>{company.users_count}</td>
                <td><StatusBadge active={company.status === 'active'}>{company.status}</StatusBadge></td>
                <td>{company.created_at}</td>
                <td>
                  <button
                    type="button"
                    className="danger-action-button"
                    onClick={() => deleteSelectedCompany(company)}
                    disabled={deletingCompanyId === company.company_id}
                  >
                    {deletingCompanyId === company.company_id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companies.length ? <DashboardEmptyBlock title="No companies yet" text="Companies created from signup or developer tools will appear here." /> : null}
      </article>

      <div className="developer-two-col">
        <article className="developer-section-card">
          <div className="developer-section-head">
            <div>
              <p className="eyebrow">All Users</p>
              <h2>Global accounts</h2>
            </div>
            <span className="soft-pill">{users.length} users</span>
          </div>
          <table className="dashboard-data-table developer-table">
            <thead>
              <tr><th>User</th><th>Email</th><th>Status</th><th>Companies</th><th>Roles</th><th>Created</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td><StatusBadge active={user.global_status === 'active'}>{user.global_status}</StatusBadge></td>
                  <td>{user.companies_access}</td>
                  <td>{user.roles || 'No roles'}</td>
                  <td>{user.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length ? <DashboardEmptyBlock title="No users yet" text="User accounts will appear here." /> : null}
        </article>

        <article className="developer-section-card">
          <div className="developer-section-head">
            <div>
              <p className="eyebrow">Workspace Access</p>
              <h2>Role assignments</h2>
            </div>
            <span className="soft-pill">{accessRecords.length} records</span>
          </div>
          <table className="dashboard-data-table developer-table">
            <thead>
              <tr><th>User</th><th>Company</th><th>Role</th><th>Status</th><th>Added</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {accessRecords.map((record) => (
                <tr key={record.access_id}>
                  <td>{record.full_name}<br /><small>{record.email}</small></td>
                  <td>{record.company_name}</td>
                  <td>{record.role_name}</td>
                  <td><StatusBadge active={record.status === 'active'}>{record.status}</StatusBadge></td>
                  <td>{record.created_at}</td>
                  <td>
                    <button
                      type="button"
                      className="danger-action-button"
                      onClick={() => removeWorkspaceAccess(record)}
                      disabled={removingAccessId === record.access_id}
                    >
                      {removingAccessId === record.access_id ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!accessRecords.length ? <DashboardEmptyBlock title="No access records yet" text="Company access assignments will appear here." /> : null}
        </article>
      </div>
    </section>
  );
}

function StatusBadge({ active, children }) {
  return <span className={`status-badge ${active ? 'active' : ''}`}>{children}</span>;
}

function logoUrlFor(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(raw)) return raw;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalized)}&sz=64`;
}

function LogoChip({ name = 'R', url = '', size = '' }) {
  const [failed, setFailed] = useState(false);
  const source = !failed ? logoUrlFor(url) : '';
  const initial = String(name || 'R').trim().charAt(0).toUpperCase() || 'R';

  return (
    <span className={`logo-chip ${size}`}>
      {source ? <img src={source} alt="" onError={() => setFailed(true)} /> : <span>{initial}</span>}
    </span>
  );
}

function ChipList({ items, empty }) {
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

function EmptyInline({ title, text }) {
  return (
    <div className="inline-empty">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function TablePage({ title, subtitle, children }) {
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

function ComingSoon({ title }) {
  return (
    <section className="empty-state">
      <BrandLogo centered />
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p>This React page shell is ready. We can move this module from backend logic into frontend components next.</p>
    </section>
  );
}

function labelForView(view) {
  const item = navItems.find(([, key]) => key === view);
  if (item) return item[0];
  if (view === 'developer') return 'Developer Admin';
  return 'Page';
}

export default App;
