function claudeModel() {
  const rawModel = String(process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001').trim();
  const model = rawModel.replace(/^CLAUDE_MODEL=/i, '').trim();
  const aliases = {
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-latest': 'claude-haiku-4-5-20251001',
    'claude-3.5-haiku-latest': 'claude-haiku-4-5-20251001',
    'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
    'claude-3-haiku-latest': 'claude-haiku-4-5-20251001',
    'claude-3-haiku-20240307': 'claude-haiku-4-5-20251001'
  };

  return aliases[model] || model || 'claude-haiku-4-5-20251001';
}

function claudeTimeout() {
  const value = Number(process.env.CLAUDE_TIMEOUT || 25000);
  return Number.isFinite(value) && value > 0 ? value : 25000;
}

function claudeMaxTokens() {
  const value = Number(process.env.CLAUDE_MAX_TOKENS || 900);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 4096) : 900;
}

function claudeAeoMaxTokens() {
  const value = Number(process.env.CLAUDE_AEO_MAX_TOKENS || 0);
  const normalized = Number.isFinite(value) && value > 0 ? value : 8192;
  return Math.min(Math.max(normalized, 4096), 8192);
}

function claudeKeyEnding() {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  return key ? key.slice(-6) : 'missing';
}

function claudeApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
}

function claudeKeyLooksValid() {
  return /^sk-ant-api[0-9]{2}-/.test(String(claudeApiKey() || '').trim());
}

function brandAliasesFor(company) {
  const aliases = [String(company?.company_name || '').trim()];

  try {
    const rawUrl = String(company?.website_url || '').trim();
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const host = new URL(normalized).hostname.replace(/^www\./i, '');
    const domainName = host.split('.')[0];

    if (domainName) aliases.push(domainName);
  } catch {
    // Ignore malformed URLs.
  }

  return [...new Set(aliases.filter((alias) => alias.length >= 3))];
}

function exactResponseMentionsBrand(responseText, company) {
  const normalizedResponse = String(responseText || '').toLowerCase();
  return brandAliasesFor(company).some((alias) => normalizedResponse.includes(alias.toLowerCase()));
}

function competitorMentionsFor(responseText, competitors) {
  const normalizedResponse = String(responseText || '').toLowerCase();

  return (competitors || [])
    .map((competitor) => {
      const name = String(competitor.competitor_name || competitor.name || '').trim();
      const websiteUrl = String(competitor.website_url || '').trim();

      if (!name || !normalizedResponse.includes(name.toLowerCase())) return null;

      return {
        competitor_name: name,
        website_url: websiteUrl,
        mention_context: 'Mentioned in Claude response.'
      };
    })
    .filter(Boolean);
}

function citationRecommendations(company, competitors, competitorMentions) {
  const citations = [];

  if (company?.website_url) {
    citations.push({
      page_title: `${company.company_name || 'Company'} website`,
      url: company.website_url,
      source_owner: company.company_name || 'Selected company',
      why_recommended: 'Primary brand website to support answer-engine visibility.'
    });
  }

  competitorMentions.slice(0, 5).forEach((competitor) => {
    if (!competitor.website_url) return;

    citations.push({
      page_title: `${competitor.competitor_name} website`,
      url: competitor.website_url,
      source_owner: competitor.competitor_name,
      why_recommended: 'Competitor source referenced for comparison visibility.'
    });
  });

  return citations;
}

function rawUserPrompt(prompt) {
  return String(prompt?.prompt_text || '').trim();
}

function extractClaudeText(payload) {
  return (payload?.content || [])
    .map((item) => (item?.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function tokenUsage(payload) {
  return {
    inputTokens: Number(payload?.usage?.input_tokens || 0),
    outputTokens: Number(payload?.usage?.output_tokens || 0)
  };
}

function estimateCostCents(inputTokens, outputTokens) {
  const inputDollarsPerMillion = Number(process.env.CLAUDE_INPUT_DOLLARS_PER_MILLION || 0.8);
  const outputDollarsPerMillion = Number(process.env.CLAUDE_OUTPUT_DOLLARS_PER_MILLION || 4);
  const dollars = (inputTokens / 1_000_000) * inputDollarsPerMillion + (outputTokens / 1_000_000) * outputDollarsPerMillion;
  return Math.ceil(dollars * 100);
}

function createClaudeError(code, providerMessage = '', providerStatus = '') {
  const error = new Error(code);
  error.providerMessage = String(providerMessage || '').slice(0, 500);
  error.providerStatus = providerStatus;
  return error;
}

function normalizeClaudeJsonText(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) return '';

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function parseClaudeJson(text) {
  const normalized = normalizeClaudeJsonText(text)
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  if (!normalized) {
    throw new Error('AI_INVALID_JSON');
  }

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(normalized.slice(firstBrace, lastBrace + 1).replace(/,\s*([}\]])/g, '$1'));
    }

    throw error;
  }
}

function normalizeAeoItems(payload, key, fields, minimum) {
  const items = Array.isArray(payload?.[key]) ? payload[key] : [];

  if (items.length < minimum) {
    throw new Error('AI_INVALID_JSON');
  }

  return items.slice(0, 8).map((item) => {
    const normalized = {};

    fields.forEach((field) => {
      const value = item?.[field];

      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('AI_INVALID_JSON');
      }

      normalized[field] = value.trim();
    });

    return normalized;
  });
}

