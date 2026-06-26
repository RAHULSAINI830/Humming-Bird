const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');
const {
  dbPath,
  initDatabase,
  getUserByEmail,
  getUserById,
  getUserCompanies,
  getUserCompanyAccess,
  userHasRole,
  getAllCompaniesForWorkspace,
  getDeveloperCompanyAccess,
  listCompanyUsers,
  countCompanyBusinessOwners,
  getAccessRecordById,
  createOrAddCompanyUser,
  removeCompanyUserAccess,
  removeAccessRecordById,
  getLatestBusinessAnalysis,
  getLatestCompletedBusinessAnalysis,
  listBusinessAnalyses,
  createAeoRecommendation,
  getLatestAeoRecommendation,
  listAeoRecommendations,
  listCompanyPrompts,
  listCompanyCompetitors,
  addCompanyPrompt,
  addCompanyCompetitor,
  removeCompanyPrompt,
  removeCompanyCompetitor,
  createBusinessAnalysis,
  completeBusinessAnalysis,
  updateCompanyGeneratedProfile,
  failBusinessAnalysis,
  replaceCompanyPrompts,
  upsertCompanyCompetitors,
  updatePromptVisibility,
  completeCompanyOnboarding,
  createUserCompanyWorkspace,
  listAllCompaniesForDeveloper,
  listAllUsersForDeveloper,
  listWorkspaceAccessForDeveloper,
  getPlatformStats,
  deleteCompany
} = require('./db');
const { hashPassword, verifyPassword } = require('./auth');
const AIService = require('./services/ai/ai-service');

const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();
const BASE_ASSIGNABLE_USER_ROLES = [
  'Marketing Manager',
  'Operations Manager',
  'Branch Manager',
  'Technician',
  'Read-Only Analyst'
];
const ELEVATED_ASSIGNABLE_USER_ROLES = ['Developer', 'Super Admin', 'Business Owner', ...BASE_ASSIGNABLE_USER_ROLES];
const COMPANY_ACCESS_STATUSES = ['active', 'inactive'];
const USER_MANAGEMENT_ROLES = ['Developer', 'Super Admin', 'Business Owner'];
const CONTENT_MANAGEMENT_ROLES = ['Developer', 'Super Admin', 'Business Owner', 'Marketing Manager'];

