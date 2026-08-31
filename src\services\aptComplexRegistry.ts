// 한국부동산원_공동주택 단지 식별정보 조회 서비스 (getAptInfo)로, MOLIT 실거래가의 단지명
// (텍스트)을 정확한 주소와 연결한다. 기존 카카오 텍스트 검색보다 신뢰도가 높다 - 이 API는
// 국토교통부/부동산원이 공식으로 관리하는 주소 데이터라서, 텍스트만 비슷한 다른 동네 건물이
// 섞일 위험이 적다.
//
// 실제 사용자가 data.go.kr Swagger 문서에서 직접 확인한 확정 스펙:
//   GET https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo
//   쿼리: page, perPage, returnType(JSON/XML, 기본 JSON), serviceKey,
//        cond[COMPLEX_PK::EQ], cond[ADRES::LIKE], cond[USEAPR_DT::LT|LTE|GT|GTE]
//   응답(JSON): { page, perPage, totalCount, currentCount, matchCount,
//                data: [{ COMPLEX_PK, PNU, ADRES, COMPLEX_NM1, COMPLEX_NM2, COMPLEX_NM3,
//                         COMPLEX_GB_CD, DONG_CNT, UNIT_CNT, USEAPR_DT }] }
//
// 단지명으로 직접 필터링하는 파라미터는 없어서, 주소(ADRES)에 특정 문자열이 포함된 건들을
// 가져온 뒤 COMPLEX_NM1/2/3을 우리 쪽에서 정규화 매칭한다. "동" 이름만으로 검색하면 그
// 동네 다세대/연립까지 수백~수천 건이 걸려서 페이지당 100건 제한 안에 원하는 단지가 안
// 들어가는 문제가 실측으로 확인됐다 - 그래서 호출부는 "동+지번"처럼 훨씬 좁은 문자열
// (addressHint)을 넘겨야 한다.

const BASE_URL = 'https://api.odcloud.kr/api/AptIdInfoSvc/v1';

interface AptInfoItem {
  COMPLEX_PK: string;
  PNU: string;
  ADRES: string;
  COMPLEX_NM1: string;
  COMPLEX_NM2: string;
  COMPLEX_NM3: string;
}

// "은천1단지아파트"(부동산원 정식 표기) vs "은천1"(MOLIT 실거래가 표기)처럼, 같은 단지인데
// 접미사 유무만 다른 케이스가 실제로 확인됨 - "아파트"만 한 번 제거하면 "은천1단지"가 남아
// "은천1"과 여전히 안 맞는다. "단지"/"아파트" 접미사가 몇 개가 붙어있든 안정될 때까지 반복 제거.
function normalizeComplexName(name: string): string {
  let n = (name || '').replace(/\s+/g, '').toLowerCase();
  let prev: string;
  do {
    prev = n;
    n = n.replace(/(아파트|단지)$/, '');
  } while (n !== prev);
  return n;
}

export class AptComplexRegistryService {
  private serviceKey: string;
  // addressHint별 조회 결과 캐시 - 캐시가 없으면 매물 하나마다 같은 주소를 새로 요청하게 되고,
  // 엔드포인트가 죽어있을 땐 똑같은 실패 요청이 매물 개수만큼 반복되는 문제가 있었다.
  private addressInfoCache = new Map<string, Promise<AptInfoItem[]>>();
  // 같은 addressHint로 여러 매물이 매칭 실패할 때마다 샘플 로그가 중복 반복되지 않도록,
  // 문자열 하나당 한 번만 샘플을 출력한다.
  private sampledHints = new Set<string>();

  constructor(serviceKey?: string) {
    this.serviceKey = serviceKey || process.env.MOLIT_SERVICE_KEY || 'MOLIT_SERVICE_KEY_NOT_SET';
  }