function validateAeoRecommendationsPayload(payload) {
  const focusSummary = payload?.focus_summary;

  if (typeof focusSummary !== 'string' || !focusSummary.trim()) {
    throw new Error('AI_INVALID_JSON');
  }

  return {
    focus_summary: focusSummary.trim(),
    priorities: normalizeAeoItems(payload, 'priorities', ['title', 'focus_area', 'why_it_matters', 'evidence', 'impact', 'effort'], 3),
    action_plan: normalizeAeoItems(payload, 'action_plan', ['step', 'how_to_do_it', 'priority', 'expected_outcome'], 4),
    content_opportunities: normalizeAeoItems(payload, 'content_opportunities', ['topic', 'target_prompt', 'page_type', 'reason'], 3),
    evidence: normalizeAeoItems(payload, 'evidence', ['metric', 'finding'], 3)
  };
}

function buildAeoRecommendationsPrompt(context) {
  return `You are Aimate, an AEO/GEO strategy lead.

Create a practical "what to do next" action plan for this brand using only saved Aimate data.

Use the provided saved business analysis, prompt checks, competitor mentions, citation recommendations, and dashboard metrics.

Rules:
- Return only valid JSON.
- Do not return markdown.
- Do not include commentary before or after the JSON.
- Keep JSON values concise so the full object fits in one response.
- Do not invent facts or metrics.
- Every recommendation must be tied to the provided saved data.
- If data is thin or missing, say what data must be collected next instead of pretending.
- Focus on AEO/GEO: answer-engine visibility, brand mentions, competitor gap, citation footprint, content pages, and prompt coverage.
- Keep all copy client-ready, direct, and actionable.
- "impact" must be High, Medium, or Low.
- "effort" must be High, Medium, or Low.
- "priority" must be P1, P2, or P3.

Return this exact JSON shape:
{
  "focus_summary": "",
  "priorities": [
    {
      "title": "",
      "focus_area": "",
      "why_it_matters": "",
      "evidence": "",
      "impact": "",
      "effort": ""
    }
  ],
  "action_plan": [
    {
      "step": "",
      "how_to_do_it": "",
      "priority": "",
      "expected_outcome": ""
    }
  ],
  "content_opportunities": [
    {
      "topic": "",
      "target_prompt": "",
      "page_type": "",
      "reason": ""
    }
  ],
  "evidence": [
    {
      "metric": "",
      "finding": ""
    }
  ]
}

Saved Aimate data:
${JSON.stringify(context, null, 2)}`;
}

async function callClaude(prompt, signal, options = {}) {
  const maxTokens = Number(options.maxTokens || claudeMaxTokens());

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': process.env.CLAUDE_API_VERSION || '2023-06-01',
      'x-api-key': claudeApiKey()
    },
    signal,
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: Math.min(Math.max(maxTokens, 1), 16000),
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || '';

    if (response.status === 401 || response.status === 403) {
      throw createClaudeError('CLAUDE_AUTH_FAILED', message, response.status);
    }

    if (response.status === 429) {
      throw createClaudeError('CLAUDE_RATE_LIMITED', message, response.status);
    }

    if (response.status === 400 && /model/i.test(message)) {
      throw createClaudeError('CLAUDE_MODEL_UNAVAILABLE', message, response.status);
    }

    throw createClaudeError('CLAUDE_REQUEST_FAILED', message, response.status);
  }

  return payload;
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  if (!claudeApiKey()) {
    throw new Error('CLAUDE_MISSING_KEY');
  }

  return Promise.all(prompts.map(async (prompt) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), claudeTimeout());

    try {
      const payload = await callClaude(rawUserPrompt(prompt), controller.signal);
      const responseText = extractClaudeText(payload);

      if (!responseText) {
        throw new Error('CLAUDE_EMPTY_RESPONSE');
      }

      const brandMentioned = exactResponseMentionsBrand(responseText, company);
      const competitorMentions = competitorMentionsFor(responseText, competitors);
      const usage = tokenUsage(payload);

      return {
        prompt_id: String(prompt.id),
        brand_mentioned: brandMentioned,
        brand_mention_context: brandMentioned ? 'Mentioned in Claude response.' : 'Not mentioned in Claude response.',
        competitor_mentions: competitorMentions,
        recommended_citations: citationRecommendations(company, competitors, competitorMentions),
        ai_response_summary: responseText,
        claude_response_summary: responseText,
        visibility_status: 'checked',
        provider_usage: {
          provider_name: 'claude',
          prompt_id: Number(prompt.id),
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          estimated_cost_cents: estimateCostCents(usage.inputTokens, usage.outputTokens)
        }
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('CLAUDE_TIMEOUT');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }));
}

async function generateAeoRecommendations(context) {
  if (!claudeApiKey()) {
    throw new Error('CLAUDE_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), claudeTimeout());

  try {
    const payload = await callClaude(buildAeoRecommendationsPrompt(context), controller.signal, {
      maxTokens: claudeAeoMaxTokens()
    });
    const text = extractClaudeText(payload);

    return validateAeoRecommendationsPayload(parseClaudeJson(text));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('CLAUDE_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderDiagnostics() {
  return {
    provider: 'Claude',
    model: claudeModel(),
    hasApiKey: Boolean(claudeApiKey()),
    keyLooksValid: claudeKeyLooksValid(),
    keyEnding: claudeKeyEnding(),
    timeoutMs: claudeTimeout(),
    maxTokens: claudeMaxTokens()
  };
}

module.exports = {
  callClaude,
  extractClaudeText,
  normalizeClaudeJsonText,
  parseClaudeJson,
  claudeTimeout,
  analyzePromptVisibility,
  generateAeoRecommendations,
  getProviderDiagnostics
};
