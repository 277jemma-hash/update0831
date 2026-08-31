// 공통 수집기 어댑터 계약. 설계 문서 01절(확장 지점) 기준.
// 새 공공데이터 API를 추가할 때는 이 인터페이스만 구현하면 되고, 수집 파이프라인/DB 저장 로직은 손대지 않는다.

export interface AdapterPage<T> {
  items: T[];
  hasMore: boolean;
  nextPageNo: number;
}

/** 실제 API는 필요 없지만 Mock 어댑터가 좌표를 그럴듯하게 흩뿌리는 데 쓰는 선택적 힌트. */
export interface FetchHint {
  centerLat?: number;
  centerLon?: number;
}

export interface SourceAdapter<T> {
  /** 수집 로그(api_sync_log)에 남길 소스 식별자, 예: 'building_ledger' */
  readonly sourceId: string;

  /** 시군구/법정동 단위로 한 페이지씩 원본 데이터를 가져온다. */
  fetchPage(
    sigunguCd: string,
    bjdongCd: string,
    pageNo: number,
    numOfRows: number,
    hint?: FetchHint
  ): Promise<AdapterPage<T>>;
}

/** data.go.kr 오픈API 공통 응답 오류 여부를 먼저 걸러낼 때 쓰는 마커. */
export function isPublicDataErrorResponse(xmlText: string): boolean {
  return (
    xmlText.includes('<cmmMsgHeader>') ||
    xmlText.includes('SERVICE_KEY_IS_NOT_REGISTERED') ||
    xmlText.includes('<returnAuthMsg>') ||
    xmlText.includes('<errMsg>')
  );
}

/** 응답 XML의 <item>...</item> 블록들에서 태그 값을 뽑아내는 공용 헬퍼. molitService.ts와 동일한 방식. */
export function extractXmlTag(itemStr: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const m = itemStr.match(regex);
  return m ? m[1].trim() : '';
}

export function extractXmlItems(xmlText: string): string[] {
  const items: string[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    items.push(match[1]);
  }
  return items;
}

/** YYYYMMDD 문자열을 Date로. 00000000이나 빈 값 등 무효 데이터는 null (임의 보정 금지). */
export function parseYyyymmdd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{8}$/.test(trimmed) || trimmed === '00000000') return null;
  return trimmed;
}

export function yyyymmddToYear(value: string | null): number | null {
  if (!value) return null;
  const year = parseInt(value.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

