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

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_TIMEOUT = Number(process.env.GEMINI_TIMEOUT || 60000);
const GEMINI_RETRY_ATTEMPTS = Number(process.env.GEMINI_RETRY_ATTEMPTS || 3);

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

  return `You are Rango, a careful business intelligence analyst.

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

function buildPromptGenerationPrompt(company, analysis) {
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
    }
  };

  return `You are Rango, an AI visibility and GEO/AEO strategist.

Create the top 15 realistic AI search prompts that potential buyers would ask ChatGPT, Gemini, Claude, Perplexity, or another answer engine when looking for a company like this.

Use only the provided company and business analysis context.

Prompt goals:
- Prompts should be related to the company's actual services, audience, industry, and buying journey.
- Include discovery, comparison, problem-aware, solution-aware, local/service-area, pricing/value, and competitor-alternative style prompts where relevant.
- Prompts must sound like real buyer questions.
- Do not mention Rango.
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

  return `You are Rango, a competitive intelligence analyst.

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
  return `You are Rango, an AEO/GEO strategy lead.

Create a practical "what to do next" action plan for this brand using only saved Rango data.

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

Saved Rango data:
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

  for (let attempt = 1; attempt <= GEMINI_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
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

    if (response.status === 401 || response.status === 403) {
      throw new Error('AI_AUTH_FAILED');
    }

    if (response.status === 429) {
      throw new Error('AI_RATE_LIMITED');
    }

    if (/quota|billing|permission|api key not valid/i.test(errorMessage)) {
      throw new Error('AI_REQUEST_FAILED');
    }

    if (response.status >= 500) {
      lastError = new Error('AI_SERVER_ERROR');

      if (attempt < GEMINI_RETRY_ATTEMPTS) {
        await sleep(1000 * attempt);
        continue;
      }

      throw lastError;
    }

    throw new Error('AI_REQUEST_FAILED');
  }

  throw lastError || new Error('AI_REQUEST_FAILED');
}

async function generateBusinessAnalysis(company) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const websiteSnapshot = await extractWebsiteSnapshot(company.website_url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

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

    return validateBusinessAnalysisPayload(JSON.parse(text));
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI_TIMEOUT');
    }

    if (error instanceof SyntaxError) {
      throw new Error('AI_INVALID_JSON');
    }

    if (error instanceof TypeError) {
      throw new Error('AI_NETWORK_ERROR');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateCompanyPrompts(company, analysis) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPromptGenerationPrompt(company, analysis) }]
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
      throw new Error('AI_NETWORK_ERROR');
    }

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
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

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
    if (error instanceof TypeError) throw new Error('AI_NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

  try {
    const response = await callGemini({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPromptVisibilityPrompt(company, prompts, competitors, analysis) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: promptVisibilityJsonSchema()
      }
    }, controller.signal);

    const payload = await response.json();
    const text = normalizeGeminiJsonText(extractGeminiText(payload));

    if (!text) {
      throw new Error('AI_INVALID_JSON');
    }

    return validatePromptVisibilityPayload(JSON.parse(text), prompts, company);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI_TIMEOUT');
    if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
    if (error instanceof TypeError) throw new Error('AI_NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAeoRecommendations(context) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('AI_MISSING_KEY');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

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
    if (error instanceof TypeError) throw new Error('AI_NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  generateBusinessAnalysis,
  generateCompanyPrompts,
  discoverCompetitors,
  analyzePromptVisibility,
  generateAeoRecommendations
};
