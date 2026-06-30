import { useState } from 'react';
import { api } from '../lib/api';
import { IconButton, Input, LogoChip, PageHeader, SideFormTray } from '../components/common';

export default function Competitors({ data, onChange, workspace }) {
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
