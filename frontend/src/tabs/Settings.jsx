import { useState } from 'react';
import { EmptyInline, Input, LogoChip, PageHeader, SettingsIcon, SideFormTray } from '../components/common';
import Users from './Users';

export default function Settings({ data, onChange, onRefreshVisibility, onCreateWorkspace, workspace }) {
  const company = data?.company;
  const users = data?.users || [];
  const progress = data?.setupProgress || {};
  const promptsSummary = data?.promptsSummary || {};
  const competitors = data?.competitors || [];
  const limits = data?.limits || {};
  const visibilityRuns = data?.visibilityRuns || [];
  const workspaceCreation = data?.workspaceCreation || {};
  const analysisStatus = data?.analysis?.analysis_status || 'Not started';
  const healthProgress = company?.onboarding_completed ? 100 : progress.percentage || 0;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [workspaceTrayOpen, setWorkspaceTrayOpen] = useState(false);
  const [workspaceForm, setWorkspaceForm] = useState({});
  const [workspaceErrors, setWorkspaceErrors] = useState({});
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);

  if (!data) {
    return <EmptyInline title="Loading settings" text="Fetching company, user, and workspace data." />;
  }

  async function handleRefresh() {
    if (!onRefreshVisibility || refreshing) return;

    setRefreshing(true);
    setRefreshMessage('');
    setRefreshError('');

    try {
      const result = await onRefreshVisibility();
      setRefreshMessage(result?.message || 'AI responses regenerated and saved.');
      if (result?.settings) {
        onChange?.(result.settings);
      }
    } catch (error) {
      setRefreshError(error.message || 'AI response regeneration failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault();

    if (!onCreateWorkspace || workspaceSubmitting) return;

    setWorkspaceSubmitting(true);
    setWorkspaceErrors({});
    setWorkspaceMessage('');

    try {
      await onCreateWorkspace({
        companyName: workspaceForm.companyName,
        websiteUrl: workspaceForm.websiteUrl,
        logoUrl: workspaceForm.logoUrl
      });
      setWorkspaceTrayOpen(false);
      setWorkspaceForm({});
    } catch (error) {
      setWorkspaceMessage(error.message || 'Workspace could not be created.');
      setWorkspaceErrors(error.data?.errors || {});
      if (error.data?.workspaceCreation) {
        onChange?.({ ...data, workspaceCreation: error.data.workspaceCreation });
      }
    } finally {
      setWorkspaceSubmitting(false);
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
        <SettingsMetric icon="file" title="Prompts" value={promptsSummary.total ?? 0} helper={limits.prompts ? `${limits.prompts.used}/${limits.prompts.limit} used` : 'Total saved prompts'} />
        <SettingsMetric icon="checkCircle" title="Prompt Checks" value={promptsSummary.checked ?? 0} helper="Completed checks" />
        <SettingsMetric icon="building" title="Competitors" value={competitors.length} helper={limits.competitors ? `${limits.competitors.used}/${limits.competitors.limit} used` : 'Tracked companies'} />
        <SettingsMetric icon="trend" title="Analysis" value={analysisStatus} helper="Saved AI status" />
      </div>

      {workspaceCreation.canManage ? (
        <article className="settings-card settings-workspace-create-card">
          <div className="settings-card-head">
            <div>
              <p className="eyebrow">Workspace Creation</p>
              <h2>Create additional company spaces</h2>
              <p>
                This owner has used {workspaceCreation.owned_workspaces ?? 0} of {workspaceCreation.workspace_limit ?? 1} allowed workspaces.
                Developer can increase this limit from Developer Admin.
              </p>
            </div>
            <button
              type="button"
              className="settings-refresh-button"
              onClick={() => setWorkspaceTrayOpen(true)}
              disabled={!workspaceCreation.can_create_workspace}
            >
              {workspaceCreation.can_create_workspace ? 'Create workspace' : 'Limit reached'}
            </button>
          </div>
          <div className="settings-refresh-meta">
            <span>{workspaceCreation.remaining_workspaces ?? 0} remaining</span>
            <span>{workspaceCreation.owned_workspaces ?? 0} owned workspaces</span>
            <span>{workspaceCreation.workspace_limit ?? 1} total limit</span>
          </div>
        </article>
      ) : null}

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

      <article className="settings-card settings-refresh-card">
        <div className="settings-card-head">
          <div>
            <p className="eyebrow">Visibility Refresh</p>
            <h2>Regenerate AI responses</h2>
            <p>
              Re-run the same saved prompts against the same competitor list, save a new response snapshot,
              and keep previous runs for comparison.
            </p>
          </div>
          <button
            type="button"
            className="settings-refresh-button"
            onClick={handleRefresh}
            disabled={refreshing || !data?.canRefreshVisibility}
          >
            {refreshing ? 'Regenerating…' : 'Regenerate responses'}
          </button>
        </div>
        {refreshError ? <div className="notice error">{refreshError}</div> : null}
        {refreshMessage ? <div className="success-notice">{refreshMessage}</div> : null}
        <div className="settings-refresh-meta">
          <span>{promptsSummary.total ?? 0} prompts saved</span>
          <span>{competitors.length} competitors saved</span>
          <span>{visibilityRuns.length ? `Last run ${formatRunDate(visibilityRuns[0].created_at)}` : 'No refresh history yet'}</span>
        </div>
        <div className="settings-run-list">
          {visibilityRuns.slice(0, 5).map((run) => (
            <div className="settings-run-row" key={run.id}>
              <span><SettingsIcon name="sparkles" /></span>
              <div>
                <strong>{run.run_type === 'daily-refresh' ? 'Daily refresh' : run.run_type === 'setup-check' ? 'Initial check' : 'Manual refresh'}</strong>
                <small>{formatRunDate(run.created_at)} · {run.prompts_checked || 0} prompts checked</small>
              </div>
              <em>{run.status}</em>
            </div>
          ))}
          {!visibilityRuns.length ? (
            <EmptyInline title="No response snapshots yet" text="Run a refresh to create the first saved comparison point." />
          ) : null}
        </div>
      </article>

      <Users data={data} onChange={onChange} embedded />

      <SideFormTray
        open={workspaceTrayOpen}
        title="Create workspace"
        eyebrow="Business Owner"
        onClose={() => setWorkspaceTrayOpen(false)}
      >
        <form className="tray-form" onSubmit={handleCreateWorkspace}>
          <div className="limit-editor-summary">
            <LogoChip name={workspaceForm.companyName || 'New'} url={workspaceForm.logoUrl} />
            <div>
              <strong>New company space</strong>
              <small>Developer limit: {workspaceCreation.owned_workspaces ?? 0}/{workspaceCreation.workspace_limit ?? 1} used.</small>
            </div>
          </div>
          {workspaceMessage ? <div className="notice">{workspaceMessage}</div> : null}
          <Input
            label="Company Name"
            value={workspaceForm.companyName}
            error={workspaceErrors.companyName}
            onChange={(value) => setWorkspaceForm((current) => ({ ...current, companyName: value }))}
          />
          <Input
            label="Website URL"
            value={workspaceForm.websiteUrl}
            error={workspaceErrors.websiteUrl}
            onChange={(value) => setWorkspaceForm((current) => ({ ...current, websiteUrl: value }))}
          />
          <Input
            label="Logo URL"
            value={workspaceForm.logoUrl}
            error={workspaceErrors.logoUrl}
            onChange={(value) => setWorkspaceForm((current) => ({ ...current, logoUrl: value }))}
            optional
          />
          <button className="primary-button" type="submit" disabled={workspaceSubmitting || !workspaceCreation.can_create_workspace}>
            {workspaceSubmitting ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>
      </SideFormTray>
    </section>
  );
}

function formatRunDate(value) {
  if (!value) return 'Not available';

  try {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value.replace(' ', 'T')));
  } catch {
    return value;
  }
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
