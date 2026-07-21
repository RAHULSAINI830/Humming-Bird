const crypto = require('node:crypto');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
let cachedGoogleToken = null;

function integrationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function envValue(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  const hasMatchingQuotes = (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"));
  return hasMatchingQuotes ? value.slice(1, -1).trim() : value;
}

function requiredGoogleConfig() {
  const config = {
    spreadsheetId: envValue('GOOGLE_SHEET_ID'),
    range: envValue('GOOGLE_SHEET_RANGE', 'Leads!A:E'),
    serviceAccountEmail: envValue('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    privateKey: envValue('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n')
  };

  if (!config.spreadsheetId || !config.serviceAccountEmail || !config.privateKey) {
    throw integrationError('Google Sheets lead storage is not configured', 'GOOGLE_SHEETS_NOT_CONFIGURED');
  }

  return config;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken(config) {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: config.serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  let signature;
  try {
    signature = signer.sign(config.privateKey, 'base64url');
  } catch {
    throw integrationError('Google service-account private key is invalid', 'GOOGLE_PRIVATE_KEY_INVALID');
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedToken}.${signature}`
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw integrationError(
      body.error_description || 'Failed to authenticate with Google Sheets',
      'GOOGLE_AUTH_FAILED'
    );
  }

  cachedGoogleToken = {
    value: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000
  };
  return cachedGoogleToken.value;
}

async function appendContactLead(lead) {
  const config = requiredGoogleConfig();
  const accessToken = await googleAccessToken(config);
  const spreadsheetId = encodeURIComponent(config.spreadsheetId);
  const range = encodeURIComponent(config.range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [[new Date().toISOString(), lead.name, lead.email, lead.website, lead.message || '']]
      })
    }
  );
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw integrationError(
      body.error?.message || 'Failed to save the enquiry to Google Sheets',
      'GOOGLE_SHEETS_WRITE_FAILED'
    );
  }

  return body;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function sendContactEmail(lead) {
  const apiKey = envValue('RESEND_API_KEY');

  if (!apiKey) {
    return { skipped: true };
  }

  const from = envValue('CONTACT_EMAIL_FROM', 'Aimate <onboarding@resend.dev>');
  const to = envValue('CONTACT_EMAIL_TO', 'hello@aimate.ai');
  const safeMessage = escapeHtml(lead.message || 'No additional details provided.').replace(/\n/g, '<br />');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: lead.email,
      subject: `New Aimate enquiry from ${lead.name.replace(/[\r\n]+/g, ' ')}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#17202a">
          <h2>New Aimate website enquiry</h2>
          <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
          <p><strong>Website:</strong> ${escapeHtml(lead.website)}</p>
          <p><strong>What they want to understand:</strong></p>
          <p>${safeMessage}</p>
        </div>
      `,
      text: `New Aimate website enquiry\n\nName: ${lead.name}\nEmail: ${lead.email}\nWebsite: ${lead.website}\n\n${lead.message || 'No additional details provided.'}`
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || 'Failed to deliver contact enquiry email');
  }

  return body;
}

async function captureContactLead(lead) {
  await appendContactLead(lead);

  try {
    await sendContactEmail(lead);
  } catch (error) {
    // The durable Sheet capture succeeded, so an optional notification failure
    // must not ask the visitor to resubmit and create a duplicate row.
    console.error('Contact lead email notification failed:', error);
  }
}

module.exports = { appendContactLead, captureContactLead };
