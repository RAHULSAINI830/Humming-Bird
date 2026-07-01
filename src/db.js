const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('./auth');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');

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

const usePostgres = Boolean(process.env.DATABASE_URL);
const { DatabaseSync } = usePostgres ? require('./postgres-sync') : require('node:sqlite');
const isVercel = process.env.VERCEL === '1';
const dataDir = isVercel ? '/tmp' : path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'rango.sqlite');
const bundledSeedDbPath = path.join(__dirname, '..', 'data', 'rango.sqlite');

if (!isVercel && !usePostgres) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!usePostgres && isVercel && !fs.existsSync(dbPath) && fs.existsSync(bundledSeedDbPath)) {
  try {
    fs.copyFileSync(bundledSeedDbPath, dbPath);
    fs.chmodSync(dbPath, 0o600);
    console.log('Hummingbird production database initialized from bundled SQLite seed.');
  } catch (error) {
    console.warn(`Could not initialize production database from bundled seed: ${error.message}`);
  }
}

try {
  if (!usePostgres && !isVercel) {
    fs.chmodSync(dataDir, 0o755);
  }

  if (!usePostgres && fs.existsSync(dbPath)) {
    fs.chmodSync(dbPath, 0o644);
  }
} catch (error) {
  console.warn(`Could not verify database write permissions: ${error.message}`);
}

const db = new DatabaseSync(dbPath);
if (!usePostgres) {
  db.exec('PRAGMA foreign_keys = ON;');
}

