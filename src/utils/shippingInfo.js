const shippingInfo = {
  naverDefault: {
    shippingFee: 3000, // 기본 배송비
    jejuShippingFee: 5000, // 제주 지역 배송비
    islandShippingFee: 7000, // 도서 지역 배송비
    freeShippingThreshold: 50000, // 무료배송 기준금액
  },

  tcgshop: {
    shippingFee: 2500,
    jejuShippingFee: 2500,
    islandShippingFee: 2500,
    freeShippingThreshold: 30000,
  },

  carddc: {
    shippingFee: 2500,
    jejuShippingFee: 2500,
    islandShippingFee: 2500,
    freeShippingThreshold: 30000,
  },
};

// 방문수령 가능한 상점과 비용
const TAKEOUT_INFO = {
  카드킹덤: 100,
  카드냥: 100,
  카드스퀘어: 100,
  민씨지샵: 0,
  전주디마켓: 100,
  마천루카드장터: 100,
  에리어제로스토어: 100,
  흑석블랙스톤: 100,
  듀얼위너: 100,
  TCG킹덤: 10,
  티씨지플레이어: 0,
  TCG카드프리덤: 0,
};

const TAKEOUT_KEY_MAPPING = {
  cardKingdom: '카드킹덤',
  cardNyang: '카드냥',
  cardSquare: '카드스퀘어',
  minCGCardMarket: '민씨지샵',
  diMarket: '전주디마켓',
  skyscraper: '마천루카드장터',
  areaZeroStore: '에리어제로스토어',
  blackStone: '흑석블랙스톤',
  dualWinner: '듀얼위너',
  tcgKingdom: 'TCG킹덤',
  tcgPlayer: '티씨지플레이어',
  tcgCardFreedom: 'TCG카드프리덤',
};

