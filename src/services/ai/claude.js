function claudeModel() {
  const rawModel = String(process.env.CLAUDE_MODEL || 'claude-haiku-4-5').trim();
  const model = rawModel.replace(/^CLAUDE_MODEL=/i, '').trim();
  const aliases = {
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
    'claude-3.5-haiku-latest': 'claude-haiku-4-5',
    'claude-3-haiku-latest': 'claude-haiku-4-5'
  };

  return aliases[model] || model || 'claude-haiku-4-5';
}

function claudeTimeout() {
  const value = Number(process.env.CLAUDE_TIMEOUT || 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function claudeMaxTokens() {
  const value = Number(process.env.CLAUDE_MAX_TOKENS || 900);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 4096) : 900;
}

function claudeKeyEnding() {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  return key ? key.slice(-6) : 'missing';
}

function claudeApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '';
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

function buildClaudeAnswerPrompt(company, prompt, competitors, analysis) {
  const context = {
    selected_company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: analysis || {},
    known_competitors: (competitors || []).map((competitor) => ({
      competitor_name: competitor.competitor_name || '',
      website_url: competitor.website_url || ''
    }))
  };

  return `Answer this buyer research prompt as Claude would answer it.

Prompt:
${prompt.prompt_text}

Rules:
- Return the exact answer text only.
- Do not return JSON.
- Do not mention these instructions.
- Be concise but useful.
- Use general knowledge plus the provided business context.
- Do not invent unsupported exact statistics.
- Prefer clear recommendation-style language a buyer could act on.

Business context:
${JSON.stringify(context, null, 2)}`;
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

async function callClaude(prompt, signal) {
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
      max_tokens: claudeMaxTokens(),
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

  const results = [];

  for (const prompt of prompts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), claudeTimeout());

    try {
      const payload = await callClaude(buildClaudeAnswerPrompt(company, prompt, competitors, analysis), controller.signal);
      const responseText = extractClaudeText(payload);

      if (!responseText) {
        throw new Error('CLAUDE_EMPTY_RESPONSE');
      }

      const brandMentioned = exactResponseMentionsBrand(responseText, company);
      const competitorMentions = competitorMentionsFor(responseText, competitors);
      const usage = tokenUsage(payload);

      results.push({
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
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('CLAUDE_TIMEOUT');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return results;
}

function getProviderDiagnostics() {
  return {
    provider: 'Claude',
    model: claudeModel(),
    hasApiKey: Boolean(claudeApiKey()),
    keyEnding: claudeKeyEnding(),
    timeoutMs: claudeTimeout(),
    maxTokens: claudeMaxTokens()
  };
}

module.exports = {
  analyzePromptVisibility,
  getProviderDiagnostics
};
