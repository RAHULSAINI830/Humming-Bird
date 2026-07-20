export const AIMATE_LOGO = '/app/aimate-logo.png';
export const AIMATE_MARK = '/app/aimate-mark.png';

export const navItems = [
  ['Dashboard', 'dashboard', '◆'],
  ['Business Analysis', 'business-analysis', '▤'],
  ['What’s Next', 'aeo-recommendations', '↗'],
  ['Competitors', 'competitors', '◎'],
  ['Prompts', 'prompts', '✦'],
  ['Prompt Research', 'prompt-research', '✧'],
  ['Citations', 'citations', '◇'],
  ['GEO Visibility', 'geo', '⌖'],
  ['Settings', 'settings', '⚙']
];

export const geoSubTabs = [
  { key: 'performance', label: 'Performance', helper: 'Clicks, impressions, CTR' },
  { key: 'queries', label: 'Queries', helper: 'Keywords and opportunities' },
  { key: 'pages', label: 'Pages', helper: 'URLs and appearance' },
  { key: 'countries', label: 'Countries', helper: 'Map and markets' },
  { key: 'technical', label: 'Technical', helper: 'Devices and coverage gaps' }
];

export const DEFAULT_ACTIVE_VIEW = 'dashboard';
export const ACTIVE_VIEW_STORAGE_KEY = 'aimate.activeView';
export const LEGACY_ACTIVE_VIEW_STORAGE_KEY = 'hummingbird.activeView';
export const allowedViewKeys = new Set([...navItems.map(([, view]) => view), 'developer']);

export function readInitialActiveView() {
  if (typeof window === 'undefined') return DEFAULT_ACTIVE_VIEW;

  const hashView = window.location.hash.replace('#', '').trim();
  const params = new URLSearchParams(window.location.search);
  const geoStatus = params.get('geo');
  const storedView =
    window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY) ||
    window.localStorage.getItem(LEGACY_ACTIVE_VIEW_STORAGE_KEY);

  if (geoStatus) return 'geo';
  if (allowedViewKeys.has(hashView)) return hashView;
  if (allowedViewKeys.has(storedView)) return storedView;
  return DEFAULT_ACTIVE_VIEW;
}
