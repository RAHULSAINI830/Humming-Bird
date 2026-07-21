const fs = require('node:fs');
const path = require('node:path');
const { extractWebsiteSnapshot } = require('./website-extractor');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadLocalEnv();

let hasLoggedAiProviderConfig = false;

function normalizeGeminiModelName(model) {
  const normalized = String(model || '')
    .trim()
    .replace(/^models\//, '');

  const blockedOrExpensiveDefaults = new Map([
    ['gemini-3.5-flash', 'gemini-flash-lite-latest'],
    ['gemini-2.5-flash', 'gemini-flash-lite-latest']
  ]);

  return blockedOrExpensiveDefaults.get(normalized) || normalized;
}

function geminiModel() {
  return normalizeGeminiModelName(process.env.GEMINI_MODEL || 'gemini-flash-lite-latest');
}

function geminiFallbackModels() {
  const configured = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map(normalizeGeminiModelName)
    .filter(Boolean);

  return configured.length
    ? configured
    : ['gemini-3.1-flash-lite', 'gemini-2.0-flash-lite', 'gemini-flash-latest'];
}

function geminiModelCandidates() {
  return [...new Set([geminiModel(), ...geminiFallbackModels()].filter(Boolean))];
}

function geminiModelPath(model = geminiModel()) {
  return `models/${normalizeGeminiModelName(model)}`;
}

function geminiTimeout() {
  const value = Number(process.env.GEMINI_TIMEOUT || 25000);
  return Number.isFinite(value) && value > 0 ? value : 25000;
}

function geminiRetryAttempts() {
  const value = Number(process.env.GEMINI_RETRY_ATTEMPTS || 3);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5) : 3;
}

function geminiKeyEnding() {
  const key = process.env.GEMINI_API_KEY || '';
  return key ? key.slice(-6) : 'missing';
}

function logAiProviderConfigOnce() {
  if (hasLoggedAiProviderConfig) {
    return;
  }

  hasLoggedAiProviderConfig = true;
  console.log(
    `Aimate provider configured: model=${geminiModel()}, keyEnding=${geminiKeyEnding()}`
  );
}

function getProviderDiagnostics() {
  return {
    provider: 'Aimate',
    model: geminiModel(),
    fallbackModels: geminiFallbackModels(),
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    keyEnding: geminiKeyEnding(),
    timeoutMs: geminiTimeout(),
    retryAttempts: geminiRetryAttempts(),
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA || '',
    vercelEnv: process.env.VERCEL_ENV || '',
    nodeEnv: process.env.NODE_ENV || ''
  };
}

function retryDelayMs(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 10000);
  }

  return Math.min(1200 * attempt, 5000);
}

function createAiError(code, providerMessage = '', providerStatus = '') {
  const error = new Error(code);
  error.providerMessage = String(providerMessage || '').slice(0, 500);
  error.providerStatus = providerStatus;
  return error;
}

function createNetworkError(error) {
  const causeMessage = error?.cause?.message || error?.message || 'Network request failed';
  return createAiError('AI_NETWORK_ERROR', causeMessage);
}

function canTryNextGeminiModel(status, message) {
  const normalizedMessage = String(message || '').toLowerCase();

  if (/prepayment credits are depleted|credits are depleted|billing|api key not valid/.test(normalizedMessage)) {
    return false;
  }

  if (/quota exceeded.*model:|free_tier_requests.*model:|retry in/i.test(message || '')) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  return /model.*no longer available|model.*not found|not supported|high demand|rate limit|rate-limit|temporarily unavailable|quota exceeded/.test(normalizedMessage);
}

const ANALYSIS_FIELDS = [
  'business_summary',
  'detected_industry',
  'detected_services',
  'target_audience_summary',
  'service_area_summary',
  'positioning_summary',
  'industry',
  'service_area',
  'target_country',
  'main_services',
  'known_competitors',
  'brand_description',
  'target_audience'
];
const PROMPT_FIELDS = ['prompt_text', 'prompt_category', 'prompt_intent'];
const PROMPT_RESEARCH_FIELDS = ['prompt_text', 'prompt_category', 'prompt_intent', 'why_recommended', 'priority'];
const COMPETITOR_FIELDS = ['competitor_name', 'website_url', 'reason'];
const AEO_PRIORITY_FIELDS = ['title', 'focus_area', 'why_it_matters', 'evidence', 'impact', 'effort'];
const AEO_ACTION_FIELDS = ['step', 'how_to_do_it', 'priority', 'expected_outcome'];
const AEO_CONTENT_FIELDS = ['topic', 'target_prompt', 'page_type', 'reason'];
const AEO_EVIDENCE_FIELDS = ['metric', 'finding'];