initDatabase();

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf('=');
        return index === -1 ? [cookie, ''] : [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function getSession(req) {
  const sid = parseCookies(req).sid;
  return sid ? sessions.get(sid) : null;
}

function createSession(res, payload) {
  const sid = crypto.randomBytes(32).toString('hex');
  sessions.set(sid, payload);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  return payload;
}

function updateSession(req, payload) {
  const sid = parseCookies(req).sid;
  const current = sid ? sessions.get(sid) : null;

  if (sid && current) {
    sessions.set(sid, { ...current, ...payload });
  }
}

function destroySession(req, res) {
  const sid = parseCookies(req).sid;

  if (sid) {
    sessions.delete(sid);
  }

  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  return sendJson(res, { error: 'Route not found' }, 404);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        return resolve({});
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function normalize(value) {
  return String(value || '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAssignableUserRoles(currentRoleName) {
  if (currentRoleName === 'Developer') {
    return ELEVATED_ASSIGNABLE_USER_ROLES;
  }

  if (currentRoleName === 'Super Admin') {
    return ['Super Admin', 'Business Owner', ...BASE_ASSIGNABLE_USER_ROLES];
  }

  return BASE_ASSIGNABLE_USER_ROLES;
}

function snapshotAccess(access) {
  return {
    selectedCompanyId: access?.company_id || null,
    selectedCompanyName: access?.company_name || null,
    selectedCompanyLogoUrl: access?.logo_url || null,
    selectedRoleId: access?.role_id || null,
    selectedRoleName: access?.role_name || null
  };
}

function workspaceCompaniesForUser(user) {
  const isDeveloper = userHasRole(user.id, 'Developer');
  return isDeveloper ? getAllCompaniesForWorkspace() : getUserCompanies(user.id);
}

function createSessionForUser(res, user) {
  const isDeveloper = userHasRole(user.id, 'Developer');
  const companies = workspaceCompaniesForUser(user);
  const firstCompany = companies[0];
  const firstAccess = firstCompany
    ? (isDeveloper ? getDeveloperCompanyAccess(firstCompany.company_id) : getUserCompanyAccess(user.id, firstCompany.company_id))
    : null;

  return createSession(res, {
    userId: user.id,
    userFullName: user.full_name,
    userEmail: user.email,
    userStatus: user.status,
    isDeveloper,
    workspaceCompanies: companies,
    ...snapshotAccess(firstAccess || {
      company_id: null,
      company_name: isDeveloper ? 'Platform Admin' : null,
      role_id: null,
      role_name: isDeveloper ? 'Developer' : null
    })
  });
}

function sessionPayload(session) {
  return {
    authenticated: true,
    isDeveloper: Boolean(session.isDeveloper),
    user: {
      id: session.userId,
      fullName: session.userFullName,
      email: session.userEmail,
      status: session.userStatus
    },
    selectedCompanyId: session.selectedCompanyId,
    selectedCompanyName: session.selectedCompanyName,
    selectedCompanyLogoUrl: session.selectedCompanyLogoUrl,
    selectedRoleId: session.selectedRoleId,
    selectedRoleName: session.selectedRoleName,
    workspaceCompanies: session.workspaceCompanies || []
  };
}

function requireSession(req, res) {
  const session = getSession(req);

  if (!session) {
    sendJson(res, { error: 'Authentication required' }, 401);
    return null;
  }

  return session;
}

function requireSelectedCompany(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.selectedCompanyId) {
    sendJson(res, { error: 'No company selected' }, 400);
    return null;
  }

  const access = session.isDeveloper
    ? getDeveloperCompanyAccess(session.selectedCompanyId)
    : getUserCompanyAccess(session.userId, session.selectedCompanyId);

  if (!access) {
    sendJson(res, { error: 'Access denied' }, 403);
    return null;
  }

  return { session, access };
}

function setupProgress(access) {
  const items = [
    ['Company Name', access.company_name],
    ['Website URL', access.website_url],
    ['Logo URL', access.logo_url]
  ];
  const completed = items.filter(([, value]) => Boolean(normalize(value))).map(([label]) => label);
  const missing = items.filter(([, value]) => !normalize(value)).map(([label]) => label);

  return {
    percentage: Math.round((completed.length / items.length) * 100),
    completed,
    missing
  };
}

function safeJsonArray(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAeoRecommendation(record) {
  if (!record) return null;

  return {
    id: record.id,
    company_id: record.company_id,
    recommendation_status: record.recommendation_status,
    source_type: record.source_type,
    focus_summary: record.focus_summary || '',
    priorities: safeJsonArray(record.priorities_json),
    action_plan: safeJsonArray(record.action_plan_json),
    content_opportunities: safeJsonArray(record.content_opportunities_json),
    evidence: safeJsonArray(record.evidence_json),
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

function enrichPrompts(prompts) {
  return prompts.map((prompt) => ({
    ...prompt,
    brand_mentioned: Boolean(Number(prompt.brand_mentioned || 0)),
    competitor_mentions_parsed: safeJsonArray(prompt.competitor_mentions),
    recommended_citations_parsed: safeJsonArray(prompt.recommended_citations),
    chatgpt_response_summary: prompt.chatgpt_response_summary || 'NA',
    claude_response_summary: prompt.claude_response_summary || 'NA',
    perplexity_response_summary: prompt.perplexity_response_summary || 'NA',
    gemini_response_summary: prompt.gemini_response_summary || prompt.ai_response_summary || 'NA'
  }));
}

function flattenCitations(prompts) {
  return enrichPrompts(prompts).flatMap((prompt) =>
    prompt.recommended_citations_parsed.map((citation, index) => ({
      id: `${prompt.id}-${index}`,
      prompt_id: prompt.id,
      prompt_order: prompt.prompt_order,
      prompt_text: prompt.prompt_text,
      page_title: citation.page_title || citation.source_owner || 'Source page',
      url: citation.url || '',
      source_owner: citation.source_owner || '',
      why_recommended: citation.why_recommended || '',
      last_checked_at: prompt.last_checked_at || ''
    }))
  );
}

function promptSummary(prompts) {
  const enriched = enrichPrompts(prompts);
  return {
    total: enriched.length,
    checked: enriched.filter((prompt) => prompt.visibility_status && prompt.visibility_status !== 'not_checked').length,
    brandMentioned: enriched.filter((prompt) => prompt.brand_mentioned).length,
    competitorMentions: enriched.reduce((total, prompt) => total + prompt.competitor_mentions_parsed.length, 0),
    citations: enriched.reduce((total, prompt) => total + prompt.recommended_citations_parsed.length, 0)
  };
}

function buildAeoRecommendationContext(company, analysis, prompts, competitors, visibilitySummary) {
  const enrichedPrompts = enrichPrompts(prompts);

  return {
    company: {
      company_name: company.company_name || '',
      website_url: company.website_url || '',
      logo_url: company.logo_url || '',
      industry: company.industry || '',
      service_area: company.service_area || '',
      target_country: company.target_country || '',
      main_services: company.main_services || '',
      known_competitors: company.known_competitors || '',
      brand_description: company.brand_description || '',
      target_audience: company.target_audience || ''
    },
    business_analysis: analysis || null,
    metrics: {
      total_prompts: visibilitySummary.totalPrompts,
      checked_prompts: visibilitySummary.checkedPrompts,
      brand_mentions: visibilitySummary.brandMentioned,
      competitor_mentions: visibilitySummary.competitorMentions,
      citations: visibilitySummary.citations,
      visibility_score: visibilitySummary.visibilityScore,
      share_of_voice: visibilitySummary.shareOfVoice,
      citation_coverage: visibilitySummary.citationCoverage,
      available_providers: visibilitySummary.availableProviderLabels
    },
    brand_ranking: (visibilitySummary.brandRanking || []).slice(0, 10),
    top_prompts_by_brand_gap: (visibilitySummary.topPromptsByBrand || []).slice(0, 10),
    top_prompts_by_citations: (visibilitySummary.topPromptsByCitations || []).slice(0, 10),
    top_citation_domains: (visibilitySummary.domainCitations || []).slice(0, 10),
    competitors: competitors.slice(0, 15).map((competitor) => ({
      competitor_name: competitor.competitor_name,
      website_url: competitor.website_url || '',
      notes: competitor.notes || ''
    })),
    checked_prompts: enrichedPrompts
      .filter((prompt) => prompt.visibility_status && prompt.visibility_status !== 'not_checked')
      .slice(0, 20)
      .map((prompt) => ({
        prompt_text: prompt.prompt_text,
        brand_mentioned: prompt.brand_mentioned,
        visibility_status: prompt.visibility_status,
        competitor_mentions: prompt.competitor_mentions_parsed,
        recommended_citations: prompt.recommended_citations_parsed,
        gemini_response_excerpt: String(prompt.gemini_response_summary || prompt.ai_response_summary || '').slice(0, 1200)
      }))
  };
}

function realProviderValue(value) {
  const normalized = normalize(value);
  return normalized && normalized.toLowerCase() !== 'na';
}

function hostnameFromUrl(value) {
  const raw = normalize(value);

  if (!raw) return '';

  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, '');
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

function incrementMap(map, key, amount = 1) {
  const normalized = normalize(key);

  if (!normalized) return;

  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function topEntries(map, limit = 10) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function dashboardVisibilitySummary(prompts, company) {
  const enriched = enrichPrompts(prompts);
  const providerDefinitions = [
    ['gemini', 'Gemini', 'gemini_response_summary'],
    ['chatgpt', 'ChatGPT', 'chatgpt_response_summary'],
    ['claude', 'Claude', 'claude_response_summary'],
    ['perplexity', 'Perplexity', 'perplexity_response_summary']
  ];

  const providers = providerDefinitions.map(([key, label, field]) => {
    const checked = enriched.filter((prompt) => realProviderValue(prompt[field])).length;

    return {
      key,
      label,
      checked,
      available: checked > 0
    };
  });
  const activeProviders = providers.filter((provider) => provider.available);
  const checkedPrompts = enriched.filter((prompt) => prompt.visibility_status && prompt.visibility_status !== 'not_checked');
  const brandMentioned = checkedPrompts.filter((prompt) => prompt.brand_mentioned).length;
  const competitorMentions = checkedPrompts.reduce((total, prompt) => total + prompt.competitor_mentions_parsed.length, 0);
  const citations = checkedPrompts.reduce((total, prompt) => total + prompt.recommended_citations_parsed.length, 0);
  const visibilityScore = checkedPrompts.length ? Math.round((brandMentioned / checkedPrompts.length) * 100) : null;
  const mentionUniverse = brandMentioned + competitorMentions;
  const shareOfVoice = mentionUniverse ? Math.round((brandMentioned / mentionUniverse) * 100) : null;
  const citationCoverage = checkedPrompts.length ? Math.round((checkedPrompts.filter((prompt) => prompt.recommended_citations_parsed.length).length / checkedPrompts.length) * 100) : null;
  const competitorMap = new Map();
  const citationUrlMap = new Map();
  const citationDomainMap = new Map();
  const brandTrendMap = new Map();
  const domainTrendMap = new Map();
  const companyDomain = hostnameFromUrl(company?.website_url);

  checkedPrompts.forEach((prompt) => {
    const date = String(prompt.last_checked_at || prompt.updated_at || prompt.created_at || '').slice(0, 10) || 'Unknown';

    if (prompt.brand_mentioned) {
      incrementMap(brandTrendMap, date);
    }

    prompt.competitor_mentions_parsed.forEach((competitor) => {
      incrementMap(competitorMap, competitor.competitor_name || competitor.name || competitor.company_name || 'Unknown competitor');
    });

    prompt.recommended_citations_parsed.forEach((citation) => {
      const url = citation.url || '';
      const domain = hostnameFromUrl(url || citation.source_owner);
      incrementMap(citationUrlMap, url || citation.page_title || citation.source_owner || domain || 'Unknown source');
      incrementMap(citationDomainMap, domain || citation.source_owner || 'Unknown domain');

      if (companyDomain && domain && domain.toLowerCase() === companyDomain.toLowerCase()) {
        incrementMap(domainTrendMap, date);
      }
    });
  });

  const competitorRows = topEntries(competitorMap, 10);
  const citationRows = topEntries(citationUrlMap, 10);
  const domainRows = topEntries(citationDomainMap, 10);
  const brandRanking = [
    {
      name: company?.company_name || 'Your brand',
      type: 'own',
      mentions: brandMentioned,
      coverage: checkedPrompts.length ? Math.round((brandMentioned / checkedPrompts.length) * 100) : 0,
      share: mentionUniverse ? Math.round((brandMentioned / mentionUniverse) * 100) : 0
    },
    ...competitorRows.map((competitor) => ({
      name: competitor.name,
      type: 'competitor',
      mentions: competitor.count,
      coverage: checkedPrompts.length ? Math.round((competitor.count / checkedPrompts.length) * 100) : 0,
      share: mentionUniverse ? Math.round((competitor.count / mentionUniverse) * 100) : 0
    }))
  ].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  const topPromptsByBrand = checkedPrompts
    .map((prompt) => ({
      id: prompt.id,
      order: prompt.prompt_order,
      prompt: prompt.prompt_text,
      brandMentioned: prompt.brand_mentioned,
      mentions: prompt.brand_mentioned ? 1 : 0,
      competitors: prompt.competitor_mentions_parsed.length,
      citations: prompt.recommended_citations_parsed.length
    }))
    .sort((a, b) => b.mentions - a.mentions || b.competitors - a.competitors || a.order - b.order)
    .slice(0, 10);
  const topPromptsByCitations = checkedPrompts
    .map((prompt) => ({
      id: prompt.id,
      order: prompt.prompt_order,
      prompt: prompt.prompt_text,
      citations: prompt.recommended_citations_parsed.length,
      brandMentioned: prompt.brand_mentioned
    }))
    .sort((a, b) => b.citations - a.citations || a.order - b.order)
    .slice(0, 10);
  const trendDates = Array.from(new Set([...brandTrendMap.keys(), ...domainTrendMap.keys()])).sort();
  const brandTrend = trendDates.map((date) => ({ date, value: brandTrendMap.get(date) || 0 }));
  const domainTrend = trendDates.map((date) => ({ date, value: domainTrendMap.get(date) || 0 }));
  const insights = [
    {
      priority: brandMentioned < Math.ceil(checkedPrompts.length / 2) ? 'High' : 'Medium',
      title: 'Improve brand mention coverage',
      text: checkedPrompts.length
        ? `${brandMentioned} of ${checkedPrompts.length} checked prompts mention your brand. Prioritize prompts where competitors appear and your brand is absent.`
        : 'Run prompt checks to measure brand mention coverage.'
    },
    {
      priority: citations ? 'Medium' : 'High',
      title: 'Improve citation footprint',
      text: citations
        ? `${citations} citation opportunities were found across checked prompts. Build pages that match recurring citation sources and prompt intent.`
        : 'No citation opportunities are saved yet. Run prompt checks and capture recommended citation pages.'
    },
    {
      priority: competitorMentions > brandMentioned ? 'High' : 'Medium',
      title: 'Monitor competitor gap',
      text: competitorMentions
        ? `Competitors were mentioned ${competitorMentions} times. Use competitor-heavy prompts to improve positioning and content.`
        : 'No competitor mentions are saved yet.'
    }
  ];

  return {
    totalPrompts: enriched.length,
    checkedPrompts: checkedPrompts.length,
    uncheckedPrompts: Math.max(enriched.length - checkedPrompts.length, 0),
    brandMentioned,
    competitorMentions,
    citations,
    visibilityScore,
    shareOfVoice,
    citationCoverage,
    activeProviderCount: activeProviders.length,
    availableProviderLabels: activeProviders.map((provider) => provider.label),
    providers,
    hasRealData: activeProviders.length > 0 && checkedPrompts.length > 0,
    brandRanking,
    topPromptsByBrand,
    topPromptsByCitations,
    citationsTable: citationRows.map((row) => ({
      url: row.name,
      domain: hostnameFromUrl(row.name),
      citations: row.count,
      share: citations ? Math.round((row.count / citations) * 100) : 0
    })),
    domainCitations: domainRows.map((row) => ({
      domain: row.name,
      citations: row.count,
      share: citations ? Math.round((row.count / citations) * 100) : 0
    })),
    brandTrend,
    domainTrend,
    insights
  };
}

function setupPipelineStatus(companyId) {
  const completedAnalysis = getLatestCompletedBusinessAnalysis(companyId);
  const prompts = listCompanyPrompts(companyId);
  const competitors = listCompanyCompetitors(companyId);
  const promptSummaryData = promptSummary(prompts);
  const steps = [
    {
      key: 'analysis',
      label: 'Business analysis',
      complete: Boolean(completedAnalysis),
      description: 'Analyze company website and business profile.'
    },
    {
      key: 'competitors',
      label: 'Competitor discovery',
      complete: competitors.length > 0,
      description: 'Discover related companies for comparison.'
    },
    {
      key: 'prompts',
      label: 'Prompt generation',
      complete: prompts.length > 0,
      description: 'Create buyer-intent AI search prompts.'
    },
    {
      key: 'checks',
      label: 'AI visibility checks',
      complete: promptSummaryData.checked > 0,
      description: 'Send prompts to available AI provider and save responses.'
    }
  ];

  return {
    ready: steps.every((step) => step.complete),
    steps,
    counts: {
      prompts: prompts.length,
      competitors: competitors.length,
      checkedPrompts: promptSummaryData.checked,
      brandMentioned: promptSummaryData.brandMentioned,
      citations: promptSummaryData.citations
    },
    analysis: completedAnalysis || null,
    competitors,
    prompts: enrichPrompts(prompts)
  };
}

function requireSetupManager(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) return null;

  if (!CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    sendJson(res, { error: 'Access denied' }, 403);
    return null;
  }

  return context;
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const email = normalize(body.email).toLowerCase();
  const password = String(body.password || '');
  const user = getUserByEmail(email);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return sendJson(res, { error: 'Invalid email or password.' }, 401);
  }

  if (user.status !== 'active') {
    return sendJson(res, { error: 'Your account is not active. Please contact an administrator.' }, 403);
  }

  const session = createSessionForUser(res, user);

  if (!session.isDeveloper && (!session.workspaceCompanies || session.workspaceCompanies.length === 0)) {
    destroySession(req, res);
    return sendJson(res, { error: 'No active company access was found for this account.' }, 403);
  }

  return sendJson(res, sessionPayload(session));
}

async function handleSignup(req, res) {
  const body = await readJson(req);
  const fullName = normalize(body.fullName);
  const email = normalize(body.email).toLowerCase();
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const companyName = normalize(body.companyName);
  const websiteUrl = normalize(body.websiteUrl);
  const logoUrl = normalize(body.logoUrl);
  const errors = {};

  if (!fullName) errors.fullName = 'Full name is required.';
  if (!email || !isValidEmail(email)) errors.email = 'Valid email is required.';
  if (!password) errors.password = 'Password is required.';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords must match.';
  if (!companyName) errors.companyName = 'Company name is required.';
  if (!websiteUrl) errors.websiteUrl = 'Website URL is required.';
  if (email && getUserByEmail(email)) errors.email = 'This email is already registered.';

  if (Object.keys(errors).length) {
    return sendJson(res, { error: 'Please fix the highlighted fields.', errors }, 422);
  }

  const result = createUserCompanyWorkspace({
    user: {
      full_name: fullName,
      email,
      password_hash: hashPassword(password)
    },
    company: {
      company_name: companyName,
      website_url: websiteUrl,
      logo_url: logoUrl,
      industry: '',
      service_area: '',
      target_country: '',
      main_services: '',
      known_competitors: '',
      brand_description: '',
      target_audience: ''
    }
  });

  const user = getUserById(result.userId);
  const session = createSessionForUser(res, {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    status: user.status
  });

  return sendJson(res, sessionPayload(session), 201);
}

async function handleSelectCompany(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  const body = await readJson(req);
  const companyId = Number(body.companyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return sendJson(res, { error: 'Invalid company selection.' }, 422);
  }

  const access = session.isDeveloper
    ? getDeveloperCompanyAccess(companyId)
    : getUserCompanyAccess(session.userId, companyId);

  if (!access) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const payload = snapshotAccess(access);
  updateSession(req, payload);
  const updatedSession = { ...session, ...payload };

  return sendJson(res, sessionPayload(updatedSession));
}

function handleDashboard(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const { session, access } = context;
  const latestAnalysis = getLatestBusinessAnalysis(access.company_id);
  const completedAnalysis = getLatestCompletedBusinessAnalysis(access.company_id);
  const prompts = listCompanyPrompts(access.company_id);
  const competitors = listCompanyCompetitors(access.company_id);
  const visibilitySummary = dashboardVisibilitySummary(prompts, access);

  return sendJson(res, {
    session: sessionPayload(session),
    company: access,
    setupProgress: setupProgress(access),
    businessAnalysis: latestAnalysis || null,
    latestCompletedAnalysis: completedAnalysis || null,
    visibilitySummary,
    counts: {
      prompts: prompts.length,
      competitors: competitors.length,
      checkedPrompts: visibilitySummary.checkedPrompts,
      brandMentioned: visibilitySummary.brandMentioned,
      citations: visibilitySummary.citations
    }
  });
}

function handleSetupStatus(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  return sendJson(res, setupPipelineStatus(context.access.company_id));
}

async function handleSetupGenerateAnalysis(req, res) {
  const context = requireSetupManager(req, res);

  if (!context) return null;

  const companyId = context.access.company_id;
  let analysis = getLatestCompletedBusinessAnalysis(companyId);
  let analysisId = null;

  try {
    if (!analysis) {
      analysisId = createBusinessAnalysis(companyId);
      analysis = await AIService.generateBusinessAnalysis(context.access);
      completeBusinessAnalysis(analysisId, analysis);
      updateCompanyGeneratedProfile(companyId, analysis);
      completeCompanyOnboarding(companyId);
    }

    return sendJson(res, setupPipelineStatus(companyId));
  } catch (error) {
    if (analysisId) failBusinessAnalysis(analysisId, 'AI business analysis failed. Please retry.', 'gemini');
    console.error(error);
    return sendJson(res, { error: 'AI business analysis failed. Please retry.' }, 500);
  }
}

async function handleSetupGenerateCompetitors(req, res) {
  const context = requireSetupManager(req, res);

  if (!context) return null;

  const companyId = context.access.company_id;
  const analysis = getLatestCompletedBusinessAnalysis(companyId);

  if (!analysis) {
    return sendJson(res, { error: 'Generate and confirm business analysis first.' }, 409);
  }

  try {
    if (!listCompanyCompetitors(companyId).length) {
      const competitors = await AIService.discoverCompetitors(context.access, analysis);
      upsertCompanyCompetitors(companyId, competitors, 'gemini');
    }

    return sendJson(res, setupPipelineStatus(companyId));
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: 'Competitor discovery failed. Please retry.' }, 500);
  }
}

async function handleSetupGeneratePrompts(req, res) {
  const context = requireSetupManager(req, res);

  if (!context) return null;

  const companyId = context.access.company_id;
  const analysis = getLatestCompletedBusinessAnalysis(companyId);

  if (!analysis) {
    return sendJson(res, { error: 'Generate and confirm business analysis first.' }, 409);
  }

  if (!listCompanyCompetitors(companyId).length) {
    return sendJson(res, { error: 'Confirm competitors before generating prompts.' }, 409);
  }

  try {
    if (!listCompanyPrompts(companyId).length) {
      const prompts = await AIService.generateCompanyPrompts(context.access, analysis);
      replaceCompanyPrompts(companyId, prompts, 'gemini');
    }

    return sendJson(res, setupPipelineStatus(companyId));
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: 'Prompt generation failed. Please retry.' }, 500);
  }
}

