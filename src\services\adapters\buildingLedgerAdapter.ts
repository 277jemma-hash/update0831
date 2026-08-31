import { BuildingRecord } from '../../types/buildingPlatform';
import { AdapterPage, SourceAdapter, isPublicDataErrorResponse, extractXmlTag, extractXmlItems, parseYyyymmdd, yyyymmddToYear } from './types';

export class BuildingLedgerAdapter implements SourceAdapter<BuildingRecord> {
  readonly sourceId = 'building_ledger';

  private static readonly RECAP_OPERATION_PATH = 'BldRgstHubService/getBrRecapTitleInfo';
  private static readonly TITLE_OPERATION_PATH = 'BldRgstHubService/getBrTitleInfo';
  private static readonly BASE_URL = 'https://apis.data.go.kr/1613000';

  private readonly serviceKey: string;

  constructor(serviceKey?: string) {
    const key = serviceKey || process.env.BUILDING_LEDGER_API_KEY || process.env.MOLIT_SERVICE_KEY;

    if (!key) {
      throw new Error('건축물대장용 일반 인증키가 설정되지 않았습니다 (.env 확인)');
    }

    this.serviceKey = key;
  }

  async fetchPage(sigunguCd: string, bjdongCd: string, pageNo: number, numOfRows: number = 100): Promise<AdapterPage<BuildingRecord>> {
    return this.fetchOperationPage(BuildingLedgerAdapter.RECAP_OPERATION_PATH, sigunguCd, bjdongCd, pageNo, numOfRows, '총괄표제부');
  }

  async fetchTitlePage(sigunguCd: string, bjdongCd: string, pageNo: number, numOfRows: number = 100): Promise<AdapterPage<BuildingRecord>> {
    return this.fetchOperationPage(BuildingLedgerAdapter.TITLE_OPERATION_PATH, sigunguCd, bjdongCd, pageNo, numOfRows, '표제부');
  }

  async fetchParcelPage(
      sigunguCd: string,
      bjdongCd: string,
      bun: string,
      ji: string,
      pageNo: number = 1,
      numOfRows: number = 100
  ): Promise<AdapterPage<BuildingRecord>> {
    return this.fetchOperationPage(
        BuildingLedgerAdapter.RECAP_OPERATION_PATH,
        sigunguCd,
        bjdongCd,
        pageNo,
        numOfRows,
        '총괄표제부-지번',
        bun,
        ji
    );
  }

  async fetchParcelTitlePage(
      sigunguCd: string,
      bjdongCd: string,
      bun: string,
      ji: string,
      pageNo: number = 1,
      numOfRows: number = 100
  ): Promise<AdapterPage<BuildingRecord>> {
    return this.fetchOperationPage(
        BuildingLedgerAdapter.TITLE_OPERATION_PATH,
        sigunguCd,
        bjdongCd,
        pageNo,
        numOfRows,
        '표제부-지번',
        bun,
        ji
    );
  }

