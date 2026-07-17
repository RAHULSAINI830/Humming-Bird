function perplexityModel() {
  return process.env.PERPLEXITY_MODEL || 'sonar';
}

function perplexityTimeout() {
  const value = Number(process.env.PERPLEXITY_TIMEOUT || 60000);
  return Number.isFinite(value) && value > 0 ? value : 60000;
}

function perplexityKeyEnding() {
  const key = process.env.PERPLEXITY_API_KEY || '';
  return key ? key.slice(-6) : 'missing';
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
        mention_context: 'Mentioned in Perplexity response.'
      };
    })
    .filter(Boolean);
}

function normalizeCitationUrl(citation) {
  if (typeof citation === 'string') return citation;
  return citation?.url || citation?.link || citation?.source || '';
}

function citationRecommendations(company, payload, competitors, competitorMentions) {
  const seen = new Set();
  const citations = [];

  (payload?.citations || payload?.search_results || []).forEach((citation) => {
    const url = normalizeCitationUrl(citation);
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push({
      page_title: citation?.title || citation?.name || url,
      url,
      source_owner: citation?.source || citation?.domain || '',
      why_recommended: 'Cited by Perplexity in the saved response.'
    });
  });

  if (!citations.length && company?.website_url) {
    citations.push({
      page_title: `${company.company_name || 'Company'} website`,
      url: company.website_url,
      source_owner: company.company_name || 'Selected company',
      why_recommended: 'Primary brand website to support answer-engine visibility.'
    });
  }

  competitorMentions.slice(0, 5).forEach((competitor) => {
    if (!competitor.website_url || seen.has(competitor.website_url)) return;
    seen.add(competitor.website_url);
    citations.push({
      page_title: `${competitor.competitor_name} website`,
      url: competitor.website_url,
      source_owner: competitor.competitor_name,
      why_recommended: 'Competitor source referenced for comparison visibility.'
    });
  });

  return citations.slice(0, 12);
}

function rawUserPrompt(prompt) {
  return String(prompt?.prompt_text || '').trim();
}

function extractPerplexityText(payload) {
  if (typeof payload?.output_text === 'string') {
    return payload.output_text.trim();
  }

  const choices = payload?.choices || [];
  const firstMessage = choices[0]?.message;

  if (typeof firstMessage?.content === 'string') {
    return firstMessage.content.trim();
  }

  if (Array.isArray(firstMessage?.content)) {
    return firstMessage.content
      .map((part) => part?.text || part?.content || '')
      .join('\n')
      .trim();
  }

  return '';
}

function tokenUsage(payload) {
  return {
    inputTokens: Number(payload?.usage?.prompt_tokens || payload?.usage?.input_tokens || 0),
    outputTokens: Number(payload?.usage?.completion_tokens || payload?.usage?.output_tokens || 0)
  };
}

function estimateCostCents(payload, inputTokens, outputTokens) {
  const totalCost = Number(
    payload?.usage?.cost?.total_cost
    || payload?.usage?.cost?.total
    || payload?.usage?.total_cost
    || 0
  );

  if (Number.isFinite(totalCost) && totalCost > 0) {
    return Math.ceil(totalCost * 100);
  }

  const inputDollarsPerMillion = Number(process.env.PERPLEXITY_INPUT_DOLLARS_PER_MILLION || 1);
  const outputDollarsPerMillion = Number(process.env.PERPLEXITY_OUTPUT_DOLLARS_PER_MILLION || 1);
  const dollars = (inputTokens / 1_000_000) * inputDollarsPerMillion + (outputTokens / 1_000_000) * outputDollarsPerMillion;
  return Math.ceil(dollars * 100);
}

function createPerplexityError(code, providerMessage = '', providerStatus = '') {
  const error = new Error(code);
  error.providerMessage = String(providerMessage || '').slice(0, 500);
  error.providerStatus = providerStatus;
  return error;
}

async function callPerplexity(prompt, signal) {
  const response = await fetch('https://api.perplexity.ai/v1/sonar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`
    },
    signal,
    body: JSON.stringify({
      model: perplexityModel(),
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
      throw createPerplexityError('PERPLEXITY_AUTH_FAILED', message, response.status);
    }

    if (response.status === 429) {
      throw createPerplexityError('PERPLEXITY_RATE_LIMITED', message, response.status);
    }

    throw createPerplexityError('PERPLEXITY_REQUEST_FAILED', message, response.status);
  }

  return payload;
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('PERPLEXITY_MISSING_KEY');
  }

  const results = [];

  for (const prompt of prompts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), perplexityTimeout());

    try {
      const payload = await callPerplexity(rawUserPrompt(prompt), controller.signal);
      const responseText = extractPerplexityText(payload);

      if (!responseText) {
        throw new Error('PERPLEXITY_EMPTY_RESPONSE');
      }

      const brandMentioned = exactResponseMentionsBrand(responseText, company);
      const competitorMentions = competitorMentionsFor(responseText, competitors);
      const usage = tokenUsage(payload);

      results.push({
        prompt_id: String(prompt.id),
        brand_mentioned: brandMentioned,
        brand_mention_context: brandMentioned ? 'Mentioned in Perplexity response.' : 'Not mentioned in Perplexity response.',
        competitor_mentions: competitorMentions,
        recommended_citations: citationRecommendations(company, payload, competitors, competitorMentions),
        ai_response_summary: responseText,
        perplexity_response_summary: responseText,
        visibility_status: 'checked',
        provider_usage: {
          provider_name: 'perplexity',
          prompt_id: Number(prompt.id),
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          estimated_cost_cents: estimateCostCents(payload, usage.inputTokens, usage.outputTokens)
        }
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('PERPLEXITY_TIMEOUT');
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
    provider: 'Perplexity',
    model: perplexityModel(),
    hasApiKey: Boolean(process.env.PERPLEXITY_API_KEY),
    keyEnding: perplexityKeyEnding(),
    timeoutMs: perplexityTimeout()
  };
}

module.exports = {
  callPerplexity,
  extractPerplexityText,
  perplexityTimeout,
  analyzePromptVisibility,
  getProviderDiagnostics
};