async function handleSetupRunChecks(req, res) {
  const context = requireSetupManager(req, res);

  if (!context) return null;

  const companyId = context.access.company_id;
  const analysis = getLatestCompletedBusinessAnalysis(companyId);
  const competitors = listCompanyCompetitors(companyId);
  const prompts = listCompanyPrompts(companyId);

  if (!analysis || !competitors.length || !prompts.length) {
    return sendJson(res, { error: 'Confirm analysis, competitors, and prompts before running checks.' }, 409);
  }

  try {
    const visibilityResults = await AIService.analyzePromptVisibility(context.access, prompts, competitors, analysis);
    updatePromptVisibility(companyId, visibilityResults);
    return sendJson(res, setupPipelineStatus(companyId));
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: 'AI visibility checks failed. Please retry.' }, 500);
  }
}

async function handleSetupRemovePrompt(req, res) {
  const context = requireSetupManager(req, res);
  if (!context) return null;
  const body = await readJson(req);
  const promptId = Number(body.promptId);
  if (!Number.isInteger(promptId) || promptId <= 0) return sendJson(res, { error: 'Select a valid prompt.' }, 422);
  removeCompanyPrompt(context.access.company_id, promptId);
  return sendJson(res, setupPipelineStatus(context.access.company_id));
}

async function handleSetupRemoveCompetitor(req, res) {
  const context = requireSetupManager(req, res);
  if (!context) return null;
  const body = await readJson(req);
  const competitorId = Number(body.competitorId);
  if (!Number.isInteger(competitorId) || competitorId <= 0) return sendJson(res, { error: 'Select a valid competitor.' }, 422);
  removeCompanyCompetitor(context.access.company_id, competitorId);
  return sendJson(res, setupPipelineStatus(context.access.company_id));
}

