export interface KnownComplexInfo {
  nameMatch: string[];
  officialName: string;
  approvalYear: number;
  approvalDate: string; // e.g. '2020.04', '1993.05' (괄호 연식 제거)
  typicalAreaM2: number;
  typicalPyeong: number; // 전용평 (네이버부동산 공인 84㎡ = 25.68~25.7평)
  supplyPyeong: number; // 공급/분양평 (e.g., 34평형)
  exclusiveRate: number; // 전용률(%)
  recentPriceManwon: number; // 실거래가 (만원)
  dealDate: string; // 최근 실거래 체결년월일
  dong?: string;
  totalHouseholds?: number;
  lat: number;
  lon: number;
}

export const KNOWN_COMPLEXES: KnownComplexInfo[] = [
  {
    nameMatch: ['e편한세상서울대입구2차', '이편한세상서울대입구2차', 'e편한세상 서울대입구 2차', '이편한세상 서울대입구 2차'],
    officialName: 'e편한세상서울대입구2차',
    approvalYear: 2020,
    approvalDate: '2020.04',
    typicalAreaM2: 84.92,
    typicalPyeong: 25.68,
    supplyPyeong: 34.2,
    exclusiveRate: 75.1,
    recentPriceManwon: 112000, // 11억 2,000만원
    dealDate: '24.05.18',
    dong: '봉천동',
    totalHouseholds: 519,
    lat: 37.4789,
    lon: 126.9423
  },
  {
    nameMatch: ['e편한세상서울대입구1차', '이편한세상서울대입구1차', 'e편한세상 서울대입구 1차', '이편한세상 서울대입구 1차'],
    officialName: 'e편한세상서울대입구1차',
    approvalYear: 2019,
    approvalDate: '2019.06',
    typicalAreaM2: 84.97,
    typicalPyeong: 25.7,
    supplyPyeong: 34.0,
    exclusiveRate: 75.6,
    recentPriceManwon: 116000, // 11억 6,000만원
    dealDate: '24.06.12',
    dong: '봉천동',
    totalHouseholds: 1531,
    lat: 37.4796,
    lon: 126.9452
  },
  {
    nameMatch: ['관악드림타운', '드림타운'],
    officialName: '관악드림타운',
    approvalYear: 2003,
    approvalDate: '2003.09',
    typicalAreaM2: 84.96,
    typicalPyeong: 25.7,
    supplyPyeong: 33.5,
    exclusiveRate: 76.7,
    recentPriceManwon: 83000, // 8억 3,000만원
    dealDate: '24.06.28',
    dong: '봉천동',
    totalHouseholds: 3544,
    lat: 37.4912,
    lon: 126.9456
  },
  {
    nameMatch: ['신림현대', '신림현대아파트'],
    officialName: '신림현대',
    approvalYear: 1993,
    approvalDate: '1993.05',
    typicalAreaM2: 84.93,
    typicalPyeong: 25.69,
    supplyPyeong: 33.8,
    exclusiveRate: 76.0,
    recentPriceManwon: 76000, // 7억 6,000만원
    dealDate: '24.05.30',
    dong: '신림동',
    totalHouseholds: 1634,
    lat: 37.4764,
    lon: 126.9328
  },
  {
    nameMatch: ['관악산휴먼시아2단지', '휴먼시아2단지', '관악산휴먼시아 2단지'],
    officialName: '관악산휴먼시아2단지',
    approvalYear: 2008,
    approvalDate: '2008.03',
    typicalAreaM2: 84.95,
    typicalPyeong: 25.7,
    supplyPyeong: 33.7,
    exclusiveRate: 76.3,
    recentPriceManwon: 71000, // 7억 1,000만원
    dealDate: '24.04.22',
    dong: '신림동',
    totalHouseholds: 2265,
    lat: 37.4642,
    lon: 126.9295
  },
  {
    nameMatch: ['관악산휴먼시아1단지', '휴먼시아1단지', '관악산휴먼시아 1단지'],
    officialName: '관악산휴먼시아1단지',
    approvalYear: 2008,
    approvalDate: '2008.03',
    typicalAreaM2: 84.92,
    typicalPyeong: 25.69,
    supplyPyeong: 33.7,
    exclusiveRate: 76.2,
    recentPriceManwon: 69000,
    dealDate: '24.04.15',
    dong: '신림동',
    totalHouseholds: 1065,
    lat: 37.4658,
    lon: 126.9312
  },
  {
    nameMatch: ['봉천두산', '두산아파트', '봉천두산아파트'],
    officialName: '봉천두산',
    approvalYear: 2000,
    approvalDate: '2000.12',
    typicalAreaM2: 84.91,
    typicalPyeong: 25.68,
    supplyPyeong: 34.1,
    exclusiveRate: 75.3,
    recentPriceManwon: 92000,
    dealDate: '24.06.05',
    dong: '봉천동',
    totalHouseholds: 2001,
    lat: 37.4851,
    lon: 126.9482
  },
  {
    nameMatch: ['신림푸르지오', '신림푸르지오1차'],
    officialName: '신림푸르지오',
    approvalYear: 2007,
    approvalDate: '2007.10',
    typicalAreaM2: 84.86,
    typicalPyeong: 25.67,
    supplyPyeong: 32.8,
    exclusiveRate: 78.3,
    recentPriceManwon: 87000,
    dealDate: '24.05.20',
    dong: '신림동',
    totalHouseholds: 1456,
    lat: 37.4891,
    lon: 126.9189
  },
  {
    nameMatch: ['보라매우성', '보라매우성아파트'],
    officialName: '보라매우성',
    approvalYear: 1995,
    approvalDate: '1995.12',
    typicalAreaM2: 84.94,
    typicalPyeong: 25.69,
    supplyPyeong: 33.2,
    exclusiveRate: 77.4,
    recentPriceManwon: 78000,
    dealDate: '24.03.18',
    dong: '신림동',
    totalHouseholds: 420,
    lat: 37.4932,
    lon: 126.9248
  },
  {
    nameMatch: ['벽산블루밍', '봉천벽산블루밍'],
    officialName: '봉천벽산블루밍',
    approvalYear: 2005,
    approvalDate: '2005.07',
    typicalAreaM2: 84.99,
    typicalPyeong: 25.71,
    supplyPyeong: 33.5,
    exclusiveRate: 76.7,
    recentPriceManwon: 81000,
    dealDate: '24.05.10',
    dong: '봉천동',
    totalHouseholds: 2105,
    lat: 37.4883,
    lon: 126.9421
  },
  {
    nameMatch: ['마포래미안푸르지오', '마래푸'],
    officialName: '마포래미안푸르지오',
    approvalYear: 2014,
    approvalDate: '2014.09',
    typicalAreaM2: 84.89,
    typicalPyeong: 25.68,
    supplyPyeong: 34.5,
    exclusiveRate: 74.4,
    recentPriceManwon: 185000, // 18억 5,000만원
    dealDate: '24.06.20',
    dong: '아현동',
    totalHouseholds: 3885,
    lat: 37.5518,
    lon: 126.9567
  },
  {
    nameMatch: ['헬리오시티', '가락헬리오시티'],
    officialName: '헬리오시티',
    approvalYear: 2018,
    approvalDate: '2018.12',
    typicalAreaM2: 84.98,
    typicalPyeong: 25.7,
    supplyPyeong: 33.1,
    exclusiveRate: 77.6,
    recentPriceManwon: 215000, // 21억 5,000만원
    dealDate: '24.06.25',
    dong: '가락동',
    totalHouseholds: 9510,
    lat: 37.4981,
    lon: 127.1062
  },
  {
    nameMatch: ['아크로리버파크', '신반포아크로리버파크'],
    officialName: '아크로리버파크',
    approvalYear: 2016,
    approvalDate: '2016.08',
    typicalAreaM2: 84.95,
    typicalPyeong: 25.7,
    supplyPyeong: 34.0,
    exclusiveRate: 75.6,
    recentPriceManwon: 410000, // 41억원
    dealDate: '24.06.15',
    dong: '반포동',
    totalHouseholds: 1612,
    lat: 37.5097,
    lon: 126.9961
  },
  {
    nameMatch: ['반포자이'],
    officialName: '반포자이',
    approvalYear: 2009,
    approvalDate: '2009.03',
    typicalAreaM2: 84.98,
    typicalPyeong: 25.7,
    supplyPyeong: 35.0,
    exclusiveRate: 73.4,
    recentPriceManwon: 360000, // 36억원
    dealDate: '24.06.01',
    dong: '반포동',
    totalHouseholds: 3410,
    lat: 37.5058,
    lon: 127.0125
  },
  {
    nameMatch: ['래미안대치팰리스', '대치래미안'],
    officialName: '래미안대치팰리스',
    approvalYear: 2015,
    approvalDate: '2015.09',
    typicalAreaM2: 84.97,
    typicalPyeong: 25.7,
    supplyPyeong: 34.2,
    exclusiveRate: 75.1,
    recentPriceManwon: 340000,
    dealDate: '24.05.29',
    dong: '대치동',
    totalHouseholds: 1608,
    lat: 37.4942,
    lon: 127.0583
  }
];

export function findKnownComplex(name: string, dongName?: string): KnownComplexInfo | null {
  if (!name) return null;
  // Normalize by removing spaces and common suffixes for clean matching
  const clean = name.replace(/\s+/g, '').toLowerCase();
  const cleanWithoutApt = clean.replace(/아파트$/g, '');

  for (const complex of KNOWN_COMPLEXES) {
    if (dongName && complex.dong) {
      const cleanDong = dongName.replace(/\s+/g, '').toLowerCase();
      const compDong = complex.dong.replace(/\s+/g, '').toLowerCase();
      if (!cleanDong.includes(compDong) && !compDong.includes(cleanDong)) {
        continue;
      }
    }
    for (const match of complex.nameMatch) {
      const matchClean = match.replace(/\s+/g, '').toLowerCase();
      const matchWithoutApt = matchClean.replace(/아파트$/g, '');

      // Strict match: must be exact match or exact match after stripping '아파트'
      // This prevents '신림현대맨션', '신림현대빌라' from falsely matching '신림현대' (신림현대아파트)
      if (clean === matchClean || cleanWithoutApt === matchWithoutApt) {
        return complex;
      }
    }
  }
  return null;
}

