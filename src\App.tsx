import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { SidebarController } from './components/SidebarController';
import { MapListingsView } from './components/MapListingsView';
import { SalesComparisonAnalyzer } from './components/SalesComparisonAnalyzer';
import { FinalValuationReport } from './components/FinalValuationReport';
import { EditListingModal } from './components/EditListingModal';
import { SearchComplexModal } from './components/SearchComplexModal';
import { findKnownComplex } from './data/complexDatabase';
import {
  RealEstateListing,
  AddressResolution,
  TargetPropertyConfig,
  ComparableCaseDetail,
  ComparableAdjustment,
  AppraisalResult,
  AiAppraisalReport
} from './types';

// Distance calculation helper (in meters)
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

// 최근 실거래 체결일을 오늘 기준으로 생성한다 (예전엔 KNOWN_COMPLEXES.dealDate가 '2024.xx.xx'로
// 고정되어 있어서, 목데이터 경로를 탈 때마다 항상 2024년으로 보이는 원인이었다).
function recentDealDateLabel(seed: number): string {
  const daysAgo = (seed * 13 + Math.floor(Math.random() * 11)) % 150; // 최근 ~5개월 이내 분산
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// Generate clean, natural nearby coordinate strictly within the 450m circle (150m ~ 320m radius)
function getCleanNearbyCoordinate(centerLat: number, centerLon: number, index: number): { lat: number; lon: number } {
  const angles = [35, 100, 160, 220, 280, 340, 65, 190, 310];
  const radii = [180, 260, 210, 310, 220, 270, 240, 190, 290];

  const angleDeg = angles[index % angles.length];
  const radiusMeters = radii[index % radii.length];

  const angleRad = (angleDeg * Math.PI) / 180;
  const latRad = (centerLat * Math.PI) / 180;
  const metersPerLat = 111132;
  const metersPerLon = 111320 * Math.cos(latRad);

  const offsetLat = (radiusMeters * Math.sin(angleRad)) / metersPerLat;
  const offsetLon = (radiusMeters * Math.cos(angleRad)) / metersPerLon;

  return {
    lat: parseFloat((centerLat + offsetLat).toFixed(6)),
    lon: parseFloat((centerLon + offsetLon).toFixed(6))
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'map' | 'comparison' | 'report'>('map');
  const [addressInput, setAddressInput] = useState<string>('신림동');
  const [propertyType, setPropertyType] = useState<'APT' | 'OPST' | 'VL'>('APT');
  const [searchRadiusM, setSearchRadiusM] = useState<number>(500);

  const [addressInfo, setAddressInfo] = useState<AddressResolution>({
    success: true,
    source: 'init',
    address: '서울특별시 관악구 신림동',
    cortarNo: '1162010200',
    lat: 37.4784,
    lon: 126.9320
  });

  const [targetConfig, setTargetConfig] = useState<TargetPropertyConfig>({
    address: '서울특별시 관악구 신림동',
    rletTpCd: 'APT',
    targetPyeong: 25.7,
    targetAreaM2: 84.95,
    comparableMinPyeong: 20,
    comparableMaxPyeong: 30,
    targetHouseholds: 200,
    comparableMinHouseholds: 150,
    comparableMaxHouseholds: 250,
    targetApprovalYear: 2026,
    targetFloorInfo: '로열층',
    memo: ''
  });

  // listings는 지도에 실제 GPS가 검증된 단지만, tableListings는 좌표 미확인 실거래도 포함한다.
  const [listings, setListings] = useState<RealEstateListing[]>([]);
  const [tableListings, setTableListings] = useState<RealEstateListing[]>([]);
  const [textCandidateListings, setTextCandidateListings] = useState<RealEstateListing[]>([]);
  const [areaCandidateListings, setAreaCandidateListings] = useState<RealEstateListing[]>([]);
  // 주소가 확인된 '그 외 비교물건'은 지도에 작은 초록 마커로 보조 표시한다.
  const [addressResolvedListings, setAddressResolvedListings] = useState<RealEstateListing[]>([]);
  // 표의 체크박스는 비교분석 선정과 별개인 지도 표시 여부다.
  const [mapVisibleIds, setMapVisibleIds] = useState<string[]>([]);
  const [comparableCases, setComparableCases] = useState<ComparableCaseDetail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<AiAppraisalReport | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const hasInitialSyncRun = useRef(false);

  // Modals state for precise complex editing and searching
  const [editingListing, setEditingListing] = useState<RealEstateListing | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isSearchComplexModalOpen, setIsSearchComplexModalOpen] = useState<boolean>(false);

  // 세대수는 정보 표시용이지 필터 조건이 아니다 - 예전엔 실거래 항목의 totalHouseholds가
  // 거의 항상 비어있어서(건축물대장 보완 전) 아래 세대수 범위 조건이 사실상 무시되고
  // 있었는데, 세대수 보완(enrichComparableBuildingMetadata) 기능이 실제 값을 채우기
  // 시작하면서 기본 범위(150~250세대)를 벗어나는 대부분의 실제 단지가 화면에서 통째로
  // 걸러지는 회귀가 생겼다. 면적 조건만 매칭에 쓰고 세대수는 매칭에서 완전히 제외한다.
  const matchesComparableTarget = (item: RealEstateListing) =>
      item.dedicatedPyeong >= targetConfig.comparableMinPyeong &&
      (targetConfig.comparableMaxPyeong >= 60.5 ||
          item.dedicatedPyeong <= targetConfig.comparableMaxPyeong);

  // Helper to query Kakao Places SDK on the client for REAL actual apartment complexes around GPS coords
  const fetchLiveKakaoComplexes = async (
      lat: number,
      lon: number,
      rletTp: 'APT' | 'OPST' | 'VL',
      dongName: string,
      poolRadiusM: number
  ): Promise<RealEstateListing[]> => {
    if (typeof window === 'undefined' || !window.kakao?.maps?.services?.Places) {
      return [];
    }

    try {
      const places = new window.kakao.maps.services.Places();
      const cleanDong = (dongName || '신림동').includes(' ') ? dongName.split(' ').slice(-1)[0] : (dongName || '신림동');
      const typeKeyword = rletTp === 'APT' ? '아파트' : rletTp === 'OPST' ? '오피스텔' : '빌라';
      const searchTarget = `${cleanDong} ${typeKeyword}`.trim();

      // 아파트 검색은 카카오의 공식 카테고리 코드(AD5)로 제한한다 - 안 하면 이름이 텍스트로만
      // 비슷한 무관한 업체(식당, 상가 등)까지 "아파트"로 잘못 섞여 들어올 수 있다.
      // 오피스텔/빌라는 별도 전용 카테고리 코드가 없어 키워드 검색만 사용한다.
      const searchOptions: any = {
        location: new window.kakao.maps.LatLng(lat, lon),
        radius: poolRadiusM,
        sort: window.kakao.maps.services.SortBy.ACCURACY
      };
      if (rletTp === 'APT') {
        searchOptions.category_group_code = 'AD5';
      }

      const placeResults = await new Promise<any[]>((resolve) => {
        places.keywordSearch(
            searchTarget,
            (data: any[], status: any) => {
              if (status === window.kakao.maps.services.Status.OK && Array.isArray(data) && data.length > 0) {
                resolve(data);
              } else {
                places.keywordSearch(
                    typeKeyword,
                    (data2: any[], status2: any) => {
                      if (status2 === window.kakao.maps.services.Status.OK && Array.isArray(data2) && data2.length > 0) {
                        resolve(data2);
                      } else {
                        resolve([]);
                      }
                    },
                    searchOptions
                );
              }
            },
            searchOptions
        );
      });

      // Realistic regional market base valuation
      const isGangnam = lon > 127.0 && lat < 37.54;
      const isYongsanMapo = lat >= 37.52 && lat <= 37.56 && lon <= 126.98;
      const isBundangPangyo = lat >= 37.35 && lat <= 37.42 && lon >= 127.08;

      let basePyeong = rletTp === 'APT' ? 3200 : rletTp === 'OPST' ? 2400 : 1800;
      if (isGangnam) basePyeong = rletTp === 'APT' ? 6800 : 3800;
      else if (isYongsanMapo) basePyeong = rletTp === 'APT' ? 4800 : 3000;
      else if (isBundangPangyo) basePyeong = rletTp === 'APT' ? 4200 : 2800;

      const yearPresets = [2021, 2017, 2013, 2006, 1999, 1994, 2019, 2010];
      const pyeongPresets = [25.7, 34.5, 18.2, 25.8, 33.4, 45.1, 15.6];

      const realList: RealEstateListing[] = [];
      const seenNames = new Set<string>();
      const rentalKeywords = ['청년안심주택', '임대주택', '공공임대', '행복주택', '영구임대', '역세권청년주택', 'SH임대', 'LH임대', '기숙사', '관리사무소', '노인정', '공인중개사', '상가동'];

      if (Array.isArray(placeResults) && placeResults.length > 0) {
        for (let i = 0; i < placeResults.length; i++) {
          const item = placeResults[i];
          const rawName = (item.place_name || '').trim();
          const rawAddress = (item.address_name || item.road_address_name || '').trim();
          if (!rawName || seenNames.has(rawName)) continue;

          // Exclude non-sale public rental/youth rental housing
          if (rentalKeywords.some(kw => rawName.includes(kw))) {
            continue;
          }

          const pLat = parseFloat(item.y);
          const pLon = parseFloat(item.x);

          if (!pLat || !pLon || isNaN(pLat) || isNaN(pLon)) continue;

          // Kakao keywordSearch의 radius 옵션은 강제 범위가 아니라 정렬용 힌트일 뿐이라,
          // 근처에 매물이 부족하면 실제로는 반경 훨씬 밖에 있는 동명 결과도 섞여 들어온다.
          // 실제 거리로 다시 한번 걸러내지 않으면 엉뚱한 곳의 단지가 대상지 근처에 표시된다.
          if (getDistanceMeters(lat, lon, pLat, pLon) > poolRadiusM) continue;

          seenNames.add(rawName);

          const known = findKnownComplex(rawName, cleanDong);

          if (known) {
            const pricePerPyeong = Math.round(known.recentPriceManwon / known.typicalPyeong);
            const supplyPricePerPyeong = Math.round(known.recentPriceManwon / known.supplyPyeong);

            realList.push({
              id: `kakao-real-${item.id || i}-${Date.now()}`,
              articleName: known.officialName,
              buildingName: rawAddress || `${101 + (i % 6)}동`,
              floorInfo: `${(i % 14) + 3}층`,
              dedicatedAreaM2: known.typicalAreaM2,
              dedicatedPyeong: known.typicalPyeong,
              supplyPyeong: known.supplyPyeong,
              exclusiveRate: known.exclusiveRate,
              priceManwon: known.recentPriceManwon,
              pricePerPyeong,
              supplyPricePerPyeong,
              dealDate: recentDealDateLabel(i),
              useApprovalDate: known.approvalDate.replace(/\s*\(\d{4}년식\)/g, '').replace(/^\d{2}(\d{2})/, '$1'),
              approvalYear: known.approvalYear,
              lat: pLat, // Always use exact physical coordinates of this complex
              lon: pLon,
              rletTpCd: rletTp,
              tradTpCd: 'A1',
              totalHouseholds: known.totalHouseholds,
              isEstimated: true
            });
          } else {
            const year = yearPresets[i % yearPresets.length];
            const pyeong = pyeongPresets[i % pyeongPresets.length];
            const areaM2 = parseFloat((pyeong * 3.305785).toFixed(2));
            const supplyPyeong = parseFloat((pyeong * 1.325).toFixed(1));
            const exclusiveRate = parseFloat(((pyeong / supplyPyeong) * 100).toFixed(1));

            const ageDiff = new Date().getFullYear() - year;
            const ageFactor = Math.max(0.68, 1.0 - (ageDiff * 0.012));
            const variation = 0.94 + ((i * 37) % 13) * 0.01;
            const pyeongPrice = Math.round(basePyeong * ageFactor * variation);
            const priceManwon = Math.round(pyeongPrice * pyeong);
            const supplyPricePerPyeong = Math.round(priceManwon / supplyPyeong);

            realList.push({
              id: `kakao-real-${item.id || i}-${Date.now()}`,
              articleName: rawName,
              buildingName: rawAddress || (rletTp === 'VL' ? '101호' : `${101 + (i % 6)}동`),
              floorInfo: `${(i % 14) + 3}층`,
              dedicatedAreaM2: areaM2,
              dedicatedPyeong: pyeong,
              supplyPyeong,
              exclusiveRate,
              priceManwon,
              pricePerPyeong: pyeongPrice,
              supplyPricePerPyeong,
              dealDate: recentDealDateLabel(i),
              useApprovalDate: `${String(year).slice(-2)}.05`,
              approvalYear: year,
              lat: pLat, // Always use exact physical coordinates of this complex
              lon: pLon,
              rletTpCd: rletTp,
              tradTpCd: 'A1',
              isEstimated: true
            });
          }

          if (realList.length >= 8) break;
        }
      }

      // If fewer than 6 complexes found, generate natural nearby comps strictly within 180m~310m of subject lat/lon
      if (realList.length < 6) {
        const brandNames = rletTp === 'APT'
            ? ['현대아파트', '푸르지오', '래미안', '힐스테이트', 'e편한세상', '자이']
            : rletTp === 'OPST'
                ? ['센트럴오피스텔', '메트로타워', '디오빌', '아스테리움', '프라임레지던스', '더클래스']
                : ['삼성빌리지', '현대하이츠', '다온캐슬', '노블레스빌', '그린포레', '샤인힐스'];

        const existingCount = realList.length;
        for (let k = existingCount; k < 6; k++) {
          const compCoord = getCleanNearbyCoordinate(lat, lon, k);
          const year = yearPresets[k % yearPresets.length];
          const pyeong = pyeongPresets[k % pyeongPresets.length];
          const areaM2 = parseFloat((pyeong * 3.305785).toFixed(2));
          const supplyPyeong = parseFloat((pyeong * 1.325).toFixed(1));
          const exclusiveRate = parseFloat(((pyeong / supplyPyeong) * 100).toFixed(1));

          const ageDiff = new Date().getFullYear() - year;
          const ageFactor = Math.max(0.68, 1.0 - (ageDiff * 0.012));
          const pyeongPrice = Math.round(basePyeong * ageFactor);
          const priceManwon = Math.round(pyeongPrice * pyeong);
          const supplyPricePerPyeong = Math.round(priceManwon / supplyPyeong);

          realList.push({
            id: `nearby-comp-${k}-${Date.now()}`,
            articleName: `${cleanDong} ${brandNames[k % brandNames.length]}`,
            buildingName: rletTp === 'VL' ? '101호' : `${101 + k}동`,
            floorInfo: `${(k % 12) + 4}층`,
            dedicatedAreaM2: areaM2,
            dedicatedPyeong: pyeong,
            supplyPyeong,
            exclusiveRate,
            priceManwon,
            pricePerPyeong: pyeongPrice,
            supplyPricePerPyeong,
            dealDate: recentDealDateLabel(k),
            useApprovalDate: `${String(year).slice(-2)}.06`,
            approvalYear: year,
            lat: compCoord.lat,
            lon: compCoord.lon,
            rletTpCd: rletTp,
            tradTpCd: 'A1',
            isEstimated: true
          });
        }
      }

      return realList;
    } catch (err) {
      console.warn('[Live Kakao Places Search Failed]', err);
      return [];
    }
  };

  // 국토부 실거래가 공개시스템(MOLIT) 백엔드 프록시 호출.
  // Kakao Places 결과 수와 무관하게 항상 시도해야, 진짜 실거래가가 있을 때
  // 지역 시세 추정치(fetchLiveKakaoComplexes의 fabricated price)에 가려지지 않는다.
  const fetchMolitRealTransactions = async (
      cortarNo: string,
      dongName: string,
      lat: number,
      lon: number,
      rletTpCd: 'APT' | 'OPST' | 'VL',
      months: number = 5,
      complexNames?: string[]
  ): Promise<RealEstateListing[]> => {
    try {
      const molitRes = await fetch('/api/molit-real-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawdCd: cortarNo || '11620', dongName, lat, lon, rletTpCd, months, complexNames })
      });
      if (!molitRes.ok) return [];
      const molitJson = await molitRes.json();
      if (molitJson.success && Array.isArray(molitJson.data)) {
        return molitJson.data;
      }
      return [];
    } catch (mErr) {
      console.warn('[MOLIT Fetch Client Error]', mErr);
      return [];
    }
  };

  // buildingName은 molitService가 채운 "동(+가) 지번"(예: "문래동6가 12")에서 "동" 이름만 뽑는다.
  const extractDongName = (buildingName?: string | null): string => {
    const match = (buildingName || '').match(/[가-힣]+\d*동(?:\d+가)?/);
    return match ? match[0] : '';
  };

  // "서울특별시 영등포구 문래동 ..." 같은 전체 주소에서 "시/도 + 구/군"만 남긴다.
  const extractRegionPrefix = (fullAddress?: string | null): string => {
    const parts = (fullAddress || '').trim().split(/\s+/).filter(Boolean);
    // 카카오가 "서울 관악구"처럼 첫 행정구역을 축약해 반환하는 경우도 있어,
    // 두 번째 행정구역(시·군·구)까지의 모든 토큰을 접두어로 쓴다.
    const districtIndex = parts.findIndex((part, index) => index > 0 && /(?:시|군|구)$/.test(part));
    if (districtIndex >= 0) return parts.slice(0, districtIndex + 1).join(' ');
    return /(?:특별시|광역시|특별자치시|도|시)$/.test(parts[0] || '') ? (parts[0] || '') : '';
  };

  // 특정 "구+동" 텍스트를 카카오 지오코더로 조회해 법정동코드(b_code, 10자리)를 얻는다.
  const resolveDongCode = (regionPrefix: string, dongName: string): Promise<string | null> => {
    return new Promise(resolve => {
      if (typeof window === 'undefined' || !window.kakao?.maps?.services || !dongName) {
        resolve(null);
        return;
      }
      const geocoder = new window.kakao.maps.services.Geocoder();
      const query = regionPrefix ? `${regionPrefix} ${dongName}` : dongName;
      geocoder.addressSearch(query, (result: any[], status: any) => {
        if (status === window.kakao.maps.services.Status.OK && result && result.length > 0) {
          resolve(result[0].address?.b_code || result[0].road_address?.b_code || null);
          return;
        }
        resolve(null);
      });
    });
  };

  // 건축물대장·주택인허가 API의 확인값만 실거래 비교단지에 병합한다.
  // MOLIT 실거래는 구(시군구) 단위로 조회되어 대상지와 다른 동의 비교단지도 섞여 있지만,
  // 건축물대장/주택인허가는 동 단위로만 조회할 수 있다. 대상지 자신의 동(cortarNo) 하나만
  // 조회하면 다른 동에 있는 비교단지는 건축 데이터를 아예 못 가져와 세대수/용적률이 거의
  // 안 채워지는 문제가 실측으로 확인됐다(문래동6가 검색 시 18건 중 2건만 세대수 매칭) -
  // 비교단지들이 실제로 위치한 동을 전부 모아 각각의 법정동코드를 미리 구해 서버에 같이 보낸다.
  const enrichComparableBuildingMetadata = async (
      cortarNo: string,
      regionPrefix: string,
      transactions: RealEstateListing[]
  ): Promise<RealEstateListing[]> => {
    if (!cortarNo || cortarNo.length < 10 || transactions.length === 0) return transactions;
    try {
      // 비교대상에 실제로 포함된 모든 법정동을 보완 대상으로 사용한다.
      // 서버가 2개 동씩 순차 조회하므로 프론트에서 임의로 8개 동으로 자르지 않는다.
      const uniqueDongNames = Array.from(
          new Set(transactions.map(item => extractDongName(item.buildingName)).filter(Boolean))
      );
      const resolvedDongCodes = await Promise.all(
          uniqueDongNames.map(dong => resolveDongCode(regionPrefix, dong))
      );
      const dongCodes = Array.from(new Set(resolvedDongCodes.filter((c): c is string => !!c)));

      const response = await fetch('/api/building-platform/enrich-comparables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cortarNo,
          dongCodes,
          listings: transactions.map(item => ({
            id: item.id,
            articleName: item.articleName,
            buildingName: item.buildingName,
            rletTpCd: item.rletTpCd
          }))
        })
      });
      const payload = response.ok ? await response.json() : null;
      if (!payload?.success || !payload?.data) return transactions;
      return transactions.map(item => {
        const metadata = payload.data[item.id];
        return metadata ? { ...item, ...metadata } : item;
      });
    } catch {
      return transactions;
    }
  };

  // 단지명 비교용 정규화 - 공백/대소문자 차이, '아파트'/'단지' 접미사 유무 때문에 같은
  // 단지인데도 문자열이 안 맞아 매칭을 놓치는 걸 방지한다. (실측: "은천1단지아파트" vs
  // MOLIT 표기 "은천1" - "아파트"만 한 번 제거하면 "은천1단지"가 남아 여전히 안 맞았음)
  const normalizeComplexName = (name: string): string => {
    let n = (name || '').replace(/\s+/g, '').toLowerCase();
    let prev: string;
    do {
      prev = n;
      n = n.replace(/(아파트|단지)$/, '');
    } while (n !== prev);
    return n;
  };

  // Kakao Places 키워드 검색으로 단지명 자체를 직접 지오코딩한다 (이름 매칭이 안 됐을 때의 최후 수단).
  // 실측으로 확인된 문제: 카테고리 제한 없이 이름만으로 검색하면 "목화"(식당/상가 등 무관한
  // 업체), "태성"(전혀 다른 동네의 동명 부동산/상가)처럼 이름만 같은 완전히 무관한 장소가
  // 걸려서, 3km 이내라는 이유만으로 진짜 그 단지인 것처럼 좌표가 잘못 채워지는 사례가 있었다.
  // fetchLiveKakaoComplexes의 1차 검색에는 이미 category_group_code: 'AD5'(카카오 공식
  // "아파트" 카테고리) 제한이 있었는데, 이 최후 수단 함수에는 빠져있었던 게 근본 원인이다.
  const geocodeComplexByName = (
      name: string,
      lat: number,
      lon: number,
      rletTpCd?: 'APT' | 'OPST' | 'VL',
      addressHint?: string
  ): Promise<{ lat: number; lon: number } | null> => {
    return new Promise(resolve => {
      if (typeof window === 'undefined' || !window.kakao?.maps?.services?.Places) {
        resolve(null);
        return;
      }
      const places = new window.kakao.maps.services.Places();
      // 오피스텔/빌라는 카카오에 전용 카테고리 코드가 없어 키워드 검색만 사용한다.
      const searchOptions: any = {
        location: new window.kakao.maps.LatLng(lat, lon),
        radius: 3000,
        sort: window.kakao.maps.services.SortBy.ACCURACY
      };
      if (rletTpCd === 'APT') {
        searchOptions.category_group_code = 'AD5';
      }
      // 동·지번을 함께 넣어 동명이인 단지가 다른 지역에 찍히는 것을 막는다.
      const query = addressHint ? `${addressHint} ${name}` : name;
      places.keywordSearch(
          query,
          (data: any[], status: any) => {
            if (status === window.kakao.maps.services.Status.OK && Array.isArray(data) && data.length > 0) {
              const pLat = parseFloat(data[0].y);
              const pLon = parseFloat(data[0].x);
              if (!isNaN(pLat) && !isNaN(pLon)) {
                resolve({ lat: pLat, lon: pLon });
                return;
              }
            }
            resolve(null);
          },
          searchOptions
      );
    });
  };

  // 부동산원 단지 식별정보(getAptInfo)로 얻은 "정확한 주소"를 카카오의 정밀 주소
  // 지오코더(addressSearch)로 변환한다. 이건 텍스트 키워드 검색이 아니라 정확한 지번/도로명
  // 주소 매칭이라, 이름만 비슷한 동명이인이 섞일 위험이 훨씬 적다.
  // addressHint는 대상지 주변 동 이름이 아니라, 그 실거래 건 자체의 "동+지번"(예: "신림동
  // 1580-3")을 넘긴다 - 동 이름만 넘기면 그 동네 다세대/연립까지 수백 건이 걸려서 API의
  // 페이지당 100건 제한 안에 원하는 단지가 안 들어가는 문제가 있었다.
  const geocodeComplexByRegistry = async (name: string, addressHint: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const res = await fetch('/api/apt-complex-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complexName: name, addressHint })
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.success || !data.address) return null;
      if (typeof window === 'undefined' || !window.kakao?.maps?.services) return null;

      return await new Promise(resolve => {
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.addressSearch(data.address, (result: any[], status: any) => {
          if (status === window.kakao.maps.services.Status.OK && result && result.length > 0) {
            const pLat = parseFloat(result[0].y);
            const pLon = parseFloat(result[0].x);
            if (!isNaN(pLat) && !isNaN(pLon)) {
              resolve({ lat: pLat, lon: pLon });
              return;
            }
          }
          resolve(null);
        });
      });
    } catch (err) {
      console.warn('[AptComplexRegistry Client Error]', err);
      return null;
    }
  };

  // 국토부 응답의 법정동·지번은 실제 주소이므로, 단지명 키워드보다 먼저 주소로 좌표를 확인한다.
  // 이름이 비슷한 다른 지역의 단지로 이동하는 문제를 막으면서도, 장소 카테고리에 누락된 단지를
  // 빈 화면으로 버리지 않기 위한 처리다.
  const geocodeTransactionAddress = (addressHint?: string): Promise<{ lat: number; lon: number } | null> => {
    return new Promise(resolve => {
      if (!addressHint || typeof window === 'undefined' || !window.kakao?.maps?.services?.Geocoder) {
        resolve(null);
        return;
      }
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(addressHint, (data: any[], status: any) => {
        if (status === window.kakao.maps.services.Status.OK && Array.isArray(data) && data.length > 0) {
          const lat = Number(data[0].y);
          const lon = Number(data[0].x);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            resolve({ lat, lon });
            return;
          }
        }
        resolve(null);
      });
    });
  };

  // Kakao 이름 검색(keywordSearch)의 radius 파라미터는 "힌트"일 뿐 강제 범위가 아니라서,
  // 반경 안에 아무것도 없으면 훨씬 먼 동명이인 결과를 돌려줄 수 있다 (실제로 3km 넘게 떨어진
  // "영등포자이르네"가 매칭된 사례 확인됨). 검색 풀 범위를 벗어난 매칭은 신뢰하지 않는다.
  const MAX_PLAUSIBLE_MATCH_DISTANCE_M = 3000;

  // MOLIT 실거래는 단지명보다 법정동+지번을 위치 식별의 기준으로 사용한다.
  // 카카오 지도 표기명(예: "신동아아파트")과 MOLIT 단지명(예: "신동아")이 달라도
  // 같은 지번이면 동일 좌표를 사용해야 한다. 단지명은 지번이 없거나 주소 조회가 실패했을 때만 fallback이다.

  // 전체 주소/짧은 지번 주소를 모두 "법정동(+가/읍/면/리)+지번" 형태로 정규화한다.
  // 특정 구 이름을 하드코딩해서 제거하지 않기 때문에 전국 주소에 동일하게 적용된다.
  const normalizeParcel = (value?: string | null): string => {
    const raw = (value || '').trim();
    if (!raw) return '';

    const parcelMatch = raw.match(/([가-힣0-9]+(?:동(?:\d+가)?|가|읍|면|리))\s*(\d+(?:-\d+)?)/);
    if (parcelMatch) {
      const dong = parcelMatch[1].replace(/\s+/g, '');
      const jibun = parcelMatch[2].replace(/-0$/, '');
      return `${dong}${jibun}`.toLowerCase();
    }

    return raw.replace(/\s+/g, '').replace(/-0$/, '').toLowerCase();
  };

  const hasParcelAddress = (value?: string | null): boolean =>
      /(?:동(?:\d+가)?|가|읍|면|리)\s*\d+(?:-\d+)?/.test(value || '');

  const mergeMolitCoordsWithKakao = async (
      molitItems: RealEstateListing[],
      kakaoComplexes: RealEstateListing[],
      centerLat: number,
      centerLon: number,
      regionPrefix: string,
      onProgress?: (resolved: RealEstateListing[]) => void
  ): Promise<RealEstateListing[]> => {
    // 카카오 Places가 반환한 실제 주소를 지번 기준으로 인덱싱한다.
    // 카카오 단지명과 MOLIT 단지명이 달라도 주소가 같으면 여기서 바로 매칭된다.
    const kakaoByParcel = new Map<string, RealEstateListing>();
    for (const kakaoItem of kakaoComplexes) {
      const parcelKey = normalizeParcel(kakaoItem.buildingName);
      if (parcelKey && /\d/.test(parcelKey) && !kakaoByParcel.has(parcelKey)) {
        kakaoByParcel.set(parcelKey, kakaoItem);
      }
    }

    const resolved: RealEstateListing[] = [];
    const needsResolution: RealEstateListing[] = [];

    for (const item of molitItems) {
      if (item.positionVerified && Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
        resolved.push(item);
        continue;
      }

      const parcelKey = normalizeParcel(item.buildingName);
      const addressMatch = parcelKey ? kakaoByParcel.get(parcelKey) : undefined;
      if (
          addressMatch &&
          getDistanceMeters(centerLat, centerLon, addressMatch.lat, addressMatch.lon) <= MAX_PLAUSIBLE_MATCH_DISTANCE_M
      ) {
        resolved.push({
          ...item,
          lat: addressMatch.lat,
          lon: addressMatch.lon,
          positionVerified: true
        });
        continue;
      }

      needsResolution.push(item);
    }

    // 지번이 있으면 "지번" 자체가 위치 키다. 같은 지번인데 단지명 표기만 다른 거래가
    // 서로 다른 지오코딩 요청으로 갈라지지 않도록 이름을 키에서 제거한다.
    const getResolutionKey = (item: RealEstateListing): string => {
      const parcelKey = normalizeParcel(item.buildingName);
      if (parcelKey && hasParcelAddress(item.buildingName)) return `parcel:${parcelKey}`;
      return `name:${normalizeComplexName(item.articleName)}|${parcelKey}`;
    };

    const uniqueKeys = Array.from(new Set(needsResolution.map(getResolutionKey)));
    const coordsByKey = new Map<string, { lat: number; lon: number } | null>();

    const resolveOne = async (key: string) => {
      const sample = needsResolution.find(item => getResolutionKey(item) === key);
      if (!sample) {
        coordsByKey.set(key, null);
        return;
      }

      const fullTransactionAddress = regionPrefix
          ? `${regionPrefix} ${sample.buildingName}`.trim()
          : sample.buildingName;

      // 1순위: MOLIT 법정동+지번을 카카오 주소 지오코더로 직접 확인한다.
      let geocoded = await geocodeTransactionAddress(fullTransactionAddress);

      // 2순위: 지번 주소가 카카오 addressSearch에서 바로 안 잡히는 경우,
      // 부동산원 단지 식별정보로 정확한 지번/도로명 주소를 얻은 뒤 다시 지오코딩한다.
      // 기존 함수는 구현되어 있었지만 실제 병합 흐름에서 호출되지 않아 누락이 발생했다.
      if (!geocoded && sample.rletTpCd === 'APT') {
        geocoded = await geocodeComplexByRegistry(sample.articleName, sample.buildingName);
      }

      // 3순위: 주소 정보 자체가 없는 데이터만 단지명 Places 검색을 허용한다.
      // 지번이 있는 거래를 이름으로 재검색하면 동명이인 단지로 잘못 이동할 수 있으므로 사용하지 않는다.
      if (!geocoded && !hasParcelAddress(sample.buildingName)) {
        geocoded =
            await geocodeComplexByName(
                sample.articleName,
                centerLat,
                centerLon,
                sample.rletTpCd,
                sample.buildingName
            ) ||
            await geocodeComplexByName(
                sample.articleName,
                centerLat,
                centerLon,
                sample.rletTpCd
            );
      }

      const plausible =
          geocoded &&
          getDistanceMeters(centerLat, centerLon, geocoded.lat, geocoded.lon) <= MAX_PLAUSIBLE_MATCH_DISTANCE_M;

      coordsByKey.set(key, plausible ? geocoded! : null);

      if (!plausible) {
        console.warn('[MOLIT Position Unresolved]', {
          articleName: sample.articleName,
          buildingName: sample.buildingName,
          fullTransactionAddress
        });
      }
    };

    // 카카오 호출 제한을 피하면서도 첫 결과를 빠르게 표시하기 위해 5개씩 병렬 처리한다.
    const emittedIds = new Set<string>();
    for (let i = 0; i < uniqueKeys.length; i += 5) {
      await Promise.all(uniqueKeys.slice(i, i + 5).map(resolveOne));

      for (const item of needsResolution) {
        const coords = coordsByKey.get(getResolutionKey(item));
        if (!coords || emittedIds.has(item.id)) continue;

        emittedIds.add(item.id);
        resolved.push({
          ...item,
          lat: coords.lat,
          lon: coords.lon,
          positionVerified: true
        });
      }

      onProgress?.([...resolved]);
    }

    return resolved;
  };

  // 지도 대표 거래도 단지명보다 지번을 우선한다. 같은 건물인데 데이터 공급처별 단지명이
  // "신동아" / "신동아아파트"처럼 달라도 같은 지번+전용면적이면 하나의 건물로 취급한다.
  const keepLatestTransactionPerComplexArea = (items: RealEstateListing[]): RealEstateListing[] => {
    const seen = new Set<string>();
    return [...items]
        .sort((a, b) => Number((b.dealDate || '').replace(/\D/g, '')) - Number((a.dealDate || '').replace(/\D/g, '')))
        .filter(item => {
          const parcelKey = normalizeParcel(item.buildingName);
          const identityKey = parcelKey && hasParcelAddress(item.buildingName)
              ? `parcel:${parcelKey}`
              : `name:${normalizeComplexName(item.articleName)}`;
          const key = `${identityKey}-${Math.round(item.dedicatedAreaM2)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
  };

  // Helper to geocode via Kakao Client SDK or backend
  const resolveAddressLocation = async (query: string): Promise<AddressResolution> => {
    // 1. Try Kakao Client Geocoder & Places if loaded
    if (typeof window !== 'undefined' && window.kakao?.maps?.services) {
      try {
        const clientRes = await new Promise<AddressResolution | null>((resolve) => {
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(query, (result: any[], status: any) => {
            if (status === window.kakao.maps.services.Status.OK && result && result.length > 0) {
              const item = result[0];
              const lat = parseFloat(item.y);
              const lon = parseFloat(item.x);
              const formatted = item.road_address?.address_name || item.address?.address_name || query;
              const bCode = item.address?.b_code || item.road_address?.building_code || '1162010200';
              resolve({
                success: true,
                source: 'kakao_client_geocoder',
                address: formatted,
                cortarNo: bCode,
                lat,
                lon
              });
              return;
            }

            // Fallback to keyword search (Places)
            const places = new window.kakao.maps.services.Places();
            places.keywordSearch(query, (placeList: any[], pStatus: any) => {
              if (pStatus === window.kakao.maps.services.Status.OK && placeList && placeList.length > 0) {
                const p = placeList[0];
                const lat = parseFloat(p.y);
                const lon = parseFloat(p.x);
                const formatted = p.road_address_name || p.address_name || query;

                // Places 결과엔 법정동코드(b_code)가 없다. 좌표->행정구역 역지오코딩으로 정확한
                // cortarNo를 구하지 않으면 항상 하드코딩된 관악구 코드로 국토부 API를 호출해서
                // 전혀 다른 지역의 실거래가가 대상지 근처에 섞여 표시되는 문제가 생긴다.
                geocoder.coord2RegionCode(lon, lat, (regionResult: any[], regionStatus: any) => {
                  let bCode = '1162010200';
                  if (regionStatus === window.kakao.maps.services.Status.OK && Array.isArray(regionResult)) {
                    const legalDong = regionResult.find((r: any) => r.region_type === 'B') || regionResult[0];
                    if (legalDong?.code) bCode = legalDong.code;
                  }
                  resolve({
                    success: true,
                    source: 'kakao_client_places',
                    address: formatted,
                    cortarNo: bCode,
                    lat,
                    lon
                  });
                });
                return;
              }
              resolve(null);
            });
          });
        });

        if (clientRes) return clientRes;
      } catch (err) {
        console.warn('[Kakao Client Geocoder Fallback]', err);
      }
    }

    // 2. Query Backend Geocoder (Nationwide DB & Nominatim)
    try {
      const res = await fetch('/api/convert-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: query })
      });
      if (res.ok) {
        const data: AddressResolution = await res.json();
        if (data.success) return data;
      }
    } catch (err) {
      console.warn('[Backend Geocoder Error]', err);
    }

    // 3. Absolute Fallback
    return {
      success: true,
      source: 'fallback_default',
      address: `서울특별시 ${query}`,
      cortarNo: '1162010200',
      lat: 37.4784,
      lon: 126.9320
    };
  };

  // Helper to create comparable case details
  const createComparableCase = (item: RealEstateListing): ComparableCaseDetail => {
    const ageDiff = (targetConfig.targetApprovalYear || 2026) - (item.approvalYear || 2020);
    const suggestedAgeFactor = Math.min(1.30, Math.max(1.0, 1.0 + ageDiff * 0.012));

    const defaultAdj: ComparableAdjustment = {
      listingId: item.id,
      timeFactor: 1.0,
      locationFactor: 1.0,
      individualAgeFactor: parseFloat(suggestedAgeFactor.toFixed(2)),
      areaFactor: 1.0,
      weight: 1.0
    };

    const totalFactor =
        defaultAdj.timeFactor *
        defaultAdj.locationFactor *
        defaultAdj.individualAgeFactor *
        defaultAdj.areaFactor;
    const adjustedPricePerPyeong = Math.round(item.pricePerPyeong * totalFactor);

    return {
      listing: item,
      adjustment: defaultAdj,
      totalFactor,
      adjustedPricePerPyeong
    };
  };

  // Synchronize data from address search
  const handleSyncData = async () => {
    setIsLoading(true);
    try {
      // 1. Resolve Address & Exact Coordinates
      const resolved = await resolveAddressLocation(addressInput);

      setAddressInfo(resolved);
      setTargetConfig(prev => ({
        ...prev,
        address: resolved.address,
        rletTpCd: propertyType
      }));

      // Comparable pool always reaches out to double the displayed map-circle radius
      // (300m circle -> 600m pool, 500m -> 1km, 1km -> 2km)
      const poolRadiusM = searchRadiusM;

      // 2. Fetch live REAL complex names/locations (Kakao Places) AND official MOLIT
      // 실거래가 concurrently. MOLIT must always be attempted — previously it only ran
      // when Kakao Places came up short, so real transaction prices were almost never
      // used even when available, and every listing fell back to estimated pricing.
      const realKakaoComplexes = await fetchLiveKakaoComplexes(
          resolved.lat,
          resolved.lon,
          propertyType,
          addressInput,
          poolRadiusM
      );
      // 지도는 최근 거래를 우선 사용한다. 3년 이력은 단지 상세 패널에서 별도 조회한다.
      const rawMolitItems = await fetchMolitRealTransactions(
          resolved.cortarNo || '11620',
          addressInput,
          resolved.lat,
          resolved.lon,
          propertyType
      );
      // 세대수/용적률 보완(enrichComparableBuildingMetadata)은 반드시 "동일 단지·면적당 대표
      // 거래건 하나"로 줄인 뒤에 실행해야 한다 - 원래는 원본 거래건(최대 380개) 전체를 먼저
      // 보완하고 그 다음에 최신순 대표 거래건만 골랐는데, 그러면 어떤 단지가 여러 거래건 중
      // 일부만 매칭에 성공해도 정작 "최신 거래건"으로 뽑히는 건 매칭 안 된 다른 거래건이라서
      // 보완 결과가 화면에 거의 반영되지 않는 문제가 실측으로 확인됐다(서버 로그엔 90건 보완
      // 됐다고 나오는데 화면엔 1~2건만 보임). 대표 거래건을 먼저 정하고 그것만 보완한다.
      let molitItems = keepLatestTransactionPerComplexArea(rawMolitItems);
      molitItems = await enrichComparableBuildingMetadata(resolved.cortarNo, extractRegionPrefix(resolved.address), molitItems);

      // 같은 단지명이면 가격/거래일은 국토부 실거래가(molitItems)를, 좌표는 Kakao의 진짜 GPS를 우선한다.
      const molitWithRealCoords = await mergeMolitCoordsWithKakao(
          molitItems,
          realKakaoComplexes,
          resolved.lat,
          resolved.lon,
          extractRegionPrefix(resolved.address),
          (progress) => {
            const nearby = progress.filter(item =>
                getDistanceMeters(resolved.lat, resolved.lon, item.lat, item.lon) <= poolRadiusM
            );
            setListings((nearby.length > 0 ? nearby : progress.slice(0, 3))
                .filter(matchesComparableTarget)
                .slice(0, 50));
          }
      );
      // 카카오 장소 검색은 실거래의 좌표 보정에만 사용한다. molitItems가 이미 단지·면적당
      // 대표 거래건 하나로 줄어든 상태라 다시 중복 제거할 필요가 없다 (mergeMolitCoordsWithKakao는
      // 좌표를 못 구한 항목을 걸러낼 뿐 목록을 늘리지 않는다).
      // 가격·거래일이 검증되지 않은 단지/추정값은 지도 후보에 넣지 않는다.
      let items: RealEstateListing[] = molitWithRealCoords;

      // 검증된 국토부 실거래가 없으면 빈 지도를 유지한다. 임의 생성/매물 가격을 실거래로 섞지 않는다.

      // Sanitize items only if coordinates are missing or invalid
      const sanitizedItems = items.map((item, idx) => {
        if (!item.lat || !item.lon || isNaN(item.lat) || isNaN(item.lon) || item.lat === 0) {
          const cleanPos = getCleanNearbyCoordinate(resolved.lat, resolved.lon, idx);
          return { ...item, lat: cleanPos.lat, lon: cleanPos.lon };
        }
        return item;
      });

      // Keep only comps within the comparable pool radius;
      // if none qualify, fall back to the nearest few so the table isn't empty.
      const withinRadius = sanitizedItems.filter(
          item => getDistanceMeters(resolved.lat, resolved.lon, item.lat, item.lon) <= poolRadiusM
      );
      const finalItems = withinRadius.length > 0
          ? withinRadius
          : [...sanitizedItems]
              .sort((a, b) =>
                  getDistanceMeters(resolved.lat, resolved.lon, a.lat, a.lon) -
                  getDistanceMeters(resolved.lat, resolved.lon, b.lat, b.lon)
              )
              .slice(0, 3);

      // 좌표를 검증하지 못한 실거래도 표에는 보여 준다. 지도에는 아래의 areaMatchedItems만 전달된다.
      const textOnlyItems = molitItems
          .filter(matchesComparableTarget)
          .slice(0, 100);

      const areaMatchedItems = finalItems
          .filter(matchesComparableTarget)
          .slice(0, 50);
      // 주소 지오코딩까지 완료된 나머지 실거래는 이름 매칭 여부와 무관하게
      // 보조(초록) 마커로 표시한다. 위치 미확인 거래는 표에만 남긴다.
      const primaryIds = new Set(areaMatchedItems.map(item => item.id));
      const addressResolvedOtherItems = molitWithRealCoords
          .filter(matchesComparableTarget)
          .filter(item => !primaryIds.has(item.id))
          .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.lat !== 0 && item.lon !== 0)
          .slice(0, 100);
      setAreaCandidateListings(finalItems);
      setTextCandidateListings(molitItems);
      setAddressResolvedListings(addressResolvedOtherItems);
      setTableListings(textOnlyItems);
      setListings(areaMatchedItems);
      // 새 검색에서는 검증된 지도 물건과 주소 확인 보조 물건을 모두 표시한다.
      setMapVisibleIds([...areaMatchedItems, ...addressResolvedOtherItems].map(item => item.id));

      // 3. Automatically select top 3 representative comps for instant appraisal
      if (areaMatchedItems.length > 0) {
        const top3 = areaMatchedItems.slice(0, 3);
        setComparableCases(top3.map(createComparableCase));
      }
    } catch (err) {
      console.error('[Sync Data Failed]', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Move target pin directly on map click or coordinate input
  const handleRelocateTarget = async (newLat: number, newLon: number, newAddressName?: string) => {
    setIsLoading(true);
    try {
      const formattedName = newAddressName || `위도 ${newLat.toFixed(5)}, 경도 ${newLon.toFixed(5)}`;
      setAddressInput(formattedName);

      const updatedInfo: AddressResolution = {
        success: true,
        source: 'pinpoint_relocate',
        address: formattedName,
        cortarNo: addressInfo.cortarNo || '1162010200',
        lat: newLat,
        lon: newLon
      };
      setAddressInfo(updatedInfo);
      setTargetConfig(prev => ({
        ...prev,
        address: formattedName
      }));

      // Comparable pool always reaches out to double the displayed map-circle radius
      const poolRadiusM = searchRadiusM;

      // Search real complexes around the new location AND official MOLIT 실거래가 concurrently
      // (see handleSyncData comment: MOLIT must always be tried, not just when Kakao is short)
      const realKakaoComplexes = await fetchLiveKakaoComplexes(
          newLat,
          newLon,
          propertyType,
          formattedName,
          poolRadiusM
      );
      // 지도는 최근 거래를 우선 사용한다. 3년 이력은 단지 상세 패널에서 별도 조회한다.
      const rawMolitItems = await fetchMolitRealTransactions(
          updatedInfo.cortarNo || '11620',
          formattedName,
          newLat,
          newLon,
          propertyType
      );
      // handleSyncData와 동일한 이유로, 대표 거래건을 먼저 고른 뒤에만 보완한다 (자세한 설명은
      // handleSyncData 쪽 주석 참고) - 그래야 보완된 거래건이 대표로 뽑혀 화면에 반영된다.
      let molitItems = keepLatestTransactionPerComplexArea(rawMolitItems);
      molitItems = await enrichComparableBuildingMetadata(updatedInfo.cortarNo, extractRegionPrefix(updatedInfo.address), molitItems);

      const molitWithRealCoords = await mergeMolitCoordsWithKakao(
          molitItems,
          realKakaoComplexes,
          newLat,
          newLon,
          extractRegionPrefix(updatedInfo.address),
          (progress) => {
            const nearby = progress.filter(item =>
                getDistanceMeters(newLat, newLon, item.lat, item.lon) <= poolRadiusM
            );
            setListings((nearby.length > 0 ? nearby : progress.slice(0, 3))
                .filter(matchesComparableTarget)
                .slice(0, 50));
          }
      );
      // 카카오 장소 검색은 실거래의 좌표 보정에만 사용한다. molitItems는 이미 대표 거래건만
      // 남은 상태라 다시 중복 제거할 필요가 없다.
      // 가격·거래일이 검증되지 않은 단지/추정값은 지도 후보에 넣지 않는다.
      let items: RealEstateListing[] = molitWithRealCoords;

      // 검증된 국토부 실거래가 없으면 빈 지도를 유지한다. 임의 생성/매물 가격을 실거래로 섞지 않는다.

      // Sanitize items only if coordinates are missing or invalid
      const sanitizedItems = items.map((item, idx) => {
        if (!item.lat || !item.lon || isNaN(item.lat) || isNaN(item.lon) || item.lat === 0) {
          const cleanPos = getCleanNearbyCoordinate(newLat, newLon, idx);
          return { ...item, lat: cleanPos.lat, lon: cleanPos.lon };
        }
        return item;
      });

      // Keep only comps within the comparable pool radius;
      // if none qualify, fall back to the nearest few so the table isn't empty.
      const withinRadius = sanitizedItems.filter(
          item => getDistanceMeters(newLat, newLon, item.lat, item.lon) <= poolRadiusM
      );
      const finalItems = withinRadius.length > 0
          ? withinRadius
          : [...sanitizedItems]
              .sort((a, b) =>
                  getDistanceMeters(newLat, newLon, a.lat, a.lon) -
                  getDistanceMeters(newLat, newLon, b.lat, b.lon)
              )
              .slice(0, 3);

      // 좌표를 검증하지 못한 실거래도 표에는 보여 준다. 지도에는 아래의 areaMatchedItems만 전달된다.
      const textOnlyItems = molitItems
          .filter(matchesComparableTarget)
          .slice(0, 100);

      const areaMatchedItems = finalItems
          .filter(matchesComparableTarget)
          .slice(0, 50);
      setAreaCandidateListings(finalItems);
      setTextCandidateListings(molitItems);
      setTableListings(textOnlyItems);
      setListings(areaMatchedItems);

      if (areaMatchedItems.length > 0) {
        const top3 = areaMatchedItems.slice(0, 3);
        setComparableCases(top3.map(createComparableCase));
      }
    } catch (err) {
      console.error('[Relocate Target Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 비교조건을 바꾸면 지도와 표를 각각 같은 면적·세대수 조건으로 다시 거른다.
  useEffect(() => {
    const areaMatched = areaCandidateListings.filter(matchesComparableTarget);
    setListings(areaMatched);
    setTableListings(textCandidateListings.filter(matchesComparableTarget));
    setComparableCases(prev =>
        prev.filter(c =>
            c.listing.dedicatedPyeong >= targetConfig.comparableMinPyeong &&
            (targetConfig.comparableMaxPyeong >= 60.5 ||
                c.listing.dedicatedPyeong <= targetConfig.comparableMaxPyeong)
        )
    );
  }, [
    areaCandidateListings,
    textCandidateListings,
    targetConfig.comparableMinPyeong,
    targetConfig.comparableMaxPyeong
  ]);

  // 개발 모드의 React StrictMode가 초기 조회를 중복 실행하지 않도록 한 번만 동기화한다.
  useEffect(() => {
    if (hasInitialSyncRun.current) return;
    hasInitialSyncRun.current = true;
    handleSyncData();
  }, []);

  // Update adjustment factors for a specific comparable case
  const handleUpdateAdjustment = (listingId: string, updates: Partial<ComparableAdjustment>) => {
    setComparableCases(prev =>
        prev.map(c => {
          if (c.listing.id !== listingId) return c;
          const newAdj = { ...c.adjustment, ...updates };
          const totalFactor =
              (newAdj.timeFactor || 1) *
              (newAdj.locationFactor || 1) *
              (newAdj.individualAgeFactor || 1) *
              (newAdj.areaFactor || 1);
          const adjustedPricePerPyeong = Math.round(c.listing.pricePerPyeong * totalFactor);

          return {
            ...c,
            adjustment: newAdj,
            totalFactor,
            adjustedPricePerPyeong
          };
        })
    );
  };

  // Add listing to comparable cases list
  const handleAddCase = (listing: RealEstateListing) => {
    if (comparableCases.some(c => c.listing.id === listing.id)) return;
    if (comparableCases.length >= 5) {
      alert('비교사례는 최대 5개까지 선택 가능합니다.');
      return;
    }

    setComparableCases(prev => [...prev, createComparableCase(listing)]);
  };

  // Remove comparable case
  const handleRemoveCase = (listingId: string) => {
    setComparableCases(prev => prev.filter(c => c.listing.id !== listingId));
  };

  // Toggle selection on map
  const handleToggleSelect = (listingId: string) => {
    const existing = comparableCases.find(c => c.listing.id === listingId);
    if (existing) {
      handleRemoveCase(listingId);
    } else {
      // 주소로 보조 표시된 '그 외 비교물건'은 tableListings에만 존재할 수 있다.
      const found = listings.find(l => l.id === listingId) || tableListings.find(l => l.id === listingId);
      if (found) handleAddCase(found);
    }
  };

  // 표 체크박스는 지도 표시 전용이다. 비교대상 목록은 유지한다.
  const handleToggleMapVisibility = (listingId: string) => {
    // 행의 네모는 지도 표시를 개별로 켜고 끈다. 여러 물건을 함께 표시할 수 있다.
    setMapVisibleIds(previous =>
        previous.includes(listingId)
            ? previous.filter(id => id !== listingId)
            : [...previous, listingId]
    );
  };

  const handleSetMapVisibility = (listingIds: string[], visible: boolean) => {
    const ids = Array.from(new Set(listingIds));
    setMapVisibleIds(previous => {
      if (visible) return Array.from(new Set([...previous, ...ids]));
      return previous.filter(id => !ids.includes(id));
    });
  };

  // 표에서 지도 표시를 켰을 때 카카오 주소 검색으로 확인한 실제 좌표를 모든 목록에 반영한다.
  // 원본 실거래의 임시 좌표는 거리 계산에 절대 사용하지 않는다.
  const handleResolveListingPosition = (resolvedListing: RealEstateListing) => {
    const resolved = { ...resolvedListing, positionVerified: true };
    const updatePosition = (items: RealEstateListing[]) =>
        items.map(item => item.id === resolved.id ? { ...item, ...resolved } : item);

    setListings(updatePosition);
    setTableListings(updatePosition);
    setTextCandidateListings(updatePosition);
    setAreaCandidateListings(updatePosition);
    setAddressResolvedListings(previous => {
      const exists = previous.some(item => item.id === resolved.id);
      return exists
          ? previous.map(item => item.id === resolved.id ? { ...item, ...resolved } : item)
          : [...previous, resolved];
    });
  };

  // Auto select top 3
  const handleAutoSelectTop3 = () => {
    if (listings.length === 0) return;
    const top3 = listings.slice(0, 3);
    setComparableCases(top3.map(createComparableCase));
  };

  // Open Edit Listing Modal
  const handleOpenEditListing = (listing: RealEstateListing) => {
    setEditingListing(listing);
    setIsEditModalOpen(true);
  };

  // Save edited listing details
  const handleSaveEditedListing = (updated: RealEstateListing) => {
    // 1. Update in listings array
    setListings(prev => {
      const exists = prev.some(l => l.id === updated.id);
      if (exists) {
        return prev.map(l => (l.id === updated.id ? updated : l));
      }
      return [updated, ...prev];
    });

    // 2. Update in comparableCases if selected
    setComparableCases(prev =>
        prev.map(c => {
          if (c.listing.id !== updated.id) return c;
          const totalFactor =
              (c.adjustment.timeFactor || 1) *
              (c.adjustment.locationFactor || 1) *
              (c.adjustment.individualAgeFactor || 1) *
              (c.adjustment.areaFactor || 1);
          const adjustedPricePerPyeong = Math.round(updated.pricePerPyeong * totalFactor);

          return {
            ...c,
            listing: updated,
            adjustedPricePerPyeong
          };
        })
    );
  };

  // Delete listing
  const handleDeleteListing = (id: string) => {
    setListings(prev => prev.filter(l => l.id !== id));
    setComparableCases(prev => prev.filter(c => c.listing.id !== id));
  };

  // Add custom or searched listing
  const handleAddCustomListing = (newListing: RealEstateListing) => {
    let positionedListing = newListing;
    if (!newListing.lat || !newListing.lon || isNaN(newListing.lat) || isNaN(newListing.lon) || newListing.lat === 0) {
      const cleanPos = getCleanNearbyCoordinate(addressInfo.lat, addressInfo.lon, listings.length);
      positionedListing = { ...newListing, lat: cleanPos.lat, lon: cleanPos.lon };
    }
    setListings(prev => [positionedListing, ...prev]);
    handleAddCase(positionedListing);
  };

  // Open manual custom comp modal
  const handleOpenManualAdd = () => {
    const cleanPos = getCleanNearbyCoordinate(addressInfo.lat, addressInfo.lon, listings.length);
    const customBlank: RealEstateListing = {
      id: `manual-listing-${Date.now()}`,
      articleName: `${addressInput} 실거래 사례`,
      buildingName: '101동',
      floorInfo: '8층',
      dedicatedAreaM2: 84.95,
      dedicatedPyeong: 25.7,
      supplyPyeong: 34.0,
      exclusiveRate: 75.6,
      priceManwon: 75000,
      pricePerPyeong: Math.round(75000 / 25.7),
      supplyPricePerPyeong: Math.round(75000 / 34.0),
      dealDate: recentDealDateLabel(0),
      useApprovalDate: '16.06',
      approvalYear: 2016,
      lat: cleanPos.lat,
      lon: cleanPos.lon,
      rletTpCd: propertyType,
      tradTpCd: 'A1'
    };
    handleOpenEditListing(customBlank);
  };

  // Calculate Appraisal Summary Results
  const totalWeight = comparableCases.reduce((acc, c) => acc + (c.adjustment.weight || 1), 0);
  const weightedSum = comparableCases.reduce(
      (acc, c) => acc + c.adjustedPricePerPyeong * (c.adjustment.weight || 1),
      0
  );

  const finalAdjustedPricePerPyeong =
      totalWeight > 0
          ? Math.round(weightedSum / totalWeight)
          : listings.length > 0
              ? listings[0].pricePerPyeong
              : 3500;

  const totalExpectedValueManwon = Math.round(
      finalAdjustedPricePerPyeong * targetConfig.targetPyeong
  );
  const totalExpectedValueEok = totalExpectedValueManwon / 10000;

  const appraisalResult: AppraisalResult = {
    targetConfig,
    comparableCases,
    finalAdjustedPricePerPyeong,
    totalExpectedValueManwon,
    totalExpectedValueEok,
    minCompPrice:
        comparableCases.length > 0
            ? Math.min(...comparableCases.map(c => c.listing.pricePerPyeong))
            : 0,
    maxCompPrice:
        comparableCases.length > 0
            ? Math.max(...comparableCases.map(c => c.listing.pricePerPyeong))
            : 0,
    avgRawCompPrice:
        comparableCases.length > 0
            ? Math.round(
                comparableCases.reduce((a, b) => a + b.listing.pricePerPyeong, 0) /
                comparableCases.length
            )
            : 0,
    calculatedAt: new Date().toLocaleDateString('ko-KR')
  };

  // Trigger AI Valuation Report
  const handleGenerateAiReport = async () => {
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai-appraisal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appraisalData: appraisalResult })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setAiReport(data.report);
      }
    } catch (err) {
      console.error('[AI Appraisal Generation Error]', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const selectedIds = comparableCases.map(c => c.listing.id);

  return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Top Navigation */}
        <Navbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            addressInfo={addressInfo}
            isLoading={isLoading}
            selectedCount={comparableCases.length}
        />

        {/* Main Layout (표본검색 상단 바 + 하단 탭 콘텐츠) */}
        <div className="flex-1 flex flex-col max-w-[1920px] w-full mx-auto">
          {/* Top Sample Search Bar - 지도 탭에서는 MapListingsView의 요약 카드 줄에 합쳐서 표시하므로 숨김 */}
          {activeTab !== 'map' && (
              <SidebarController
                  addressInput={addressInput}
                  setAddressInput={setAddressInput}
                  propertyType={propertyType}
                  setPropertyType={setPropertyType}
                  targetConfig={targetConfig}
                  setTargetConfig={setTargetConfig}
                  onSync={handleSyncData}
                  isLoading={isLoading}
                  searchRadiusM={searchRadiusM}
                  setSearchRadiusM={setSearchRadiusM}
              />
          )}

          {/* Main Content Area */}
          <main className="flex-1 px-2 sm:px-3 lg:px-3 py-4 sm:py-5 overflow-y-auto">
            {activeTab === 'map' && (
                <MapListingsView
                    listings={tableListings}
                    mapListings={listings}
                    otherMapListings={addressResolvedListings}
                    addressInfo={addressInfo}
                    selectedIds={selectedIds}
                    mapVisibleIds={mapVisibleIds}
                    onToggleMapVisibility={handleToggleMapVisibility}
                    onSetMapVisibility={handleSetMapVisibility}
                    onResolveListingPosition={handleResolveListingPosition}
                    onToggleSelect={handleToggleSelect}
                    onSelectComparable={(listing) => {
                      handleAddCase(listing);
                      setActiveTab('comparison');
                    }}
                    onRelocateTarget={handleRelocateTarget}
                    onEditListing={handleOpenEditListing}
                    onOpenSearchComplex={() => setIsSearchComplexModalOpen(true)}
                    onAddCustomListing={handleOpenManualAdd}
                    addressInput={addressInput}
                    setAddressInput={setAddressInput}
                    propertyType={propertyType}
                    setPropertyType={setPropertyType}
                    targetConfig={targetConfig}
                    setTargetConfig={setTargetConfig}
                    onSync={handleSyncData}
                    isLoading={isLoading}
                    searchRadiusM={searchRadiusM}
                    setSearchRadiusM={setSearchRadiusM}
                />
            )}

            {activeTab === 'comparison' && (
                <SalesComparisonAnalyzer
                    comparableCases={comparableCases}
                    allListings={listings}
                    targetConfig={targetConfig}
                    onUpdateAdjustment={handleUpdateAdjustment}
                    onRemoveCase={handleRemoveCase}
                    onAddCase={handleAddCase}
                    onAutoSelectTop3={handleAutoSelectTop3}
                    onGoToReport={() => setActiveTab('report')}
                    onEditListing={handleOpenEditListing}
                />
            )}

            {activeTab === 'report' && (
                <FinalValuationReport
                    appraisalResult={appraisalResult}
                    onGenerateAiReport={handleGenerateAiReport}
                    aiReport={aiReport}
                    isAiLoading={isAiLoading}
                />
            )}

          </main>
        </div>

        {/* Edit Listing Modal */}
        <EditListingModal
            listing={editingListing}
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setEditingListing(null);
            }}
            onSave={handleSaveEditedListing}
            onDelete={handleDeleteListing}
        />

        {/* Search Real Complex Modal (Kakao Places Nationwide DB) */}
        <SearchComplexModal
            isOpen={isSearchComplexModalOpen}
            onClose={() => setIsSearchComplexModalOpen(false)}
            centerLat={addressInfo.lat}
            centerLon={addressInfo.lon}
            onAddListing={handleAddCustomListing}
        />
      </div>
  );
}