async function handleSetupAddPrompt(req, res) {
  const context = requireSetupManager(req, res);
  if (!context) return null;
  const body = await readJson(req);
  const promptText = normalize(body.promptText);
  if (!promptText) return sendJson(res, { error: 'Prompt text is required.' }, 422);
  addCompanyPrompt({
    companyId: context.access.company_id,
    promptText,
    promptCategory: normalize(body.promptCategory || 'Manual'),
    promptIntent: normalize(body.promptIntent || 'Manual tracking'),
    sourceType: 'manual'
  });
  return sendJson(res, setupPipelineStatus(context.access.company_id), 201);
}

async function handleSetupAddCompetitor(req, res) {
  const context = requireSetupManager(req, res);
  if (!context) return null;
  const body = await readJson(req);
  const competitorName = normalize(body.competitorName);
  if (!competitorName) return sendJson(res, { error: 'Competitor name is required.' }, 422);
  addCompanyCompetitor({
    companyId: context.access.company_id,
    competitorName,
    websiteUrl: normalize(body.websiteUrl),
    notes: normalize(body.notes),
    sourceType: 'manual'
  });
  return sendJson(res, setupPipelineStatus(context.access.company_id), 201);
}

async function handleGenerateSetup(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const companyId = context.access.company_id;
  let analysis = getLatestCompletedBusinessAnalysis(companyId);
  let analysisId = null;

  try {
    if (!analysis) {
      analysisId = createBusinessAnalysis(companyId);
      analysis = await AIService.generateBusinessAnalysis(context.access);
      completeBusinessAnalysis(analysisId, analysis);
      updateCompanyGeneratedProfile(companyId, analysis);
      completeCompanyOnboarding(companyId);
    }

    let competitors = listCompanyCompetitors(companyId);

    if (!competitors.length) {
      const discoveredCompetitors = await AIService.discoverCompetitors(context.access, analysis);
      upsertCompanyCompetitors(companyId, discoveredCompetitors, 'gemini');
      competitors = listCompanyCompetitors(companyId);
    }

    let prompts = listCompanyPrompts(companyId);

    if (!prompts.length) {
      const generatedPrompts = await AIService.generateCompanyPrompts(context.access, analysis);
      replaceCompanyPrompts(companyId, generatedPrompts, 'gemini');
      prompts = listCompanyPrompts(companyId);
    }

    const summary = promptSummary(prompts);

    if (prompts.length && summary.checked === 0) {
      const visibilityResults = await AIService.analyzePromptVisibility(context.access, prompts, competitors, analysis);
      updatePromptVisibility(companyId, visibilityResults);
    }

    return sendJson(res, setupPipelineStatus(companyId));
  } catch (error) {
    if (analysisId) {
      failBusinessAnalysis(analysisId, 'AI setup generation failed. Please retry.', 'gemini');
    }

    console.error(error);
    return sendJson(res, { error: 'AI setup generation failed. Please retry.' }, 500);
  }
}

