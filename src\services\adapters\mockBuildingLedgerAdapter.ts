import { BuildingRecord } from '../../types/buildingPlatform';
import { AdapterPage, FetchHint, SourceAdapter } from './types';

/**
 * BuildingLedgerAdapter와 완전히 동일한 SourceAdapter<BuildingRecord> 인터페이스를 구현하는 Mock.
 * 공공데이터포털 API 키가 없는 동안 이 어댑터로 전체 파이프라인(수집 -> 노후도 계산 -> 지도 시각화)을
 * 먼저 완성해두고, 키가 발급되면 이 클래스를 BuildingLedgerAdapter로 바꿔치기만 하면 된다
 * (getBuildingLedgerAdapter() 팩토리 한 곳만 수정하면 됨 - adapters/index.ts 참고).
 */
export class MockBuildingLedgerAdapter implements SourceAdapter<BuildingRecord> {
  readonly sourceId = 'building_ledger_mock';

  private static readonly PURPOSES: Array<{ cd: string; nm: string }> = [
    { cd: '02100', nm: '공동주택(아파트)' },
    { cd: '02102', nm: '공동주택(연립주택)' },
    { cd: '02103', nm: '공동주택(다세대주택)' },
    { cd: '01000', nm: '단독주택' },
    { cd: '04000', nm: '제2종근린생활시설' }
  ];

  private static readonly STRUCTURES: Array<{ cd: string; nm: string }> = [
    { cd: '21', nm: '철근콘크리트구조' },
    { cd: '25', nm: '철골철근콘크리트구조' },
    { cd: '11', nm: '벽돌구조' },
    { cd: '01', nm: '목구조' }
  ];

  private static readonly NAME_PREFIXES = [
    '한빛', '무궁화', '은하수', '푸른', '햇살', '느티나무', '개나리', '진달래', '해오름', '별빛'
  ];

  async fetchPage(
    sigunguCd: string,
    bjdongCd: string,
    pageNo: number,
    numOfRows: number = 1000,
    hint?: FetchHint
  ): Promise<AdapterPage<BuildingRecord>> {
    // Mock은 페이지 1건만 생성하고 끝낸다 - 실제 페이지네이션 흉내는 필요 없음.
    if (pageNo > 1) {
      return { items: [], hasMore: false, nextPageNo: pageNo + 1 };
    }

    const centerLat = hint?.centerLat ?? 37.4784;
    const centerLon = hint?.centerLon ?? 126.932;
    const count = Math.min(normalizeNumOfRows(numOfRows), 40);

    const items: BuildingRecord[] = [];
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < count; i++) {
      // 사용승인연도를 5개 노후도 구간에 고르게 분산 (신축~고노후 전부 눈에 보이도록)
      const bandIndex = i % 5;
      const ageWithinBand = deterministicJitter(i, 0, bandIndex === 4 ? 25 : 9);
      const ageBandFloors = [0, 5, 10, 20, 30];
      const ageYears = ageBandFloors[bandIndex] + ageWithinBand;
      const useAprYear = currentYear - ageYears;

      // 대상지 주변 80~600m 안에 각도별로 분산 배치
      const angle = (i / count) * 2 * Math.PI;
      const radiusMeters = 80 + deterministicJitter(i, 0, 520);
      const { lat, lon } = offsetLatLon(centerLat, centerLon, angle, radiusMeters);

      const purpose = MockBuildingLedgerAdapter.PURPOSES[i % MockBuildingLedgerAdapter.PURPOSES.length];
      const structure = MockBuildingLedgerAdapter.STRUCTURES[i % MockBuildingLedgerAdapter.STRUCTURES.length];
      const totalArea = 400 + deterministicJitter(i, 0, 3600);
      const groundFloors = 3 + (i % 20);

      items.push({
        mgmBldPk: `MOCK-${sigunguCd}-${bjdongCd}-${i + 1}`,
        bldName: `${MockBuildingLedgerAdapter.NAME_PREFIXES[i % MockBuildingLedgerAdapter.NAME_PREFIXES.length]}빌딩 ${i + 1}동`,
        addressJibun: `${sigunguCd.slice(0, 2)}시 ${bjdongCd} ${100 + i}-${(i % 9) + 1}`,
        addressRoad: null, // 실제 API도 종종 비어있는 필드 - Mock에서도 항상 채우지 않음
        sigunguCd,
        bjdongCd,
        mainPurpsCd: purpose.cd,
        mainPurpsNm: purpose.nm,
        totalAreaM2: round1(totalArea),
        archAreaM2: round1(totalArea / Math.max(groundFloors, 1)),
        platAreaM2: round1(totalArea / Math.max(groundFloors, 1) / 0.6),
        householdCnt: 20 + (i * 7),
        floorAreaRatio: 120 + (i % 8) * 20,
        floorGroundCnt: groundFloors,
        floorUnderCnt: i % 4 === 0 ? 1 : 0,
        structCd: structure.cd,
        structNm: structure.nm,
        useAprDay: `${useAprYear}0615`,
        useAprYear,
        lat,
        lon,
        geocodeSource: 'mock_generated',
        geocodeConfidence: 'exact'
      });
    }

    return { items, hasMore: false, nextPageNo: pageNo + 1 };
  }
}

function normalizeNumOfRows(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Math.random() 대신 인덱스 기반 결정론적 지터 - 같은 입력이면 항상 같은 mock 데이터가 나오게 한다. */
function deterministicJitter(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.round(min + frac * (max - min));
}

function offsetLatLon(
  centerLat: number,
  centerLon: number,
  angleRad: number,
  radiusMeters: number
): { lat: number; lon: number } {
  const metersPerLat = 111132;
  const metersPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);
  return {
    lat: parseFloat((centerLat + (radiusMeters * Math.sin(angleRad)) / metersPerLat).toFixed(6)),
    lon: parseFloat((centerLon + (radiusMeters * Math.cos(angleRad)) / metersPerLon).toFixed(6))
  };
}

