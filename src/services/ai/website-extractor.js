const DEFAULT_TIMEOUT = 15000;
const MAX_WEBSITE_TEXT_LENGTH = 12000;
const MAX_ASSET_TEXT_LENGTH = 10000;
const MAX_SCRIPT_ASSETS = 45;

function normalizeWebsiteUrl(url) {
  const rawUrl = String(url || '').trim();

  if (!rawUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }

  return `https://${rawUrl}`;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractMetaContent(html, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedName}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern) || html.match(reversePattern);
  return decodeHtmlEntities(match?.[1] || '').trim();
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(h[1-6]|p|li|div|section|article|header|footer|main|br)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(url, baseUrl) {
  try {
    if (/^assets\//i.test(url)) {
      const base = new URL(baseUrl);
      return `${base.origin}/${url}`;
    }

    return new URL(url, baseUrl).toString();
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isUsefulJavascriptAsset(url) {
  const value = String(url || '').toLowerCase();

  if (!value.endsWith('.js')) return false;
  if (/vendor|react|three|framer|motion|lucide|radix|chunk|polyfill/.test(value)) return false;

  return true;
}

function extractScriptUrls(html, baseUrl) {
  const urls = [];
  const scriptPattern = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const modulePreloadPattern = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = scriptPattern.exec(html))) {
    urls.push(absoluteUrl(match[1], baseUrl));
  }

  while ((match = modulePreloadPattern.exec(html))) {
    urls.push(absoluteUrl(match[1], baseUrl));
  }

  return unique(urls);
}

function extractAssetUrlsFromJavascript(javascript, baseUrl) {
  const urls = [];
  const assetPattern = /assets\/[A-Za-z0-9_.-]+\.js/g;
  let match;

  while ((match = assetPattern.exec(javascript))) {
    urls.push(absoluteUrl(match[0], baseUrl));
  }

  return unique(urls);
}

function cleanupJavascriptString(value) {
  let text = String(value || '');

  try {
    text = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
  } catch {
    text = text.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function looksLikeHumanWebsiteCopy(text) {
  if (text.length < 24 || text.length > 500) return false;
  if (!/[a-zA-Z]{4}/.test(text)) return false;
  if (!/\s/.test(text)) return false;
  if (/^(flex|grid|block|inline|absolute|relative|container|text-|bg-|hover:|focus:|items-|justify-|rounded|shadow|border|w-|h-|p-|m-|px-|py-|gap-|space-|transition|duration)/i.test(text)) return false;
  if (/(^|\s)(className|function|return|const|let|var|import|export|undefined|null|assets\/|\.js|\.css)(\s|$)/i.test(text)) return false;
  if (/react|children|hydration|minified|exception|circular refs|intersectionobserver|private member|dangerouslysetinnerhtml|defaultchecked|defaultvalue|error message|environment|stylesheet|preload/i.test(text)) return false;
  if (/[{}()[\]<>]|#[A-Fa-f0-9]{3,6}|`|\$\{/.test(text)) return false;
  if ((text.match(/[-_:]/g) || []).length > 8) return false;

  return true;
}

function extractHumanTextFromJavascript(javascript) {
  const strings = [];
  const stringPattern = /(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/g;
  let match;

  while ((match = stringPattern.exec(javascript))) {
    const text = cleanupJavascriptString(match[1] || match[2] || match[3] || '');

    if (looksLikeHumanWebsiteCopy(text)) {
      strings.push(text);
    }
  }

  return unique(strings);
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'HummingbirdBot/0.1 (+https://hummingbird.local; business analysis)'
      },
      redirect: 'follow'
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicText(url) {
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    return '';
  }

  return response.text();
}

async function extractJavascriptRenderedText(html, pageUrl) {
  const queue = extractScriptUrls(html, pageUrl).sort((a, b) => {
    const aUseful = isUsefulJavascriptAsset(a) ? 0 : 1;
    const bUseful = isUsefulJavascriptAsset(b) ? 0 : 1;
    return aUseful - bUseful;
  });
  const seen = new Set(queue);
  const humanStrings = [];

  for (let index = 0; index < queue.length && index < MAX_SCRIPT_ASSETS; index += 1) {
    const scriptUrl = queue[index];

    try {
      const javascript = await fetchPublicText(scriptUrl);

      if (isUsefulJavascriptAsset(scriptUrl)) {
        humanStrings.push(...extractHumanTextFromJavascript(javascript));
      }

      for (const assetUrl of extractAssetUrlsFromJavascript(javascript, scriptUrl)) {
        if (isUsefulJavascriptAsset(assetUrl) && !seen.has(assetUrl) && queue.length < MAX_SCRIPT_ASSETS) {
          seen.add(assetUrl);
          queue.push(assetUrl);
        }
      }
    } catch {
      // Ignore individual asset failures. Many modern sites split optional chunks.
    }
  }

  return unique(humanStrings).join('\n').slice(0, MAX_ASSET_TEXT_LENGTH);
}

async function extractWebsiteSnapshot(websiteUrl) {
  const normalizedUrl = normalizeWebsiteUrl(websiteUrl);

  if (!normalizedUrl) {
    return {
      url: '',
      fetched: false,
      error: 'Website URL is missing.',
      title: '',
      description: '',
      text: ''
    };
  }

  try {
    const response = await fetchWithTimeout(normalizedUrl);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      return {
        url: response.url || normalizedUrl,
        fetched: false,
        error: `Website returned HTTP ${response.status}.`,
        title: '',
        description: '',
        text: ''
      };
    }

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        url: response.url || normalizedUrl,
        fetched: false,
        error: 'Website did not return HTML content.',
        title: '',
        description: '',
        text: ''
      };
    }

    const html = await response.text();
    const title = extractTitle(html);
    const description = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');
    const htmlText = htmlToText(html);
    const scriptText = htmlText.length < 300 ? await extractJavascriptRenderedText(html, response.url || normalizedUrl) : '';
    const text = [htmlText, scriptText].filter(Boolean).join('\n\n').slice(0, MAX_WEBSITE_TEXT_LENGTH);

    return {
      url: response.url || normalizedUrl,
      fetched: Boolean(text),
      error: text ? '' : 'Website did not contain readable text.',
      title,
      description,
      text
    };
  } catch (error) {
    return {
      url: normalizedUrl,
      fetched: false,
      error: error?.name === 'AbortError' ? 'Website fetch timed out.' : 'Website could not be fetched.',
      title: '',
      description: '',
      text: ''
    };
  }
}

module.exports = {
  extractWebsiteSnapshot,
  normalizeWebsiteUrl
};