function handleBusinessAnalysis(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const companyId = context.access.company_id;

  return sendJson(res, {
    latest: getLatestBusinessAnalysis(companyId) || null,
    latestCompleted: getLatestCompletedBusinessAnalysis(companyId) || null,
    history: listBusinessAnalyses(companyId)
  });
}

function handleAeoRecommendations(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const companyId = context.access.company_id;
  const prompts = listCompanyPrompts(companyId);
  const competitors = listCompanyCompetitors(companyId);
  const analysis = getLatestCompletedBusinessAnalysis(companyId);
  const visibilitySummary = dashboardVisibilitySummary(prompts, context.access);
  const latest = parseAeoRecommendation(getLatestAeoRecommendation(companyId));
  const history = listAeoRecommendations(companyId).map(parseAeoRecommendation);

  return sendJson(res, {
    latest,
    history,
    canGenerate: CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name),
    prerequisites: {
      analysisCompleted: Boolean(analysis),
      competitors: competitors.length,
      prompts: prompts.length,
      checkedPrompts: visibilitySummary.checkedPrompts,
      hasRealData: visibilitySummary.hasRealData
    },
    summary: {
      brandMentioned: visibilitySummary.brandMentioned,
      competitorMentions: visibilitySummary.competitorMentions,
      citations: visibilitySummary.citations,
      visibilityScore: visibilitySummary.visibilityScore,
      shareOfVoice: visibilitySummary.shareOfVoice,
      citationCoverage: visibilitySummary.citationCoverage
    }
  });
}