function businessAnalysisJsonSchema() {
  return {
    type: 'OBJECT',
    required: ANALYSIS_FIELDS,
    propertyOrdering: ANALYSIS_FIELDS,
    properties: Object.fromEntries(
      ANALYSIS_FIELDS.map((field) => [field, { type: 'STRING' }])
    )
  };
}

function promptGenerationJsonSchema() {
  return {
    type: 'OBJECT',
    required: ['prompts'],
    properties: {
      prompts: {
        type: 'ARRAY',
        minItems: 15,
        maxItems: 15,
        items: {
          type: 'OBJECT',
          required: PROMPT_FIELDS,
          propertyOrdering: PROMPT_FIELDS,
          properties: {
            prompt_text: { type: 'STRING' },
            prompt_category: { type: 'STRING' },
            prompt_intent: { type: 'STRING' }
          }
        }
      }
    }
  };
}

function promptResearchJsonSchema(maxItems = 10) {
  return {
    type: 'OBJECT',
    required: ['prompts'],
    properties: {
      prompts: {
        type: 'ARRAY',
        minItems: 1,
        maxItems: Math.max(1, Math.min(Number(maxItems) || 10, 30)),
        items: {
          type: 'OBJECT',
          required: PROMPT_RESEARCH_FIELDS,
          propertyOrdering: PROMPT_RESEARCH_FIELDS,
          properties: {
            prompt_text: { type: 'STRING' },
            prompt_category: { type: 'STRING' },
            prompt_intent: { type: 'STRING' },
            why_recommended: { type: 'STRING' },
            priority: { type: 'STRING' }
          }
        }
      }
    }
  };
}

function competitorDiscoveryJsonSchema() {
  return {
    type: 'OBJECT',
    required: ['competitors'],
    properties: {
      competitors: {
        type: 'ARRAY',
        minItems: 10,
        maxItems: 10,
        items: {
          type: 'OBJECT',
          required: COMPETITOR_FIELDS,
          propertyOrdering: COMPETITOR_FIELDS,
          properties: {
            competitor_name: { type: 'STRING' },
            website_url: { type: 'STRING' },
            reason: { type: 'STRING' }
          }
        }
      }
    }
  };
}

function promptVisibilityJsonSchema() {
  return {
    type: 'OBJECT',
    required: ['prompt_results'],
    properties: {
      prompt_results: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: [
            'prompt_id',
            'brand_mentioned',
            'brand_mention_context',
            'competitor_mentions',
            'recommended_citations',
            'ai_response_summary',
            'visibility_status'
          ],
          properties: {
            prompt_id: { type: 'STRING' },
            brand_mentioned: { type: 'BOOLEAN' },
            brand_mention_context: { type: 'STRING' },
            competitor_mentions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                required: ['competitor_name', 'website_url', 'mention_context'],
                properties: {
                  competitor_name: { type: 'STRING' },
                  website_url: { type: 'STRING' },
                  mention_context: { type: 'STRING' }
                }
              }
            },
            recommended_citations: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                required: ['page_title', 'url', 'source_owner', 'why_recommended'],
                properties: {
                  page_title: { type: 'STRING' },
                  url: { type: 'STRING' },
                  source_owner: { type: 'STRING' },
                  why_recommended: { type: 'STRING' }
                }
              }
            },
            ai_response_summary: { type: 'STRING' },
            visibility_status: { type: 'STRING' }
          }
        }
      }
    }
  };
}

