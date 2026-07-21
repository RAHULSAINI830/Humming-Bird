const { captureContactLead } = require('../src/contact-leads');

const allowedOrigins = new Set(
  String(process.env.LANDING_PAGE_ORIGINS || 'https://www.hiaimate.com,https://hiaimate.com,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
);
const rateLimits = new Map();

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');

  if (origin && !allowedOrigins.has(origin)) {
    sendJson(res, { error: 'Origin is not allowed' }, 403);
    return false;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function isRateLimited(req) {
  const key = clientIp(req);
  const now = Date.now();
  const current = rateLimits.get(key);

  if (!current || current.expiresAt <= now) {
    rateLimits.set(key, { count: 1, expiresAt: now + 15 * 60 * 1000 });
    return false;
  }

  current.count += 1;
  return current.count > 5;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('REQUEST_TOO_LARGE');
  }

  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function normalize(value) {
  return String(value || '').trim();
}

function validatedLead(body) {
  const input = {
    name: normalize(body.name),
    email: normalize(body.email).toLowerCase(),
    website: normalize(body.website),
    message: normalize(body.message),
    fax: normalize(body.fax)
  };
  const errors = {};

  if (input.name.length < 2 || input.name.length > 100) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
    errors.email = 'Enter a valid work email.';
  }
  if (input.message.length > 2000) errors.message = 'Message must be 2,000 characters or fewer.';

  try {
    const website = new URL(input.website);
    if (!['http:', 'https:'].includes(website.protocol) || input.website.length > 2048) {
      errors.website = 'Enter a complete HTTP or HTTPS website URL.';
    }
  } catch {
    errors.website = 'Enter a complete website URL.';
  }

  return { input, errors };
}

module.exports = async function contactHandler(req, res) {
  if (!applyCors(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, { error: 'Method not allowed' }, 405);
    return;
  }

  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '900');
    sendJson(res, { error: 'Too many enquiries. Please try again in 15 minutes.' }, 429);
    return;
  }

  try {
    const body = await readJson(req);
    const { input, errors } = validatedLead(body);

    if (input.fax) {
      sendJson(res, { message: 'Thanks — your enquiry has been received.' }, 201);
      return;
    }

    if (Object.keys(errors).length) {
      sendJson(res, { error: 'Please check your details and try again.', errors }, 400);
      return;
    }

    await captureContactLead(input);
    sendJson(res, { message: 'Thanks — your enquiry has been received.' }, 201);
  } catch (error) {
    console.error('Contact API error:', error);
    const statusCode = error.message === 'INVALID_JSON' || error.message === 'REQUEST_TOO_LARGE' ? 400 : 500;
    sendJson(res, {
      error: statusCode === 400
        ? 'Invalid request body.'
        : 'We could not save your enquiry. Please try again shortly.',
      ...(statusCode === 500 ? { code: error.code || 'CONTACT_DELIVERY_FAILED' } : {})
    }, statusCode);
  }
};

module.exports.config = { maxDuration: 15 };
