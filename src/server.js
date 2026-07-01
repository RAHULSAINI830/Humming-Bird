const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
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
  listActiveCompanies,
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
  upsertGoogleConnection,
  getGoogleConnection,
  updateGoogleConnectionTokens,
  disconnectGoogleConnection,
  replaceSearchConsoleProperties,
  listSearchConsoleProperties,
  setSelectedSearchConsoleProperty,
  getSelectedSearchConsoleProperty,
  replaceGeoSnapshots,
  listGeoCountrySnapshots,
  listGeoQuerySnapshots,
  listGeoDimensionSnapshots,
  clearGeoSnapshots,
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
const SESSION_COOKIE_NAME = 'hbsid';
const SESSION_SECRET =
  process.env.HUMMINGBIRD_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.HUMMINGBIRD_DEVELOPER_PASSWORD ||
  process.env.RANGO_DEVELOPER_PASSWORD ||
  'hummingbird-local-development-secret';
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
const GEO_MANAGEMENT_ROLES = CONTENT_MANAGEMENT_ROLES;
const GOOGLE_SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email';

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

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || SESSION_SECRET)
    .digest();
}

function encryptSecret(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  if (!value) return '';
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split('.');

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return '';
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function signSessionPayload(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function encodeSessionClaims(claims) {
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signSessionPayload(payload);
  return `${payload}.${signature}`;
}

function decodeSessionClaims(token) {
  const [payload, signature] = String(token || '').split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(payload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(base64UrlDecode(payload));

    if (!claims?.userId) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge = 86400) {
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function setSessionCookie(res, claims) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(encodeSessionClaims(claims))}; ${cookieOptions()}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; ${cookieOptions(0)}`);
}

function hydrateSession(claims) {
  const user = getUserById(Number(claims.userId));

  if (!user || user.status !== 'active') {
    return null;
  }

  const isDeveloper = userHasRole(user.id, 'Developer');
  const companies = workspaceCompaniesForUser(user);
  const requestedCompanyId = Number(claims.selectedCompanyId || 0);
  const selectedCompany = requestedCompanyId
    ? companies.find((company) => Number(company.company_id) === requestedCompanyId)
    : companies[0];
  const companyId = selectedCompany?.company_id || companies[0]?.company_id || null;
  const access = companyId
    ? (isDeveloper ? getDeveloperCompanyAccess(companyId) : getUserCompanyAccess(user.id, companyId))
    : null;

  return {
    userId: user.id,
    userFullName: user.full_name,
    userEmail: user.email,
    userStatus: user.status,
    isDeveloper,
    workspaceCompanies: companies,
    ...snapshotAccess(access || {
      company_id: null,
      company_name: isDeveloper ? 'Platform Admin' : null,
      role_id: null,
      role_name: isDeveloper ? 'Developer' : null
    })
  };
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME] || cookies.sid;
  const claims = decodeSessionClaims(token);
  return claims ? hydrateSession(claims) : null;
}

function createSession(res, payload) {
  const claims = {
    userId: payload.userId,
    selectedCompanyId: payload.selectedCompanyId || null
  };
  setSessionCookie(res, claims);
  return hydrateSession(claims) || payload;
}

function updateSession(req, res, payload) {
  const current = getSession(req);

  if (current) {
    setSessionCookie(res, {
      userId: current.userId,
      selectedCompanyId: payload.selectedCompanyId || current.selectedCompanyId || null
    });
  }
}

function destroySession(req, res) {
  clearSessionCookie(res);
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

function safeErrorDetail(error) {
  return {
    detail: String(error?.message || '').slice(0, 500),
    code: error?.code || ''
  };
}

function aiErrorResponse(error, fallbackMessage) {
  const code = String(error?.message || '');
  const messages = {
    AI_MISSING_KEY: 'Hummingbird AI is not configured yet. Please add the AI API key in production environment variables and redeploy.',
    AI_AUTH_FAILED: 'Hummingbird AI authentication failed. Please check the AI API key in production environment variables and redeploy.',
    AI_RATE_LIMITED: 'Hummingbird AI is temporarily rate-limited. Please wait a minute and retry. If this continues, the AI key quota is exhausted or production is still using the old key.',
    AI_TIMEOUT: 'Hummingbird AI took too long to respond. Please retry.',
    AI_INVALID_JSON: 'Hummingbird AI returned an unreadable response. Please retry.',
    AI_NETWORK_ERROR: 'Hummingbird AI could not be reached. Please retry.',
    AI_SERVER_ERROR: 'Hummingbird AI service is temporarily unavailable. Please retry.',
    AI_REQUEST_FAILED: 'Hummingbird AI request failed. Please check the AI key, model, and provider quota.'
  };

  return {
    error: messages[code] || fallbackMessage,
    detail: code && messages[code] ? '' : String(error?.message || '').slice(0, 500),
    code: error?.code || code
  };
}

function notFound(res) {
  return sendJson(res, { error: 'Route not found' }, 404);
}

function staticContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.json': 'application/json; charset=utf-8'
  };

  return types[extension] || 'application/octet-stream';
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return notFound(res);
  }

  res.writeHead(200, {
    'Content-Type': staticContentType(filePath),
    'Cache-Control': filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function serveFrontend(req, res, url) {
  const distDir = path.join(__dirname, '..', 'frontend', 'dist');

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    return sendJson(res, {
      error: 'Frontend build not found. Run npm run build, then restart npm start.'
    }, 404);
  }

  if (url.pathname === '/') {
    return redirect(res, '/app/');
  }

  if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') {
    return serveFile(res, path.join(distDir, url.pathname.slice(1)));
  }

  if (url.pathname.startsWith('/app/assets/')) {
    const assetPath = path.join(distDir, url.pathname.replace(/^\/app\//, ''));
    return serveFile(res, assetPath);
  }

  if (url.pathname === '/app') {
    return redirect(res, '/app/');
  }

  if (url.pathname.startsWith('/app/')) {
    const requestedPath = path.join(distDir, url.pathname.replace(/^\/app\//, ''));

    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
      return serveFile(res, requestedPath);
    }

    return serveFile(res, path.join(distDir, 'index.html'));
  }

  return false;
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
    ['gemini', 'Hummingbird AI', 'gemini_response_summary'],
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

function requestBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'http';
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  return `${proto}://${host}`;
}

function publicBaseUrl(req) {
  return process.env.PUBLIC_APP_URL || requestBaseUrl(req);
}

function googleRedirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${publicBaseUrl(req)}/api/google/callback`;
}

function safeReturnBaseUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host) {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function appRedirectPath(params = '') {
  return `/app/${params ? `?${params}` : ''}`;
}

function appReturnUrl(req, state, params = '') {
  const returnBase = safeReturnBaseUrl(state?.returnBaseUrl) || requestBaseUrl(req);
  return `${returnBase}${appRedirectPath(params)}`;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function encodeOAuthState(payload) {
  const state = base64UrlEncode(JSON.stringify(payload));
  return `${state}.${signSessionPayload(state)}`;
}

function decodeOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(payload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    return parsed.exp && parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

async function readGoogleJson(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error_description || data?.error?.message || data?.error || fallbackMessage;
    const error = new Error(String(message || fallbackMessage).slice(0, 220));
    error.googleError = data?.error || '';
    error.googleDescription = data?.error_description || data?.error?.message || '';
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

function safeGoogleErrorCode(error) {
  const googleError = String(error?.googleError || '').toLowerCase();
  const message = `${googleError} ${String(error?.googleDescription || '')} ${String(error?.message || '')}`.toLowerCase();

  if (message.includes('redirect_uri_mismatch')) return 'redirect-uri-mismatch';
  if (message.includes('invalid_client')) return 'invalid-client';
  if (message.includes('invalid_grant')) return 'invalid-grant';
  if (message.includes('unauthorized_client')) return 'unauthorized-client';
  if (message.includes('invalid_request')) return 'invalid-request';
  if (message.includes('access_denied')) return 'access-denied';
  if (message.includes('not been used') || message.includes('disabled') || message.includes('api has not')) return 'api-not-enabled';
  if (message.includes('permission') || message.includes('forbidden')) return 'permission-denied';
  if (message.includes('search console')) return 'search-console-error';
  if (message.includes('fetch failed') || message.includes('network')) return 'google-network-error';

  return 'google-callback-error';
}

function logGoogleCallbackIssue(req, error) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
  const safeDetails = {
    host: req.headers.host,
    redirectUri: googleRedirectUri(req),
    googleClientIdEnding: clientId ? clientId.slice(-18) : 'missing',
    hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    statusCode: error?.statusCode || '',
    googleError: error?.googleError || '',
    reason: safeGoogleErrorCode(error)
  };

  console.warn(`Google OAuth callback failed: ${JSON.stringify(safeDetails)}`);
}

function tokenExpiryFromSeconds(seconds) {
  return new Date(Date.now() + Number(seconds || 3600) * 1000).toISOString();
}

function tokenIsExpired(connection) {
  if (!connection?.token_expiry) return true;
  return new Date(connection.token_expiry).getTime() < Date.now() + 60_000;
}

async function refreshGoogleAccessToken(connection) {
  const refreshToken = decryptSecret(connection.refresh_token_encrypted);

  if (!refreshToken) {
    throw new Error('Google refresh token is missing. Please reconnect Search Console.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await readGoogleJson(response, 'Could not refresh Google token.');
  const accessToken = data.access_token;

  if (!accessToken) {
    throw new Error('Google did not return a new access token.');
  }

  updateGoogleConnectionTokens(
    connection.id,
    encryptSecret(accessToken),
    '',
    tokenExpiryFromSeconds(data.expires_in)
  );

  return accessToken;
}

async function googleAccessTokenForCompany(companyId) {
  const connection = getGoogleConnection(companyId);

  if (!connection || connection.status !== 'connected') {
    throw new Error('Google Search Console is not connected.');
  }

  if (!tokenIsExpired(connection)) {
    const accessToken = decryptSecret(connection.access_token_encrypted);
    if (accessToken) return accessToken;
  }

  return refreshGoogleAccessToken(connection);
}

async function fetchSearchConsoleProperties(accessToken) {
  const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await readGoogleJson(response, 'Could not fetch Search Console properties.');
  return Array.isArray(data.siteEntry) ? data.siteEntry : [];
}

function normalizeDomain(value) {
  const raw = normalize(value).replace(/^sc-domain:/i, '');

  if (!raw) return '';

  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function bestSearchConsoleProperty(company, properties) {
  const companyDomain = normalizeDomain(company?.website_url);

  if (!companyDomain) {
    return properties[0]?.siteUrl || '';
  }

  const exact = properties.find((property) => normalizeDomain(property.siteUrl) === companyDomain);
  const contains = properties.find((property) => {
    const propertyDomain = normalizeDomain(property.siteUrl);
    return propertyDomain && (companyDomain.endsWith(propertyDomain) || propertyDomain.endsWith(companyDomain));
  });

  return (exact || contains || properties[0])?.siteUrl || '';
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dateRangeDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function previousDateRange(startDate, endDate) {
  const days = dateRangeDays(startDate, endDate);
  const previousEnd = new Date(`${startDate}T00:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);

  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10)
  };
}

