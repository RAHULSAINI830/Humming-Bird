import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { ACTIVE_VIEW_STORAGE_KEY, DEFAULT_ACTIVE_VIEW, allowedViewKeys, geoSubTabs, navItems, readInitialActiveView } from './lib/constants';
import { AuthScreen, BrandLogo, LoadingScreen, LogoChip, SetupGenerationScreen, WorkspaceCard } from './components/common';
import Dashboard from './tabs/Dashboard';
import BusinessAnalysis from './tabs/BusinessAnalysis';
import AeoRecommendations from './tabs/AeoRecommendations';
import Competitors from './tabs/Competitors';
import Prompts from './tabs/Prompts';
import Citations from './tabs/Citations';
import GeoVisibility from './tabs/GeoVisibility';
import Settings from './tabs/Settings';
import DeveloperAdmin from './tabs/DeveloperAdmin';

function App() {
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [status, setStatus] = useState('loading');
  const [activeView, setActiveViewState] = useState(readInitialActiveView);
  const [dashboard, setDashboard] = useState(null);
  const [businessAnalysis, setBusinessAnalysis] = useState(null);
  const [aeoRecommendations, setAeoRecommendations] = useState(null);
  const [promptsData, setPromptsData] = useState({ prompts: [], summary: null });
  const [competitorsData, setCompetitorsData] = useState({ competitors: [] });
  const [citationsData, setCitationsData] = useState({ citations: [], summary: null });
  const [geoData, setGeoData] = useState(null);
  const [geoTab, setGeoTab] = useState('performance');
  const [settingsData, setSettingsData] = useState(null);
  const [developerData, setDeveloperData] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [notice, setNotice] = useState('');

  function setActiveView(view) {
    const nextView = allowedViewKeys.has(view) ? view : DEFAULT_ACTIVE_VIEW;
    setActiveViewState(nextView);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, nextView);
      window.history.replaceState({}, '', `${window.location.pathname}#${nextView}`);
    }
  }

  useEffect(() => {
    api('/api/session')
      .then((data) => {
        setSession(data);
        setStatus('ready');
      })
      .catch(() => setStatus('guest'));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const geo = params.get('geo');
    const reason = params.get('reason');
    const auth = params.get('auth');

    if (auth) {
      const authMessages = {
        required: 'Please login again before connecting Google Search Console.',
        'no-company': 'Please select or create a workspace before connecting Google Search Console.',
        'access-denied': 'Your account does not have access to this workspace anymore.'
      };

      setNotice(authMessages[auth] || 'Please login again to continue.');

      if (auth === 'required') {
        setSession(null);
        setStatus('guest');
      }

      return;
    }

    if (!geo) return;

    const reasonMessages = {
      'api-not-enabled': 'Google Search Console API is not enabled for this Google Cloud project.',
      'invalid-client': 'Google OAuth Client ID or Client Secret is missing or incorrect in Vercel.',
      'invalid-grant': 'Google rejected the OAuth code. Restart the connection from GEO Visibility and make sure local GOOGLE_REDIRECT_URI matches localhost.',
      'invalid-request': 'Google OAuth request is invalid. Check the redirect URI and OAuth client setup.',
      'unauthorized-client': 'This OAuth client is not allowed to use this flow. Check Google OAuth client type and redirect URI.',
      'redirect-uri-mismatch': 'Google OAuth redirect URI does not exactly match the Vercel callback URL.',
      'permission-denied': 'The connected Google account does not have permission for Search Console properties.',
      'google-network-error': 'Hummingbird could not reach Google from the server. Try again or check local network access.',
      'search-console-error': 'Google connected, but Search Console properties could not be fetched.',
      'google-callback-error': 'Google OAuth callback failed. Check Vercel environment variables and Google Cloud setup.'
    };
    const geoMessages = {
      connected: 'Google Search Console connected.',
      'connected-no-properties': reasonMessages[reason] || 'Google connected, but no Search Console properties were found.',
      failed: reasonMessages[reason] || 'Google Search Console connection failed.',
      'not-configured': 'Google OAuth is not configured in Vercel.'
    };

    setNotice(geoMessages[geo] || 'Google Search Console setup status updated.');
    setActiveView('geo');
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      setSession(null);
      setStatus('guest');
      setDashboard(null);
      setBusinessAnalysis(null);
      setAeoRecommendations(null);
      setSetupStatus(null);
      setSetupLoading(false);
      setSetupError('');
      setNotice('Your session expired. Please log in again.');
    }

    window.addEventListener('hummingbird:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('hummingbird:auth-expired', handleAuthExpired);
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

    if (activeView === 'geo') {
      api('/api/geo').then(setGeoData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'settings') {
      api('/api/settings').then(setSettingsData).catch((error) => setNotice(error.message));
    }

    if (activeView === 'developer') {
      api('/api/developer').then(setDeveloperData).catch((error) => setNotice(error.message));
    }
  }, [activeView, status, session?.selectedCompanyId]);

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
    setNotice('');
    setDashboard(null);
    setActiveView(DEFAULT_ACTIVE_VIEW);
  }

  async function handleWorkspaceChange(event) {
    const data = await api('/api/workspace/select', {
      method: 'POST',
      body: JSON.stringify({ companyId: Number(event.target.value) })
    });
    setSession(data);
    setSetupStatus(null);
    setDashboard(null);
    setBusinessAnalysis(null);
    setAeoRecommendations(null);
    setPromptsData({ prompts: [], summary: null });
    setCompetitorsData({ competitors: [] });
    setCitationsData({ citations: [], summary: null });
    setGeoData(null);
    setSettingsData(null);
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
          setNotice('');
          setSession(data);
          setStatus('ready');
          setActiveView(DEFAULT_ACTIVE_VIEW);
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
            <div className={view === 'geo' ? 'sidebar-nav-group' : ''} key={view}>
              <button
                type="button"
                onClick={() => setActiveView(view)}
                className={activeView === view ? 'active' : ''}
              >
                <span>{icon}</span> {label}
              </button>
              {view === 'geo' ? (
                <div className={`sidebar-child-nav ${activeView === 'geo' ? 'open' : ''}`}>
                  {geoSubTabs.map((tab) => (
                    <button
                      type="button"
                      key={tab.key}
                      onClick={() => {
                        setActiveView('geo');
                        setGeoTab(tab.key);
                      }}
                      className={activeView === 'geo' && geoTab === tab.key ? 'active' : ''}
                      title={tab.helper}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
        {activeView === 'geo' ? <GeoVisibility data={geoData} onChange={setGeoData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} geoTab={geoTab} /> : null}
        {activeView === 'settings' ? <Settings data={settingsData} onChange={setSettingsData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
        {activeView === 'developer' ? <DeveloperAdmin data={developerData} onChange={setDeveloperData} workspace={<WorkspaceCard session={session} onChange={handleWorkspaceChange} />} /> : null}
      </section>
    </main>
  );
}

export default App;