  private async fetchOperationPage(
      operationPath: string,
      sigunguCd: string,
      bjdongCd: string,
      pageNo: number,
      numOfRows: number,
      label: string,
      bun?: string,
      ji?: string
  ): Promise<AdapterPage<BuildingRecord>> {
    const key = this.serviceKey.includes('%') ? this.serviceKey : encodeURIComponent(this.serviceKey);

    let url =
        `${BuildingLedgerAdapter.BASE_URL}/${operationPath}` +
        `?serviceKey=${key}` +
        `&sigunguCd=${encodeURIComponent(sigunguCd)}` +
        `&bjdongCd=${encodeURIComponent(bjdongCd)}` +
        `&pageNo=${pageNo}` +
        `&numOfRows=${numOfRows}` +
        `&_type=xml`;

    if (bun) {
      url += `&bun=${encodeURIComponent(bun)}`;
    }

    if (ji) {
      url += `&ji=${encodeURIComponent(ji)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let xmlText = '';
    let httpStatus = 0;

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/xml, text/xml, */*'
        }
      });

      httpStatus = response.status;
      xmlText = await response.text();

      if (!response.ok) {
        console.log(`[BuildingLedgerAdapter:${label}] ERROR RESPONSE: ${xmlText.slice(0, 1000)}`);
        throw new Error(`[BuildingLedgerAdapter:${label}] HTTP ${response.status}: ${xmlText.slice(0, 500)}`);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`[BuildingLedgerAdapter:${label}] API 요청 Timeout`);
      }

      if (httpStatus > 0) {
        console.warn(`[BuildingLedgerAdapter:${label}] 호출 실패 HTTP ${httpStatus}`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (isPublicDataErrorResponse(xmlText)) {
      throw new Error(`[BuildingLedgerAdapter:${label}] API 오류 응답: ${xmlText.slice(0, 500)}`);
    }

    const totalCountMatch = xmlText.match(/<totalCount>(\d+)<\/totalCount>/);
    const responseRowsMatch = xmlText.match(/<numOfRows>(\d+)<\/numOfRows>/);
    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;

    const rawItems = extractXmlItems(xmlText);
    const items = rawItems.map(itemStr => this.mapItem(itemStr, sigunguCd, bjdongCd));

    // 건축HUB가 요청 numOfRows=1000을 무시하고 실제 100건만 내려주는 경우가 있으므로
    // 응답의 numOfRows 또는 실제 반환건수를 기준으로 다음 페이지를 판단한다.
    let effectiveRows = responseRowsMatch ? parseInt(responseRowsMatch[1], 10) : numOfRows;

    if (!responseRowsMatch && items.length > 0 && items.length < numOfRows && totalCount > items.length) {
      effectiveRows = items.length;
    }

    if (effectiveRows <= 0) {
      effectiveRows = numOfRows > 0 ? numOfRows : 100;
    }

    if (bun || ji) {
      console.log(`[BuildingLedgerAdapter:${label}] PARSED ${items.length}/${totalCount}`, items.map(item => {
        const row = item as BuildingRecord & {
          familyCnt?: number | null;
          hoCnt?: number | null;
          vlRatEstmTotArea?: number | null;
        };

        return {
          bldName: row.bldName,
          addressJibun: row.addressJibun,
          householdCnt: row.householdCnt,
          familyCnt: row.familyCnt,
          hoCnt: row.hoCnt,
          floorAreaRatio: row.floorAreaRatio,
          vlRatEstmTotArea: row.vlRatEstmTotArea,
          platAreaM2: row.platAreaM2
        };
      }));
    }

    return {
      items,
      hasMore: pageNo * effectiveRows < totalCount,
      nextPageNo: pageNo + 1
    };
  }

  private mapItem(itemStr: string, sigunguCd: string, bjdongCd: string): BuildingRecord {
    const useAprDay = parseYyyymmdd(extractXmlTag(itemStr, 'useAprDay'));

    return {
      mgmBldPk: extractXmlTag(itemStr, 'mgmBldrgstPk') || extractXmlTag(itemStr, 'mgmBldPk'),
      bldName: extractXmlTag(itemStr, 'bldNm') || null,
      addressJibun: extractXmlTag(itemStr, 'platPlc') || null,
      addressRoad: extractXmlTag(itemStr, 'newPlatPlc') || null,
      sigunguCd,
      bjdongCd,
      mainPurpsCd: extractXmlTag(itemStr, 'mainPurpsCd') || null,
      mainPurpsNm: extractXmlTag(itemStr, 'mainPurpsCdNm') || null,
      totalAreaM2: parseFloatOrNull(extractXmlTag(itemStr, 'totArea')),
      archAreaM2: parseFloatOrNull(extractXmlTag(itemStr, 'archArea')),
      platAreaM2: parseFloatOrNull(extractXmlTag(itemStr, 'platArea')),
      householdCnt: parseIntOrNull(extractXmlTag(itemStr, 'hhldCnt')),
      familyCnt: parseIntOrNull(extractXmlTag(itemStr, 'fmlyCnt')),
      hoCnt: parseIntOrNull(extractXmlTag(itemStr, 'hoCnt')),
      floorAreaRatio: parseFloatOrNull(extractXmlTag(itemStr, 'vlRat')),
      vlRatEstmTotArea: parseFloatOrNull(extractXmlTag(itemStr, 'vlRatEstmTotArea')),
      floorGroundCnt: parseIntOrNull(extractXmlTag(itemStr, 'grndFlrCnt')),
      floorUnderCnt: parseIntOrNull(extractXmlTag(itemStr, 'ugrndFlrCnt')),
      structCd: extractXmlTag(itemStr, 'strctCd') || null,
      structNm: extractXmlTag(itemStr, 'strctCdNm') || null,
      useAprDay,
      useAprYear: yyyymmddToYear(useAprDay),
      lat: null,
      lon: null,
      geocodeSource: null,
      geocodeConfidence: null
    } as BuildingRecord & {
      familyCnt: number | null;
      hoCnt: number | null;
      vlRatEstmTotArea: number | null;
    };
  }
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

