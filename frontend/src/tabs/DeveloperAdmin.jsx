import { useState } from 'react';
import { api } from '../lib/api';
import { DashboardEmptyBlock, EmptyInline, Input, LogoChip, PageHeader, SideFormTray, StatusBadge } from '../components/common';

export default function DeveloperAdmin({ data, onChange, workspace }) {
  const stats = data?.stats || {};
  const companies = data?.companies || [];
  const users = data?.users || [];
  const accessRecords = data?.accessRecords || [];
  const providerControlsByCompany = data?.providerControlsByCompany || {};
  const [message, setMessage] = useState('');
  const [deletingCompanyId, setDeletingCompanyId] = useState(null);
  const [removingAccessId, setRemovingAccessId] = useState(null);
  const [limitCompany, setLimitCompany] = useState(null);
  const [limitForm, setLimitForm] = useState({});
  const [limitErrors, setLimitErrors] = useState({});
  const [savingLimits, setSavingLimits] = useState(false);
  const [automationCompany, setAutomationCompany] = useState(null);
  const [automationForm, setAutomationForm] = useState({});
  const [automationErrors, setAutomationErrors] = useState({});
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [workspaceLimitUser, setWorkspaceLimitUser] = useState(null);
  const [workspaceLimitForm, setWorkspaceLimitForm] = useState({});
  const [workspaceLimitErrors, setWorkspaceLimitErrors] = useState({});
  const [savingWorkspaceLimit, setSavingWorkspaceLimit] = useState(false);
  const [providerCompany, setProviderCompany] = useState(null);
  const [providerForms, setProviderForms] = useState({});
  const [providerErrors, setProviderErrors] = useState({});
  const [savingProvider, setSavingProvider] = useState('');

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

  function openLimitEditor(company) {
    setLimitCompany(company);
    setLimitErrors({});
    setLimitForm({
      promptLimit: String(company.prompt_limit ?? 15),
      competitorLimit: String(company.competitor_limit ?? 10)
    });
  }

  function openAutomationEditor(company) {
    setAutomationCompany(company);
    setAutomationErrors({});
    setAutomationForm({
      autoRefreshEnabled: Number(company.auto_refresh_enabled ?? 1) === 1,
      refreshIntervalDays: String(company.refresh_interval_days ?? 1),
      refreshStatus: company.refresh_status || 'active',
      refreshPausedUntil: company.refresh_paused_until ? String(company.refresh_paused_until).slice(0, 10) : '',
      refreshStopReason: company.refresh_stop_reason || ''
    });
  }

  function openWorkspaceLimitEditor(user) {
    setWorkspaceLimitUser(user);
    setWorkspaceLimitErrors({});
    setWorkspaceLimitForm({
      workspaceLimit: String(user.workspace_limit ?? 1)
    });
  }

  function openProviderEditor(company) {
    const controls = providerControlsByCompany[company.company_id] || [];
    const forms = {};

    controls.forEach((control) => {
      forms[control.provider_name] = {
        status: control.status || 'disabled',
        dailyPromptLimit: String(control.daily_prompt_limit ?? 0),
        monthlyPromptLimit: String(control.monthly_prompt_limit ?? 0),
        monthlyCostLimitCents: String(control.monthly_cost_limit_cents ?? 0),
        autoRefreshEnabled: Number(control.auto_refresh_enabled || 0) === 1,
        manualRefreshEnabled: Number(control.manual_refresh_enabled || 0) === 1
      };
    });

    setProviderCompany(company);
    setProviderForms(forms);
    setProviderErrors({});
  }

  function updateProviderForm(providerName, key, value) {
    setProviderForms((current) => ({
      ...current,
      [providerName]: {
        ...(current[providerName] || {}),
        [key]: value
      }
    }));
  }

  async function saveCompanyLimits(event) {
    event.preventDefault();

    if (!limitCompany) return;

    setSavingLimits(true);
    setLimitErrors({});
    setMessage('');

    try {
      const result = await api('/api/developer/companies/limits', {
        method: 'POST',
        body: JSON.stringify({
          companyId: limitCompany.company_id,
          promptLimit: Number(limitForm.promptLimit),
          competitorLimit: Number(limitForm.competitorLimit)
        })
      });
      onChange(result);
      setMessage(`${limitCompany.company_name} limits updated.`);
      setLimitCompany(null);
      setLimitForm({});
    } catch (error) {
      setMessage(error.message);
      setLimitErrors(error.data?.errors || {});
    } finally {
      setSavingLimits(false);
    }
  }

  async function saveCompanyAutomation(event) {
    event.preventDefault();

    if (!automationCompany) return;

    setSavingAutomation(true);
    setAutomationErrors({});
    setMessage('');

    try {
      const result = await api('/api/developer/companies/automation', {
        method: 'POST',
        body: JSON.stringify({
          companyId: automationCompany.company_id,
          autoRefreshEnabled: Boolean(automationForm.autoRefreshEnabled),
          refreshIntervalDays: Number(automationForm.refreshIntervalDays),
          refreshStatus: automationForm.refreshStatus,
          refreshPausedUntil: automationForm.refreshPausedUntil,
          refreshStopReason: automationForm.refreshStopReason
        })
      });
      onChange(result);
      setMessage(`${automationCompany.company_name} automation controls updated.`);
      setAutomationCompany(null);
      setAutomationForm({});
    } catch (error) {
      setMessage(error.message);
      setAutomationErrors(error.data?.errors || {});
    } finally {
      setSavingAutomation(false);
    }
  }

  async function saveUserWorkspaceLimit(event) {
    event.preventDefault();

    if (!workspaceLimitUser) return;

    setSavingWorkspaceLimit(true);
    setWorkspaceLimitErrors({});
    setMessage('');

    try {
      const result = await api('/api/developer/users/workspace-limit', {
        method: 'POST',
        body: JSON.stringify({
          userId: workspaceLimitUser.user_id,
          workspaceLimit: Number(workspaceLimitForm.workspaceLimit)
        })
      });
      onChange(result);
      setMessage(`${workspaceLimitUser.full_name} workspace limit updated.`);
      setWorkspaceLimitUser(null);
      setWorkspaceLimitForm({});
    } catch (error) {
      setMessage(error.message);
      setWorkspaceLimitErrors(error.data?.errors || {});
    } finally {
      setSavingWorkspaceLimit(false);
    }
  }

  async function saveProviderControl(providerName) {
    if (!providerCompany) return;

    const form = providerForms[providerName] || {};

    setSavingProvider(providerName);
    setProviderErrors({});
    setMessage('');

    try {
      const result = await api('/api/developer/companies/provider-control', {
        method: 'POST',
        body: JSON.stringify({
          companyId: providerCompany.company_id,
          providerName,
          status: form.status || 'disabled',
          dailyPromptLimit: Number(form.dailyPromptLimit || 0),
          monthlyPromptLimit: Number(form.monthlyPromptLimit || 0),
          monthlyCostLimitCents: Number(form.monthlyCostLimitCents || 0),
          autoRefreshEnabled: Boolean(form.autoRefreshEnabled),
          manualRefreshEnabled: Boolean(form.manualRefreshEnabled)
        })
      });
      onChange(result);
      setMessage(`${providerLabel(providerName)} controls updated for ${providerCompany.company_name}.`);
    } catch (error) {
      setMessage(error.message);
      setProviderErrors(error.data?.errors || {});
    } finally {
      setSavingProvider('');
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
            <tr><th>Company</th><th>Website</th><th>Industry</th><th>Prompts</th><th>Competitors</th><th>Automation</th><th>Onboarding</th><th>Users</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.company_id}>
                <td><div className="entity-cell"><LogoChip name={company.company_name} url={company.logo_url || company.website_url} /><strong>{company.company_name}</strong></div></td>
                <td className="url-cell">{company.website_url || 'Not added'}</td>
                <td>{company.industry || 'Not added'}</td>
                <td><span className="soft-pill">{company.prompt_limit ?? 15} max</span></td>
                <td><span className="soft-pill">{company.competitor_limit ?? 10} max</span></td>
                <td>
                  <div className="automation-summary">
                    <StatusBadge active={Number(company.auto_refresh_enabled ?? 1) === 1 && company.refresh_status === 'active'}>
                      {automationLabel(company)}
                    </StatusBadge>
                    <small>{automationMeta(company)}</small>
                  </div>
                </td>
                <td><StatusBadge active={Boolean(company.onboarding_completed)}>{company.onboarding_completed ? 'Completed' : 'Incomplete'}</StatusBadge></td>
                <td>{company.users_count}</td>
                <td><StatusBadge active={company.status === 'active'}>{company.status}</StatusBadge></td>
                <td>{company.created_at}</td>
                <td>
                  <div className="developer-action-row">
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => openLimitEditor(company)}
                    >
                      Limits
                    </button>
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => openAutomationEditor(company)}
                    >
                      Automation
                    </button>
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => openProviderEditor(company)}
                    >
                      AI providers
                    </button>
                    <button
                      type="button"
                      className="danger-action-button"
                      onClick={() => deleteSelectedCompany(company)}
                      disabled={deletingCompanyId === company.company_id}
                    >
                      {deletingCompanyId === company.company_id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
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
              <tr><th>User</th><th>Email</th><th>Status</th><th>Companies</th><th>Workspace Limit</th><th>Roles</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.full_name}</td>
                  <td>{user.email}</td>
                  <td><StatusBadge active={user.global_status === 'active'}>{user.global_status}</StatusBadge></td>
                  <td>{user.companies_access}</td>
                  <td>
                    <div className="automation-summary">
                      <span className="soft-pill">{user.owned_workspaces ?? 0}/{user.workspace_limit ?? 1} owned</span>
                      <small>{Math.max(Number(user.workspace_limit ?? 1) - Number(user.owned_workspaces ?? 0), 0)} remaining</small>
                    </div>
                  </td>
                  <td>{user.roles || 'No roles'}</td>
                  <td>{user.created_at}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-action-button"
                      onClick={() => openWorkspaceLimitEditor(user)}
                    >
                      Workspace limit
                    </button>
                  </td>
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

      <SideFormTray
        open={Boolean(limitCompany)}
        title="Workspace limits"
        eyebrow="Developer control"
        onClose={() => setLimitCompany(null)}
      >
        <form className="tray-form" onSubmit={saveCompanyLimits}>
          <div className="limit-editor-summary">
            <LogoChip name={limitCompany?.company_name || 'Company'} url={limitCompany?.logo_url || limitCompany?.website_url} />
            <div>
              <strong>{limitCompany?.company_name}</strong>
              <small>Set how many prompts and competitors this workspace can use.</small>
            </div>
          </div>
          <Input
            label="Prompt limit"
            value={limitForm.promptLimit}
            error={limitErrors.promptLimit}
            onChange={(value) => setLimitForm((current) => ({ ...current, promptLimit: value }))}
          />
          <Input
            label="Competitor limit"
            value={limitForm.competitorLimit}
            error={limitErrors.competitorLimit}
            onChange={(value) => setLimitForm((current) => ({ ...current, competitorLimit: value }))}
          />
          <button className="primary-button" type="submit" disabled={savingLimits}>
            {savingLimits ? 'Saving limits…' : 'Save limits'}
          </button>
        </form>
      </SideFormTray>

      <SideFormTray
        open={Boolean(automationCompany)}
        title="Automation controls"
        eyebrow="Developer control"
        onClose={() => setAutomationCompany(null)}
      >
        <form className="tray-form" onSubmit={saveCompanyAutomation}>
          <div className="limit-editor-summary">
            <LogoChip name={automationCompany?.company_name || 'Company'} url={automationCompany?.logo_url || automationCompany?.website_url} />
            <div>
              <strong>{automationCompany?.company_name}</strong>
              <small>Control when Hummingbird refreshes prompts, AI responses, and saved visibility data.</small>
            </div>
          </div>

          <label className="field checkbox-field">
            <span>Auto refresh <small>Developer controlled</small></span>
            <span className="input-shell checkbox-shell">
              <input
                type="checkbox"
                checked={Boolean(automationForm.autoRefreshEnabled)}
                onChange={(event) => setAutomationForm((current) => ({ ...current, autoRefreshEnabled: event.target.checked }))}
              />
              <b>{automationForm.autoRefreshEnabled ? 'Enabled' : 'Disabled'}</b>
            </span>
          </label>

          <Input
            label="Refresh gap in days"
            type="number"
            value={automationForm.refreshIntervalDays}
            error={automationErrors.refreshIntervalDays}
            onChange={(value) => setAutomationForm((current) => ({ ...current, refreshIntervalDays: value }))}
          />

          <label className="field">
            <span>Refresh status <em>Required</em></span>
            <span className="input-shell">
              <select
                value={automationForm.refreshStatus || 'active'}
                onChange={(event) => setAutomationForm((current) => ({ ...current, refreshStatus: event.target.value }))}
              >
                <option value="active">Active — follow refresh gap</option>
                <option value="paused">Paused temporarily</option>
                <option value="stopped">Stopped permanently</option>
              </select>
            </span>
            {automationErrors.refreshStatus ? <strong>{automationErrors.refreshStatus}</strong> : null}
          </label>

          {automationForm.refreshStatus === 'paused' ? (
            <Input
              label="Pause until"
              type="date"
              value={automationForm.refreshPausedUntil}
              error={automationErrors.refreshPausedUntil}
              onChange={(value) => setAutomationForm((current) => ({ ...current, refreshPausedUntil: value }))}
              optional
            />
          ) : null}

          {automationForm.refreshStatus === 'stopped' ? (
            <Input
              label="Permanent stop reason"
              value={automationForm.refreshStopReason}
              error={automationErrors.refreshStopReason}
              onChange={(value) => setAutomationForm((current) => ({ ...current, refreshStopReason: value }))}
            />
          ) : (
            <Input
              label="Internal note"
              value={automationForm.refreshStopReason}
              error={automationErrors.refreshStopReason}
              onChange={(value) => setAutomationForm((current) => ({ ...current, refreshStopReason: value }))}
              optional
            />
          )}

          <div className="automation-helper-card">
            <strong>How this works</strong>
            <p>Daily cron runs every day, but this company refreshes only when its gap is due. Pause skips temporarily. Stopped skips permanently until Developer changes it back.</p>
          </div>

          <button className="primary-button" type="submit" disabled={savingAutomation}>
            {savingAutomation ? 'Saving controls…' : 'Save automation controls'}
          </button>
        </form>
      </SideFormTray>

      <SideFormTray
        open={Boolean(providerCompany)}
        title="AI provider controls"
        eyebrow="Paid provider control"
        onClose={() => setProviderCompany(null)}
      >
        <div className="tray-form">
          <div className="limit-editor-summary">
            <LogoChip name={providerCompany?.company_name || 'Company'} url={providerCompany?.logo_url || providerCompany?.website_url} />
            <div>
              <strong>{providerCompany?.company_name}</strong>
              <small>Enable ChatGPT only for approved companies and cap daily prompts, monthly prompts, and estimated spend.</small>
            </div>
          </div>

          {(providerControlsByCompany[providerCompany?.company_id] || []).map((control) => {
            const form = providerForms[control.provider_name] || {};
            const isPaid = ['openai', 'claude', 'perplexity'].includes(control.provider_name);
            return (
              <article className={`provider-control-card ${control.provider_name}`} key={control.provider_name}>
                <div className="provider-control-head">
                  <div>
                    <span className="eyebrow">{isPaid ? 'Paid provider' : 'Primary provider'}</span>
                    <h3>{providerLabel(control.provider_name)}</h3>
                  </div>
                  <StatusBadge active={form.status === 'enabled'}>{form.status || 'disabled'}</StatusBadge>
                </div>

                <label className="field">
                  <span>Status <em>Required</em></span>
                  <span className="input-shell">
                    <select
                      value={form.status || 'disabled'}
                      onChange={(event) => updateProviderForm(control.provider_name, 'status', event.target.value)}
                    >
                      <option value="enabled">Enabled</option>
                      <option value="paused">Paused temporarily</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </span>
                  {providerErrors.status ? <strong>{providerErrors.status}</strong> : null}
                </label>

                <div className="provider-limit-grid">
                  <Input
                    label="Daily prompts"
                    type="number"
                    value={form.dailyPromptLimit}
                    error={providerErrors.dailyPromptLimit}
                    onChange={(value) => updateProviderForm(control.provider_name, 'dailyPromptLimit', value)}
                  />
                  <Input
                    label="Monthly prompts"
                    type="number"
                    value={form.monthlyPromptLimit}
                    error={providerErrors.monthlyPromptLimit}
                    onChange={(value) => updateProviderForm(control.provider_name, 'monthlyPromptLimit', value)}
                  />
                  <Input
                    label="Monthly cost cap cents"
                    type="number"
                    value={form.monthlyCostLimitCents}
                    error={providerErrors.monthlyCostLimitCents}
                    onChange={(value) => updateProviderForm(control.provider_name, 'monthlyCostLimitCents', value)}
                  />
                </div>

                <div className="provider-usage-row">
                  <span>{control.daily_prompts_used || 0}/{control.daily_prompt_limit || 0} daily prompts</span>
                  <span>{control.monthly_prompts_used || 0}/{control.monthly_prompt_limit || 0} monthly prompts</span>
                  <span>${((control.monthly_cost_used_cents || 0) / 100).toFixed(2)} used</span>
                </div>

                <div className="provider-toggle-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.manualRefreshEnabled)}
                      onChange={(event) => updateProviderForm(control.provider_name, 'manualRefreshEnabled', event.target.checked)}
                    />
                    Manual refresh
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(form.autoRefreshEnabled)}
                      onChange={(event) => updateProviderForm(control.provider_name, 'autoRefreshEnabled', event.target.checked)}
                    />
                    Daily auto refresh
                  </label>
                </div>

                {control.provider_name === 'openai' ? (
                  <p className="provider-control-note">
                    ChatGPT uses the platform OPENAI_API_KEY. Keep auto refresh off until you are comfortable with spend.
                  </p>
                ) : null}

                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => saveProviderControl(control.provider_name)}
                  disabled={savingProvider === control.provider_name}
                >
                  {savingProvider === control.provider_name ? 'Saving…' : `Save ${providerLabel(control.provider_name)}`}
                </button>
              </article>
            );
          })}
        </div>
      </SideFormTray>

      <SideFormTray
        open={Boolean(workspaceLimitUser)}
        title="Owner workspace limit"
        eyebrow="Developer control"
        onClose={() => setWorkspaceLimitUser(null)}
      >
        <form className="tray-form" onSubmit={saveUserWorkspaceLimit}>
          <div className="limit-editor-summary">
            <LogoChip name={workspaceLimitUser?.full_name || 'User'} />
            <div>
              <strong>{workspaceLimitUser?.full_name}</strong>
              <small>
                This controls how many company workspaces this user can own/create.
                Current usage: {workspaceLimitUser?.owned_workspaces ?? 0}/{workspaceLimitUser?.workspace_limit ?? 1}.
              </small>
            </div>
          </div>
          <Input
            label="Workspace creation limit"
            type="number"
            value={workspaceLimitForm.workspaceLimit}
            error={workspaceLimitErrors.workspaceLimit}
            onChange={(value) => setWorkspaceLimitForm((current) => ({ ...current, workspaceLimit: value }))}
          />
          <div className="automation-helper-card">
            <strong>How this works</strong>
            <p>If the limit is 1, the owner can only have their original workspace. If you set 3, they can create up to 3 company spaces owned by themselves.</p>
          </div>
          <button className="primary-button" type="submit" disabled={savingWorkspaceLimit}>
            {savingWorkspaceLimit ? 'Saving workspace limit…' : 'Save workspace limit'}
          </button>
        </form>
      </SideFormTray>
    </section>
  );
}

function automationLabel(company) {
  if (Number(company.auto_refresh_enabled ?? 1) !== 1) return 'Disabled';
  if (company.refresh_status === 'paused') return 'Paused';
  if (company.refresh_status === 'stopped') return 'Stopped';
  return `Every ${company.refresh_interval_days || 1}d`;
}

function automationMeta(company) {
  if (company.refresh_status === 'paused') {
    return company.refresh_paused_until ? `Until ${String(company.refresh_paused_until).slice(0, 10)}` : 'Paused until resumed';
  }

  if (company.refresh_status === 'stopped') {
    return company.refresh_stop_reason || 'Permanent stop';
  }

  if (Number(company.auto_refresh_enabled ?? 1) !== 1) {
    return 'Auto refresh off';
  }

  return company.last_auto_refresh_at ? `Last ${company.last_auto_refresh_at}` : 'No auto refresh yet';
}

function providerLabel(providerName) {
  const labels = {
    gemini: 'Hummingbird AI',
    openai: 'ChatGPT',
    claude: 'Claude',
    perplexity: 'Perplexity'
  };

  return labels[providerName] || providerName;
}