function aeoRecommendationsJsonSchema() {
  const stringProps = (fields) => Object.fromEntries(fields.map((field) => [field, { type: 'STRING' }]));

  return {
    type: 'OBJECT',
    required: ['focus_summary', 'priorities', 'action_plan', 'content_opportunities', 'evidence'],
    properties: {
      focus_summary: { type: 'STRING' },
      priorities: {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 6,
        items: {
          type: 'OBJECT',
          required: AEO_PRIORITY_FIELDS,
          propertyOrdering: AEO_PRIORITY_FIELDS,
          properties: stringProps(AEO_PRIORITY_FIELDS)
        }
      },
      action_plan: {
        type: 'ARRAY',
        minItems: 4,
        maxItems: 8,
        items: {
          type: 'OBJECT',
          required: AEO_ACTION_FIELDS,
          propertyOrdering: AEO_ACTION_FIELDS,
          properties: stringProps(AEO_ACTION_FIELDS)
        }
      },
      content_opportunities: {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'OBJECT',
          required: AEO_CONTENT_FIELDS,
          propertyOrdering: AEO_CONTENT_FIELDS,
          properties: stringProps(AEO_CONTENT_FIELDS)
        }
      },
      evidence: {
        type: 'ARRAY',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'OBJECT',
          required: AEO_EVIDENCE_FIELDS,
          propertyOrdering: AEO_EVIDENCE_FIELDS,
          properties: stringProps(AEO_EVIDENCE_FIELDS)
        }
      }
    }
  };
}

function buildBusinessAnalysisPrompt(company, websiteSnapshot) {
  const profile = {
    company_name: String(company.company_name || '').trim(),
    website_url: String(company.website_url || '').trim(),
    logo_url: String(company.logo_url || '').trim()
  };

  return `You are Aimate, a careful business intelligence analyst.

Analyze this company using the provided company identity and the extracted website content.

Priority:
1. Use extracted website content as the primary source.
2. Use title/meta description as supporting context.
3. Use company name and URL only when website content is missing or unclear.

Rules:
- Return only valid JSON.
- Do not return markdown.
- Do not wrap the JSON in code fences.
- Do not invent unsupported facts.
- If unsure, use "Unknown" or explain uncertainty briefly.
- If website content was not fetched, clearly mention that uncertainty in relevant fields.
- Keep output client-ready and concise.
- Prefer exact product/service language found on the website.

Return strict JSON with exactly these keys:
{
  "business_summary": "",
  "detected_industry": "",
  "detected_services": "",
  "target_audience_summary": "",
  "service_area_summary": "",
  "positioning_summary": "",
  "industry": "",
  "service_area": "",
  "target_country": "",
  "main_services": "",
  "known_competitors": "",
  "brand_description": "",
  "target_audience": ""
}

Company identity:
${JSON.stringify(profile, null, 2)}

Website snapshot:
${JSON.stringify(websiteSnapshot, null, 2)}`;
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = Array.isArray(candidates[0]?.content?.parts) ? candidates[0].content.parts : [];
  const textPart = parts.find((part) => typeof part?.text === 'string');
  return textPart?.text || '';
}

function normalizeGeminiJsonText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function validateBusinessAnalysisPayload(payload) {
  const analysis = {};

  for (const field of ANALYSIS_FIELDS) {
    const value = payload?.[field];

    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('AI_INVALID_JSON');
    }

    analysis[field] = value.trim();
  }

  return analysis;
}

function buildPromptGenerationPrompt(company, analysis, websiteSnapshot) {
  const context = {
    company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      known_competitors: company.known_competitors || '',
      brand_description: company.brand_description || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: {
      business_summary: analysis?.business_summary || '',
      detected_industry: analysis?.detected_industry || '',
      detected_services: analysis?.detected_services || '',
      target_audience_summary: analysis?.target_audience_summary || '',
      service_area_summary: analysis?.service_area_summary || '',
      positioning_summary: analysis?.positioning_summary || ''
    },
    website_snapshot: {
      fetched: Boolean(websiteSnapshot?.fetched),
      url: websiteSnapshot?.url || company.website_url || '',
      title: websiteSnapshot?.title || '',
      description: websiteSnapshot?.description || '',
      readable_text: websiteSnapshot?.text || '',
      fetch_error: websiteSnapshot?.error || ''
    }
  };

  return `You are Aimate, an AI visibility and GEO/AEO strategist.

Create the top 15 realistic AI search prompts that potential buyers would ask ChatGPT, Gemini, Claude, Perplexity, or another answer engine when looking for solutions related to this company's actual business.

Use only the provided company, saved business analysis, and extracted website content.

Source priority:
1. Extracted website readable_text, title, and description.
2. Saved business analysis generated from the website.
3. Company profile fields.

Critical rules:
- Prompts must be related to the business category, services, audience, buyer pain points, and buying journey of this specific company.
- Do not generate prompts that merely ask "what is [company]" or "tell me about [company]" unless that is clearly a buyer-intent query.
- Do not generate prompts about Aimate, SEO software, AI visibility tracking, or this platform unless the company itself sells that.
- Each prompt must include a specific service, problem, use case, audience, industry, location, or comparison angle from the provided context.
- If website content is available, prefer service language found on the website.
- If website content is missing, be conservative and use only the saved analysis fields.

Prompt goals:
- Prompts should model what real buyers would ask before buying from or comparing vendors like this company.
- Include discovery, comparison, problem-aware, solution-aware, local/service-area, pricing/value, and competitor-alternative style prompts where relevant.
- Prompts must sound like real buyer questions.
- Do not mention Aimate.
- Do not invent unsupported services or locations.
- If location is unknown, keep prompts location-neutral.
- Keep each prompt clear and client-ready.

Return only valid JSON with exactly this shape:
{
  "prompts": [
    {
      "prompt_text": "",
      "prompt_category": "",
      "prompt_intent": ""
    }
  ]
}

Return exactly 15 prompts.

Context:
${JSON.stringify(context, null, 2)}`;
}

