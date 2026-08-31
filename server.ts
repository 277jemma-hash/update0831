import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { NaverLandDongConverter } from './src/services/dongConverter';
import { SafeNaverLandCrawler } from './src/services/crawler';
import { MolitRealEstateService } from './src/services/molitService';
import { AptComplexRegistryService } from './src/services/aptComplexRegistry';
import { calculateAge } from './src/services/ageBands';
import { BuildingLedgerAdapter } from './src/services/adapters/buildingLedgerAdapter';
import { KaptBasisService } from './src/services/kaptBasisService';
import {
  getBuildingLedgerAdapter,
  getHousingPermitAdapter,
  isUsingMockBuildingData,
  isUsingMockPermitData,
  getBuildingLedgerServiceKey,
  getHousingPermitServiceKey
} from './src/services/adapters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const dongConverter = new NaverLandDongConverter();
  const crawler = new SafeNaverLandCrawler();
  const molitService = new MolitRealEstateService();
  const aptComplexRegistry = new AptComplexRegistryService();

  // 총괄표제부에 값이 없을 때 표제부(getBrTitleInfo)를 2차 조회하기 위한 실제 어댑터.
  // enrich-comparables 라우트는 실제 키가 있는 경우에만 이 인스턴스를 사용한다.
  const buildingLedgerFallbackAdapter = getBuildingLedgerServiceKey()
      ? new BuildingLedgerAdapter(getBuildingLedgerServiceKey())
      : null;

  // K-apt 공동주택 기본정보 서비스.
  // 해당 데이터셋 활용신청이 되어 있지 않거나 키가 없으면 세대수 fallback만 건너뛴다.
  let kaptBasisService: KaptBasisService | null = null;
  try {
    kaptBasisService = new KaptBasisService(
        process.env.KAPT_API_KEY ||
        process.env.MOLIT_SERVICE_KEY ||
        getBuildingLedgerServiceKey() ||
        undefined
    );
  } catch {
    kaptBasisService = null;
  }

  // Lazy Gemini AI initialization
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI | null {
    if (!aiClient && process.env.GEMINI_API_KEY) {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 2. Address to Legal Dong code (CortarNo) and Coordinates
  app.post('/api/convert-address', async (req, res) => {
    try {
      const { address } = req.body;
      const result = await dongConverter.convertAddressToCode(address || "신림동");
      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "주소 변환 중 오류가 발생했습니다."
      });
    }
  });

  // 3. Fetch real estate listings from Naver or dynamic relative fallback
  app.post('/api/fetch-listings', async (req, res) => {
    try {
      const {
        cortarNo,
        rletTpCd = 'APT',
        tradTpCd = 'A1',
        dongName = '신림동',
        centerLat = 37.4784,
        centerLon = 126.9320,
        page = 1
      } = req.body;

      const listings = await crawler.fetchListings(
          cortarNo,
          rletTpCd,
          tradTpCd,
          page,
          dongName,
          centerLat,
          centerLon
      );

      res.json({
        success: true,
        count: listings.length,
        data: listings,
        centerLat,
        centerLon,
        dongName
      });
    } catch (error: any) {
      // Even in catch block, provide fallback to keep UI perfectly synchronized
      const fallbackListings = crawler.getDynamicMockData(
          req.body.rletTpCd || 'APT',
          req.body.dongName || '사업지',
          req.body.centerLat || 37.4784,
          req.body.centerLon || 126.9320
      );
      res.json({
        success: true,
        count: fallbackListings.length,
        data: fallbackListings,
        isFallback: true
      });
    }
  });

  // 3.1. Fetch official MOLIT actual transaction records (국토교통부 실거래가)
  app.post('/api/molit-real-transactions', async (req, res) => {
    try {
      const {
        lawdCd = '11620',
        dealYmd,
        dongName,
        lat = 37.4784,
        lon = 126.9320,
        rletTpCd = 'APT',
        months = 5,
        complexName,
        complexNames
      } = req.body;
      const transactions = await molitService.fetchRealTransactions(
          rletTpCd,
          lawdCd,
          dealYmd,
          dongName,
          parseFloat(lat),
          parseFloat(lon),
          Number(months) || 5,
          complexName,
          Array.isArray(complexNames) ? complexNames : undefined
      );
      res.json({
        success: true,
        count: transactions.length,
        data: transactions,
        lawdCd,
        dealYmd,
        months: Math.min(36, Math.max(1, Number(months) || 5)),
        complexName: complexName || null
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || "국토부 실거래가 조회 중 오류가 발생했습니다."
      });
    }
  });

  // 3.2. 부동산원 단지 식별정보(getAptInfo)로 정확한 주소 조회
  // 카카오 텍스트 검색보다 신뢰도 높은 위치 확인용 - 클라이언트가 이 주소를 카카오
  // geocoder.addressSearch로 정밀 지오코딩한다.
  app.post('/api/apt-complex-address', async (req, res) => {
    try {
      const { complexName, addressHint } = req.body;
      if (!complexName || !addressHint) {
        res.status(400).json({ success: false, error: 'complexName과 addressHint가 필요합니다.' });
        return;
      }
      const address = await aptComplexRegistry.resolveComplexAddress(complexName, addressHint);
      res.json({ success: !!address, address: address || null });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || '단지 주소 조회 중 오류가 발생했습니다.' });
    }
  });

  // 4. AI Professional Real Estate Valuation & PF Opinion generator
  app.post('/api/ai-appraisal', async (req, res) => {
    try {
      const { appraisalData } = req.body;
      const ai = getAiClient();

      if (!ai) {
        // Return structured intelligent evaluation when API key is not ready
        return res.json({
          success: true,
          report: {
            summary: `${appraisalData.targetConfig.address} 인근의 동종 실거래 매물 ${appraisalData.comparableCases.length}건을 바탕으로 산정한 최종 감정평가 전용평당가는 약 ${appraisalData.finalAdjustedPricePerPyeong.toLocaleString()}만원이며, 목표 전용면적 ${appraisalData.targetConfig.targetPyeong}평 기준 적정 기대가치는 ${appraisalData.totalExpectedValueEok.toFixed(2)}억원으로 평가됩니다.`,
            marketTrend: `해당 권역은 대중교통 접근성과 직주근접 수요가 탄탄한 지역으로, 최근 신축 선호 현상과 구축 리모델링 수요가 양립하고 있습니다.`,
            buildingAgeAnalysis: `비교 대상 사례들의 평균 건축연식 대비 사업지(신축)의 감가상각 가치 우위가 +10~15% 반영되었으며, 노후도 격차에 따른 개별요인($S_i$) 보정이 유효하게 작동하였습니다.`,
            recommendedPriceRange: {
              minPricePerPyeong: Math.round(appraisalData.finalAdjustedPricePerPyeong * 0.95),
              maxPricePerPyeong: Math.round(appraisalData.finalAdjustedPricePerPyeong * 1.06),
              totalMinValuation: Math.round(appraisalData.totalExpectedValueManwon * 0.95),
              totalMaxValuation: Math.round(appraisalData.totalExpectedValueManwon * 1.06)
            },
            pfRiskFactors: [
              "고금리 기조에 따른 분양 수분양자 초기 자금조달 부담 가능성",
              "인근 유사 평형대 공급 물량 집중 시 일시적 매매가 상승폭 둔화 위험",
              "신축 프리미엄 유지 기간(준공 후 3년) 내 조기 완판 마케팅 전략 수립 필요"
            ],
            valuationOpinion: `본 사업지는 주변 노후 주거단지 대비 신축 프리미엄과 공간 효율성을 확보하고 있어 평당 ${appraisalData.finalAdjustedPricePerPyeong.toLocaleString()}만원 선의 가격 저항선이 크지 않을 것으로 분석됩니다. 안정적인 분양률 달성을 위해 1차 분양가는 하단 밴드인 ${Math.round(appraisalData.finalAdjustedPricePerPyeong * 0.97).toLocaleString()}만원/평으로 책정 후 순차 인상을 권고합니다.`
          }
        });
      }

      const prompt = `
당신은 대한민국 최고 수준의 부동산 감정평가사 및 부동산 PF 심사역입니다.
아래 거래사례비교법 평가 결과 데이터를 정밀 분석하여 전문적인 감정평가서 및 PF 심사의견을 JSON 형식으로 작성해 주십시오.

[평가 입력 데이터]
- 대상 사업지 주소: ${appraisalData.targetConfig.address}
- 부동산 유형: ${appraisalData.targetConfig.rletTpCd}
- 목표 전용면적: ${appraisalData.targetConfig.targetPyeong}평 (${appraisalData.targetConfig.targetAreaM2}㎡)
- 사업지 예정 준공: ${appraisalData.targetConfig.targetApprovalYear}년식 (신축)
- 선택된 비교 사례 수: ${appraisalData.comparableCases.length}건
- 비교사례 요약:
${appraisalData.comparableCases.map((c: any, i: number) => `  * 사례 ${i + 1}: ${c.listing.articleName} (${c.listing.useApprovalDate}, 전용 ${c.listing.dedicatedPyeong}평), 원본단가 ${c.listing.pricePerPyeong.toLocaleString()}만원/평 -> 보정계수 ${c.totalFactor.toFixed(3)} -> 보정단가 ${c.adjustedPricePerPyeong.toLocaleString()}만원/평`).join('\n')}
- 최종 산정 전용평당가: ${appraisalData.finalAdjustedPricePerPyeong.toLocaleString()}만원/평
- 목표면적 기준 총 기대가치: ${appraisalData.totalExpectedValueManwon.toLocaleString()}만원 (${appraisalData.totalExpectedValueEok.toFixed(2)}억원)

JSON 응답 필드:
{
  "summary": "핵심 감정평가 요약 2~3문장",
  "marketTrend": "해당 권역 입지 및 부동산 시장 동향 분석",
  "buildingAgeAnalysis": "사용승인일(연식) 차이에 따른 노후도 감가 및 신축 프리미엄 보정 적정성 평가",
  "recommendedPriceRange": {
    "minPricePerPyeong": 숫자,
    "maxPricePerPyeong": 숫자,
    "totalMinValuation": 숫자(만원단위),
    "totalMaxValuation": 숫자(만원단위)
  },
  "pfRiskFactors": ["위험요소 및 주의사항 1", "위험요소 및 주의사항 2", "위험요소 및 주의사항 3"],
  "valuationOpinion": "최종 감정평가사 종합 분양가/매매가 전략 의견"
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const jsonText = response.text || "{}";
      const report = JSON.parse(jsonText);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3.3. 실거래 비교단지에 건축물대장·주택인허가의 세대수/용적률을 보완한다.
  app.post('/api/building-platform/enrich-comparables', async (req, res) => {
    try {
      const { cortarNo, dongCodes, listings = [] } = req.body as {
        cortarNo?: string;
        dongCodes?: string[];
        listings?: Array<{
          id: string;
          articleName?: string;
          buildingName?: string;
          rletTpCd?: 'APT' | 'OPST' | 'VL';
        }>;
      };

      const sigunguCd = String(cortarNo || '').slice(0, 5);
      const defaultBjdongCd = String(cortarNo || '').slice(5, 10);

      if (!sigunguCd || !defaultBjdongCd || !Array.isArray(listings) || listings.length === 0) {
        return res.json({ success: true, data: {}, reason: '법정동 코드 또는 비교단지 정보 없음' });
      }

      if (!buildingLedgerFallbackAdapter) {
        return res.json({ success: true, data: {}, reason: '건축물대장 실제 API 키 미설정', isMock: true });
      }

      const normalizeText = (value?: string | null): string =>
          (value || '').normalize('NFKC').replace(/\s+/g, '').replace(/[()（）·ㆍ.,]/g, '').toLowerCase();

      const extractDong = (value?: string | null): string => {
        const match = (value || '').match(/([가-힣0-9]+(?:동|가|읍|면|리))/);
        return match ? match[1] : '';
      };

      const extractParcelInfo = (value?: string | null): { dongName: string; bun: string; ji: string; key: string } | null => {
        const match = (value || '').match(/([가-힣0-9]+(?:동|가|읍|면|리))\s*(?:산\s*)?(\d+)(?:-(\d+))?/);

        if (!match) {
          return null;
        }

        const dongName = match[1];
        const main = Number(match[2]);
        const sub = match[3] ? Number(match[3]) : 0;

        return {
          dongName,
          bun: String(main).padStart(4, '0'),
          ji: String(sub).padStart(4, '0'),
          key: `${dongName}:${main}${sub > 0 ? `-${sub}` : ''}`
        };
      };

      const extractParcel = (value?: string | null): string => {
        const info = extractParcelInfo(value);
        return info?.key || '';
      };

      const normalizeBrand = (value?: string | null): string => {
        let normalized = normalizeText(value);
        let previous = '';

        while (normalized && normalized !== previous) {
          previous = normalized;
          normalized = normalized.replace(/(아파트|apt|주상복합|오피스텔|공동주택|단지)$/gi, '');
        }

        return normalized;
      };

      const brandScore = (listingName?: string, recordName?: string | null): number => {
        const listingBrand = normalizeBrand(listingName);
        const recordBrand = normalizeBrand(recordName);

        if (!listingBrand || !recordBrand) {
          return 0;
        }

        if (listingBrand === recordBrand) {
          return 100;
        }

        if (recordBrand.includes(listingBrand) || listingBrand.includes(recordBrand)) {
          return 80;
        }

        return 0;
      };

      type NamedAddressRecord = {
        mgmBldPk?: string | null;
        bldName?: string | null;
        projectName?: string | null;
        addressJibun?: string | null;
        mainPurpsNm?: string | null;
        householdCnt?: number | null;
        familyCnt?: number | null;
        hoCnt?: number | null;
        floorAreaRatio?: number | null;
        totalAreaM2?: number | null;
        platAreaM2?: number | null;
        vlRatEstmTotArea?: number | null;
      };

      const positive = (value: unknown): number | undefined => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };

      const rawDongCodes = Array.isArray(dongCodes)
          ? dongCodes.filter((code): code is string => typeof code === 'string' && /^\d{10}$/.test(code))
          : [];

      const dongCodeByName = new Map<string, string>();

      for (const code of [String(cortarNo), ...rawDongCodes]) {
        if (!/^\d{10}$/.test(code) || code.slice(0, 5) !== sigunguCd) {
          continue;
        }
      }

      // 프론트에서 dongCodes 순서와 listings의 동 순서가 1:1이라고 보장할 수 없으므로,
      // 기본 법정동은 cortarNo를 사용하고 다른 동은 기존 주택인허가 보완용 동코드 목록으로만 유지한다.
      const uniqueDongCodes = Array.from(new Set([String(cortarNo), ...rawDongCodes]))
          .filter(code => /^\d{10}$/.test(code) && code.slice(0, 5) === sigunguCd);

      const inferBjdongCd = (listing: { buildingName?: string }): string => {
        const listingDong = extractDong(listing.buildingName);

        if (!listingDong) {
          return defaultBjdongCd;
        }

        // 현재 대상 법정동과 같은 동이면 cortarNo의 bjdongCd 사용.
        // 타 법정동 코드 매핑은 프론트가 dongCodes를 보내는 기존 구조를 보조적으로 사용한다.
        const defaultDong = listings.map(item => extractDong(item.buildingName)).find(Boolean);

        if (listingDong === defaultDong) {
          return defaultBjdongCd;
        }

        // 코드 자체만으로 동 이름은 알 수 없으므로 타 동은 총괄/표제부 direct 조회 실패 시 permit 보완만 사용한다.
        return defaultBjdongCd;
      };

      const fetchAllParcelPages = async (
          fetchPage: (pageNo: number) => Promise<{ items: NamedAddressRecord[]; hasMore: boolean; nextPageNo: number }>
      ): Promise<NamedAddressRecord[]> => {
        const all: NamedAddressRecord[] = [];
        let pageNo = 1;

        for (let guard = 0; guard < 10; guard++) {
          const page = await fetchPage(pageNo);
          all.push(...page.items);

          if (!page.hasMore) {
            break;
          }

          pageNo = page.nextPageNo || pageNo + 1;
        }

        return all;
      };

      const parcelKeyByListingId = new Map<string, string>();
      const parcelRequestMap = new Map<string, {
        bjdongCd: string;
        bun: string;
        ji: string;
        listings: typeof listings;
      }>();

      for (const listing of listings) {
        const parcel = extractParcelInfo(listing.buildingName);

        if (!parcel) {
          continue;
        }

        const bjdongCd = inferBjdongCd(listing);
        const requestKey = `${bjdongCd}:${parcel.bun}:${parcel.ji}`;

        parcelKeyByListingId.set(listing.id, requestKey);

        const current = parcelRequestMap.get(requestKey);

        if (current) {
          current.listings.push(listing);
        } else {
          parcelRequestMap.set(requestKey, {
            bjdongCd,
            bun: parcel.bun,
            ji: parcel.ji,
            listings: [listing]
          });
        }
      }

      const recapByParcel = new Map<string, NamedAddressRecord[]>();
      const titleByParcel = new Map<string, NamedAddressRecord[]>();
      const parcelErrors: string[] = [];

      const parcelRequests = Array.from(parcelRequestMap.entries());

      for (let i = 0; i < parcelRequests.length; i += 2) {
        const batch = parcelRequests.slice(i, i + 2);

        const results = await Promise.allSettled(
            batch.map(async ([requestKey, request]) => {
              const recapItems = await fetchAllParcelPages(pageNo =>
                    buildingLedgerFallbackAdapter.fetchParcelPage(
                        sigunguCd,
                        request.bjdongCd,
                        request.bun,
                        request.ji,
                        pageNo,
                        100
                    ) as Promise<{ items: NamedAddressRecord[]; hasMore: boolean; nextPageNo: number }>
                );
              const titleItems = await fetchAllParcelPages(pageNo =>
                    buildingLedgerFallbackAdapter.fetchParcelTitlePage(
                        sigunguCd,
                        request.bjdongCd,
                        request.bun,
                        request.ji,
                        pageNo,
                        100
                    ) as Promise<{ items: NamedAddressRecord[]; hasMore: boolean; nextPageNo: number }>
                );

              return {
                requestKey,
                recapItems,
                titleItems
              };
            })
        );

        results.forEach(result => {
          if (result.status === 'fulfilled') {
            recapByParcel.set(result.value.requestKey, result.value.recapItems);
            titleByParcel.set(result.value.requestKey, result.value.titleItems);
          } else {
            parcelErrors.push(String(result.reason?.message || result.reason));
          }
        });
      }

      const fetchAllPermitPages = async <T,>(
          fetchPage: (code: string, pageNo: number) => Promise<{ items: T[]; hasMore: boolean; nextPageNo: number }>,
          code: string
      ): Promise<T[]> => {
        const all: T[] = [];
        let pageNo = 1;

        for (let guard = 0; guard < 20; guard++) {
          const page = await fetchPage(code, pageNo);
          all.push(...page.items);

          if (!page.hasMore) {
            break;
          }

          pageNo = page.nextPageNo || pageNo + 1;
        }

        return all;
      };

      const permitSettled = await Promise.allSettled(
          uniqueDongCodes.map(code =>
              fetchAllPermitPages(
                  (dongCode, pageNo) =>
                      getHousingPermitAdapter().fetchPage(sigunguCd, dongCode.slice(5, 10), pageNo, 1000),
                  code
              )
          )
      );

      const permitItems = permitSettled.flatMap(result => result.status === 'fulfilled' ? result.value : []);

      const findBestMatch = <T extends NamedAddressRecord>(
          listing: { articleName?: string; buildingName?: string },
          records: T[],
          requireMatchEvidence = false
      ): T | null => {
        if (records.length === 0) {
          return null;
        }

        const exactParcel = extractParcel(listing.buildingName);
        const sameParcel = exactParcel
            ? records.filter(record => extractParcel(record.addressJibun) === exactParcel)
            : records;

        const hasExactParcel = sameParcel.length > 0;
        const candidates = hasExactParcel ? sameParcel : records;

        const scored = candidates
            .map(record => ({
              record,
              score: brandScore(listing.articleName, record.bldName || record.projectName)
            }))
            .sort((a, b) => b.score - a.score);

        const best = scored[0];

        // Permit records cover the whole legal dong. If neither the parcel nor the
        // complex name matches, choosing the first record leaks one building's
        // household count into unrelated complexes.
        if (requireMatchEvidence && !hasExactParcel && (!best || best.score === 0)) {
          return null;
        }

        return best?.record || candidates[0] || null;
      };

      const isPurposeMatched = (
          record: NamedAddressRecord,
          rletTpCd?: 'APT' | 'OPST' | 'VL'
      ): boolean => {
        const purpose = normalizeText(record.mainPurpsNm);

        if (!purpose) {
          return false;
        }

        if (rletTpCd === 'APT') {
          return purpose.includes('공동주택') || purpose.includes('아파트');
        }

        if (rletTpCd === 'OPST') {
          return purpose.includes('업무시설') || purpose.includes('오피스텔');
        }

        if (rletTpCd === 'VL') {
          return purpose.includes('공동주택') || purpose.includes('다세대') || purpose.includes('연립');
        }

        return true;
      };

      const resolveFar = (
          listing: {
            articleName?: string;
            buildingName?: string;
            rletTpCd?: 'APT' | 'OPST' | 'VL';
          },
          records: NamedAddressRecord[],
          sourceLabel: string
      ): number | undefined => {
        if (records.length === 0) {

          return undefined;
        }

        /**
         * 용적률은 계산하지 않고 건축물대장에 직접 기재된 vlRat만 사용한다.
         *
         * 우선순위
         * 1. 부동산 유형에 맞는 주용도 + vlRat > 0
         * 2. 주용도명이 비어 있는 경우 단지명 유사도 + vlRat > 0
         * 3. 그 외 용도가 다른 레코드는 사용하지 않는다.
         *
         * APT  : 공동주택/아파트
         * OPST : 업무시설/오피스텔
         * VL   : 공동주택/다세대/연립
         */
        const directCandidates = records
            .map(record => {
              const far = positive(record.floorAreaRatio);
              const purposeMatched = isPurposeMatched(record, listing.rletTpCd);
              const hasPurpose = !!normalizeText(record.mainPurpsNm);
              const nameScore = brandScore(listing.articleName, record.bldName || record.projectName);

              return {
                record,
                far,
                purposeMatched,
                hasPurpose,
                nameScore
              };
            })
            .filter(
                (item): item is {
                  record: NamedAddressRecord;
                  far: number;
                  purposeMatched: boolean;
                  hasPurpose: boolean;
                  nameScore: number;
                } => item.far !== undefined
            );

        const matchedPurposeCandidates = directCandidates
            .filter(item => item.purposeMatched)
            .sort((a, b) => b.nameScore - a.nameScore);

        if (matchedPurposeCandidates.length > 0) {
          const selected = matchedPurposeCandidates[0];

          return selected.far;
        }

        /**
         * 일부 오래된 건축물대장은 주용도명이 공란일 수 있다.
         * 이 경우에만 단지명이 명확하게 일치하는 레코드의 vlRat을 허용한다.
         */
        const noPurposeCandidates = directCandidates
            .filter(item => !item.hasPurpose && item.nameScore >= 80)
            .sort((a, b) => b.nameScore - a.nameScore);

        if (noPurposeCandidates.length > 0) {
          const selected = noPurposeCandidates[0];

          return selected.far;
        }
        return undefined;
      };

      const kaptInfoByListingId = new Map<string, { households?: number; address?: string | null; pnu?: string | null }>();

      if (kaptBasisService) {
        const aptTargets = listings.filter(listing => listing.rletTpCd === 'APT' || listing.rletTpCd === undefined);

        for (let i = 0; i < aptTargets.length; i += 2) {
          const batch = aptTargets.slice(i, i + 2);

          const results = await Promise.allSettled(
              batch.map(async listing => {
                const info = await kaptBasisService!.resolveBasicInfo(
                    sigunguCd,
                    listing.articleName || '',
                    listing.buildingName || ''
                );

                return { listingId: listing.id, info };
              })
          );

          results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.info) {
              kaptInfoByListingId.set(result.value.listingId, {
                households: result.value.info.households || undefined,
                address: result.value.info.address,
                pnu: result.value.info.pnu
              });
            }
          });
        }
      }

      const kaptLedgerByListingId = new Map<string, { recap: NamedAddressRecord[]; title: NamedAddressRecord[] }>();

      const parsePnu = (pnu?: string | null): { sigunguCd: string; bjdongCd: string; bun: string; ji: string } | null => {
        const value = String(pnu || '').replace(/\D/g, '');
        if (value.length < 19) return null;
        return { sigunguCd: value.slice(0, 5), bjdongCd: value.slice(5, 10), bun: value.slice(11, 15), ji: value.slice(15, 19) };
      };

      // 동일 PNU는 한 번만 조회하고, 서로 다른 PNU는 제한된 병렬 배치로 처리한다.
      const pnuTargets = new Map<string, { pnuInfo: { sigunguCd: string; bjdongCd: string; bun: string; ji: string }; listingIds: string[] }>();

      for (const listing of listings) {
        if (listing.rletTpCd !== 'APT' && listing.rletTpCd !== undefined) continue;

        const kaptInfo = kaptInfoByListingId.get(listing.id);
        const pnuInfo = parsePnu(kaptInfo?.pnu);
        if (!pnuInfo) continue;

        const pnuKey = `${pnuInfo.sigunguCd}:${pnuInfo.bjdongCd}:${pnuInfo.bun}:${pnuInfo.ji}`;
        const existing = pnuTargets.get(pnuKey);

        if (existing) {
          existing.listingIds.push(listing.id);
        } else {
          pnuTargets.set(pnuKey, { pnuInfo, listingIds: [listing.id] });
        }
      }

      const pnuEntries = Array.from(pnuTargets.values());

      for (let i = 0; i < pnuEntries.length; i += 2) {
        const batch = pnuEntries.slice(i, i + 2);

        const results = await Promise.allSettled(
            batch.map(async target => {
              const recap = await fetchAllParcelPages(pageNo =>
                    buildingLedgerFallbackAdapter.fetchParcelPage(
                        target.pnuInfo.sigunguCd,
                        target.pnuInfo.bjdongCd,
                        target.pnuInfo.bun,
                        target.pnuInfo.ji,
                        pageNo,
                        100
                    ) as Promise<{ items: NamedAddressRecord[]; hasMore: boolean; nextPageNo: number }>
                );
              const title = await fetchAllParcelPages(pageNo =>
                    buildingLedgerFallbackAdapter.fetchParcelTitlePage(
                        target.pnuInfo.sigunguCd,
                        target.pnuInfo.bjdongCd,
                        target.pnuInfo.bun,
                        target.pnuInfo.ji,
                        pageNo,
                        100
                    ) as Promise<{ items: NamedAddressRecord[]; hasMore: boolean; nextPageNo: number }>
                );

              return { listingIds: target.listingIds, recap, title };
            })
        );

        for (const result of results) {
          if (result.status !== 'fulfilled') continue;

          for (const listingId of result.value.listingIds) {
            kaptLedgerByListingId.set(listingId, {
              recap: result.value.recap,
              title: result.value.title
            });
          }
        }
      }

      const data: Record<string, { totalHouseholds?: number; floorAreaRatio?: number }> = {};

      for (const listing of listings) {
        const requestKey = parcelKeyByListingId.get(listing.id);
        const recapRecords = requestKey ? recapByParcel.get(requestKey) || [] : [];
        const titleRecords = requestKey ? titleByParcel.get(requestKey) || [] : [];

        const recap = findBestMatch(listing, recapRecords);
        const title = findBestMatch(listing, titleRecords);
        const permit = findBestMatch(listing, permitItems, true);

        let households: number | undefined;

        if (listing.rletTpCd === 'OPST') {
          households =
              positive(recap?.hoCnt) ??
              positive(recap?.householdCnt) ??
              positive(recap?.familyCnt) ??
              positive(title?.hoCnt) ??
              positive(title?.householdCnt) ??
              positive(title?.familyCnt);
        } else if (listing.rletTpCd === 'VL') {
          households =
              positive(permit?.householdCnt) ??
              positive(recap?.householdCnt) ??
              positive(recap?.familyCnt) ??
              positive(title?.householdCnt) ??
              positive(title?.familyCnt);
        } else {
          households =
              kaptInfoByListingId.get(listing.id)?.households ??
              positive(permit?.householdCnt) ??
              positive(recap?.householdCnt) ??
              positive(title?.householdCnt);
        }

        // 용적률은 총괄표제부/표제부의 직접 기재 vlRat만 사용한다.
        // 면적 기반 계산 fallback은 사용하지 않는다.
        let floorAreaRatio = resolveFar(listing, recapRecords, '총괄표제부-지번');

        if (floorAreaRatio === undefined) {
          floorAreaRatio = resolveFar(listing, titleRecords, '표제부-지번');
        }

        if (floorAreaRatio === undefined) {
          const kaptLedger = kaptLedgerByListingId.get(listing.id);
          if (kaptLedger) {
            floorAreaRatio = resolveFar(listing, kaptLedger.recap, '총괄표제부-REB-PNU');
            if (floorAreaRatio === undefined) floorAreaRatio = resolveFar(listing, kaptLedger.title, '표제부-REB-PNU');
          }
        }

        const matched: { totalHouseholds?: number; floorAreaRatio?: number } = {};

        if (households !== undefined) {
          matched.totalHouseholds = Math.round(households);
        }

        if (floorAreaRatio !== undefined) {
          matched.floorAreaRatio = Math.round(floorAreaRatio);
        }

        if (Object.keys(matched).length > 0) {
          data[listing.id] = matched;
        }
      }

      const permitRejected = permitSettled.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
      );

      if (parcelErrors.length > 0) {
      }

      res.json({
        success: true,
        data,
        isMock: false,
        buildingLedgerAvailable: parcelRequestMap.size === 0 || recapByParcel.size > 0 || titleByParcel.size > 0,
        housingPermitAvailable: permitRejected.length < uniqueDongCodes.length,
        parcelRequestCount: parcelRequestMap.size,
        parcelErrorCount: parcelErrors.length
      });
    } catch (error: any) {

      res.json({
        success: true,
        data: {},
        error: error?.message || '건축 데이터 조회 실패'
      });
    }
  });

  // 4.1. 건축물대장 조회 (실제 키가 있으면 실API, 없으면 Mock - 어댑터 팩토리가 알아서 고른다)
  app.post('/api/building-platform/buildings', async (req, res) => {
    try {
      const { sigunguCd, bjdongCd, centerLat = 37.4784, centerLon = 126.932, numOfRows = 40 } = req.body;
      if (!sigunguCd || !bjdongCd) {
        return res.status(400).json({ success: false, error: 'sigunguCd, bjdongCd는 필수입니다.' });
      }

      const adapter = getBuildingLedgerAdapter();
      const page = await adapter.fetchPage(sigunguCd, bjdongCd, 1, numOfRows, {
        centerLat: parseFloat(centerLat),
        centerLon: parseFloat(centerLon)
      });

      // 노후도는 저장하지 않고 조회 시점에 계산 (설계 문서 10절)
      const data = page.items.map(b => ({ ...b, age: calculateAge(b.useAprYear) }));

      res.json({ success: true, count: data.length, data, isMock: isUsingMockBuildingData() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || '건축물대장 조회 중 오류가 발생했습니다.' });
    }
  });

  // 4.2. 주택인허가 조회
  app.post('/api/building-platform/housing-permits', async (req, res) => {
    try {
      const { sigunguCd, bjdongCd, centerLat = 37.4784, centerLon = 126.932, numOfRows = 12 } = req.body;
      if (!sigunguCd || !bjdongCd) {
        return res.status(400).json({ success: false, error: 'sigunguCd, bjdongCd는 필수입니다.' });
      }

      const adapter = getHousingPermitAdapter();
      const page = await adapter.fetchPage(sigunguCd, bjdongCd, 1, numOfRows, {
        centerLat: parseFloat(centerLat),
        centerLon: parseFloat(centerLon)
      });

      res.json({ success: true, count: page.items.length, data: page.items, isMock: isUsingMockPermitData() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || '주택인허가 조회 중 오류가 발생했습니다.' });
    }
  });

  // 5. Vite or Static file handler
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '127.0.0.1', () => {
  });
}

startServer();

