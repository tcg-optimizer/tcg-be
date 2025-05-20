/**
 * 웹 크롤링을 위한 User-Agent 유틸리티
 * IP 차단 방지를 위해 다양한 User-Agent와 헤더를 제공합니다.
 */

// 데스크톱 브라우저 User-Agent 목록
const desktopUserAgents = [
  // Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',

  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:94.0) Gecko/20100101 Firefox/94.0',
  'Mozilla/5.0 (X11; Linux i686; rv:94.0) Gecko/20100101 Firefox/94.0',

  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',

  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36 Edg/96.0.1054.43',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36 Edg/96.0.1054.34',
];

// 모바일 브라우저 User-Agent 목록
const mobileUserAgents = [
  // Android
  'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
  'Mozilla/5.0 (Android 12; Mobile; rv:94.0) Gecko/94.0 Firefox/94.0',

  // iOS
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
];

// 다양한 Accept 헤더
const acceptHeaders = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
];

// 다양한 Accept-Language 헤더
const acceptLanguageHeaders = [
  'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'ko-KR,ko;q=0.9,en-US,en;q=0.8',
];

// 다양한 Cache-Control 헤더
const cacheControlHeaders = ['max-age=0', 'no-cache', 'max-age=0, private, must-revalidate'];

/**
 * 랜덤 User-Agent 문자열을 생성합니다.
 * @param {boolean} [includeMobile=false] - 모바일 User-Agent도 포함할지 여부
 * @returns {string} - 랜덤 User-Agent 문자열
 */
function getRandomUserAgent(includeMobile = false) {
  const userAgents = includeMobile
    ? [...desktopUserAgents, ...mobileUserAgents]
    : desktopUserAgents;

  const randomIndex = Math.floor(Math.random() * userAgents.length);
  return userAgents[randomIndex];
}

/**
 * 크롤링을 위한 랜덤 헤더 세트를 생성합니다.
 * @param {boolean} [includeMobile=false] - 모바일 User-Agent도 포함할지 여부
 * @param {Object} [additionalHeaders={}] - 추가할 사용자 정의 헤더
 * @returns {Object} - HTTP 요청 헤더 객체
 */
function getRandomizedHeaders(includeMobile = false, additionalHeaders = {}) {
  // 기본 헤더 설정
  const headers = {
    'User-Agent': getRandomUserAgent(includeMobile),
    Accept: acceptHeaders[Math.floor(Math.random() * acceptHeaders.length)],
    'Accept-Language':
      acceptLanguageHeaders[Math.floor(Math.random() * acceptLanguageHeaders.length)],
    'Cache-Control': cacheControlHeaders[Math.floor(Math.random() * cacheControlHeaders.length)],
    Connection: Math.random() > 0.5 ? 'keep-alive' : 'close',
    Pragma: Math.random() > 0.7 ? 'no-cache' : '',
  };

  // 확률적으로 Referer 추가
  if (Math.random() > 0.3) {
    const referers = [
      'https://www.google.com/',
      'https://www.google.co.kr/',
      'https://search.naver.com/',
      'https://search.daum.net/',
    ];
    headers['Referer'] = referers[Math.floor(Math.random() * referers.length)];
  }

  // 추가 헤더 병합
  return { ...headers, ...additionalHeaders };
}

/**
 * 랜덤 쿠키 헤더를 생성합니다.
 * @param {string} site - 크롤링 대상 사이트
 * @returns {string} - 쿠키 헤더 문자열
 */
function generateRandomCookies(site) {
  // 공통 쿠키 속성
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
    case 'onlyyugioh':
      siteCookies.JSESSIONID = generateRandomString(32);
      siteCookies.userLang = Math.random() > 0.3 ? 'ko_KR' : 'en_US';
      break;
  }

  // 모든 쿠키 병합 및 문자열로 변환
  const allCookies = { ...commonCookies, ...siteCookies };
  return Object.entries(allCookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * 랜덤 문자열을 생성합니다.
 * @param {number} length - 문자열 길이
 * @returns {string} - 랜덤 문자열
 */
function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

/**
 * 사이트별 특화된 헤더를 생성합니다. (기존 함수 확장)
 * @param {string} site - 크롤링 대상 사이트 ('tcgshop', 'carddc', 'onlyyugioh')
 * @param {Object} [additionalHeaders={}] - 추가할 사용자 정의 헤더
 * @param {boolean} [includeCookies=true] - 쿠키를 포함할지 여부
 * @returns {Object} - 사이트에 최적화된 HTTP 요청 헤더 객체
 */
function getSiteSpecificHeaders(site, additionalHeaders = {}, includeCookies = true) {
  if (!site) {
    console.warn('[WARN] 사이트 이름이 제공되지 않았습니다. 기본 헤더만 사용합니다.');
    return getRandomizedHeaders(false, additionalHeaders);
  }

  // 사이트별 특화 헤더
  const siteHeaders = {};

  switch (site.toLowerCase()) {
    case 'tcgshop':
      siteHeaders['Referer'] = 'http://www.tcgshop.co.kr/';
      siteHeaders['Origin'] = 'http://www.tcgshop.co.kr';
      siteHeaders['Host'] = 'www.tcgshop.co.kr';
      break;
    case 'carddc':
      siteHeaders['Referer'] = 'https://www.carddc.co.kr/';
      siteHeaders['Origin'] = 'https://www.carddc.co.kr';
      siteHeaders['Host'] = 'www.carddc.co.kr';
      break;
    case 'onlyyugioh':
      siteHeaders['Referer'] = 'https://www.onlyyugioh.com/';
      siteHeaders['Origin'] = 'https://www.onlyyugioh.com';
      siteHeaders['Host'] = 'www.onlyyugioh.com';
      break;
  }

  // 쿠키 추가
  if (includeCookies) {
    siteHeaders['Cookie'] = generateRandomCookies(site);
  }

  // 기본 랜덤 헤더 + 사이트별 특화 헤더 + 추가 헤더 병합
  return {
    ...getRandomizedHeaders(false),
    ...siteHeaders,
    ...additionalHeaders,
  };
}

/**
 * 크롤링 요청에 대한 Axios 설정을 생성합니다.
 * @param {string} site - 크롤링 대상 사이트
 * @param {Object} [options={}] - 추가 옵션
 * @returns {Object} - Axios 요청 설정 객체
 */
function createCrawlerConfig(site, options = {}) {
  const {
    timeoutMs = 10000,
    useGzip = true,
    useCookies = true,
    additionalHeaders = {},
    responseType = 'arraybuffer',
  } = options;

  // 헤더 생성
  const headers = getSiteSpecificHeaders(site, additionalHeaders, useCookies);

  // gzip 압축 지원 추가
  if (useGzip && !headers['Accept-Encoding']) {
    headers['Accept-Encoding'] = 'gzip, deflate';
  }

  // 기본 설정
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