function validatePromptGenerationPayload(payload) {
  const prompts = Array.isArray(payload?.prompts) ? payload.prompts : [];

  if (prompts.length !== 15) {
    throw new Error('AI_INVALID_JSON');
  }

  return prompts.map((prompt) => {
    const normalized = {};

    for (const field of PROMPT_FIELDS) {
      const value = prompt?.[field];

      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('AI_INVALID_JSON');
      }

      normalized[field] = value.trim();
    }

    return normalized;
  });
}

function buildPromptResearchPrompt(company, analysis, websiteSnapshot, existingPrompts, research) {
  const maxPrompts = Math.max(1, Math.min(Number(research?.maxPrompts) || 10, 30));
  const context = {
    company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      known_competitors: company.known_competitors || '',
      brand_description: company.brand_description || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: {
      business_summary: analysis?.business_summary || '',
      detected_industry: analysis?.detected_industry || '',
      detected_services: analysis?.detected_services || '',
      target_audience_summary: analysis?.target_audience_summary || '',
      service_area_summary: analysis?.service_area_summary || '',
      positioning_summary: analysis?.positioning_summary || ''
    },
    website_snapshot: {
      fetched: Boolean(websiteSnapshot?.fetched),
      url: websiteSnapshot?.url || company.website_url || '',
      title: websiteSnapshot?.title || '',
      description: websiteSnapshot?.description || '',
      readable_text: websiteSnapshot?.text || '',
      fetch_error: websiteSnapshot?.error || ''
    },
    current_saved_prompts: (existingPrompts || []).map((prompt) => ({
      prompt_text: prompt.prompt_text || '',
      prompt_category: prompt.prompt_category || '',
      prompt_intent: prompt.prompt_intent || ''
    })),
    research_brief: {
      max_prompts_to_return: maxPrompts,
      research_goal: research?.goal || '',
      target_buyer: research?.audience || '',
      service_or_topic_focus: research?.serviceFocus || '',
      market_or_location_focus: research?.locationFocus || '',
      buyer_stage: research?.buyerStage || '',
      extra_notes: research?.notes || ''
    }
  };

  return `You are Aimate, an AI visibility prompt strategist.

Research new buyer-intent prompts for this company. The user will decide which prompts to include in the workspace.

Use only the provided website content, business analysis, current saved prompts, and research brief.

Rules:
- Return only valid JSON.
- Do not return markdown.
- Do not duplicate or lightly rephrase the current saved prompts.
- Do not invent unsupported services, locations, industries, or competitors.
- Prompts must be useful for answer-engine visibility research across ChatGPT, Aimate, Claude, Perplexity, and similar AI search tools.
- Every prompt must sound like a real buyer, operator, or decision-maker asking for help.
- Focus on prompts the company should actively track or optimize content for.
- If the research brief is narrow, prioritize that brief.
- If a requested angle is unsupported by the business data, choose a safer adjacent buyer-intent prompt.
- Return no more than ${maxPrompts} prompts.
- "priority" must be High, Medium, or Low.

Return exactly this JSON shape:
{
  "prompts": [
    {
      "prompt_text": "",
      "prompt_category": "",
      "prompt_intent": "",
      "why_recommended": "",
      "priority": ""
    }
  ]
}

Context:
${JSON.stringify(context, null, 2)}`;
}

