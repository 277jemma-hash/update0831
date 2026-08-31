export interface AddressResolution {
  success: boolean;
  source: string;
  address: string;
  cortarNo: string;
  lat: number;
  lon: number;
  error?: string;
}

export interface RealEstateListing {
  id: string;
  articleName: string;
  buildingName: string;
  floorInfo: string;
  dedicatedAreaM2: number;
  dedicatedPyeong: number;
  supplyPyeong?: number;
  exclusiveRate?: number;
  priceManwon: number;
  pricePerPyeong: number;
  supplyPricePerPyeong?: number;
  dealDate?: string;
  registrationDate?: string;
  useApprovalDate: string;
  approvalYear: number | null;
  lat: number;
  lon: number;
  rletTpCd: 'APT' | 'OPST' | 'VL';
  tradTpCd: string;
  totalHouseholds?: number;
  floorAreaRatio?: number;
  isEstimated?: boolean;
  positionVerified?: boolean;
}

export interface ComparableAdjustment {
  listingId: string;
  timeFactor: number;
  locationFactor: number;
  individualAgeFactor: number;
  areaFactor: number;
  weight: number;
  note?: string;
}

export interface ComparableCaseDetail {
  listing: RealEstateListing;
  adjustment: ComparableAdjustment;
  totalFactor: number;
  adjustedPricePerPyeong: number;
}

export interface TargetPropertyConfig {
  address: string;
  rletTpCd: 'APT' | 'OPST' | 'VL';
  targetPyeong: number;
  targetAreaM2: number;
  comparableMinPyeong: number;
  comparableMaxPyeong: number;
  targetHouseholds: number;
  comparableMinHouseholds: number;
  comparableMaxHouseholds: number;
  targetApprovalYear: number;
  targetFloorInfo: string;
  memo: string;
}

export interface AppraisalResult {
  targetConfig: TargetPropertyConfig;
  comparableCases: ComparableCaseDetail[];
  finalAdjustedPricePerPyeong: number;
  totalExpectedValueManwon: number;
  totalExpectedValueEok: number;
  minCompPrice: number;
  maxCompPrice: number;
  avgRawCompPrice: number;
  calculatedAt: string;
}

export interface AiAppraisalReport {
  summary: string;
  marketTrend: string;
  buildingAgeAnalysis: string;
  recommendedPriceRange: {
    minPricePerPyeong: number;
    maxPricePerPyeong: number;
    totalMinValuation: number;
    totalMaxValuation: number;
  };
  pfRiskFactors: string[];
  valuationOpinion: string;
}

