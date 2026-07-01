import { useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, SettingsIcon, displayAiSource } from '../components/common';

export default function AeoRecommendations({ data, onChange, workspace, goTo }) {
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
      setMessage('What’s Next plan generated from saved Hummingbird AI analysis.');
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
            <p>Hummingbird AI is reading saved analysis, prompt checks, competitor gaps, and citation signals.</p>
            <div className="loading-bar"><span /></div>
          </div>
        </div>
      ) : null}

      {!latest ? (
        <article className="aeo-empty-card">
          <div>
            <p className="eyebrow">Ready when your tracking data is ready</p>
            <h2>Generate a real AEO focus plan after checks are saved.</h2>
            <p>Hummingbird will use your stored AI business analysis, checked prompts, competitor mentions, and citation recommendations. No mock data is used.</p>
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
                <span className="soft-pill">{displayAiSource(latest.source_type)} · {latest.updated_at || latest.created_at}</span>
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
              <h2>Priority moves ranked by Hummingbird AI from your saved data</h2>
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
