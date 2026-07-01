const GeminiProvider = require('./gemini');

async function generateBusinessAnalysis(company) {
  return GeminiProvider.generateBusinessAnalysis(company);
}

async function generateCompanyPrompts(company, analysis) {
  return GeminiProvider.generateCompanyPrompts(company, analysis);
}

async function discoverCompetitors(company, analysis) {
  return GeminiProvider.discoverCompetitors(company, analysis);
}

async function analyzePromptVisibility(company, prompts, competitors, analysis) {
  return GeminiProvider.analyzePromptVisibility(company, prompts, competitors, analysis);
}

async function generateAeoRecommendations(context) {
  return GeminiProvider.generateAeoRecommendations(context);
}

function getProviderDiagnostics() {
  return GeminiProvider.getProviderDiagnostics();
}

module.exports = {
  generateBusinessAnalysis,
  generateCompanyPrompts,
  discoverCompetitors,
  analyzePromptVisibility,
  generateAeoRecommendations,
  getProviderDiagnostics
};
