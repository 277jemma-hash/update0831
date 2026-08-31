import { HousingPermitRecord, PermitStatus } from '../../types/buildingPlatform';
import {
  AdapterPage,
  SourceAdapter,
  isPublicDataErrorResponse,
  extractXmlTag,
  extractXmlItems,
  parseYyyymmdd
} from './types';

/**
 * 국토교통부_건축HUB_주택인허가정보 서비스 - 기본개요 어댑터.
 *
 * 필드 매핑은 설계 문서 03절 근거. "사업명" 전용 필드와 "사업구분/사업상태" 필드는
 * 실제로 제공되지 않는다 - 사업명은 건물명(bldNm)으로 대체 표기하고, 상태는
 * 날짜 필드의 존재 여부로 파생 계산한다(추정이 아니라 이미 있는 값을 그대로 읽는 규칙).
 *
 * TODO(Phase 0 확인): OPERATION_PATH는 이 샌드박스에서 hub.go.kr Swagger를 직접 열람하지
 * 못해 확정하지 못했다. HOUSING_PERMIT_API_KEY 발급 후 반드시 재확인할 것.
 */
export class HousingPermitAdapter implements SourceAdapter<HousingPermitRecord> {
  readonly sourceId = 'housing_permit';

  private static readonly OPERATION_PATH = 'HsPmsHubService/getHpBasisOulnInfo';
  private static readonly BASE_URL = 'https://apis.data.go.kr/1613000';

  private readonly serviceKey: string;

  constructor(serviceKey?: string) {
    const key = serviceKey || process.env.HOUSING_PERMIT_API_KEY || process.env.MOLIT_SERVICE_KEY;
    if (!key) {
      throw new Error('주택인허가용 일반 인증키가 설정되지 않았습니다 (.env 확인)');
    }
    this.serviceKey = key;
  }

  async fetchPage(
    sigunguCd: string,
    bjdongCd: string,
    pageNo: number,
    numOfRows: number = 1000
  ): Promise<AdapterPage<HousingPermitRecord>> {
    // .env.example 안내대로 이 서비스는 "Decoding 키"(원문 그대로, +,/,= 등 특수문자 포함)를
    // 쓴다 - 쿼리스트링에 그대로 넣으면 깨진다. MOLIT 연동 때 겪은 것과 같은 부류의 버그라
    // 미리 encodeURIComponent를 적용한다 (이미 인코딩된 키가 들어오면 이중 인코딩하지 않음).
    const key = this.serviceKey.includes('%') ? this.serviceKey : encodeURIComponent(this.serviceKey);
    const url =
      `${HousingPermitAdapter.BASE_URL}/${HousingPermitAdapter.OPERATION_PATH}` +
      `?serviceKey=${key}` +
      `&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}` +
      `&pageNo=${pageNo}&numOfRows=${numOfRows}&_type=xml`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let xmlText: string;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/xml, text/xml, */*' }
      });
      xmlText = await response.text();
    } finally {
      clearTimeout(timeoutId);
    }

    if (isPublicDataErrorResponse(xmlText)) {
      throw new Error(`[HousingPermitAdapter] API 오류 응답: ${xmlText.slice(0, 300)}`);
    }

    const totalCountMatch = xmlText.match(/<totalCount>(\d+)<\/totalCount>/);
    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;

    const items = extractXmlItems(xmlText).map(itemStr => this.mapItem(itemStr, sigunguCd, bjdongCd));

    return {
      items,
      hasMore: pageNo * numOfRows < totalCount,
      nextPageNo: pageNo + 1
    };
  }

  private mapItem(itemStr: string, sigunguCd: string, bjdongCd: string): HousingPermitRecord {
    const permitDay = parseYyyymmdd(extractXmlTag(itemStr, 'apprvDay'));
    const startCnstwkDay = parseYyyymmdd(extractXmlTag(itemStr, 'stcnsDay'));
    const useInspectDay = parseYyyymmdd(extractXmlTag(itemStr, 'useInsptDay'));

    return {
      permitKey: extractXmlTag(itemStr, 'mgmHsrgstPk'),
      projectName: extractXmlTag(itemStr, 'bldNm') || null,
      addressJibun: extractXmlTag(itemStr, 'platPlc') || null,
      sigunguCd,
      bjdongCd,
      householdCnt: parseIntOrNull(extractXmlTag(itemStr, 'totHhldCnt')),
      floorGroundCnt: parseIntOrNull(extractXmlTag(itemStr, 'grndFlrCnt')),
      floorUnderCnt: parseIntOrNull(extractXmlTag(itemStr, 'ugrndFlrCnt')),
      totalAreaM2: parseFloatOrNull(extractXmlTag(itemStr, 'totArea')),
      platAreaM2: parseFloatOrNull(extractXmlTag(itemStr, 'platArea')),
      permitDay,
      startCnstwkDay,
      useInspectDay,
      status: derivePermitStatus(permitDay, startCnstwkDay, useInspectDay),
      lat: null,
      lon: null,
      geocodeSource: null
    };
  }
}

/**
 * 설계 문서 03절의 파생 규칙: 값을 지어내지 않고 이미 있는 날짜 필드를 그대로 읽어 이름만 붙인다.
 * useInspectDay 있음 -> completed, startCnstwkDay만 있음 -> construction,
 * permitDay만 있음 -> permitted, 셋 다 없으면 unknown.
 */
export function derivePermitStatus(
  permitDay: string | null,
  startCnstwkDay: string | null,
  useInspectDay: string | null
): PermitStatus {
  if (useInspectDay) return 'completed';
  if (startCnstwkDay) return 'construction';
  if (permitDay) return 'permitted';
  return 'unknown';
}

function parseFloatOrNull(value: string): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function parseIntOrNull(value: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

