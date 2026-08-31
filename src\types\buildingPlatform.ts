// 건축물 데이터 분석 플랫폼 - 도메인 타입
// 설계 문서 05절(데이터베이스 구조) 기준. 컬럼명은 그 SQL 스키마와 1:1로 맞춰뒀다.

export interface BuildingRecord {
  mgmBldPk: string; // 건축HUB 관리건축물대장PK
  bldName: string | null; // bldNm
  addressJibun: string | null; // platPlc
  addressRoad: string | null; // newPlatPlc
  sigunguCd: string;
  bjdongCd: string;
  mainPurpsCd: string | null;
  mainPurpsNm: string | null; // mainPurpsCdNm
  totalAreaM2: number | null; // totArea
  archAreaM2: number | null; // archArea
  platAreaM2: number | null; // platArea
  householdCnt: number | null; // hhldCnt (건축물대장 세대수)
  floorAreaRatio: number | null; // vlRat (건축물대장 용적률)
  floorGroundCnt: number | null; // grndFlrCnt
  floorUnderCnt: number | null; // ugrndFlrCnt
  structCd: string | null;
  structNm: string | null; // strctCdNm
  useAprDay: string | null; // useAprDay, YYYYMMDD 원본 그대로 (파싱 실패 시 null)
  useAprYear: number | null; // useAprDay 앞 4자리에서 파생, API 원본 필드 아님
  lat: number | null; // 지오코딩 결과, API 미제공
  lon: number | null;
  geocodeSource: string | null;
  geocodeConfidence: 'exact' | 'approx' | 'none' | null;
}

export type PermitStatus = 'permitted' | 'construction' | 'completed' | 'unknown';

export interface HousingPermitRecord {
  permitKey: string; // 건축HUB 발급 고유키
  projectName: string | null; // bldNm 대체 표기. "사업명" 전용 필드는 API에 없음
  addressJibun: string | null; // platPlc
  sigunguCd: string;
  bjdongCd: string;
  householdCnt: number | null; // hhldCnt / totHhldCnt
  floorGroundCnt: number | null;
  floorUnderCnt: number | null;
  totalAreaM2: number | null;
  platAreaM2: number | null;
  permitDay: string | null; // pmsDay
  startCnstwkDay: string | null; // stcnsDay
  useInspectDay: string | null; // useInsptDay
  status: PermitStatus; // 날짜 필드 존재 여부로 파생 계산, API 원본 필드 아님
  lat: number | null;
  lon: number | null;
  geocodeSource: string | null;
}

export interface AgeBand {
  id: number;
  label: string; // '신축' | '양호' | '보통' | '노후' | '고노후'
  minYears: number;
  maxYears: number | null; // null = 상한 없음
  colorHex: string;
}