  /**
   * 주소 문자열(예: "신림동 1580-3")로 그 주소에 걸리는 공동주택 단지들을 가져온다.
   * ADRES::LIKE 필터라서 부분 문자열만 들어가도 매칭된다.
   */
  private async fetchByAddress(addressHint: string): Promise<AptInfoItem[]> {
    const key = this.serviceKey.includes('%') ? this.serviceKey : encodeURIComponent(this.serviceKey);
    const params = new URLSearchParams({
      page: '1',
      perPage: '100',
      returnType: 'JSON',
      serviceKey: key
    });
    // URLSearchParams가 이미 encodeURIComponent를 적용하므로 append로 넣으면
    // 대괄호/콜론이 포함된 파라미터명("cond[ADRES::LIKE]")도 안전하게 인코딩된다.
    params.append('cond[ADRES::LIKE]', addressHint);
    const url = `${BASE_URL}/getAptInfo?${params.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.warn(`[AptComplexRegistry] HTTP ${response.status} ${response.statusText} - 응답 본문:`, body.slice(0, 500));
        return [];
      }

      const json = await response.json();
      if (!Array.isArray(json?.data)) {
        console.warn('[AptComplexRegistry] 응답에 data 배열 없음:', JSON.stringify(json).slice(0, 500));
        return [];
      }
      return json.data as AptInfoItem[];
    } catch (err: any) {
      console.warn('[AptComplexRegistry] 요청 실패:', err?.name === 'AbortError' ? '타임아웃(3초)' : err?.message || err);
      return [];
    }
  }

  private getByAddress(addressHint: string): Promise<AptInfoItem[]> {
    if (this.serviceKey === 'MOLIT_SERVICE_KEY_NOT_SET') return Promise.resolve([]);

    const cached = this.addressInfoCache.get(addressHint);
    if (cached) return cached;

    const promise = this.fetchByAddress(addressHint);
    this.addressInfoCache.set(addressHint, promise);
    return promise;
  }

  private findMatch(complexName: string, list: AptInfoItem[]): AptInfoItem | undefined {
    const target = normalizeComplexName(complexName);
    return list.find(
      item =>
        normalizeComplexName(item.COMPLEX_NM1) === target ||
        normalizeComplexName(item.COMPLEX_NM2) === target ||
        normalizeComplexName(item.COMPLEX_NM3) === target
    );
  }

  private logNoMatch(complexName: string, addressHint: string, list: AptInfoItem[]) {
    if (!this.sampledHints.has(addressHint)) {
      this.sampledHints.add(addressHint);
      // 실제 API가 돌려주는 단지명 표기가 우리가 아는 이름과 어떻게 다른지 비교할 수 있도록,
      // 처음 5건의 COMPLEX_NM1/ADRES 샘플을 addressHint 하나당 한 번만 남긴다.
      const sample = list.slice(0, 5).map(i => ({ nm: i.COMPLEX_NM1, adres: i.ADRES }));
      console.warn(`[AptComplexRegistry] "${addressHint}" 검색 결과(${list.length}건) 샘플:`, JSON.stringify(sample));
    }
    console.warn(`[AptComplexRegistry] "${complexName}" 매칭 안 됨 (addressHint="${addressHint}")`);
  }

  /**
   * 단지명 + 주소 힌트(동+지번)로, 이 단지의 정확한 주소(ADRES)를 찾는다.
   * 못 찾으면 null (호출부는 기존 카카오 텍스트 검색으로 폴백해야 한다).
   */
  async resolveComplexAddress(complexName: string, addressHint: string): Promise<string | null> {
    const list = await this.getByAddress(addressHint);
    if (list.length > 0) {
      const match = this.findMatch(complexName, list);
      if (match) return match.ADRES || null;
    }

    // "신림동 1580-3"처럼 지번에 세부번지(-3)가 있으면, MOLIT과 API의 지번 표기가
    // 미세하게 다를 수 있어 본번만으로("신림동 1580") 한 번 더 시도한다.
    const mainLotOnly = addressHint.replace(/-\d+$/, '');
    if (mainLotOnly !== addressHint) {
      const fallbackList = await this.getByAddress(mainLotOnly);
      if (fallbackList.length > 0) {
        const fallbackMatch = this.findMatch(complexName, fallbackList);
        if (fallbackMatch) return fallbackMatch.ADRES || null;
      }
      this.logNoMatch(complexName, mainLotOnly, fallbackList);
      return null;
    }

    this.logNoMatch(complexName, addressHint, list);
    return null;
  }
}