// 네이버샵의 판매자별 배송비 정보
const naverSellerShippingInfo = {
  카드킹덤: {
    shippingFee: 2800,
    jejuShippingFee: 5500,
    islandShippingFee: 5500,
    freeShippingThreshold: 40000,
  },

  Jclover: {
    shippingFee: 3400,
    jejuShippingFee: 4600,
    islandShippingFee: 9400,
    freeShippingThreshold: 100000,
  },

  카드스퀘어: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  TCG포유: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 50000,
  },

  티씨지트레이서즈: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 50000,
  },

  코토리샵: {
    shippingFee: 3000,
    jejuShippingFee: 5500,
    islandShippingFee: 5500,
    freeShippingThreshold: Infinity,
  },

  소소TCG: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  전주디마켓: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: 50000,
  },

  마왕성뒷골목: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 100000,
  },

  티씨지헤븐: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 100000,
  },

  티씨지플레이존: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 50000,
  },

  카드냥: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 40000,
  },

  카드캐처: {
    shippingFee: 3500,
    jejuShippingFee: 6500,
    islandShippingFee: 6500,
    freeShippingThreshold: 50000,
  },

  인카드: {
    shippingFee: 3000,
    jejuShippingFee: 5500,
    islandShippingFee: 8000,
    freeShippingThreshold: Infinity,
  },

  티씨지몰: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  유유토이: {
    shippingFee: 3000,
    jejuShippingFee: 5000,
    islandShippingFee: 8000,
    freeShippingThreshold: 40000,
  },

  듀얼스페이스: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 9000,
    freeShippingThreshold: 60000,
  },

  TCG마트: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  코코래빗: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 30000,
  },

  TCG월드: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 50000,
  },

  TCG킹덤: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  티씨지스카이: {
    shippingFee: 3500,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  KTCG: {
    shippingFee: 2500,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  믐믐샵: {
    shippingFee: 3500,
    jejuShippingFee: 6500,
    islandShippingFee: 7500,
    freeShippingThreshold: 50000,
  },

  유희왕카드가게: {
    shippingFee: 3000,
    jejuShippingFee: 5500,
    islandShippingFee: 5500,
    freeShippingThreshold: 30000,
  },

  카드Labo: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  유희왕중고카드샵: {
    shippingFee: 2200,
    jejuShippingFee: 2200,
    islandShippingFee: 2200,
    freeShippingThreshold: 30000,
  },

  카드Station: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: 70000,
  },

  슈미카드: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: 40000,
  },

  TCG얼라이브: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  TCG카톤깡: {
    shippingFee: 3500,
    jejuShippingFee: 3500,
    islandShippingFee: 3500,
    freeShippingThreshold: 70000,
  },

  정무샵: {
    shippingFee: 4000,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 47000,
  },

  캠핑토이: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  민씨지샵: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 40000,
  },

  카드팝: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: Infinity,
  },

  트레카샵: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: 150000,
  },

  OCGTCG: {
    shippingFee: 2000,
    jejuShippingFee: 6000,
    islandShippingFee: 7000,
    freeShippingThreshold: 30000,
  },

  딱지세상: {
    shippingFee: 2200,
    jejuShippingFee: 2200,
    islandShippingFee: 2200,
    freeShippingThreshold: Infinity,
  },

  카드맥스: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: 50000,
  },

  루아네상점: {
    shippingFee: 2800,
    jejuShippingFee: 5800,
    islandShippingFee: 5800,
    freeShippingThreshold: 50000,
  },

  ocg의시작: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: 30000,
  },

  딱지집: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: Infinity,
  },

  랩터샵: {
    shippingFee: 3500,
    jejuShippingFee: 3500,
    islandShippingFee: 3500,
    freeShippingThreshold: Infinity,
  },

  ss듀얼샵: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 8000,
    freeShippingThreshold: 50000,
  },

  티씨지플레이어: {
    shippingFee: 3500,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  TCG써클: {
    shippingFee: 3500,
    jejuShippingFee: 3500,
    islandShippingFee: 3500,
    freeShippingThreshold: 50000,
  },

  마천루카드장터: {
    shippingFee: 3000,
    jejuShippingFee: 10000,
    islandShippingFee: 10000,
    freeShippingThreshold: 50000,
  },

  우유TCG: {
    shippingFee: 4000,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 45000,
  },

  더아지트몰: {
    shippingFee: 3500,
    jejuShippingFee: 7500,
    islandShippingFee: 7500,
    freeShippingThreshold: 50000,
  },

  봉플레이스: {
    shippingFee: 3000,
    jejuShippingFee: 7000,
    islandShippingFee: 11000,
    freeShippingThreshold: 50000,
  },

  듀얼팩토리: {
    shippingFee: 3000,
    jejuShippingFee: 3200,
    islandShippingFee: 3200,
    freeShippingThreshold: 70000,
  },

  유희왕STORE: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: Infinity,
  },

  마래하비: {
    shippingFee: 3500,
    jejuShippingFee: 6500,
    islandShippingFee: 6500,
    freeShippingThreshold: 50000,
  },

  듀얼위너: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: 60000,
  },

  굿즈덕트: {
    shippingFee: 3200,
    jejuShippingFee: 6700,
    islandShippingFee: 8200,
    freeShippingThreshold: 50000,
  },

  Tcg랜드: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 45000,
  },

  TCG하우스: {
    shippingFee: 3500,
    jejuShippingFee: 3500,
    islandShippingFee: 3500,
    freeShippingThreshold: 40000,
  },

  게임만물상: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 70000,
  },

  에리어제로스토어: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: 40000,
  },

  TCG나라: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  아트워키: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: Infinity,
  },

  기어타운: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  TCGHOME: {
    shippingFee: 3000,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 50000,
  },

  굿즈아레나: {
    shippingFee: 3000,
    jejuShippingFee: 5500,
    islandShippingFee: 5500,
    freeShippingThreshold: Infinity,
  },

  TCG카드프리덤: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  DS듀얼: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  흑석블랙스톤: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 50000,
  },

  글로벌구매대행: {
    shippingFee: 3200,
    jejuShippingFee: 7200,
    islandShippingFee: 8200,
    freeShippingThreshold: 50000,
  },

  하이랄게임샵: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: Infinity,
  },

  티씨지팩토리: {
    shippingFee: 3500,
    jejuShippingFee: 6500,
    islandShippingFee: 6500,
    freeShippingThreshold: 50000,
  },

  TCG999: {
    shippingFee: 3000,
    jejuShippingFee: 3000,
    islandShippingFee: 3000,
    freeShippingThreshold: 90000,
  },

  드로우박스: {
    shippingFee: 3200,
    jejuShippingFee: 6700,
    islandShippingFee: 6700,
    freeShippingThreshold: 40000,
  },

  콜코COLLCO: {
    shippingFee: 4000,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 100000,
  },

  카드피아: {
    shippingFee: 4000,
    jejuShippingFee: 4000,
    islandShippingFee: 4000,
    freeShippingThreshold: Infinity,
  },

  카드팜CARDPOM: {
    shippingFee: 3500,
    jejuShippingFee: 6500,
    islandShippingFee: 6500,
    freeShippingThreshold: 50000,
  },

  카드바인더: {
    shippingFee: 4000,
    jejuShippingFee: 9000,
    islandShippingFee: 9000,
    freeShippingThreshold: 30000,
  },

  덱인사이드: {
    shippingFee: 3200,
    jejuShippingFee: 7200,
    islandShippingFee: 7200,
    freeShippingThreshold: 50000,
  },

  방해꾼샵: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },
  
  해피네샵: {
    shippingFee: 3500,
    jejuShippingFee: 8500,
    islandShippingFee: 8500,
    freeShippingThreshold: 100000,
  },

  카드슬래쉬: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: Infinity,
  },

  카드펀: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  대구듀얼스파크: {
    shippingFee: 3500,
    jejuShippingFee: 3500,
    islandShippingFee: 3500,
    freeShippingThreshold: 39000,
  },

  카드베이스: {
    shippingFee: 3500,
    jejuShippingFee: 8500,
    islandShippingFee: 8500,
    freeShippingThreshold: 40000,
  },

  지구정복tcg: {
    shippingFee: 2000,
    jejuShippingFee: 2000,
    islandShippingFee: 2000,
    freeShippingThreshold: 50000,
  },

  카드팰리스: {
    shippingFee: 3000,
    jejuShippingFee: 8000,
    islandShippingFee: 13000,
    freeShippingThreshold: 50000,
  },

  안성하얀숲카드하우스: {
    shippingFee: 4000,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 40000,
  },

  랭크타운tcgshop: {
    shippingFee: 3000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  },

  카드트리거: {
    shippingFee: 2000,
    jejuShippingFee: 5000,
    islandShippingFee: 7000,
    freeShippingThreshold: 40000,
  },

  원앤헌트tcg: {
    shippingFee: 3500,
    jejuShippingFee: 7000,
    islandShippingFee: 7000,
    freeShippingThreshold: 50000,
  },

  'armosh-tcg': {
    shippingFee: 4000,
    jejuShippingFee: 6000,
    islandShippingFee: 6000,
    freeShippingThreshold: 50000,
  }
};

