import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { AIMATE_MARK } from '../lib/constants';

const starterQuestions = [
  'How does Prompt Research work?',
  'Where do I find GEO data?',
  'What does Average Brand Position mean?',
  'How do I regenerate AI responses?'
];

const botCapabilities = [
  { label: 'Find data', value: 'Tabs & reports' },
  { label: 'Explain metrics', value: 'Plain English' },
  { label: 'Escalate gaps', value: 'Developer request' }
];

export default function HelpBot({ session }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const messagesRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      title: 'Aimate help',
      text: 'I can guide you through Aimate: where to find data, what a metric means, and which tab to use next. If I cannot answer, I’ll send a request to the Developer team.'
    }
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !messagesRef.current) return;

    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, loading, open]);

  async function ask(nextQuestion = question) {
    const cleanQuestion = String(nextQuestion || '').trim();

    if (!cleanQuestion || loading) return;

    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: cleanQuestion }]);
    setLoading(true);

    try {
      const result = await api('/api/help-chat', {
        method: 'POST',
        body: JSON.stringify({ question: cleanQuestion })
      });

      setMessages((current) => [
        ...current,
        {
          role: 'bot',
          title: result.title,
          text: result.answer,
          steps: result.steps || [],
          facts: result.facts || {},
          requestId: result.requestId || null,
          confidence: result.confidence
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'bot',
          title: 'Could not answer',
          text: error.message || 'Something went wrong while asking the help bot.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    ask();
  }

  return (
    <div className={`helpbot ${open ? 'open' : ''} ${loading ? 'thinking' : ''}`}>
      {open ? (
        <section className="helpbot-panel" aria-label="Aimate help bot">
          <header className="helpbot-header">
            <div className="helpbot-avatar" aria-hidden="true">
              <img src={AIMATE_MARK} alt="" />
              <span />
            </div>
            <div>
              <strong>Aimate Help</strong>
              <small>{loading ? 'Searching the platform guide…' : session?.selectedCompanyName || 'Workspace assistant'}</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help bot">×</button>
          </header>

          <div className="helpbot-intro">
            <p className="eyebrow">Platform guide</p>
            <h3>Ask where to go, what it means, or what to do next.</h3>
            <div className="helpbot-capabilities">
              {botCapabilities.map((item) => (
                <span key={item.label}>
                  <strong>{item.label}</strong>
                  <small>{item.value}</small>
                </span>
              ))}
            </div>
          </div>

          <div className="helpbot-starters">
            <span>Try asking</span>
            {starterQuestions.map((starter) => (
              <button type="button" key={starter} onClick={() => ask(starter)} disabled={loading}>
                {starter}
              </button>
            ))}
          </div>

          <div className="helpbot-messages" ref={messagesRef}>
            {messages.map((message, index) => (
              <article className={`helpbot-message ${message.role} ${message.confidence === 'low' ? 'needs-developer' : ''}`} key={`${message.role}-${index}`}>
                {message.title ? <strong>{message.title}</strong> : null}
                <p>{message.text}</p>
                {message.steps?.length ? (
                  <ol>
                    {message.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                ) : null}
                {message.facts && Object.keys(message.facts).length ? (
                  <div className="helpbot-facts">
                    {message.facts.companyName ? <span>Company: {message.facts.companyName}</span> : null}
                    {Number.isFinite(Number(message.facts.prompts)) ? <span>Prompts: {message.facts.prompts}/{message.facts.promptLimit}</span> : null}
                    {Number.isFinite(Number(message.facts.competitors)) ? <span>Competitors: {message.facts.competitors}/{message.facts.competitorLimit}</span> : null}
                    {message.facts.businessAnalysisStatus ? <span>Analysis: {message.facts.businessAnalysisStatus}</span> : null}
                    {message.facts.geoConnected ? <span>GEO: {message.facts.geoProperty || 'Connected'}</span> : null}
                  </div>
                ) : null}
                {message.requestId ? <em>Developer request #{message.requestId} created.</em> : null}
              </article>
            ))}
            {loading ? (
              <article className="helpbot-message bot loading">
                <strong>Aimate is checking…</strong>
                <span />
                <span />
                <span />
              </article>
            ) : null}
          </div>

          <form className="helpbot-form" onSubmit={submit}>
            <label>
              <span>Ask Aimate</span>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Example: where can I see prompt responses?"
              />
            </label>
            <button type="submit" disabled={loading || !question.trim()}>Ask</button>
          </form>
        </section>
      ) : null}

      <button className="helpbot-launcher" type="button" onClick={() => setOpen((current) => !current)} aria-label="Open Aimate help">
        <span className="robot-orbit" aria-hidden="true" />
        <span className="robot-launcher-body" aria-hidden="true">
          <img src={AIMATE_MARK} alt="" />
        </span>
        <span className="robot-spark one" aria-hidden="true" />
        <span className="robot-spark two" aria-hidden="true" />
        <span className="helpbot-launcher-label">Ask</span>
      </button>
    </div>
  );
}