function validatePromptResearchPayload(payload, maxPrompts) {
  const prompts = Array.isArray(payload?.prompts) ? payload.prompts : [];
  const limit = Math.max(1, Math.min(Number(maxPrompts) || 10, 30));

  if (!prompts.length) {
    throw new Error('AI_INVALID_JSON');
  }

  return prompts.slice(0, limit).map((prompt) => {
    const normalized = {};

    for (const field of PROMPT_RESEARCH_FIELDS) {
      const value = prompt?.[field];

      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('AI_INVALID_JSON');
      }

      normalized[field] = value.trim();
    }

    if (!['high', 'medium', 'low'].includes(normalized.priority.toLowerCase())) {
      normalized.priority = 'Medium';
    }

    return normalized;
  });
}

function buildCompetitorDiscoveryPrompt(company, analysis) {
  const context = {
    company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      known_competitors: company.known_competitors || '',
      brand_description: company.brand_description || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: analysis || {}
  };

  return `You are Aimate, a competitive intelligence analyst.

Identify related competitors for this company based on the provided saved company profile and business analysis.

Rules:
- Return only valid JSON.
- Do not return markdown.
- Prefer direct competitors or close alternatives in the same buyer category.
- Include company name and official website URL if you know it.
- If the exact URL is uncertain, use "Unknown".
- Do not include the selected company itself as a competitor.
- Return exactly 10 competitors.

JSON shape:
{
  "competitors": [
    {
      "competitor_name": "",
      "website_url": "",
      "reason": ""
    }
  ]
}

Context:
${JSON.stringify(context, null, 2)}`;
}

function buildPromptVisibilityPrompt(company, prompts, competitors, analysis) {
  const context = {
    company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      brand_description: company.brand_description || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: analysis || {},
    competitors: competitors.map((competitor) => ({
      competitor_name: competitor.competitor_name,
      website_url: competitor.website_url || '',
      notes: competitor.notes || ''
    })),
    prompts: prompts.map((prompt) => ({
      prompt_id: String(prompt.id),
      prompt_text: prompt.prompt_text,
      prompt_category: prompt.prompt_category || '',
      prompt_intent: prompt.prompt_intent || ''
    }))
  };

  return `You are Gemini answering buyer research prompts.

For each prompt, first generate the exact answer Gemini would give to that user prompt.

Important:
- The "ai_response_summary" field must contain the exact Gemini answer text, not a summary.
- Do not summarize the answer in "ai_response_summary".
- Brand mention must be based only on that exact answer text.
- Set "brand_mentioned" to true only if the exact answer explicitly mentions the selected brand/company name or an unmistakable variant of it.
- If the exact answer does not mention the selected brand/company, set "brand_mentioned" to false and set "brand_mention_context" to "Not mentioned in Gemini response."
- Competitor mentions must also be based only on the exact answer text.

For every prompt:
1. Generate the exact Gemini answer text for the buyer prompt.
2. Check whether the exact answer mentions the selected brand/company.
3. Identify listed competitors that appear in the exact answer.
4. Recommend citation/source pages that should support visibility for the brand and competitors.

Citation/source rules:
- Include the selected company's website URL when it would be useful.
- Include competitor URLs when competitor mentions are relevant and known.
- You may recommend likely page types such as homepage, pricing, solutions, case studies, integrations, reviews, or comparison pages.
- Do not invent exact deep URLs unless provided. If only the domain is known, use the domain.
- Keep output concise and practical.

Return only valid JSON. No markdown.

JSON shape:
{
  "prompt_results": [
    {
      "prompt_id": "",
      "brand_mentioned": true,
      "brand_mention_context": "",
      "competitor_mentions": [
        {
          "competitor_name": "",
          "website_url": "",
          "mention_context": ""
        }
      ],
      "recommended_citations": [
        {
          "page_title": "",
          "url": "",
          "source_owner": "",
          "why_recommended": ""
        }
      ],
      "ai_response_summary": "Exact Gemini answer text goes here.",
      "visibility_status": ""
    }
  ]
}

Context:
${JSON.stringify(context, null, 2)}`;
}

