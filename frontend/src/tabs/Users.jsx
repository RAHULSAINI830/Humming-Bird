import { useState } from 'react';
import { api } from '../lib/api';
import { EmptyInline, Input, LogoChip, Metric, PageHeader, SideFormTray, StatusBadge } from '../components/common';

export default function Users({ data, onChange, workspace }) {
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