function countryLabel(countryCode) {
  const code = String(countryCode || '').toUpperCase();

  if (!code) return 'Unknown';

  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

async function searchConsoleQuery(accessToken, propertyUrl, body) {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  const data = await readGoogleJson(response, 'Could not fetch Search Console analytics.');
  return Array.isArray(data.rows) ? data.rows : [];
}

function dimensionRow(type, row) {
  const keys = row.keys || [];
  return {
    dimension_type: type,
    dimension_key: keys[0] || '',
    dimension_key_2: keys[1] || '',
    dimension_key_3: keys[2] || '',
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position
  };
}

function aggregateRows(rows) {
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const weightedPosition = rows.reduce((sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0), 0);

  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : 0
  };
}

function latestCreatedRows(rows) {
  const firstCreated = rows[0]?.created_at;
  return rows.filter((row) => !firstCreated || row.created_at === firstCreated);
}

function changeValue(current, previous) {
  if (previous === null || previous === undefined || Number(previous) === 0) {
    return current ? null : 0;
  }

  return ((Number(current || 0) - Number(previous || 0)) / Number(previous)) * 100;
}

function byKey(rows, keyName = 'dimension_key') {
  return new Map(rows.map((row) => [String(row[keyName] || '').toLowerCase(), row]));
}

function searchIntentForQuery(query) {
  const value = String(query || '').toLowerCase();
  if (/\b(price|cost|buy|near me|service|company|best|top|software|tool)\b/.test(value)) return 'Commercial';
  if (/\b(how|what|why|guide|ideas|examples|template)\b/.test(value)) return 'Informational';
  if (/\b(login|contact|website|brand|support)\b/.test(value)) return 'Navigational';
  return 'Mixed';
}