async function handleGenerateAeoRecommendations(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const companyId = context.access.company_id;
  const analysis = getLatestCompletedBusinessAnalysis(companyId);
  const prompts = listCompanyPrompts(companyId);
  const competitors = listCompanyCompetitors(companyId);
  const visibilitySummary = dashboardVisibilitySummary(prompts, context.access);

  if (!analysis || !competitors.length || !prompts.length || visibilitySummary.checkedPrompts === 0) {
    return sendJson(res, { error: 'Complete business analysis, competitors, prompts, and AI visibility checks before generating What’s Next.' }, 409);
  }

  try {
    const recommendation = await AIService.generateAeoRecommendations(
      buildAeoRecommendationContext(context.access, analysis, prompts, competitors, visibilitySummary)
    );
    createAeoRecommendation(companyId, recommendation, 'gemini');

    return handleAeoRecommendations(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: 'Gemini could not generate the AEO action plan. Please retry.' }, 500);
  }
}

function handlePrompts(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const prompts = listCompanyPrompts(context.access.company_id);

  return sendJson(res, {
    prompts: enrichPrompts(prompts),
    summary: promptSummary(prompts),
    canManage: CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)
  });
}

async function handleAddPrompt(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const promptText = normalize(body.promptText);
  const promptCategory = normalize(body.promptCategory || 'Manual');
  const promptIntent = normalize(body.promptIntent || 'Manual tracking');
  const errors = {};

  if (!promptText) errors.promptText = 'Prompt text is required.';

  if (Object.keys(errors).length) {
    return sendJson(res, { error: 'Please fix the highlighted fields.', errors }, 422);
  }

  addCompanyPrompt({
    companyId: context.access.company_id,
    promptText,
    promptCategory,
    promptIntent,
    sourceType: 'manual'
  });

  const prompts = listCompanyPrompts(context.access.company_id);

  return sendJson(res, {
    ok: true,
    prompts: enrichPrompts(prompts),
    summary: promptSummary(prompts),
    canManage: true
  }, 201);
}