function buildAeoRecommendationsPrompt(context) {
  return `You are Aimate, an AEO/GEO strategy lead.

Create a practical "what to do next" action plan for this brand using only saved Aimate data.

Use the provided saved business analysis, prompt checks, competitor mentions, citation recommendations, and dashboard metrics.

Rules:
- Return only valid JSON.
- Do not return markdown.
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

function validateCompetitorDiscoveryPayload(payload) {
  const competitors = Array.isArray(payload?.competitors) ? payload.competitors : [];

  if (!competitors.length) {
    throw new Error('AI_INVALID_JSON');
  }

  if (competitors.length < 10) {
    throw new Error('AI_INVALID_JSON');
  }

  return competitors.slice(0, 10).map((competitor) => {
    const normalized = {};

    for (const field of COMPETITOR_FIELDS) {
      const value = competitor?.[field];

      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('AI_INVALID_JSON');
      }

      normalized[field] = value.trim();
    }

    return normalized;
  });
}

function brandAliasesFor(company) {
  const aliases = [String(company?.company_name || '').trim()];

  try {
    const rawUrl = String(company?.website_url || '').trim();
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const host = new URL(normalized).hostname.replace(/^www\./i, '');
    const domainName = host.split('.')[0];

    if (domainName) {
      aliases.push(domainName);
    }
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
        mention_context: 'Mentioned in Aimate response.'
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

function geminiTokenUsage(payload) {
  return {
    inputTokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
    outputTokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0)
  };
}

function estimateGeminiCostCents(inputTokens, outputTokens) {
  const inputDollarsPerMillion = Number(process.env.GEMINI_INPUT_DOLLARS_PER_MILLION || 0);
  const outputDollarsPerMillion = Number(process.env.GEMINI_OUTPUT_DOLLARS_PER_MILLION || 0);
  const dollars = (inputTokens / 1_000_000) * inputDollarsPerMillion + (outputTokens / 1_000_000) * outputDollarsPerMillion;
  return Math.ceil(dollars * 100);
}

function validatePromptVisibilityPayload(payload, prompts, company) {
  const promptIds = new Set(prompts.map((prompt) => String(prompt.id)));
  const results = Array.isArray(payload?.prompt_results) ? payload.prompt_results : [];

  if (!results.length) {
    throw new Error('AI_INVALID_JSON');
  }

  return results
    .filter((result) => promptIds.has(String(result?.prompt_id)))
    .map((result) => {
      const exactResponse = String(result.ai_response_summary || '').trim();
      const brandMentioned = exactResponseMentionsBrand(exactResponse, company);

      return {
        prompt_id: String(result.prompt_id),
        brand_mentioned: brandMentioned,
        brand_mention_context: brandMentioned
          ? String(result.brand_mention_context || '').trim()
          : 'Not mentioned in Gemini response.',
        competitor_mentions: Array.isArray(result.competitor_mentions)
        ? result.competitor_mentions.map((competitor) => ({
          competitor_name: String(competitor.competitor_name || '').trim(),
          website_url: String(competitor.website_url || '').trim(),
          mention_context: String(competitor.mention_context || '').trim()
        })).filter((competitor) => competitor.competitor_name)
        : [],
        recommended_citations: Array.isArray(result.recommended_citations)
        ? result.recommended_citations.map((citation) => ({
          page_title: String(citation.page_title || '').trim(),
          url: String(citation.url || '').trim(),
          source_owner: String(citation.source_owner || '').trim(),
          why_recommended: String(citation.why_recommended || '').trim()
        })).filter((citation) => citation.page_title || citation.url)
        : [],
        ai_response_summary: exactResponse,
        visibility_status: String(result.visibility_status || 'checked').trim()
      };
    });
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
    priorities: normalizeAeoItems(payload, 'priorities', AEO_PRIORITY_FIELDS, 3),
    action_plan: normalizeAeoItems(payload, 'action_plan', AEO_ACTION_FIELDS, 4),
    content_opportunities: normalizeAeoItems(payload, 'content_opportunities', AEO_CONTENT_FIELDS, 3),
    evidence: normalizeAeoItems(payload, 'evidence', AEO_EVIDENCE_FIELDS, 3)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(body, signal) {
  let lastError = null;
  const attempts = geminiRetryAttempts();
  const modelCandidates = geminiModelCandidates();

  logAiProviderConfigOnce();

  for (const model of modelCandidates) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${geminiModelPath(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': process.env.GEMINI_API_KEY
          },
          signal,
          body: JSON.stringify(body)
        }
      );

      if (response.ok) {
        return response;
      }

      let errorMessage = '';

      try {
        const errorPayload = await response.json();
        errorMessage = String(errorPayload?.error?.message || '');
      } catch {
        errorMessage = '';
      }

      const hasFallbackModel = model !== modelCandidates[modelCandidates.length - 1];

      if (response.status === 401 || response.status === 403) {
        console.warn(
          `Aimate auth failed: status=${response.status}, model=${model}, keyEnding=${geminiKeyEnding()}, message=${errorMessage.slice(0, 180) || 'no-message'}`
        );
        throw createAiError('AI_AUTH_FAILED', errorMessage, response.status);
      }

      if (response.status === 429) {
        lastError = createAiError('AI_RATE_LIMITED', errorMessage, response.status);

        if (hasFallbackModel && canTryNextGeminiModel(response.status, errorMessage)) {
          console.warn(
            `Aimate switching model after rate limit: from=${model}, next=${modelCandidates[modelCandidates.indexOf(model) + 1]}, message=${errorMessage.slice(0, 180) || 'no-message'}`
          );
          break;
        }

        if (attempt < attempts) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        console.warn(
          `Aimate rate limited: model=${model}, keyEnding=${geminiKeyEnding()}, message=${errorMessage.slice(0, 180) || 'no-message'}`
        );
        throw lastError;
      }

      if (/quota|billing|permission|api key not valid/i.test(errorMessage)) {
        if (hasFallbackModel && canTryNextGeminiModel(response.status, errorMessage)) {
          console.warn(
            `Aimate switching model after quota response: from=${model}, next=${modelCandidates[modelCandidates.indexOf(model) + 1]}, status=${response.status}, message=${errorMessage.slice(0, 180) || 'no-message'}`
          );
          break;
        }

        console.warn(
          `Aimate request rejected: status=${response.status}, model=${model}, keyEnding=${geminiKeyEnding()}, message=${errorMessage.slice(0, 180) || 'no-message'}`
        );
        throw createAiError('AI_REQUEST_FAILED', errorMessage, response.status);
      }

      if (response.status >= 500) {
        lastError = createAiError('AI_SERVER_ERROR', errorMessage, response.status);

        if (attempt < attempts) {
          await sleep(1000 * attempt);
          continue;
        }

        if (hasFallbackModel && canTryNextGeminiModel(response.status, errorMessage)) {
          console.warn(
            `Aimate switching model after server error: from=${model}, next=${modelCandidates[modelCandidates.indexOf(model) + 1]}, message=${errorMessage.slice(0, 180) || 'no-message'}`
          );
          break;
        }

        throw lastError;
      }

      lastError = createAiError('AI_REQUEST_FAILED', errorMessage, response.status);

      if (hasFallbackModel && canTryNextGeminiModel(response.status, errorMessage)) {
        console.warn(
          `Aimate switching model after request failure: from=${model}, next=${modelCandidates[modelCandidates.indexOf(model) + 1]}, status=${response.status}, message=${errorMessage.slice(0, 180) || 'no-message'}`
        );
        break;
      }

      console.warn(
        `Aimate request failed: status=${response.status}, model=${model}, keyEnding=${geminiKeyEnding()}, message=${errorMessage.slice(0, 180) || 'no-message'}`
      );
      throw lastError;
    }
  }

  throw lastError || createAiError('AI_REQUEST_FAILED');
}

async function testProviderConnection() {
  if (!process.env.GEMINI_API_KEY) {
    throw createAiError('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(geminiTimeout(), 30000));

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Return exactly: ok' }]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8
      }
    }, controller.signal);

    const payload = await response.json();
    return {
      ok: true,
      diagnostics: getProviderDiagnostics(),
      responsePreview: String(extractGeminiText(payload) || '').slice(0, 50)
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      error = createAiError('AI_TIMEOUT');
    } else if (error instanceof TypeError) {
      error = createNetworkError(error);
    }

    return {
      ok: false,
      diagnostics: getProviderDiagnostics(),
      error: error?.message || 'AI_REQUEST_FAILED',
      providerStatus: error?.providerStatus || '',
      providerMessage: error?.providerMessage || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateBusinessAnalysis(company) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const websiteSnapshot = await extractWebsiteSnapshot(company.website_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeout());

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildBusinessAnalysisPrompt(company, websiteSnapshot) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: businessAnalysisJsonSchema()
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return { ...validateBusinessAnalysisPayload(JSON.parse(text)), websiteSnapshot };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI_TIMEOUT');
    }

    if (error instanceof SyntaxError) {
      throw new Error('AI_INVALID_JSON');
    }

    if (error instanceof TypeError) {
      throw createNetworkError(error);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// The business analysis step already fetches and saves a snapshot of the
// company's website. Reuse it here instead of re-fetching and re-scanning
// the same site (which can involve dozens of JS bundle requests) every time
// prompts are (re)generated for the same company.
function resolveWebsiteSnapshot(company, analysis) {
  if (analysis?.website_snapshot_json) {
    try {
      const parsed = JSON.parse(analysis.website_snapshot_json);

      if (parsed && typeof parsed === 'object') {
        return Promise.resolve(parsed);
      }
    } catch {
      // Fall through to a fresh fetch below.
    }
  }

  return extractWebsiteSnapshot(company.website_url);
}

async function generateCompanyPrompts(company, analysis) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const websiteSnapshot = await resolveWebsiteSnapshot(company, analysis);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeout());

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPromptGenerationPrompt(company, analysis, websiteSnapshot) }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
        responseSchema: promptGenerationJsonSchema()
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return validatePromptGenerationPayload(JSON.parse(text));
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI_TIMEOUT');
    }

    if (error instanceof SyntaxError) {
      throw new Error('AI_INVALID_JSON');
    }

    if (error instanceof TypeError) {
      throw createNetworkError(error);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function researchPrompts(company, analysis, existingPrompts = [], research = {}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const maxPrompts = Math.max(1, Math.min(Number(research.maxPrompts) || 10, 30));
  const websiteSnapshot = await extractWebsiteSnapshot(company.website_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeout());

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPromptResearchPrompt(company, analysis, websiteSnapshot, existingPrompts, research) }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
        responseSchema: promptResearchJsonSchema(maxPrompts)
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return validatePromptResearchPayload(JSON.parse(text), maxPrompts);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
    if (error instanceof TypeError) throw createNetworkError(error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverCompetitors(company, analysis) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeout());

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildCompetitorDiscoveryPrompt(company, analysis) }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: competitorDiscoveryJsonSchema()
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return validateCompetitorDiscoveryPayload(JSON.parse(text));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
    if (error instanceof TypeError) throw createNetworkError(error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  return Promise.all(prompts.map(async (prompt) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), geminiTimeout());

    try {
      const response = await callGemini({
        contents: [
          {
            role: 'user',
            parts: [{ text: rawUserPrompt(prompt) }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      }, controller.signal);

      const payload = await response.json();
      const responseText = String(extractGeminiText(payload) || '').trim();

      if (!responseText) {
        throw new Error('AI_INVALID_JSON');
      }

      const brandMentioned = exactResponseMentionsBrand(responseText, company);
      const competitorMentions = competitorMentionsFor(responseText, competitors);
      const usage = geminiTokenUsage(payload);

      return {
        prompt_id: String(prompt.id),
        brand_mentioned: brandMentioned,
        brand_mention_context: brandMentioned
          ? 'Mentioned in Aimate response.'
          : 'Not mentioned in Aimate response.',
        competitor_mentions: competitorMentions,
        recommended_citations: citationRecommendations(company, competitors, competitorMentions),
        ai_response_summary: responseText,
        gemini_response_summary: responseText,
        visibility_status: 'checked',
        provider_usage: {
          provider_name: 'gemini',
          prompt_id: Number(prompt.id),
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          estimated_cost_cents: estimateGeminiCostCents(usage.inputTokens, usage.outputTokens)
        }
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('AI_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      if (error instanceof TypeError) throw createNetworkError(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }));
}

async function generateAeoRecommendations(context) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeout());

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildAeoRecommendationsPrompt(context) }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: aeoRecommendationsJsonSchema()
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return validateAeoRecommendationsPayload(JSON.parse(text));
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
    if (error instanceof TypeError) throw createNetworkError(error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  generateBusinessAnalysis,
  generateCompanyPrompts,
  researchPrompts,
  discoverCompetitors,
  analyzePromptVisibility,
  generateAeoRecommendations,
  testProviderConnection,
  getProviderDiagnostics,
  extractWebsiteSnapshot,
  resolveWebsiteSnapshot,
  buildBusinessAnalysisPrompt,
  validateBusinessAnalysisPayload,
  buildPromptGenerationPrompt,
  validatePromptGenerationPayload,
  buildCompetitorDiscoveryPrompt,
  validateCompetitorDiscoveryPayload,
  normalizeGeminiJsonText
};
