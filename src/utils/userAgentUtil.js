const desktopUserAgents = [
  // Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',

  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',

  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',

  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
];

const mobileUserAgents = [
  // Android
  'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',

  // iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
];
const acceptHeaders = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
];

const acceptLanguageHeaders = [
  'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'ko-KR,ko;q=0.9,en-US,en;q=0.8',
];

const cacheControlHeaders = ['max-age=0', 'no-cache', 'max-age=0, private, must-revalidate'];

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
    Accept: acceptHeaders[Math.floor(Math.random() * acceptHeaders.length)],
    'Accept-Language':
      acceptLanguageHeaders[Math.floor(Math.random() * acceptLanguageHeaders.length)],
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': cacheControlHeaders[Math.floor(Math.random() * cacheControlHeaders.length)],
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    DNT: '1',
  };

  if (Math.random() > 0.3) {
    const referers = [
      'https://www.google.com/',
      'https://www.google.co.kr/',
      'https://search.naver.com/',
      'https://search.daum.net/',
    ];
    headers['Referer'] = referers[Math.floor(Math.random() * referers.length)];
    headers['Sec-Fetch-Site'] = 'cross-site';
  }

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
      siteHeaders['Host'] = 'www.tcgshop.co.kr';
      siteHeaders['Sec-Fetch-Site'] = 'same-origin';
      break;
    case 'carddc':
      siteHeaders['Referer'] = 'https://www.carddc.co.kr/';
      siteHeaders['Host'] = 'www.carddc.co.kr';
      siteHeaders['Sec-Fetch-Site'] = 'same-origin';
      break;
  }

  if (includeCookies) {
    siteHeaders['Cookie'] = generateRandomCookies(site);
  }

  const baseHeaders = getRandomizedHeaders(false);
  
  return {
    ...baseHeaders,
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

  if (useGzip && !headers['Accept-Encoding']) {
    headers['Accept-Encoding'] = 'gzip, deflate, br';
  }

  const config = {
    headers,
    timeout: timeoutMs,
    responseType,
    maxRedirects: 5,
    // HTTP/2 지원 활성화 (Node.js 15.10.0+)
    httpAgent: false,
    httpsAgent: false,
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
