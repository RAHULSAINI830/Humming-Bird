import { api } from '../lib/api';
import { DashboardEmptyBlock, EmptyInline, LogoChip, PageHeader, StatusBadge } from '../components/common';

export default function DeveloperAdmin({ data, onChange, workspace }) {
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