function handleCompetitors(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  return sendJson(res, {
    competitors: listCompanyCompetitors(context.access.company_id),
    canManage: CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)
  });
}

async function handleAddCompetitor(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!CONTENT_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const competitorName = normalize(body.competitorName);
  const websiteUrl = normalize(body.websiteUrl);
  const notes = normalize(body.notes);
  const errors = {};

  if (!competitorName) errors.competitorName = 'Competitor name is required.';

  if (Object.keys(errors).length) {
    return sendJson(res, { error: 'Please fix the highlighted fields.', errors }, 422);
  }

  addCompanyCompetitor({
    companyId: context.access.company_id,
    competitorName,
    websiteUrl,
    notes,
    sourceType: 'manual'
  });

  return sendJson(res, {
    ok: true,
    competitors: listCompanyCompetitors(context.access.company_id),
    canManage: true
  }, 201);
}

function handleAiResponses(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const prompts = enrichPrompts(listCompanyPrompts(context.access.company_id));
  const responses = prompts.filter((prompt) =>
    prompt.ai_response_summary ||
    prompt.gemini_response_summary !== 'NA' ||
    prompt.brand_mention_context ||
    prompt.last_checked_at
  );

  return sendJson(res, {
    responses,
    summary: {
      total: responses.length,
      brandMentioned: responses.filter((prompt) => prompt.brand_mentioned).length,
      gemini: responses.filter((prompt) => prompt.gemini_response_summary && prompt.gemini_response_summary !== 'NA').length,
      chatgpt: responses.filter((prompt) => prompt.chatgpt_response_summary && prompt.chatgpt_response_summary !== 'NA').length,
      claude: responses.filter((prompt) => prompt.claude_response_summary && prompt.claude_response_summary !== 'NA').length,
      perplexity: responses.filter((prompt) => prompt.perplexity_response_summary && prompt.perplexity_response_summary !== 'NA').length
    }
  });
}

function handleCitations(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  const prompts = listCompanyPrompts(context.access.company_id);
  const citations = flattenCitations(prompts);

  return sendJson(res, {
    citations,
    summary: {
      total: citations.length,
      promptsWithCitations: new Set(citations.map((citation) => citation.prompt_id)).size
    }
  });
}

function handleSettings(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  return sendJson(res, {
    session: sessionPayload(context.session),
    company: context.access,
    setupProgress: setupProgress(context.access),
    users: listCompanyUsers(context.access.company_id),
    canManage: USER_MANAGEMENT_ROLES.includes(context.access.role_name),
    analysis: getLatestBusinessAnalysis(context.access.company_id) || null,
    promptsSummary: promptSummary(listCompanyPrompts(context.access.company_id)),
    competitors: listCompanyCompetitors(context.access.company_id)
  });
}

function handleUsers(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  return sendJson(res, {
    company: context.access,
    users: listCompanyUsers(context.access.company_id),
    canManage: USER_MANAGEMENT_ROLES.includes(context.access.role_name),
    assignableRoles: getAssignableUserRoles(context.access.role_name),
    statuses: COMPANY_ACCESS_STATUSES
  });
}

async function handleAddUser(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!USER_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const input = {
    fullName: normalize(body.fullName),
    email: normalize(body.email).toLowerCase(),
    password: String(body.password || ''),
    confirmPassword: String(body.confirmPassword || ''),
    roleName: normalize(body.roleName),
    status: normalize(body.status || 'active')
  };
  const assignableRoles = getAssignableUserRoles(context.access.role_name);
  const errors = {};

  if (!input.fullName) errors.fullName = 'Full name is required.';
  if (!input.email || !isValidEmail(input.email)) errors.email = 'Valid email is required.';
  if (!input.password) errors.password = 'Password is required.';
  if (input.password !== input.confirmPassword) errors.confirmPassword = 'Passwords must match.';
  if (!assignableRoles.includes(input.roleName)) errors.roleName = 'Select an allowed role.';
  if (!COMPANY_ACCESS_STATUSES.includes(input.status)) errors.status = 'Select a valid status.';

  if (Object.keys(errors).length) {
    return sendJson(res, { error: 'Please fix the highlighted fields.', errors }, 422);
  }

  try {
    createOrAddCompanyUser({
      fullName: input.fullName,
      email: input.email,
      passwordHash: hashPassword(input.password),
      roleName: input.roleName,
      status: input.status,
      companyId: context.access.company_id
    });
  } catch (error) {
    if (error.message === 'DUPLICATE_COMPANY_ACCESS') {
      return sendJson(res, { error: 'User already has access to this company' }, 409);
    }

    throw error;
  }

  return sendJson(res, {
    ok: true,
    users: listCompanyUsers(context.access.company_id)
  }, 201);
}

