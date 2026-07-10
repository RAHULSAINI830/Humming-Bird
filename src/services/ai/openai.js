function openaiModel() {
  return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}

function openaiTimeout() {
  const value = Number(process.env.OPENAI_TIMEOUT || 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function openaiKeyEnding() {
  const key = process.env.OPENAI_API_KEY || '';
  return key ? key.slice(-6) : 'missing';
}

function openaiKeyLooksValid() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  return /^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}/.test(key) && !key.startsWith('sk-ant-');
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
        mention_context: `Mentioned in ChatGPT response.`
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

function extractOpenAiText(payload) {
  if (typeof payload?.output_text === 'string') {
    return payload.output_text.trim();
  }

  const parts = [];
  (payload?.output || []).forEach((item) => {
    (item?.content || []).forEach((content) => {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    });
  });

  return parts.join('\n').trim();
}

function tokenUsage(payload) {
  return {
    inputTokens: Number(payload?.usage?.input_tokens || payload?.usage?.prompt_tokens || 0),
    outputTokens: Number(payload?.usage?.output_tokens || payload?.usage?.completion_tokens || 0)
  };
}

function estimateCostCents(inputTokens, outputTokens) {
  // Conservative default for gpt-4.1-mini-ish testing. Developer caps remain the real guardrail.
  const inputDollarsPerMillion = Number(process.env.OPENAI_INPUT_DOLLARS_PER_MILLION || 0.4);
  const outputDollarsPerMillion = Number(process.env.OPENAI_OUTPUT_DOLLARS_PER_MILLION || 1.6);
  const dollars = (inputTokens / 1_000_000) * inputDollarsPerMillion + (outputTokens / 1_000_000) * outputDollarsPerMillion;
  return Math.ceil(dollars * 100);
}

function createOpenAiError(code, providerMessage = '', providerStatus = '') {
  const error = new Error(code);
  error.providerMessage = String(providerMessage || '').slice(0, 500);
  error.providerStatus = providerStatus;
  return error;
}

async function callOpenAi(prompt, signal) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    signal,
    body: JSON.stringify({
      model: openaiModel(),
      input: prompt,
      temperature: 0.2
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || '';

    if (response.status === 401 || response.status === 403) {
      throw createOpenAiError('OPENAI_AUTH_FAILED', message, response.status);
    }

    if (response.status === 429) {
      throw createOpenAiError('OPENAI_RATE_LIMITED', message, response.status);
    }

    throw createOpenAiError('OPENAI_REQUEST_FAILED', message, response.status);
  }

  return payload;
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_MISSING_KEY');
  }

  if (!openaiKeyLooksValid()) {
    throw createOpenAiError('OPENAI_INVALID_KEY_FORMAT', 'OPENAI_API_KEY does not look like an OpenAI API key.', '');
  }

  const results = [];

  for (const prompt of prompts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), openaiTimeout());

    try {
      const payload = await callOpenAi(rawUserPrompt(prompt), controller.signal);
      const responseText = extractOpenAiText(payload);

      if (!responseText) {
        throw new Error('OPENAI_EMPTY_RESPONSE');
      }

      const brandMentioned = exactResponseMentionsBrand(responseText, company);
      const competitorMentions = competitorMentionsFor(responseText, competitors);
      const usage = tokenUsage(payload);

      results.push({
        prompt_id: String(prompt.id),
        brand_mentioned: brandMentioned,
        brand_mention_context: brandMentioned ? 'Mentioned in ChatGPT response.' : 'Not mentioned in ChatGPT response.',
        competitor_mentions: competitorMentions,
        recommended_citations: citationRecommendations(company, competitors, competitorMentions),
        ai_response_summary: responseText,
        chatgpt_response_summary: responseText,
        visibility_status: 'checked',
        provider_usage: {
          provider_name: 'openai',
          prompt_id: Number(prompt.id),
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          estimated_cost_cents: estimateCostCents(usage.inputTokens, usage.outputTokens)
        }
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('OPENAI_TIMEOUT');
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
    provider: 'OpenAI',
    model: openaiModel(),
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    keyLooksValid: openaiKeyLooksValid(),
    keyEnding: openaiKeyEnding(),
    timeoutMs: openaiTimeout()
  };
}

module.exports = {
  analyzePromptVisibility,
  getProviderDiagnostics
};
