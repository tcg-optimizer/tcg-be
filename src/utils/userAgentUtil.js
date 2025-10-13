const desktopUserAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

const mobileUserAgents = [
  // Android
  'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
  'Mozilla/5.0 (Android 12; Mobile; rv:94.0) Gecko/94.0 Firefox/94.0',

  // iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
];

function getRandomUserAgent(includeMobile = false) {
  const userAgents = includeMobile
    ? [...desktopUserAgents, ...mobileUserAgents]
    : desktopUserAgents;

  const randomIndex = Math.floor(Math.random() * userAgents.length);
  return userAgents[randomIndex];
}

function getRandomizedHeaders(includeMobile = false, additionalHeaders = {}) {
  const headers = {
    'User-Agent': getRandomUserAgent(includeMobile),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  return { ...headers, ...additionalHeaders };
}

function generateRandomCookies(site) {
  const commonCookies = {
    visited: 'true',
    sessionStarted: Date.now().toString(),
    screenWidth: `${Math.floor(Math.random() * 500) + 1000}`,
    screenHeight: `${Math.floor(Math.random() * 300) + 700}`,
    colorDepth: '24',
  };

  // 사이트별 특화 쿠키
  const siteCookies = {};
  switch (site.toLowerCase()) {
    case 'tcgshop':
      siteCookies.PHPSESSID = generateRandomString(26);
      siteCookies.viewType = Math.random() > 0.5 ? 'gallery' : 'list';
      break;
    case 'carddc':
      siteCookies.PHPSESSID = generateRandomString(26);
      siteCookies._ga = `GA1.2.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000 - Math.random() * 86400 * 30)}`;
      break;
  }

  const allCookies = { ...commonCookies, ...siteCookies };
  return Object.entries(allCookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

function getSiteSpecificHeaders(site, additionalHeaders = {}, includeCookies = true) {
  if (!site) {
    return getRandomizedHeaders(false, additionalHeaders);
  }

  const siteHeaders = {};

  switch (site.toLowerCase()) {
    case 'tcgshop':
      siteHeaders['Referer'] = 'http://www.tcgshop.co.kr/';
      siteHeaders['Origin'] = 'http://www.tcgshop.co.kr';
      siteHeaders['Host'] = 'www.tcgshop.co.kr';
      break;
    case 'carddc':
      break;
  }

  if (includeCookies) {
    siteHeaders['Cookie'] = generateRandomCookies(site);
  }

  return {
    ...getRandomizedHeaders(false),
    ...siteHeaders,
    ...additionalHeaders,
  };
}

function createCrawlerConfig(site, options = {}) {
  const {
    timeoutMs = 10000,
    useGzip = true,
    useCookies = true,
    additionalHeaders = {},
    responseType = 'arraybuffer',
  } = options;

  const headers = getSiteSpecificHeaders(site, additionalHeaders, useCookies);

  if (useGzip) {
    headers['Accept-Encoding'] = 'gzip, deflate, br';
  }

  const config = {
    headers,
    timeout: timeoutMs,
    responseType,
    maxRedirects: 5,
  };

  return config;
}

module.exports = {
  getRandomUserAgent,
  getRandomizedHeaders,
  getSiteSpecificHeaders,
  generateRandomCookies,
  createCrawlerConfig,
};