function migrate() {
  db.exec(`
    DROP TABLE IF EXISTS ai_provider_settings;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      website_url TEXT,
      logo_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS user_company_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, company_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_user_company_access_user_id
      ON user_company_access(user_id);

    CREATE INDEX IF NOT EXISTS idx_user_company_access_company_id
      ON user_company_access(company_id);

    CREATE INDEX IF NOT EXISTS idx_users_email
      ON users(email);

    CREATE INDEX IF NOT EXISTS idx_user_company_access_role_id
      ON user_company_access(role_id);

    CREATE TABLE IF NOT EXISTS business_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      business_summary TEXT,
      detected_industry TEXT,
      detected_services TEXT,
      target_audience_summary TEXT,
      service_area_summary TEXT,
      positioning_summary TEXT,
      industry TEXT,
      service_area TEXT,
      target_country TEXT,
      main_services TEXT,
      known_competitors TEXT,
      brand_description TEXT,
      target_audience TEXT,
      analysis_status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      source_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_business_analyses_company_id
      ON business_analyses(company_id);

    CREATE INDEX IF NOT EXISTS idx_business_analyses_status
      ON business_analyses(analysis_status);

    CREATE TABLE IF NOT EXISTS company_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      prompt_order INTEGER NOT NULL,
      prompt_text TEXT NOT NULL,
      prompt_category TEXT,
      prompt_intent TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source_type TEXT,
      brand_mentioned INTEGER NOT NULL DEFAULT 0,
      brand_mention_context TEXT,
      competitor_mentions TEXT,
      recommended_citations TEXT,
      ai_response_summary TEXT,
      chatgpt_response_summary TEXT,
      claude_response_summary TEXT,
      perplexity_response_summary TEXT,
      gemini_response_summary TEXT,
      visibility_status TEXT NOT NULL DEFAULT 'not_checked',
      last_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_company_prompts_company_id
      ON company_prompts(company_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_company_prompts_company_order
      ON company_prompts(company_id, prompt_order);

    CREATE TABLE IF NOT EXISTS company_competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      competitor_name TEXT NOT NULL,
      website_url TEXT,
      notes TEXT,
      source_type TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_company_competitors_company_id
      ON company_competitors(company_id);

    CREATE TABLE IF NOT EXISTS aeo_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      recommendation_status TEXT NOT NULL DEFAULT 'completed',
      source_type TEXT,
      focus_summary TEXT,
      priorities_json TEXT,
      action_plan_json TEXT,
      content_opportunities_json TEXT,
      evidence_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_aeo_recommendations_company_id
      ON aeo_recommendations(company_id);

    CREATE TABLE IF NOT EXISTS google_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL UNIQUE,
      google_email TEXT,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      token_expiry TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_google_connections_company_id
      ON google_connections(company_id);

    CREATE TABLE IF NOT EXISTS search_console_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      site_url TEXT NOT NULL,
      permission_level TEXT,
      selected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, site_url),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_search_console_properties_company_id
      ON search_console_properties(company_id);

    CREATE TABLE IF NOT EXISTS geo_search_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_url TEXT NOT NULL,
      country TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_geo_search_snapshots_company_date
      ON geo_search_snapshots(company_id, start_date, end_date);

    CREATE TABLE IF NOT EXISTS geo_query_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_url TEXT NOT NULL,
      query TEXT,
      country TEXT,
      page TEXT,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_geo_query_snapshots_company_date
      ON geo_query_snapshots(company_id, start_date, end_date);

    CREATE TABLE IF NOT EXISTS geo_dimension_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      property_url TEXT NOT NULL,
      dimension_type TEXT NOT NULL,
      dimension_key TEXT,
      dimension_key_2 TEXT,
      dimension_key_3 TEXT,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      period_label TEXT NOT NULL DEFAULT 'current',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_geo_dimension_snapshots_company_type
      ON geo_dimension_snapshots(company_id, property_url, dimension_type, period_label);

  `);

  const promptColumns = db
    .prepare('PRAGMA table_info(company_prompts)')
    .all()
    .map((column) => column.name);

  [
    ['brand_mentioned', 'INTEGER NOT NULL DEFAULT 0'],
    ['brand_mention_context', 'TEXT'],
    ['competitor_mentions', 'TEXT'],
    ['recommended_citations', 'TEXT'],
    ['ai_response_summary', 'TEXT'],
    ['chatgpt_response_summary', "TEXT DEFAULT 'NA'"],
    ['claude_response_summary', "TEXT DEFAULT 'NA'"],
    ['perplexity_response_summary', "TEXT DEFAULT 'NA'"],
    ['gemini_response_summary', "TEXT DEFAULT 'NA'"],
    ['visibility_status', "TEXT NOT NULL DEFAULT 'not_checked'"],
    ['last_checked_at', 'TEXT']
  ].forEach(([columnName, columnType]) => {
    if (!promptColumns.includes(columnName)) {
      db.exec(`ALTER TABLE company_prompts ADD COLUMN ${columnName} ${columnType};`);
    }
  });

  const analysisColumns = db
    .prepare('PRAGMA table_info(business_analyses)')
    .all()
    .map((column) => column.name);

  [
    ['error_message', 'TEXT'],
    ['source_type', 'TEXT'],
    ['industry', 'TEXT'],
    ['service_area', 'TEXT'],
    ['target_country', 'TEXT'],
    ['main_services', 'TEXT'],
    ['known_competitors', 'TEXT'],
    ['brand_description', 'TEXT'],
    ['target_audience', 'TEXT']
  ].forEach(([columnName, columnType]) => {
    if (!analysisColumns.includes(columnName)) {
      db.exec(`ALTER TABLE business_analyses ADD COLUMN ${columnName} ${columnType};`);
    }
  });

  const companyColumns = db
    .prepare('PRAGMA table_info(companies)')
    .all()
    .map((column) => column.name);

  [
    ['industry', 'TEXT'],
    ['service_area', 'TEXT'],
    ['target_country', 'TEXT'],
    ['main_services', 'TEXT'],
    ['known_competitors', 'TEXT'],
    ['brand_description', 'TEXT'],
    ['target_audience', 'TEXT'],
    ['onboarding_completed', 'INTEGER DEFAULT 0'],
    ['onboarding_completed_at', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'active'"]
  ].forEach(([columnName, columnType]) => {
    if (!companyColumns.includes(columnName)) {
      db.exec(`ALTER TABLE companies ADD COLUMN ${columnName} ${columnType};`);
    }
  });
}

function seedRoles() {
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (role_name, description)
    VALUES (?, ?)
  `);

  [
    ['Developer', 'Can build and maintain the product.'],
    ['Super Admin', 'Full platform administration access.'],
    ['Business Owner', 'Owns business-level settings and decisions.'],
    ['Marketing Manager', 'Manages marketing workflows and reports.'],
    ['Operations Manager', 'Manages operations workflows and teams.'],
    ['Branch Manager', 'Manages branch-level operations.'],
    ['Technician', 'Handles service execution and field tasks.'],
    ['Read-Only Analyst', 'Can view reports and data without making changes.']
  ].forEach(([roleName, description]) => insertRole.run(roleName, description));
}

function seedDemoData() {
  // Demo seed data has been removed. Real users now come from signup,
  // developer-created companies, or explicit company user management.
}

function cleanupDemoData() {
  const demoEmails = [
    'owner@rango.test',
    'tech@rango.test',
    'inactive@rango.test',
    'analyst@rango.test'
  ];
  const placeholders = demoEmails.map(() => '?').join(', ');

  db.prepare(`
    DELETE FROM user_company_access
    WHERE user_id IN (
      SELECT id FROM users WHERE email IN (${placeholders})
    )
  `).run(...demoEmails);

  db.prepare(`DELETE FROM users WHERE email IN (${placeholders})`).run(...demoEmails);

  db.prepare(`
    DELETE FROM companies
    WHERE website_url IN ('https://acme.example', 'https://northstar.example')
      AND id NOT IN (SELECT DISTINCT company_id FROM user_company_access)
  `).run();
}

function initDatabase() {
  migrate();
  seedRoles();
  seedDemoData();
  cleanupDemoData();
  normalizeInternalDeveloperWorkspace();
  seedDefaultDeveloper();
}

function normalizeInternalDeveloperWorkspace() {
  db.prepare(`
    UPDATE companies
    SET
      company_name = 'Hummingbird Internal',
      website_url = 'https://hummingbird.local',
      brand_description = 'Internal Hummingbird developer workspace.',
      target_audience = 'Hummingbird internal team',
      updated_at = CURRENT_TIMESTAMP
    WHERE company_name = 'Rango Internal'
  `).run();
}

function seedDefaultDeveloper() {
  const developerCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_company_access uca
    JOIN roles r ON r.id = uca.role_id
    WHERE r.role_name = 'Developer'
  `).get().count;

  if (developerCount > 0) {
    return;
  }

  const password = process.env.HUMMINGBIRD_DEVELOPER_PASSWORD || process.env.RANGO_DEVELOPER_PASSWORD;

  if (!password) {
    console.warn('HUMMINGBIRD_DEVELOPER_PASSWORD is not set. Default Developer user was not created.');
    return;
  }

  const developerRole = getRoleByName('Developer');

  if (!developerRole) {
    console.warn('Developer role is missing. Default Developer user was not created.');
    return;
  }

  try {
    db.exec('BEGIN');

    let user = getUserByEmail('sainirahul1009@gmail.com');

    if (!user) {
      const result = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, status)
        VALUES (?, ?, ?, 'active')
      `).run('Rahul Saini', 'sainirahul1009@gmail.com', hashPassword(password));
      user = { id: Number(result.lastInsertRowid) };
    }

    let company = db.prepare('SELECT id FROM companies WHERE company_name = ?').get('Hummingbird Internal');

    if (!company) {
      company = db.prepare('SELECT id FROM companies WHERE company_name = ?').get('Rango Internal');
    }

    if (!company) {
      const result = db.prepare(`
        INSERT INTO companies (
          company_name,
          website_url,
          logo_url,
          industry,
          service_area,
          target_country,
          main_services,
          known_competitors,
          brand_description,
          target_audience,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        'Hummingbird Internal',
        'https://hummingbird.local',
        '',
        'SaaS',
        'Global',
        'United States',
        'Platform administration',
        '',
        'Internal Hummingbird developer workspace.',
        'Hummingbird internal team'
      );
      company = { id: Number(result.lastInsertRowid) };
    } else {
      db.prepare(`
        UPDATE companies
        SET
          company_name = ?,
          website_url = ?,
          brand_description = ?,
          target_audience = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        'Hummingbird Internal',
        'https://hummingbird.local',
        'Internal Hummingbird developer workspace.',
        'Hummingbird internal team',
        company.id
      );
    }

    db.prepare(`
      INSERT OR IGNORE INTO user_company_access (user_id, company_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(user.id, company.id, developerRole.id);

    db.exec('COMMIT');
    console.log('Default Developer user created from HUMMINGBIRD_DEVELOPER_PASSWORD.');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
}

function getUserById(id) {
  return db
    .prepare('SELECT id, full_name, email, status, created_at, updated_at FROM users WHERE id = ?')
    .get(id);
}

function getUserCompanies(userId) {
  return db.prepare(`
    SELECT
      uca.id AS access_id,
      uca.status AS access_status,
      c.id AS company_id,
      c.company_name,
      c.website_url,
      c.logo_url,
      r.id AS role_id,
      r.role_name
    FROM user_company_access uca
    JOIN companies c ON c.id = uca.company_id
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.user_id = ?
      AND uca.status = 'active'
      AND c.status = 'active'
    ORDER BY c.company_name ASC
  `).all(userId);
}

function userHasRole(userId, roleName) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM user_company_access uca
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.user_id = ?
      AND r.role_name = ?
      AND uca.status = 'active'
    LIMIT 1
  `).get(userId, roleName));
}

function getAllCompaniesForWorkspace() {
  return db.prepare(`
    SELECT
      id AS company_id,
      company_name,
      website_url,
      logo_url,
      status,
      'Developer' AS role_name,
      (SELECT id FROM roles WHERE role_name = 'Developer') AS role_id
    FROM companies
    ORDER BY company_name ASC
  `).all();
}

function listActiveCompanies() {
  return db.prepare(`
    SELECT
      id AS company_id,
      company_name,
      website_url,
      logo_url,
      industry,
      service_area,
      target_country,
      main_services,
      known_competitors,
      brand_description,
      target_audience,
      onboarding_completed,
      onboarding_completed_at,
      status
    FROM companies
    WHERE status = 'active'
    ORDER BY id ASC
  `).all();
}

function getDeveloperCompanyAccess(companyId) {
  return db.prepare(`
    SELECT
      c.id AS company_id,
      c.company_name,
      c.website_url,
      c.logo_url,
      c.industry,
      c.service_area,
      c.target_country,
      c.main_services,
      c.known_competitors,
      c.brand_description,
      c.target_audience,
      c.onboarding_completed,
      c.onboarding_completed_at,
      c.status,
      r.id AS role_id,
      r.role_name
    FROM companies c
    JOIN roles r ON r.role_name = 'Developer'
    WHERE c.id = ?
  `).get(companyId);
}

function getUserCompanyAccess(userId, companyId) {
  return db.prepare(`
    SELECT
      c.id AS company_id,
      c.company_name,
      c.website_url,
      c.logo_url,
      c.industry,
      c.service_area,
      c.target_country,
      c.main_services,
      c.known_competitors,
      c.brand_description,
      c.target_audience,
      c.onboarding_completed,
      c.onboarding_completed_at,
      c.status,
      r.id AS role_id,
      r.role_name
    FROM user_company_access uca
    JOIN companies c ON c.id = uca.company_id
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.user_id = ?
      AND uca.company_id = ?
      AND uca.status = 'active'
      AND c.status = 'active'
  `).get(userId, companyId);
}

function getRoleByName(roleName) {
  return db.prepare('SELECT id, role_name FROM roles WHERE role_name = ?').get(roleName);
}

function listCompanyUsers(companyId) {
  return db.prepare(`
    SELECT
      uca.id AS access_id,
      uca.status AS access_status,
      uca.created_at AS added_date,
      u.id AS user_id,
      u.full_name,
      u.email,
      u.status AS user_status,
      r.id AS role_id,
      r.role_name
    FROM user_company_access uca
    JOIN users u ON u.id = uca.user_id
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.company_id = ?
    ORDER BY
      CASE WHEN r.role_name = 'Business Owner' THEN 0 ELSE 1 END,
      u.full_name ASC
  `).all(companyId);
}

function getCompanyUserAccess(companyId, userId) {
  return db.prepare(`
    SELECT
      uca.id AS access_id,
      uca.status AS access_status,
      uca.created_at AS added_date,
      u.id AS user_id,
      u.full_name,
      u.email,
      r.id AS role_id,
      r.role_name
    FROM user_company_access uca
    JOIN users u ON u.id = uca.user_id
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.company_id = ?
      AND uca.user_id = ?
  `).get(companyId, userId);
}

function countCompanyBusinessOwners(companyId) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_company_access uca
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.company_id = ?
      AND r.role_name = 'Business Owner'
  `).get(companyId).count;
}

function createOrAddCompanyUser({ fullName, email, passwordHash, roleName, status, companyId }) {
  const role = getRoleByName(roleName);

  if (!role) {
    throw new Error('Selected role does not exist.');
  }

  try {
    db.exec('BEGIN');

    let user = getUserByEmail(email);

    if (!user) {
      const userResult = db.prepare(`
        INSERT INTO users (full_name, email, password_hash, status)
        VALUES (?, ?, ?, 'active')
      `).run(fullName, email, passwordHash);

      user = {
        id: Number(userResult.lastInsertRowid),
        full_name: fullName,
        email,
        status: 'active'
      };
    }

    const existingAccess = db.prepare(`
      SELECT id FROM user_company_access
      WHERE user_id = ?
        AND company_id = ?
    `).get(user.id, companyId);

    if (existingAccess) {
      throw new Error('DUPLICATE_COMPANY_ACCESS');
    }

    db.prepare(`
      INSERT INTO user_company_access (user_id, company_id, role_id, status)
      VALUES (?, ?, ?, ?)
    `).run(user.id, companyId, role.id, status);

    db.exec('COMMIT');

    return user;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function addExistingUserCompanyAccess({ userId, companyId, roleName, status }) {
  const role = getRoleByName(roleName);

  if (!role) {
    throw new Error('Selected role does not exist.');
  }

  const existingAccess = db.prepare(`
    SELECT id FROM user_company_access
    WHERE user_id = ?
      AND company_id = ?
  `).get(userId, companyId);

  if (existingAccess) {
    throw new Error('DUPLICATE_COMPANY_ACCESS');
  }

  return db.prepare(`
    INSERT INTO user_company_access (user_id, company_id, role_id, status)
    VALUES (?, ?, ?, ?)
  `).run(userId, companyId, role.id, status);
}

function updateCompanyUserAccess({ companyId, userId, roleName, status }) {
  const role = getRoleByName(roleName);

  if (!role) {
    throw new Error('Selected role does not exist.');
  }

  return db.prepare(`
    UPDATE user_company_access
    SET role_id = ?,
        status = ?
    WHERE company_id = ?
      AND user_id = ?
  `).run(role.id, status, companyId, userId);
}

function removeCompanyUserAccess(companyId, userId) {
  return db.prepare(`
    DELETE FROM user_company_access
    WHERE company_id = ?
      AND user_id = ?
  `).run(companyId, userId);
}

function getAccessRecordById(accessId) {
  return db.prepare(`
    SELECT
      uca.id AS access_id,
      uca.user_id,
      uca.company_id,
      uca.status,
      r.role_name
    FROM user_company_access uca
    JOIN roles r ON r.id = uca.role_id
    WHERE uca.id = ?
  `).get(accessId);
}

function updateAccessRecordById({ accessId, roleName, status }) {
  const role = getRoleByName(roleName);

  if (!role) {
    throw new Error('Selected role does not exist.');
  }

  return db.prepare(`
    UPDATE user_company_access
    SET role_id = ?,
        status = ?
    WHERE id = ?
  `).run(role.id, status, accessId);
}

function removeAccessRecordById(accessId) {
  return db.prepare('DELETE FROM user_company_access WHERE id = ?').run(accessId);
}

function listAllCompaniesForDeveloper() {
  return db.prepare(`
    SELECT
      c.id AS company_id,
      c.company_name,
      c.website_url,
      c.industry,
      c.onboarding_completed,
      c.created_at,
      c.status,
      COUNT(uca.id) AS users_count
    FROM companies c
    LEFT JOIN user_company_access uca ON uca.company_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
}

function listAllUsersForDeveloper() {
  return db.prepare(`
    SELECT
      u.id AS user_id,
      u.full_name,
      u.email,
      u.status AS global_status,
      u.created_at,
      COUNT(uca.id) AS companies_access,
      COALESCE(group_concat(DISTINCT r.role_name), '') AS roles
    FROM users u
    LEFT JOIN user_company_access uca ON uca.user_id = u.id
    LEFT JOIN roles r ON r.id = uca.role_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
}

function listWorkspaceAccessForDeveloper() {
  return db.prepare(`
    SELECT
      uca.id AS access_id,
      u.full_name,
      u.email,
      c.company_name,
      r.role_name,
      uca.status,
      uca.created_at
    FROM user_company_access uca
    JOIN users u ON u.id = uca.user_id
    JOIN companies c ON c.id = uca.company_id
    JOIN roles r ON r.id = uca.role_id
    ORDER BY uca.created_at DESC
  `).all();
}

function getPlatformStats() {
  return {
    companies: db.prepare('SELECT COUNT(*) AS count FROM companies').get().count,
    activeCompanies: db.prepare("SELECT COUNT(*) AS count FROM companies WHERE status = 'active'").get().count,
    users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
    accessRecords: db.prepare('SELECT COUNT(*) AS count FROM user_company_access').get().count
  };
}

function createCompanyForDeveloper(company) {
  return db.prepare(`
    INSERT INTO companies (
      company_name,
      website_url,
      logo_url,
      industry,
      service_area,
      target_country,
      main_services,
      known_competitors,
      brand_description,
      target_audience,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    company.company_name,
    company.website_url,
    company.logo_url,
    company.industry,
    company.service_area,
    company.target_country,
    company.main_services,
    company.known_competitors,
    company.brand_description,
    company.target_audience,
    company.status
  );
}

function setCompanyStatus(companyId, status) {
  return db.prepare(`
    UPDATE companies
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, companyId);
}

function deleteCompany(companyId) {
  return db.prepare('DELETE FROM companies WHERE id = ?').run(companyId);
}

function setUserStatus(userId, status) {
  return db.prepare(`
    UPDATE users
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, userId);
}

function createBusinessAnalysis(companyId) {
  const result = db.prepare(`
    INSERT INTO business_analyses (company_id, analysis_status, source_type)
    VALUES (?, 'in_progress', 'gemini')
  `).run(companyId);

  return Number(result.lastInsertRowid);
}

function createCompanyForBusinessOwner(userId, company) {
  const businessOwnerRole = getRoleByName('Business Owner');

  if (!businessOwnerRole) {
    throw new Error('Business Owner role is missing.');
  }

  try {
    db.exec('BEGIN');

    const companyResult = db.prepare(`
      INSERT INTO companies (
        company_name,
        website_url,
        logo_url,
        industry,
        service_area,
        target_country,
        main_services,
        known_competitors,
        brand_description,
        target_audience
      )
      VALUES (?, ?, ?, '', '', '', '', '', '', '')
    `).run(
      company.company_name,
      company.website_url,
      company.logo_url
    );

    db.prepare(`
      INSERT INTO user_company_access (user_id, company_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(userId, companyResult.lastInsertRowid, businessOwnerRole.id);

    db.exec('COMMIT');

    return Number(companyResult.lastInsertRowid);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function completeBusinessAnalysis(analysisId, analysis) {
  db.prepare(`
    UPDATE business_analyses
    SET
      business_summary = ?,
      detected_industry = ?,
      detected_services = ?,
      target_audience_summary = ?,
      service_area_summary = ?,
      positioning_summary = ?,
      industry = ?,
      service_area = ?,
      target_country = ?,
      main_services = ?,
      known_competitors = ?,
      brand_description = ?,
      target_audience = ?,
      analysis_status = 'completed',
      error_message = NULL,
      source_type = 'gemini',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    analysis.business_summary,
    analysis.detected_industry,
    analysis.detected_services,
    analysis.target_audience_summary,
    analysis.service_area_summary,
    analysis.positioning_summary,
    analysis.industry,
    analysis.service_area,
    analysis.target_country,
    analysis.main_services,
    analysis.known_competitors,
    analysis.brand_description,
    analysis.target_audience,
    analysisId
  );
}

function updateCompanyGeneratedProfile(companyId, analysis) {
  return db.prepare(`
    UPDATE companies
    SET
      industry = ?,
      service_area = ?,
      target_country = ?,
      main_services = ?,
      known_competitors = ?,
      brand_description = ?,
      target_audience = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    analysis.industry,
    analysis.service_area,
    analysis.target_country,
    analysis.main_services,
    analysis.known_competitors,
    analysis.brand_description,
    analysis.target_audience,
    companyId
  );
}

function failBusinessAnalysis(analysisId, errorMessage, sourceType = 'gemini') {
  return db.prepare(`
    UPDATE business_analyses
    SET
      analysis_status = 'failed',
      error_message = ?,
      source_type = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(errorMessage, sourceType, analysisId);
}

function getLatestBusinessAnalysis(companyId) {
  return db.prepare(`
    SELECT *
    FROM business_analyses
    WHERE company_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(companyId);
}

function getLatestCompletedBusinessAnalysis(companyId) {
  return db.prepare(`
    SELECT *
    FROM business_analyses
    WHERE company_id = ?
      AND analysis_status = 'completed'
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(companyId);
}

function getBusinessAnalysisById(companyId, analysisId) {
  return db.prepare(`
    SELECT *
    FROM business_analyses
    WHERE company_id = ?
      AND id = ?
    LIMIT 1
  `).get(companyId, analysisId);
}

function listBusinessAnalyses(companyId) {
  return db.prepare(`
    SELECT *
    FROM business_analyses
    WHERE company_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
  `).all(companyId);
}

function createAeoRecommendation(companyId, recommendation, sourceType = 'gemini') {
  const serialize = (value) => JSON.stringify(Array.isArray(value) ? value : []);

  return db.prepare(`
    INSERT INTO aeo_recommendations (
      company_id,
      recommendation_status,
      source_type,
      focus_summary,
      priorities_json,
      action_plan_json,
      content_opportunities_json,
      evidence_json
    )
    VALUES (?, 'completed', ?, ?, ?, ?, ?, ?)
  `).run(
    companyId,
    sourceType,
    recommendation.focus_summary || '',
    serialize(recommendation.priorities),
    serialize(recommendation.action_plan),
    serialize(recommendation.content_opportunities),
    serialize(recommendation.evidence)
  );
}

function getLatestAeoRecommendation(companyId) {
  return db.prepare(`
    SELECT *
    FROM aeo_recommendations
    WHERE company_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(companyId);
}

function listAeoRecommendations(companyId) {
  return db.prepare(`
    SELECT *
    FROM aeo_recommendations
    WHERE company_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
  `).all(companyId);
}

function listCompanyPrompts(companyId) {
  return db.prepare(`
    SELECT *
    FROM company_prompts
    WHERE company_id = ?
    ORDER BY prompt_order ASC, id ASC
  `).all(companyId);
}

function getCompanyPromptById(companyId, promptId) {
  return db.prepare(`
    SELECT *
    FROM company_prompts
    WHERE company_id = ?
      AND id = ?
    LIMIT 1
  `).get(companyId, promptId);
}

function nextPromptOrder(companyId) {
  const row = db.prepare(`
    SELECT COALESCE(MAX(prompt_order), 0) + 1 AS next_order
    FROM company_prompts
    WHERE company_id = ?
  `).get(companyId);

  return Number(row?.next_order || 1);
}

function addCompanyPrompt({ companyId, promptText, promptCategory = 'Manual', promptIntent = 'Manual tracking', sourceType = 'manual' }) {
  return db.prepare(`
    INSERT INTO company_prompts (
      company_id,
      prompt_order,
      prompt_text,
      prompt_category,
      prompt_intent,
      status,
      source_type,
      chatgpt_response_summary,
      claude_response_summary,
      perplexity_response_summary,
      gemini_response_summary
    )
    VALUES (?, ?, ?, ?, ?, 'active', ?, 'NA', 'NA', 'NA', 'NA')
  `).run(
    companyId,
    nextPromptOrder(companyId),
    promptText,
    promptCategory,
    promptIntent,
    sourceType
  );
}

function removeCompanyPrompt(companyId, promptId) {
  return db.prepare(`
    DELETE FROM company_prompts
    WHERE company_id = ?
      AND id = ?
  `).run(companyId, promptId);
}

function replaceCompanyPrompts(companyId, prompts, sourceType = 'gemini') {
  const deleteExisting = db.prepare(`
    DELETE FROM company_prompts
    WHERE company_id = ?
      AND source_type != 'manual'
  `);
  const insertPrompt = db.prepare(`
    INSERT INTO company_prompts (
      company_id,
      prompt_order,
      prompt_text,
      prompt_category,
      prompt_intent,
      status,
      source_type
    )
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `);

  try {
    db.exec('BEGIN');
    deleteExisting.run(companyId);
    const firstOrder = nextPromptOrder(companyId);

    prompts.forEach((prompt, index) => {
      insertPrompt.run(
        companyId,
        firstOrder + index,
        prompt.prompt_text,
        prompt.prompt_category || '',
        prompt.prompt_intent || '',
        sourceType
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function listCompanyCompetitors(companyId) {
  return db.prepare(`
    SELECT *
    FROM company_competitors
    WHERE company_id = ?
      AND status = 'active'
    ORDER BY competitor_name ASC, id ASC
  `).all(companyId);
}

function addCompanyCompetitor({ companyId, competitorName, websiteUrl = '', notes = '', sourceType = 'manual' }) {
  return db.prepare(`
    INSERT INTO company_competitors (
      company_id,
      competitor_name,
      website_url,
      notes,
      source_type,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(companyId, competitorName, websiteUrl, notes, sourceType);
}

function removeCompanyCompetitor(companyId, competitorId) {
  return db.prepare(`
    DELETE FROM company_competitors
    WHERE company_id = ?
      AND id = ?
  `).run(companyId, competitorId);
}

function upsertCompanyCompetitors(companyId, competitors, sourceType = 'gemini') {
  const existing = listCompanyCompetitors(companyId).map((competitor) => {
    const name = String(competitor.competitor_name || '').trim().toLowerCase();
    const url = String(competitor.website_url || '').trim().toLowerCase();
    return `${name}|${url}`;
  });
  const existingSet = new Set(existing);

  const insertCompetitor = db.prepare(`
    INSERT INTO company_competitors (
      company_id,
      competitor_name,
      website_url,
      notes,
      source_type,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'active')
  `);

  try {
    db.exec('BEGIN');

    competitors.forEach((competitor) => {
      const competitorName = String(competitor.competitor_name || '').trim();
      const websiteUrl = String(competitor.website_url || '').trim();
      const key = `${competitorName.toLowerCase()}|${websiteUrl.toLowerCase()}`;

      if (!competitorName || existingSet.has(key)) {
        return;
      }

      existingSet.add(key);
      insertCompetitor.run(
        companyId,
        competitorName,
        websiteUrl,
        competitor.reason || competitor.notes || '',
        sourceType
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function updatePromptVisibility(companyId, results) {
  const updatePrompt = db.prepare(`
    UPDATE company_prompts
    SET
      brand_mentioned = ?,
      brand_mention_context = ?,
      competitor_mentions = ?,
      recommended_citations = ?,
      ai_response_summary = ?,
      gemini_response_summary = ?,
      chatgpt_response_summary = COALESCE(NULLIF(chatgpt_response_summary, ''), 'NA'),
      claude_response_summary = COALESCE(NULLIF(claude_response_summary, ''), 'NA'),
      perplexity_response_summary = COALESCE(NULLIF(perplexity_response_summary, ''), 'NA'),
      visibility_status = ?,
      last_checked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
      AND id = ?
  `);

  try {
    db.exec('BEGIN');

    results.forEach((result) => {
      updatePrompt.run(
        result.brand_mentioned ? 1 : 0,
        result.brand_mention_context || '',
        JSON.stringify(result.competitor_mentions || []),
        JSON.stringify(result.recommended_citations || []),
        result.ai_response_summary || '',
        result.ai_response_summary || 'NA',
        result.visibility_status || 'checked',
        companyId,
        Number(result.prompt_id)
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function updateCompanyProfile(companyId, profile) {
  return db.prepare(`
    UPDATE companies
    SET
      company_name = ?,
      website_url = ?,
      logo_url = ?,
      industry = ?,
      service_area = ?,
      target_country = ?,
      main_services = ?,
      known_competitors = ?,
      brand_description = ?,
      target_audience = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    profile.company_name,
    profile.website_url,
    profile.logo_url,
    profile.industry,
    profile.service_area,
    profile.target_country,
    profile.main_services,
    profile.known_competitors,
    profile.brand_description,
    profile.target_audience,
    companyId
  );
}

function completeCompanyOnboarding(companyId) {
  return db.prepare(`
    UPDATE companies
    SET
      onboarding_completed = 1,
      onboarding_completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(companyId);
}

function upsertGoogleConnection({
  userId,
  companyId,
  googleEmail,
  accessTokenEncrypted,
  refreshTokenEncrypted,
  tokenExpiry,
  status = 'connected'
}) {
  const existing = getGoogleConnection(companyId);

  if (existing) {
    return db.prepare(`
      UPDATE google_connections
      SET
        user_id = ?,
        google_email = ?,
        access_token_encrypted = ?,
        refresh_token_encrypted = COALESCE(?, refresh_token_encrypted),
        token_expiry = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
    `).run(
      userId,
      googleEmail,
      accessTokenEncrypted,
      refreshTokenEncrypted || null,
      tokenExpiry,
      status,
      companyId
    );
  }

  return db.prepare(`
    INSERT INTO google_connections (
      user_id,
      company_id,
      google_email,
      access_token_encrypted,
      refresh_token_encrypted,
      token_expiry,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, companyId, googleEmail, accessTokenEncrypted, refreshTokenEncrypted, tokenExpiry, status);
}

function getGoogleConnection(companyId) {
  return db.prepare(`
    SELECT *
    FROM google_connections
    WHERE company_id = ?
    LIMIT 1
  `).get(companyId);
}

function updateGoogleConnectionTokens(connectionId, accessTokenEncrypted, refreshTokenEncrypted, tokenExpiry) {
  return db.prepare(`
    UPDATE google_connections
    SET
      access_token_encrypted = ?,
      refresh_token_encrypted = COALESCE(?, refresh_token_encrypted),
      token_expiry = ?,
      status = 'connected',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(accessTokenEncrypted, refreshTokenEncrypted || null, tokenExpiry, connectionId);
}

function disconnectGoogleConnection(companyId) {
  return db.prepare(`
    UPDATE google_connections
    SET
      status = 'disconnected',
      access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      token_expiry = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `).run(companyId);
}

function replaceSearchConsoleProperties(companyId, properties) {
  const currentSelected = getSelectedSearchConsoleProperty(companyId)?.site_url;
  const insertProperty = db.prepare(`
    INSERT INTO search_console_properties (company_id, site_url, permission_level, selected)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(company_id, site_url) DO UPDATE SET
      permission_level = excluded.permission_level,
      selected = excluded.selected,
      updated_at = CURRENT_TIMESTAMP
  `);

  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM search_console_properties WHERE company_id = ?').run(companyId);

    properties.forEach((property, index) => {
      const siteUrl = String(property.siteUrl || property.site_url || '').trim();

      if (!siteUrl) {
        return;
      }

      insertProperty.run(
        companyId,
        siteUrl,
        property.permissionLevel || property.permission_level || '',
        siteUrl === currentSelected || (!currentSelected && index === 0) ? 1 : 0
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function listSearchConsoleProperties(companyId) {
  return db.prepare(`
    SELECT *
    FROM search_console_properties
    WHERE company_id = ?
    ORDER BY selected DESC, site_url ASC
  `).all(companyId);
}

function setSelectedSearchConsoleProperty(companyId, propertyUrl) {
  try {
    db.exec('BEGIN');
    db.prepare('UPDATE search_console_properties SET selected = 0, updated_at = CURRENT_TIMESTAMP WHERE company_id = ?').run(companyId);
    db.prepare(`
      UPDATE search_console_properties
      SET selected = 1, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND site_url = ?
    `).run(companyId, propertyUrl);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function getSelectedSearchConsoleProperty(companyId) {
  return db.prepare(`
    SELECT *
    FROM search_console_properties
    WHERE company_id = ?
      AND selected = 1
    LIMIT 1
  `).get(companyId);
}

function replaceGeoSnapshots({
  companyId,
  propertyUrl,
  startDate,
  endDate,
  countryRows = [],
  queryRows = [],
  dimensionRows = [],
  periodLabel = 'current'
}) {
  const insertCountry = db.prepare(`
    INSERT INTO geo_search_snapshots (
      company_id,
      property_url,
      country,
      clicks,
      impressions,
      ctr,
      position,
      start_date,
      end_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQuery = db.prepare(`
    INSERT INTO geo_query_snapshots (
      company_id,
      property_url,
      query,
      country,
      page,
      clicks,
      impressions,
      ctr,
      position,
      start_date,
      end_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDimension = db.prepare(`
    INSERT INTO geo_dimension_snapshots (
      company_id,
      property_url,
      dimension_type,
      dimension_key,
      dimension_key_2,
      dimension_key_3,
      clicks,
      impressions,
      ctr,
      position,
      start_date,
      end_date,
      period_label
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    db.exec('BEGIN');
    db.prepare(`
      DELETE FROM geo_search_snapshots
      WHERE company_id = ?
        AND property_url = ?
        AND start_date = ?
        AND end_date = ?
    `).run(companyId, propertyUrl, startDate, endDate);
    db.prepare(`
      DELETE FROM geo_query_snapshots
      WHERE company_id = ?
        AND property_url = ?
        AND start_date = ?
        AND end_date = ?
    `).run(companyId, propertyUrl, startDate, endDate);
    db.prepare(`
      DELETE FROM geo_dimension_snapshots
      WHERE company_id = ?
        AND property_url = ?
        AND start_date = ?
        AND end_date = ?
        AND period_label = ?
    `).run(companyId, propertyUrl, startDate, endDate, periodLabel);

    countryRows.forEach((row) => {
      insertCountry.run(
        companyId,
        propertyUrl,
        row.country || 'Unknown',
        Number(row.clicks || 0),
        Number(row.impressions || 0),
        Number(row.ctr || 0),
        Number(row.position || 0),
        startDate,
        endDate
      );
    });

    queryRows.forEach((row) => {
      insertQuery.run(
        companyId,
        propertyUrl,
        row.query || '',
        row.country || '',
        row.page || '',
        Number(row.clicks || 0),
        Number(row.impressions || 0),
        Number(row.ctr || 0),
        Number(row.position || 0),
        startDate,
        endDate
      );
    });

    dimensionRows.forEach((row) => {
      insertDimension.run(
        companyId,
        propertyUrl,
        row.dimension_type || row.type || 'unknown',
        row.dimension_key || row.key || '',
        row.dimension_key_2 || row.key2 || '',
        row.dimension_key_3 || row.key3 || '',
        Number(row.clicks || 0),
        Number(row.impressions || 0),
        Number(row.ctr || 0),
        Number(row.position || 0),
        startDate,
        endDate,
        periodLabel
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function listGeoCountrySnapshots(companyId, propertyUrl) {
  return db.prepare(`
    SELECT *
    FROM geo_search_snapshots
    WHERE company_id = ?
      AND property_url = COALESCE(?, property_url)
    ORDER BY datetime(created_at) DESC, impressions DESC, clicks DESC
  `).all(companyId, propertyUrl || null);
}

function listGeoQuerySnapshots(companyId, propertyUrl) {
  return db.prepare(`
    SELECT *
    FROM geo_query_snapshots
    WHERE company_id = ?
      AND property_url = COALESCE(?, property_url)
    ORDER BY datetime(created_at) DESC, impressions DESC, clicks DESC
  `).all(companyId, propertyUrl || null);
}

function listGeoDimensionSnapshots(companyId, propertyUrl, dimensionType, periodLabel = 'current') {
  return db.prepare(`
    SELECT *
    FROM geo_dimension_snapshots
    WHERE company_id = ?
      AND property_url = COALESCE(?, property_url)
      AND dimension_type = ?
      AND period_label = ?
    ORDER BY datetime(created_at) DESC, impressions DESC, clicks DESC
  `).all(companyId, propertyUrl || null, dimensionType, periodLabel);
}

function clearGeoSnapshots(companyId, propertyUrl = '') {
  try {
    db.exec('BEGIN');
    db.prepare(`
      DELETE FROM geo_search_snapshots
      WHERE company_id = ?
        AND property_url = COALESCE(NULLIF(?, ''), property_url)
    `).run(companyId, propertyUrl || '');
    db.prepare(`
      DELETE FROM geo_query_snapshots
      WHERE company_id = ?
        AND property_url = COALESCE(NULLIF(?, ''), property_url)
    `).run(companyId, propertyUrl || '');
    db.prepare(`
      DELETE FROM geo_dimension_snapshots
      WHERE company_id = ?
        AND property_url = COALESCE(NULLIF(?, ''), property_url)
    `).run(companyId, propertyUrl || '');
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }
}

function createUserCompanyWorkspace({ user, company }) {
  const businessOwnerRole = db
    .prepare('SELECT id FROM roles WHERE role_name = ?')
    .get('Business Owner');

  if (!businessOwnerRole) {
    throw new Error('Business Owner role is missing.');
  }

  try {
    db.exec('BEGIN');

    const userResult = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, status)
      VALUES (?, ?, ?, 'active')
    `).run(user.full_name, user.email, user.password_hash);

    const companyResult = db.prepare(`
      INSERT INTO companies (
        company_name,
        website_url,
        logo_url,
        industry,
        service_area,
        target_country,
        main_services,
        known_competitors,
        brand_description,
        target_audience
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      company.company_name,
      company.website_url,
      company.logo_url,
      company.industry,
      company.service_area,
      company.target_country,
      company.main_services,
      company.known_competitors,
      company.brand_description,
      company.target_audience
    );

    db.prepare(`
      INSERT INTO user_company_access (user_id, company_id, role_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(userResult.lastInsertRowid, companyResult.lastInsertRowid, businessOwnerRole.id);

    db.exec('COMMIT');

    return {
      userId: Number(userResult.lastInsertRowid),
      companyId: Number(companyResult.lastInsertRowid),
      roleId: businessOwnerRole.id
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = {
  db,
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
  getRoleByName,
  listCompanyUsers,
  getCompanyUserAccess,
  countCompanyBusinessOwners,
  createOrAddCompanyUser,
  addExistingUserCompanyAccess,
  updateCompanyUserAccess,
  removeCompanyUserAccess,
  getAccessRecordById,
  updateAccessRecordById,
  removeAccessRecordById,
  listAllCompaniesForDeveloper,
  listAllUsersForDeveloper,
  listWorkspaceAccessForDeveloper,
  getPlatformStats,
  createCompanyForDeveloper,
  createCompanyForBusinessOwner,
  setCompanyStatus,
  deleteCompany,
  setUserStatus,
  createBusinessAnalysis,
  completeBusinessAnalysis,
  updateCompanyGeneratedProfile,
  failBusinessAnalysis,
  getLatestBusinessAnalysis,
  getLatestCompletedBusinessAnalysis,
  getBusinessAnalysisById,
  listBusinessAnalyses,
  createAeoRecommendation,
  getLatestAeoRecommendation,
  listAeoRecommendations,
  listCompanyPrompts,
  getCompanyPromptById,
  addCompanyPrompt,
  removeCompanyPrompt,
  replaceCompanyPrompts,
  listCompanyCompetitors,
  addCompanyCompetitor,
  removeCompanyCompetitor,
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
  updateCompanyProfile,
  completeCompanyOnboarding,
  createUserCompanyWorkspace
};