const REGION_TYPES = {
  DEFAULT: 'default',
  JEJU: 'jeju',
  ISLAND: 'island',
};

// 최저가 계산 시 스킵해야 하는 상점 목록
const SKIP_MARKETPLACES = [
  '쿠팡',
  'SSG닷컴',
  '신세계몰',
  '이마트몰',
  'G마켓',
  '옥션',
  '11번가',
  '위메프',
  '티몬',
];

// 판매자 이름의 공백과 특수 문자를 제거하여 소문자로 정규화
function normalizeSellerName(sellerName) {
  if (!sellerName) return '';

  return sellerName
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '')
    .toLowerCase();
}

// 최저가 계산 시 스킵해야 하는 상점인지 확인
function shouldSkipMarketplace(sellerName) {
  return SKIP_MARKETPLACES.some(
    marketplace => normalizeSellerName(sellerName) === normalizeSellerName(marketplace)
  );
}

// 판매자 이름 추출
function getSellerName(seller) {
  return typeof seller === 'string' ? seller : seller.name || seller.id || String(seller);
}

// 배송비 정보를 반환
function getShippingInfo(site) {
  let sellerName = getSellerName(site).toLowerCase();

  if (sellerName === 'tcgshop') {
    return shippingInfo.tcgshop;
  } else if (sellerName === 'carddc') {
    return shippingInfo.carddc;
  } else {
    // 네이버 판매자인 경우 판매자 이름 앞의 'naver_' 접두사 제거해야함
    if (sellerName.startsWith('naver_')) {
      sellerName = sellerName.substring(6);
    }

    const normalizedSellerName = normalizeSellerName(sellerName);

    for (const seller in naverSellerShippingInfo) {
      if (normalizeSellerName(seller) === normalizedSellerName) {
        return naverSellerShippingInfo[seller];
      }
    }

    // 일치하는 판매자가 없을 경우 기본 배송비 정보 반환
    // 이 로그를 발견하면 해당 판매자의 배송비 정보를 수동으로 추가할 것
    console.log(`[INFO] 판매자 '${sellerName}'의 배송비 정보가 없습니다. 기본값 사용.`);
    return shippingInfo.naverDefault;
  }
}

