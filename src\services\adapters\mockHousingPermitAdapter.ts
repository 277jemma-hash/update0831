import { HousingPermitRecord } from '../../types/buildingPlatform';
import { AdapterPage, FetchHint, SourceAdapter } from './types';
import { derivePermitStatus } from './housingPermitAdapter';

/**
 * HousingPermitAdapter와 동일한 인터페이스의 Mock. derivePermitStatus()를 실제 어댑터와
 * 공유해서, 상태 파생 규칙이 mock/실제 어디서도 같은 로직을 타도록 했다.
 */
export class MockHousingPermitAdapter implements SourceAdapter<HousingPermitRecord> {
  readonly sourceId = 'housing_permit_mock';

  private static readonly PROJECT_NAMES = [
    '한빛 신축공사', '무궁화 재건축', '은하수 도시형생활주택', '푸른숲 오피스텔',
    '햇살마을 공동주택', '느티나무 리모델링', '개나리 신축', '별빛타워 신축공사'
  ];

  async fetchPage(
    sigunguCd: string,
    bjdongCd: string,
    pageNo: number,
    numOfRows: number = 1000,
    hint?: FetchHint
  ): Promise<AdapterPage<HousingPermitRecord>> {
    if (pageNo > 1) {
      return { items: [], hasMore: false, nextPageNo: pageNo + 1 };
    }

    const centerLat = hint?.centerLat ?? 37.4784;
    const centerLon = hint?.centerLon ?? 126.932;
    const count = Math.min(numOfRows > 0 ? numOfRows : 12, 12);

    const items: HousingPermitRecord[] = [];
    const today = new Date();

    for (let i = 0; i < count; i++) {
      // 인허가/착공/준공이 고르게 섞이도록 3그룹으로 순환
      const stage = i % 3; // 0=준공, 1=착공, 2=인허가만
      const permitDay = formatYmd(addMonths(today, -18 + (i % 6)));
      const startCnstwkDay = stage <= 1 ? formatYmd(addMonths(today, -12 + (i % 5))) : null;
      const useInspectDay = stage === 0 ? formatYmd(addMonths(today, -2 + (i % 3))) : null;

      const angle = ((i + 2.5) / count) * 2 * Math.PI;
      const radiusMeters = 120 + deterministicJitter(i, 0, 480);
      const { lat, lon } = offsetLatLon(centerLat, centerLon, angle, radiusMeters);

      items.push({
        permitKey: `MOCK-PERMIT-${sigunguCd}-${bjdongCd}-${i + 1}`,
        projectName: MockHousingPermitAdapter.PROJECT_NAMES[i % MockHousingPermitAdapter.PROJECT_NAMES.length],
        addressJibun: `${sigunguCd.slice(0, 2)}시 ${bjdongCd} ${200 + i}-${(i % 7) + 1}`,
        sigunguCd,
        bjdongCd,
        householdCnt: 20 + deterministicJitter(i, 0, 280),
        floorGroundCnt: 5 + (i % 15),
        floorUnderCnt: i % 3 === 0 ? 2 : 1,
        totalAreaM2: round1(1200 + deterministicJitter(i, 0, 8000)),
        platAreaM2: round1(600 + deterministicJitter(i, 0, 3000)),
        permitDay,
        startCnstwkDay,
        useInspectDay,
        status: derivePermitStatus(permitDay, startCnstwkDay, useInspectDay),
        lat,
        lon,
        geocodeSource: 'mock_generated'
      });
    }

    return { items, hasMore: false, nextPageNo: pageNo + 1 };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function deterministicJitter(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 78.233 + 11) * 43758.5453;
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

