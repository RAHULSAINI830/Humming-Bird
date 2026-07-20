const GeminiProvider = require('./gemini');
const OpenAIProvider = require('./openai');
const PerplexityProvider = require('./perplexity');
const ClaudeProvider = require('./claude');

function configuredGenerationProviderNames() {
  return ['gemini', 'openai', 'claude', 'perplexity'].filter((providerName) => providerConfigured(providerName));
}

function normalizeProviderJsonText(text) {
  return normalizeJsonText(text).replace(/,\s*([}\]])/g, '$1').trim();
}

function providerTimeout(providerName) {
  if (providerName === 'openai') return OpenAIProvider.openaiTimeout();
  if (providerName === 'claude') return ClaudeProvider.claudeTimeout();
  if (providerName === 'perplexity') return PerplexityProvider.perplexityTimeout();
  return 25000;
}

async function callProviderJson(providerName, prompt, options = {}) {
  if (providerName === 'openai') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeout(providerName));

    try {
      const payload = await OpenAIProvider.callOpenAi(prompt, controller.signal);
      const text = normalizeProviderJsonText(OpenAIProvider.extractOpenAiText(payload));

      if (!text) throw new Error('AI_INVALID_JSON');

      return JSON.parse(text);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('OPENAI_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (providerName === 'claude') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeout(providerName));

    try {
      const payload = await ClaudeProvider.callClaude(prompt, controller.signal, {
        maxTokens: options.maxTokens || 2400
      });
      const text = normalizeProviderJsonText(ClaudeProvider.extractClaudeText(payload));

      if (!text) throw new Error('AI_INVALID_JSON');

      return JSON.parse(text);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('CLAUDE_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (providerName === 'perplexity') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeout(providerName));

    try {
      const payload = await PerplexityProvider.callPerplexity(prompt, controller.signal);
      const text = normalizeProviderJsonText(PerplexityProvider.extractPerplexityText(payload));

      if (!text) throw new Error('AI_INVALID_JSON');

      return JSON.parse(text);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('PERPLEXITY_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('AI_MISSING_KEY');
}

async function runStructuredGenerationWithFallback(label, geminiRun, fallbackRun) {
  const errors = [];

  if (providerConfigured('gemini')) {
    try {
      return await geminiRun();
    } catch (error) {
      errors.push({ providerName: 'gemini', error });
    }
  }

  for (const providerName of configuredGenerationProviderNames().filter((name) => name !== 'gemini')) {
    try {
      return await fallbackRun(providerName);
    } catch (error) {
      errors.push({ providerName, error });
    }
  }

  const firstError = errors[0]?.error || new Error('AI_MISSING_KEY');
  firstError.failedProviders = errors.map((item) => item.providerName);
  firstError.generationTask = label;
  throw firstError;
}

async function generateBusinessAnalysis(company) {
  return runStructuredGenerationWithFallback(
    'business-analysis',
    () => GeminiProvider.generateBusinessAnalysis(company),
    async (providerName) => {
      const websiteSnapshot = await GeminiProvider.extractWebsiteSnapshot(company.website_url);
      const payload = await callProviderJson(
        providerName,
        GeminiProvider.buildBusinessAnalysisPrompt(company, websiteSnapshot),
        { maxTokens: 2200 }
      );

      return GeminiProvider.validateBusinessAnalysisPayload(payload);
    }
  );
}

async function generateCompanyPrompts(company, analysis) {
  return runStructuredGenerationWithFallback(
    'prompt-generation',
    () => GeminiProvider.generateCompanyPrompts(company, analysis),
    async (providerName) => {
      const websiteSnapshot = await GeminiProvider.extractWebsiteSnapshot(company.website_url);
      const payload = await callProviderJson(
        providerName,
        GeminiProvider.buildPromptGenerationPrompt(company, analysis, websiteSnapshot),
        { maxTokens: 2600 }
      );

      return GeminiProvider.validatePromptGenerationPayload(payload);
    }
  );
}

function normalizeJsonText(text) {
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

function buildPromptResearchPrompt(company, analysis, existingPrompts, research) {
  const maxPrompts = Math.max(1, Math.min(Number(research?.maxPrompts) || 10, 30));
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

Rules:
- Return only valid JSON.
- Do not return markdown.
- Do not duplicate or lightly rephrase current saved prompts.
- Do not invent unsupported services, locations, industries, or competitors.
- Prompts must be useful for answer-engine visibility research across ChatGPT, Aimate, Claude, Perplexity, and similar AI search tools.
- Every prompt must sound like a real buyer, operator, or decision-maker asking for help.
- Focus on prompts the company should actively track or optimize content for.
- Use the research brief to shape the angle.
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
    const normalized = {
      prompt_text: String(prompt?.prompt_text || '').trim(),
      prompt_category: String(prompt?.prompt_category || '').trim(),
      prompt_intent: String(prompt?.prompt_intent || '').trim(),
      why_recommended: String(prompt?.why_recommended || '').trim(),
      priority: String(prompt?.priority || 'Medium').trim()
    };

    if (!normalized.prompt_text || !normalized.prompt_category || !normalized.prompt_intent || !normalized.why_recommended) {
      throw new Error('AI_INVALID_JSON');
    }

    if (!['high', 'medium', 'low'].includes(normalized.priority.toLowerCase())) {
      normalized.priority = 'Medium';
    }

    return normalized;
  });
}

async function researchPrompts(company, analysis, existingPrompts, research = {}) {
  const providerName = String(research.providerName || 'gemini').trim().toLowerCase();
  const maxPrompts = Math.max(1, Math.min(Number(research.maxPrompts) || 10, 30));

  if (providerName === 'gemini') {
    return GeminiProvider.researchPrompts(company, analysis, existingPrompts, research);
  }

  const prompt = buildPromptResearchPrompt(company, analysis, existingPrompts, research);

  if (providerName === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_MISSING_KEY');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OpenAIProvider.openaiTimeout());

    try {
      const payload = await OpenAIProvider.callOpenAi(prompt, controller.signal);
      return validatePromptResearchPayload(JSON.parse(normalizeJsonText(OpenAIProvider.extractOpenAiText(payload))), maxPrompts);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('OPENAI_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (providerName === 'claude') {
    if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) throw new Error('CLAUDE_MISSING_KEY');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ClaudeProvider.claudeTimeout());

    try {
      const payload = await ClaudeProvider.callClaude(prompt, controller.signal);
      return validatePromptResearchPayload(JSON.parse(normalizeJsonText(ClaudeProvider.extractClaudeText(payload))), maxPrompts);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('CLAUDE_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (providerName === 'perplexity') {
    if (!process.env.PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_MISSING_KEY');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PerplexityProvider.perplexityTimeout());

    try {
      const payload = await PerplexityProvider.callPerplexity(prompt, controller.signal);
      return validatePromptResearchPayload(JSON.parse(normalizeJsonText(PerplexityProvider.extractPerplexityText(payload))), maxPrompts);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('PERPLEXITY_TIMEOUT');
      if (error instanceof SyntaxError) throw new Error('AI_INVALID_JSON');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('UNSUPPORTED_PROMPT_RESEARCH_PROVIDER');
}

async function discoverCompetitors(company, analysis) {
  return runStructuredGenerationWithFallback(
    'competitor-discovery',
    () => GeminiProvider.discoverCompetitors(company, analysis),
    async (providerName) => {
      const payload = await callProviderJson(
        providerName,
        GeminiProvider.buildCompetitorDiscoveryPrompt(company, analysis),
        { maxTokens: 1800 }
      );

      return GeminiProvider.validateCompetitorDiscoveryPayload(payload);
    }
  );
}

function controlFor(providerControls, providerName) {
  return (providerControls || []).find((control) => control.provider_name === providerName);
}

function providerEnabled(providerControls, providerName, refreshType = 'manual') {
  const control = controlFor(providerControls, providerName);

  if (!control) {
    return providerName === 'gemini';
  }

  if (control.status !== 'enabled') {
    return false;
  }

  if (refreshType === 'auto' && Number(control.auto_refresh_enabled || 0) !== 1) {
    return false;
  }

  if (refreshType !== 'auto' && Number(control.manual_refresh_enabled || 0) !== 1) {
    return false;
  }

  const dailyRemaining = Number(control.daily_remaining || 0);
  const monthlyRemaining = Number(control.monthly_remaining || 0);
  const monthlyCostRemaining = Number(control.monthly_cost_remaining_cents || 0);

  if (Number(control.daily_prompt_limit || 0) > 0 && dailyRemaining <= 0) return false;
  if (Number(control.monthly_prompt_limit || 0) > 0 && monthlyRemaining <= 0) return false;
  if (Number(control.monthly_cost_limit_cents || 0) > 0 && monthlyCostRemaining <= 0) return false;

  return true;
}

function providerConfigured(providerName) {
  if (providerName === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (providerName === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (providerName === 'perplexity') return Boolean(process.env.PERPLEXITY_API_KEY);
  if (providerName === 'claude') return Boolean(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  return false;
}

function configuredProviderNames() {
  return ['gemini', 'openai', 'claude', 'perplexity'].filter((providerName) => providerConfigured(providerName));
}

function shouldRunProvider(providerControls, providerName, refreshType, initialProviderBootstrap) {
  if (initialProviderBootstrap) {
    return providerConfigured(providerName);
  }

  return providerEnabled(providerControls, providerName, refreshType);
}

function promptSliceForProvider(prompts, providerControls, providerName) {
  const control = controlFor(providerControls, providerName);

  if (!control) return prompts;

  const remainingCandidates = [
    Number(control.daily_prompt_limit || 0) > 0 ? Number(control.daily_remaining || 0) : prompts.length,
    Number(control.monthly_prompt_limit || 0) > 0 ? Number(control.monthly_remaining || 0) : prompts.length
  ];
  const allowed = Math.max(0, Math.min(prompts.length, ...remainingCandidates));

  return prompts.slice(0, allowed);
}

function mergeProviderResults(baseResults, providerResults, providerName) {
  const resultByPrompt = new Map((baseResults || []).map((result) => [String(result.prompt_id), { ...result }]));

  (providerResults || []).forEach((providerResult) => {
    const promptId = String(providerResult.prompt_id);
    const current = resultByPrompt.get(promptId) || {
      prompt_id: promptId,
      brand_mentioned: false,
      brand_mention_context: '',
      competitor_mentions: [],
      recommended_citations: [],
      ai_response_summary: '',
      visibility_status: 'checked'
    };

    if (providerName === 'openai') {
      current.chatgpt_response_summary = providerResult.chatgpt_response_summary || providerResult.ai_response_summary || 'NA';
    }

    if (providerName === 'perplexity') {
      current.perplexity_response_summary = providerResult.perplexity_response_summary || providerResult.ai_response_summary || 'NA';
    }

    if (providerName === 'claude') {
      current.claude_response_summary = providerResult.claude_response_summary || providerResult.ai_response_summary || 'NA';
    }

    if (providerName === 'openai' || providerName === 'perplexity' || providerName === 'claude') {
      if (!current.ai_response_summary) {
        current.ai_response_summary = providerResult.ai_response_summary || '';
      }

      if (!current.brand_mentioned && providerResult.brand_mentioned) {
        current.brand_mentioned = true;
        current.brand_mention_context = providerResult.brand_mention_context || current.brand_mention_context;
      }

      if (!current.competitor_mentions?.length) {
        current.competitor_mentions = providerResult.competitor_mentions || [];
      }

      if (!current.recommended_citations?.length) {
        current.recommended_citations = providerResult.recommended_citations || [];
      }
    }

    const existingUsage = Array.isArray(current.provider_usage)
      ? current.provider_usage
      : (current.provider_usage ? [current.provider_usage] : []);
    current.provider_usage = [...existingUsage, ...(providerResult.provider_usage ? [providerResult.provider_usage] : [])];
    resultByPrompt.set(promptId, current);
  });

  return Array.from(resultByPrompt.values());
}

async function analyzePromptVisibility(company, prompts, competitors, analysis, options = {}) {
  const providerControls = options.providerControls || [];
  const refreshType = options.refreshType || 'manual';
  const initialProviderBootstrap = Boolean(options.initialProviderBootstrap);
  const allowPartialProviderBootstrap = Boolean(options.allowPartialProviderBootstrap);
  const promptsFor = (providerName) => initialProviderBootstrap
    ? prompts
    : promptSliceForProvider(prompts, providerControls, providerName);

  // Providers used to be awaited one after another (Gemini, then OpenAI, then
  // Perplexity, then Claude), which made total latency the *sum* of every
  // provider's response time instead of the slowest one. Firing them
  // concurrently and merging in this same fixed order once they all settle
  // keeps the exact same result precedence while cutting wall-clock time
  // roughly 4x.
  const providerTasks = [];

  if (shouldRunProvider(providerControls, 'gemini', refreshType, initialProviderBootstrap)) {
    providerTasks.push({
      name: 'gemini',
      promise: GeminiProvider.analyzePromptVisibility(company, promptsFor('gemini'), competitors, analysis)
    });
  }

  if (shouldRunProvider(providerControls, 'openai', refreshType, initialProviderBootstrap)) {
    const openAiPrompts = promptsFor('openai');

    if (openAiPrompts.length && process.env.OPENAI_API_KEY) {
      providerTasks.push({
        name: 'openai',
        promise: OpenAIProvider.analyzePromptVisibility(company, openAiPrompts, competitors, analysis)
      });
    }
  }

  if (shouldRunProvider(providerControls, 'perplexity', refreshType, initialProviderBootstrap)) {
    const perplexityPrompts = promptsFor('perplexity');

    if (perplexityPrompts.length && process.env.PERPLEXITY_API_KEY) {
      providerTasks.push({
        name: 'perplexity',
        promise: PerplexityProvider.analyzePromptVisibility(company, perplexityPrompts, competitors, analysis)
      });
    }
  }

  if (shouldRunProvider(providerControls, 'claude', refreshType, initialProviderBootstrap)) {
    const claudePrompts = promptsFor('claude');

    if (claudePrompts.length && (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)) {
      providerTasks.push({
        name: 'claude',
        promise: ClaudeProvider.analyzePromptVisibility(company, claudePrompts, competitors, analysis)
      });
    }
  }

  const settledProviders = await Promise.allSettled(providerTasks.map((task) => task.promise));
  let results = [];
  const errors = [];
  const failedProviders = [];

  providerTasks.forEach((task, index) => {
    const outcome = settledProviders[index];

    if (outcome.status === 'rejected') {
      failedProviders.push(task.name);
      errors.push(outcome.reason);
      return;
    }

    if (task.name === 'gemini') {
      results = outcome.value.map((result) => ({
        ...result,
        gemini_response_summary: result.gemini_response_summary || result.ai_response_summary || 'NA'
      }));
      return;
    }

    results = mergeProviderResults(results, outcome.value, task.name);
  });

  if (initialProviderBootstrap && failedProviders.length && !allowPartialProviderBootstrap) {
    const error = errors[0] || new Error('AI_PROVIDER_BOOTSTRAP_FAILED');
    error.failedProviders = Array.from(new Set(failedProviders));
    throw error;
  }

  if (initialProviderBootstrap && !allowPartialProviderBootstrap) {
    const expectedProviderCount = configuredProviderNames().length;
    const completePromptCount = (results || []).filter((result) => {
      const saved = [
        result.gemini_response_summary,
        result.chatgpt_response_summary,
        result.claude_response_summary,
        result.perplexity_response_summary
      ].filter((value) => {
        const normalized = String(value || '').trim();
        return normalized && normalized.toUpperCase() !== 'NA';
      }).length;

      return saved >= expectedProviderCount;
    }).length;

    if (expectedProviderCount && completePromptCount < prompts.length) {
      throw new Error('AI_PROVIDER_BOOTSTRAP_INCOMPLETE');
    }
  }

  if (!results.length && errors.length) {
    throw errors[0];
  }

  return results;
}

async function generateAeoRecommendations(context) {
  return ClaudeProvider.generateAeoRecommendations(context);
}

function getProviderDiagnostics() {
  const aimate = GeminiProvider.getProviderDiagnostics();

  return {
    ...aimate,
    aimate,
    openai: OpenAIProvider.getProviderDiagnostics(),
    perplexity: PerplexityProvider.getProviderDiagnostics(),
    claude: ClaudeProvider.getProviderDiagnostics()
  };
}

async function testProviderConnection() {
  return GeminiProvider.testProviderConnection();
}

module.exports = {
  generateBusinessAnalysis,
  generateCompanyPrompts,
  researchPrompts,
  discoverCompetitors,
  analyzePromptVisibility,
  generateAeoRecommendations,
  getProviderDiagnostics,
  testProviderConnection
};