function calculateShippingFee(
  site,
  region = REGION_TYPES.DEFAULT,
  totalPrice = 0,
  takeoutOptions = []
) {
  let sellerName = getSellerName(site);

  if (sellerName.startsWith('Naver_')) {
    sellerName = sellerName.substring(6);
  }

  // 방문수령 옵션이 활성화된 상점인지 확인
  if (takeoutOptions && takeoutOptions.length > 0) {
    const enabledTakeoutStores = takeoutOptions
      .map(key => TAKEOUT_KEY_MAPPING[key])
      .filter(Boolean);

    const normalizedSellerName = normalizeSellerName(sellerName);

    for (const enabledStore of enabledTakeoutStores) {
      const normalizedEnabledStore = normalizeSellerName(enabledStore);

      if (
        normalizedSellerName === normalizedEnabledStore &&
        TAKEOUT_INFO[enabledStore] !== undefined
      ) {
        console.log(
          `[INFO] "${sellerName}" 상점의 방문수령 옵션 적용: ${TAKEOUT_INFO[enabledStore]}원`
        );
        return TAKEOUT_INFO[enabledStore];
      }
    }
  }

  // 방문수령이 아닌 경우 기존 배송비 계산 로직 사용
  const shippingInfo = getShippingInfo(site);

  // 무료 배송 기준 금액 이상이면 무료 배송 (무료배송 조건이 없는 경우(Infinity) 제외)
  if (
    totalPrice >= shippingInfo.freeShippingThreshold &&
    shippingInfo.freeShippingThreshold !== Infinity
  ) {
    return 0;
  }

  switch (region) {
    case REGION_TYPES.JEJU:
      return shippingInfo.jejuShippingFee;
    case REGION_TYPES.ISLAND:
      return shippingInfo.islandShippingFee;
    case REGION_TYPES.DEFAULT:
    default:
      return shippingInfo.shippingFee;
  }
}

module.exports = {
  shippingInfo,
  getShippingInfo,
  calculateShippingFee,
  normalizeSellerName,
  REGION_TYPES,
  shouldSkipMarketplace,
  getSellerName,
  TAKEOUT_INFO,
  TAKEOUT_KEY_MAPPING,
};