async function handleRemoveUser(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (!USER_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const userId = Number(body.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return sendJson(res, { error: 'Select a valid user to remove.' }, 422);
  }

  const users = listCompanyUsers(context.access.company_id);
  const targetUser = users.find((user) => Number(user.user_id) === userId);

  if (!targetUser) {
    return sendJson(res, { error: 'User does not have access to this company.' }, 404);
  }

  if (targetUser.role_name === 'Business Owner' && countCompanyBusinessOwners(context.access.company_id) <= 1) {
    return sendJson(res, { error: 'Cannot remove the last Business Owner from this company.' }, 409);
  }

  removeCompanyUserAccess(context.access.company_id, userId);

  return sendJson(res, {
    ok: true,
    users: listCompanyUsers(context.access.company_id)
  });
}

function handleDeveloperAdmin(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.isDeveloper) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  return sendJson(res, {
    stats: getPlatformStats(),
    companies: listAllCompaniesForDeveloper(),
    users: listAllUsersForDeveloper(),
    accessRecords: listWorkspaceAccessForDeveloper()
  });
}

async function handleDeveloperDeleteCompany(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.isDeveloper) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const companyId = Number(body.companyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return sendJson(res, { error: 'Select a valid company to delete.' }, 422);
  }

  deleteCompany(companyId);

  return sendJson(res, {
    ok: true,
    stats: getPlatformStats(),
    companies: listAllCompaniesForDeveloper(),
    users: listAllUsersForDeveloper(),
    accessRecords: listWorkspaceAccessForDeveloper()
  });
}

async function handleDeveloperRemoveAccess(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.isDeveloper) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const accessId = Number(body.accessId);

  if (!Number.isInteger(accessId) || accessId <= 0) {
    return sendJson(res, { error: 'Select a valid access record to remove.' }, 422);
  }

  const accessRecord = getAccessRecordById(accessId);

  if (!accessRecord) {
    return sendJson(res, { error: 'Access record was not found.' }, 404);
  }

  if (accessRecord.role_name === 'Business Owner' && countCompanyBusinessOwners(accessRecord.company_id) <= 1) {
    return sendJson(res, { error: 'Cannot remove the last Business Owner from this company.' }, 409);
  }

  removeAccessRecordById(accessId);

  return sendJson(res, {
    ok: true,
    stats: getPlatformStats(),
    companies: listAllCompaniesForDeveloper(),
    users: listAllUsersForDeveloper(),
    accessRecords: listWorkspaceAccessForDeveloper()
  });
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, { ok: true, app: 'hummingbird', layer: 'backend-api', database: dbPath });
    }

    if (req.method === 'GET' && url.pathname === '/api/session') {
      const session = getSession(req);
      return sendJson(res, session ? sessionPayload(session) : { authenticated: false }, session ? 200 : 401);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      return handleLogin(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      return handleSignup(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      destroySession(req, res);
      return sendJson(res, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/workspace/select') {
      return handleSelectCompany(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      return handleDashboard(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/setup/status') {
      return handleSetupStatus(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/generate') {
      return handleGenerateSetup(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/generate-analysis') {
      return handleSetupGenerateAnalysis(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/generate-competitors') {
      return handleSetupGenerateCompetitors(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/generate-prompts') {
      return handleSetupGeneratePrompts(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/run-checks') {
      return handleSetupRunChecks(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/prompts/remove') {
      return handleSetupRemovePrompt(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/competitors/remove') {
      return handleSetupRemoveCompetitor(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/prompts/add') {
      return handleSetupAddPrompt(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/setup/competitors/add') {
      return handleSetupAddCompetitor(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/business-analysis') {
      return handleBusinessAnalysis(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/aeo-recommendations') {
      return handleAeoRecommendations(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/aeo-recommendations/generate') {
      return handleGenerateAeoRecommendations(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/prompts') {
      return handlePrompts(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/prompts/add') {
      return handleAddPrompt(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/competitors') {
      return handleCompetitors(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/competitors/add') {
      return handleAddCompetitor(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/ai-responses') {
      return handleAiResponses(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/citations') {
      return handleCitations(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/settings') {
      return handleSettings(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/users') {
      return handleUsers(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/developer') {
      return handleDeveloperAdmin(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/developer/companies/delete') {
      return handleDeveloperDeleteCompany(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/developer/access/remove') {
      return handleDeveloperRemoveAccess(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/users/add') {
      return handleAddUser(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/users/remove') {
      return handleRemoveUser(req, res);
    }

    return notFound(res);
  } catch (error) {
    if (error.message === 'Invalid JSON body') {
      return sendJson(res, { error: 'Invalid JSON body' }, 400);
    }

    console.error(error);
    return sendJson(res, { error: 'Internal server error' }, 500);
  }
}

if (require.main === module) {
  const server = http.createServer(router);
  server.listen(PORT, () => {
    console.log(`Hummingbird backend API running at http://localhost:${PORT}`);
    console.log(`Database: ${dbPath}`);
  });
}

module.exports = router;