function brandTypeForQuery(query, companyName = '') {
  const queryValue = String(query || '').toLowerCase();
  const brand = String(companyName || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const brandTokens = brand.split(/\s+/).filter((token) => token.length > 2);
  return brandTokens.some((token) => queryValue.includes(token)) ? 'Brand' : 'Non-brand';
}

function pageTypeForUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('/blog') || value.includes('/articles')) return 'Blog';
  if (value.includes('/product')) return 'Product';
  if (value.includes('/docs') || value.includes('/help')) return 'Docs';
  if (value.includes('/category')) return 'Category';
  if (value === '/' || value.split('/').filter(Boolean).length <= 2) return 'Landing Page';
  return 'Page';
}

function queryStatus(row, previous) {
  if (!previous) return 'New';
  const currentClicks = Number(row.clicks || 0);
  const previousClicks = Number(previous.clicks || 0);
  if (currentClicks > previousClicks) return 'Growing';
  if (currentClicks < previousClicks) return 'Declining';
  return 'Stable';
}

function opportunityScore(row) {
  const position = Number(row.position || 0);
  const impressions = Number(row.impressions || 0);
  if (position < 8 || position > 20 || !impressions) return 0;
  return Math.min(100, Math.round((impressions / 100) + (21 - position) * 4));
}

