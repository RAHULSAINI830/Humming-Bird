const GeminiProvider = require('./gemini');
const OpenAIProvider = require('./openai');

async function generateBusinessAnalysis(company) {
  return GeminiProvider.generateBusinessAnalysis(company);
}

async function generateCompanyPrompts(company, analysis) {
  return GeminiProvider.generateCompanyPrompts(company, analysis);
}

async function discoverCompetitors(company, analysis) {
  return GeminiProvider.discoverCompetitors(company, analysis);
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

    current.provider_usage = [...(current.provider_usage || []), ...(providerResult.provider_usage ? [providerResult.provider_usage] : [])];
    resultByPrompt.set(promptId, current);
  });

  return Array.from(resultByPrompt.values());
}

async function analyzePromptVisibility(company, prompts, competitors, analysis, options = {}) {
  const providerControls = options.providerControls || [];
  const refreshType = options.refreshType || 'manual';
  let results = [];
  const errors = [];

  if (providerEnabled(providerControls, 'gemini', refreshType)) {
    try {
      results = await GeminiProvider.analyzePromptVisibility(
        company,
        promptSliceForProvider(prompts, providerControls, 'gemini'),
        competitors,
        analysis
      );
    } catch (error) {
      errors.push(error);
    }
  }

  if (providerEnabled(providerControls, 'openai', refreshType)) {
    const openAiPrompts = promptSliceForProvider(prompts, providerControls, 'openai');

    if (openAiPrompts.length && process.env.OPENAI_API_KEY) {
      try {
        const openAiResults = await OpenAIProvider.analyzePromptVisibility(company, openAiPrompts, competitors, analysis);
        results = mergeProviderResults(results, openAiResults, 'openai');
      } catch (error) {
        errors.push(error);
      }
    }
  }

  if (!results.length && errors.length) {
    throw errors[0];
  }

  return results;
}

async function generateAeoRecommendations(context) {
  return GeminiProvider.generateAeoRecommendations(context);
}

function getProviderDiagnostics() {
  const hummingbird = GeminiProvider.getProviderDiagnostics();

  return {
    ...hummingbird,
    hummingbird,
    openai: OpenAIProvider.getProviderDiagnostics()
  };
}

async function testProviderConnection() {
  return GeminiProvider.testProviderConnection();
}

module.exports = {
  generateBusinessAnalysis,
  generateCompanyPrompts,
  discoverCompetitors,
  analyzePromptVisibility,
  generateAeoRecommendations,
  getProviderDiagnostics,
  testProviderConnection
};