function expectedCtrForPosition(position) {
  const pos = Number(position || 0);
  if (pos <= 1) return 0.28;
  if (pos <= 2) return 0.15;
  if (pos <= 3) return 0.11;
  if (pos <= 5) return 0.07;
  if (pos <= 10) return 0.035;
  return 0.012;
}

function geoDashboardPayload(companyId) {
  const connection = getGoogleConnection(companyId);
  const properties = listSearchConsoleProperties(companyId);
  const selected = getSelectedSearchConsoleProperty(companyId) || properties[0] || null;
  const isConnected = Boolean(connection && connection.status === 'connected');
  const propertyUrl = selected?.site_url || '';
  const countryRows = isConnected ? latestCreatedRows(listGeoCountrySnapshots(companyId, propertyUrl)) : [];
  const queryRows = isConnected ? latestCreatedRows(listGeoQuerySnapshots(companyId, propertyUrl)) : [];
  const dateRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'date')) : [];
  const pageRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'page')) : [];
  const deviceRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'device')) : [];
  const searchAppearanceRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'searchAppearance')) : [];
  const previousQueryRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'query', 'previous')) : [];
  const previousPageRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'page', 'previous')) : [];
  const previousDateRows = isConnected ? latestCreatedRows(listGeoDimensionSnapshots(companyId, propertyUrl, 'date', 'previous')) : [];
  const totals = aggregateRows(dateRows.length ? dateRows : countryRows);
  const previousTotals = aggregateRows(previousDateRows);
  const previousQueryMap = byKey(previousQueryRows);
  const previousPageMap = byKey(previousPageRows);
  const enrichedQueries = queryRows.map((row) => {
    const previous = previousQueryMap.get(String(row.query || '').toLowerCase());
    const clickChange = previous ? Number(row.clicks || 0) - Number(previous.clicks || 0) : Number(row.clicks || 0);
    const impressionChange = previous ? Number(row.impressions || 0) - Number(previous.impressions || 0) : Number(row.impressions || 0);
    const positionChange = previous ? Number(previous.position || 0) - Number(row.position || 0) : null;

    return {
      ...row,
      search_intent: searchIntentForQuery(row.query),
      brand_type: brandTypeForQuery(row.query, getDeveloperCompanyAccess(companyId)?.company_name || ''),
      status: queryStatus(row, previous),
      click_change: clickChange,
      impression_change: impressionChange,
      position_change: positionChange,
      opportunity_score: opportunityScore(row),
      expected_ctr: expectedCtrForPosition(row.position),
      potential_lost_clicks: Math.max(0, Math.round((expectedCtrForPosition(row.position) - Number(row.ctr || 0)) * Number(row.impressions || 0)))
    };
  });
  const enrichedPages = pageRows.map((row) => {
    const previous = previousPageMap.get(String(row.dimension_key || '').toLowerCase());
    const positionChange = previous ? Number(previous.position || 0) - Number(row.position || 0) : null;
    const clickChange = previous ? Number(row.clicks || 0) - Number(previous.clicks || 0) : Number(row.clicks || 0);
    const tags = [];
    if (Number(row.clicks || 0) >= 10) tags.push('Top Performer');
    if (Number(row.ctr || 0) < 0.02 && Number(row.impressions || 0) >= 100) tags.push('Low CTR');
    if (positionChange !== null && positionChange < -2) tags.push('Ranking Drop');
    if (!previous) tags.push('New Page');
    if (!tags.length) tags.push('Needs Optimization');

    return {
      url: row.dimension_key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      indexed_status: 'Requires URL Inspection',
      last_crawled: 'Requires URL Inspection',
      page_type: pageTypeForUrl(row.dimension_key),
      primary_keyword: enrichedQueries.find((query) => query.page === row.dimension_key)?.query || '',
      click_change: clickChange,
      position_change: positionChange,
      tags
    };
  });
  const lowCtr = enrichedQueries
    .filter((row) => Number(row.impressions || 0) >= 50 && Number(row.ctr || 0) < expectedCtrForPosition(row.position))
    .sort((a, b) => b.potential_lost_clicks - a.potential_lost_clicks)
    .slice(0, 12);
  const keywordOpportunities = enrichedQueries
    .filter((row) => Number(row.position || 0) >= 8 && Number(row.position || 0) <= 20)
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 12);
  const winners = enrichedQueries
    .filter((row) => Number(row.click_change || 0) > 0 || Number(row.position_change || 0) > 0)
    .sort((a, b) => Number(b.click_change || 0) - Number(a.click_change || 0))
    .slice(0, 10);
  const losers = enrichedQueries
    .filter((row) => Number(row.click_change || 0) < 0 || Number(row.position_change || 0) < 0)
    .sort((a, b) => Number(a.click_change || 0) - Number(b.click_change || 0))
    .slice(0, 10);
  const rankingDistribution = {
    top3: enrichedQueries.filter((row) => Number(row.position || 0) <= 3).length,
    top10: enrichedQueries.filter((row) => Number(row.position || 0) <= 10).length,
    top20: enrichedQueries.filter((row) => Number(row.position || 0) <= 20).length,
    top50: enrichedQueries.filter((row) => Number(row.position || 0) <= 50).length,
    top100: enrichedQueries.filter((row) => Number(row.position || 0) <= 100).length
  };
  const seoScore = Math.max(0, Math.min(100, Math.round(
    45 +
    (totals.ctr > 0.03 ? 15 : totals.ctr > 0.01 ? 7 : 0) +
    (totals.position && totals.position <= 20 ? 15 : totals.position <= 50 ? 8 : 0) +
    (enrichedQueries.length ? 10 : 0) +
    (countryRows.length ? 10 : 0) +
    (Number(changeValue(totals.clicks, previousTotals.clicks) || 0) > 0 ? 5 : 0)
  )));

  return {
    companyId,
    connected: isConnected,
    connection: connection ? {
      google_email: connection.google_email,
      status: connection.status,
      updated_at: connection.updated_at
    } : null,
    properties,
    selectedProperty: selected,
    summary: {
      countries: countryRows.length,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.ctr,
      position: totals.position,
      lastSyncedAt: countryRows[0]?.created_at || queryRows[0]?.created_at || null,
      dateRange: countryRows[0] ? { startDate: countryRows[0].start_date, endDate: countryRows[0].end_date } : null
    },
    kpis: {
      totalClicks: totals.clicks,
      totalImpressions: totals.impressions,
      averageCtr: totals.ctr,
      averagePosition: totals.position,
      searchQueries: enrichedQueries.length,
      rankingKeywords: enrichedQueries.filter((row) => Number(row.impressions || 0) > 0).length,
      indexedPages: null,
      validPages: null,
      crawledPages: null,
      notIndexedPages: null,
      searchTrafficValue: null,
      newPagesIndexed: null,
      lostIndexedPages: null,
      mobileUsabilityIssues: null,
      coreWebVitalsStatus: 'Requires PageSpeed/CrUX API',
      seoScore
    },
    comparison: {
      clicks: changeValue(totals.clicks, previousTotals.clicks),
      impressions: changeValue(totals.impressions, previousTotals.impressions),
      ctr: changeValue(totals.ctr, previousTotals.ctr),
      position: previousTotals.position ? Number(previousTotals.position) - Number(totals.position || 0) : null
    },
    countries: countryRows.map((row) => ({
      ...row,
      country_label: countryLabel(row.country)
    })),
    queries: enrichedQueries,
    pages: enrichedPages,
    devices: deviceRows,
    searchAppearance: searchAppearanceRows,
    performanceSeries: dateRows.sort((a, b) => String(a.dimension_key).localeCompare(String(b.dimension_key))).map((row) => ({
      date: row.dimension_key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    previousPerformanceSeries: previousDateRows.sort((a, b) => String(a.dimension_key).localeCompare(String(b.dimension_key))).map((row) => ({
      date: row.dimension_key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    opportunities: {
      keywordOpportunities,
      lowCtr,
      winners,
      losers,
      rankingDistribution
    },
    unsupportedMetrics: [
      'Index Coverage',
      'URL Inspection bulk data',
      'Core Web Vitals',
      'Mobile Usability',
      'Crawl Statistics',
      'Manual Actions',
      'Security Issues'
    ]
  };
}

function handleGeo(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) {
    return null;
  }

  if (context.access.role_name === 'Technician') {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  return sendJson(res, {
    ...geoDashboardPayload(context.access.company_id),
    canManage: GEO_MANAGEMENT_ROLES.includes(context.access.role_name)
  });
}

function handleGoogleConnect(req, res) {
  const session = getSession(req);

  if (!session) {
    return redirect(res, `${requestBaseUrl(req)}/app/?auth=required`);
  }

  if (!session.selectedCompanyId) {
    return redirect(res, `${requestBaseUrl(req)}/app/?auth=no-company`);
  }

  const access = session.isDeveloper
    ? getDeveloperCompanyAccess(session.selectedCompanyId)
    : getUserCompanyAccess(session.userId, session.selectedCompanyId);

  if (!access) {
    return redirect(res, `${requestBaseUrl(req)}/app/?auth=access-denied`);
  }

  const context = { session, access };

  if (!GEO_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return sendJson(res, { error: 'Google OAuth is not configured.' }, 500);
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', googleRedirectUri(req));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SEARCH_CONSOLE_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', encodeOAuthState({
    userId: context.session.userId,
    companyId: context.access.company_id,
    returnBaseUrl: requestBaseUrl(req),
    exp: Date.now() + 10 * 60 * 1000
  }));

  return redirect(res, authUrl.toString());
}

async function handleGoogleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = decodeOAuthState(url.searchParams.get('state'));

  if (!code || !state) {
    return redirect(res, '/app/?geo=failed');
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirect(res, appReturnUrl(req, state, 'geo=not-configured'));
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: googleRedirectUri(req)
      })
    });
    const tokenData = await readGoogleJson(tokenResponse, 'Google OAuth token exchange failed.');

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = await readGoogleJson(userInfoResponse, 'Could not fetch Google account.');

    upsertGoogleConnection({
      userId: Number(state.userId),
      companyId: Number(state.companyId),
      googleEmail: userInfo.email || '',
      accessTokenEncrypted: encryptSecret(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : '',
      tokenExpiry: tokenExpiryFromSeconds(tokenData.expires_in),
      status: 'connected'
    });

    try {
      const properties = await fetchSearchConsoleProperties(tokenData.access_token);
      replaceSearchConsoleProperties(Number(state.companyId), properties);

      const selected = bestSearchConsoleProperty(getDeveloperCompanyAccess(Number(state.companyId)), properties);
      if (selected) {
        setSelectedSearchConsoleProperty(Number(state.companyId), selected);
      }
    } catch (propertiesError) {
      console.warn(`Google Search Console properties could not be fetched: ${propertiesError.message}`);
      return redirect(res, appReturnUrl(req, state, `geo=connected-no-properties&reason=${safeGoogleErrorCode(propertiesError)}`));
    }

    return redirect(res, appReturnUrl(req, state, 'geo=connected'));
  } catch (error) {
    logGoogleCallbackIssue(req, error);
    return redirect(res, appReturnUrl(req, state, `geo=failed&reason=${safeGoogleErrorCode(error)}`));
  }
}

async function handleSelectGeoProperty(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) return null;

  if (!GEO_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const body = await readJson(req);
  const propertyUrl = normalize(body.propertyUrl);

  if (!propertyUrl) {
    return sendJson(res, { error: 'Select a Search Console property.' }, 422);
  }

  const property = listSearchConsoleProperties(context.access.company_id).find((item) => item.site_url === propertyUrl);

  if (!property) {
    return sendJson(res, { error: 'Property was not found for this workspace.' }, 404);
  }

  setSelectedSearchConsoleProperty(context.access.company_id, propertyUrl);
  return sendJson(res, geoDashboardPayload(context.access.company_id));
}

async function syncGeoForCompany(companyId) {
  const selected = getSelectedSearchConsoleProperty(companyId);

  if (!selected) {
    return { skipped: true, reason: 'no-selected-property' };
  }

  const accessToken = await googleAccessTokenForCompany(companyId);
  const startDate = dateDaysAgo(30);
  const endDate = dateDaysAgo(2);
  const previousRange = previousDateRange(startDate, endDate);
  const commonBody = { startDate, endDate, rowLimit: 25000 };
  const [
    countryRows,
    queryRows,
    dateRows,
    pageRows,
    deviceRows,
    searchAppearanceRows,
    previousQueryRows,
    previousPageRows,
    previousDateRows
  ] = await Promise.all([
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['country']
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['query', 'country', 'page']
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['date'],
      rowLimit: 5000
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['page']
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['device'],
      rowLimit: 5000
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      ...commonBody,
      dimensions: ['searchAppearance'],
      rowLimit: 5000
    }).catch(() => []),
    searchConsoleQuery(accessToken, selected.site_url, {
      startDate: previousRange.startDate,
      endDate: previousRange.endDate,
      rowLimit: 25000,
      dimensions: ['query']
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      startDate: previousRange.startDate,
      endDate: previousRange.endDate,
      rowLimit: 25000,
      dimensions: ['page']
    }),
    searchConsoleQuery(accessToken, selected.site_url, {
      startDate: previousRange.startDate,
      endDate: previousRange.endDate,
      rowLimit: 5000,
      dimensions: ['date']
    })
  ]);

  clearGeoSnapshots(companyId, selected.site_url);

  replaceGeoSnapshots({
    companyId,
    propertyUrl: selected.site_url,
    startDate,
    endDate,
    countryRows: countryRows.map((row) => ({
      country: row.keys?.[0] || 'Unknown',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    queryRows: queryRows.map((row) => ({
      query: row.keys?.[0] || '',
      country: row.keys?.[1] || '',
      page: row.keys?.[2] || '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position
    })),
    dimensionRows: [
      ...dateRows.map((row) => dimensionRow('date', row)),
      ...pageRows.map((row) => dimensionRow('page', row)),
      ...deviceRows.map((row) => dimensionRow('device', row)),
      ...searchAppearanceRows.map((row) => dimensionRow('searchAppearance', row)),
      ...queryRows.map((row) => dimensionRow('queryDetail', row))
    ]
  });

  replaceGeoSnapshots({
    companyId,
    propertyUrl: selected.site_url,
    startDate: previousRange.startDate,
    endDate: previousRange.endDate,
    countryRows: [],
    queryRows: [],
    dimensionRows: [
      ...previousDateRows.map((row) => dimensionRow('date', row)),
      ...previousQueryRows.map((row) => dimensionRow('query', row)),
      ...previousPageRows.map((row) => dimensionRow('page', row))
    ],
    periodLabel: 'previous'
  });

  return {
    skipped: false,
    propertyUrl: selected.site_url,
    countryRows: countryRows.length,
    queryRows: queryRows.length,
    dateRows: dateRows.length
  };
}

async function handleSyncGeo(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) return null;

  if (!GEO_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const selected = getSelectedSearchConsoleProperty(context.access.company_id);

  if (!selected) {
    return sendJson(res, { error: 'Select a Search Console property before syncing.' }, 409);
  }

  try {
    await syncGeoForCompany(context.access.company_id);

    return sendJson(res, geoDashboardPayload(context.access.company_id));
  } catch (error) {
    return sendJson(res, { error: error.message || 'Search Console sync failed.' }, 500);
  }
}

async function handleDisconnectGeo(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) return null;

  if (!GEO_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  disconnectGoogleConnection(context.access.company_id);
  return sendJson(res, geoDashboardPayload(context.access.company_id));
}

async function handleClearGeoData(req, res) {
  const context = requireSelectedCompany(req, res);

  if (!context) return null;

  if (!GEO_MANAGEMENT_ROLES.includes(context.access.role_name)) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  const selected = getSelectedSearchConsoleProperty(context.access.company_id);
  clearGeoSnapshots(context.access.company_id, selected?.site_url || '');
  return sendJson(res, geoDashboardPayload(context.access.company_id));
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
  updateSession(req, res, payload);
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
    const payload = aiErrorResponse(error, 'AI business analysis failed. Please retry.');
    if (analysisId) failBusinessAnalysis(analysisId, payload.error, 'gemini');
    console.error(error);
    return sendJson(res, payload, 500);
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
    return sendJson(res, aiErrorResponse(error, 'Competitor discovery failed. Please retry.'), 500);
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
    return sendJson(res, aiErrorResponse(error, 'Prompt generation failed. Please retry.'), 500);
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
    return sendJson(res, aiErrorResponse(error, 'AI visibility checks failed. Please retry.'), 500);
  }
}

async function refreshPromptChecksForCompany(companyId) {
  const access = getDeveloperCompanyAccess(companyId);
  const analysis = getLatestCompletedBusinessAnalysis(companyId);
  const competitors = listCompanyCompetitors(companyId);
  const prompts = listCompanyPrompts(companyId).filter((prompt) => prompt.status === 'active');

  if (!access || !analysis || !competitors.length || !prompts.length) {
    return { skipped: true, reason: 'missing-analysis-competitors-or-prompts' };
  }

  const visibilityResults = await AIService.analyzePromptVisibility(access, prompts, competitors, analysis);
  updatePromptVisibility(companyId, visibilityResults);

  return {
    skipped: false,
    checkedPrompts: visibilityResults.length,
    provider: 'gemini'
  };
}

function isAuthorizedCronRequest(req) {
  const cronSecret = process.env.CRON_SECRET || process.env.HUMMINGBIRD_CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authorization = String(req.headers.authorization || '');
  const headerSecret = String(req.headers['x-cron-secret'] || '');

  return authorization === `Bearer ${cronSecret}` || headerSecret === cronSecret;
}

async function handleDailyRefresh(req, res) {
  if (!isAuthorizedCronRequest(req)) {
    return sendJson(res, { error: 'Unauthorized cron request' }, 401);
  }

  const startedAt = new Date().toISOString();
  const companies = listActiveCompanies();
  const results = [];

  for (const company of companies) {
    const item = {
      company_id: company.company_id,
      company_name: company.company_name,
      geo: null,
      prompts: null
    };

    try {
      const connection = getGoogleConnection(company.company_id);
      const selectedProperty = getSelectedSearchConsoleProperty(company.company_id);

      if (connection?.status === 'connected' && selectedProperty) {
        item.geo = await syncGeoForCompany(company.company_id);
      } else {
        item.geo = { skipped: true, reason: 'search-console-not-connected' };
      }
    } catch (error) {
      item.geo = { skipped: true, error: error.safeMessage || error.message || 'GEO refresh failed' };
    }

    try {
      item.prompts = await refreshPromptChecksForCompany(company.company_id);
    } catch (error) {
      item.prompts = { skipped: true, error: error.safeMessage || error.message || 'Prompt refresh failed' };
    }

    results.push(item);
  }

  return sendJson(res, {
    ok: true,
    refresh_type: 'daily',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    companies: results.length,
    results
  });
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
    const payload = aiErrorResponse(error, 'AI setup generation failed. Please retry.');

    if (analysisId) {
      failBusinessAnalysis(analysisId, payload.error, 'gemini');
    }

    console.error(error);
    return sendJson(res, payload, 500);
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
    return sendJson(res, { error: 'Hummingbird AI could not generate the AEO action plan. Please retry.' }, 500);
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
    assignableRoles: getAssignableUserRoles(context.access.role_name),
    statuses: COMPANY_ACCESS_STATUSES,
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

function handleDeveloperAiDiagnostics(req, res) {
  const session = requireSession(req, res);

  if (!session) {
    return null;
  }

  if (!session.isDeveloper) {
    return sendJson(res, { error: 'Access denied' }, 403);
  }

  return sendJson(res, AIService.getProviderDiagnostics ? AIService.getProviderDiagnostics() : {
    provider: 'Hummingbird AI',
    error: 'Diagnostics unavailable'
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

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/cron/daily-refresh') {
      return handleDailyRefresh(req, res);
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

    if (req.method === 'GET' && url.pathname === '/api/geo') {
      return handleGeo(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/google/connect') {
      return handleGoogleConnect(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/api/google/callback') {
      return handleGoogleCallback(req, res, url);
    }

    if (req.method === 'POST' && url.pathname === '/api/geo/select-property') {
      return handleSelectGeoProperty(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/geo/sync') {
      return handleSyncGeo(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/geo/disconnect') {
      return handleDisconnectGeo(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/api/geo/clear') {
      return handleClearGeoData(req, res);
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

    if (req.method === 'GET' && url.pathname === '/api/developer/ai-diagnostics') {
      return handleDeveloperAiDiagnostics(req, res);
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

    if (req.method === 'GET') {
      const served = serveFrontend(req, res, url);
      if (served) return served;
    }

    return notFound(res);
  } catch (error) {
    if (error.message === 'Invalid JSON body') {
      return sendJson(res, { error: 'Invalid JSON body' }, 400);
    }

    console.error(`API error on ${req.method} ${url.pathname}:`, error);
    return sendJson(res, { error: 'Internal server error', ...safeErrorDetail(error) }, 500);
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
