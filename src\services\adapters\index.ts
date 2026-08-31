import { SourceAdapter } from './types';
import { BuildingRecord, HousingPermitRecord } from '../../types/buildingPlatform';
import { BuildingLedgerAdapter } from './buildingLedgerAdapter';
import { HousingPermitAdapter } from './housingPermitAdapter';
import { MockBuildingLedgerAdapter } from './mockBuildingLedgerAdapter';
import { MockHousingPermitAdapter } from './mockHousingPermitAdapter';

/**
 * data.go.kr의 일반 인증키는 서비스별로 따로 만들 필요가 없다.
 * 전용 환경변수가 없으면 기존 MOLIT_SERVICE_KEY를 건축HUB에도 사용한다.
 * (별도 키를 쓰고 싶을 때만 BUILDING_LEDGER_API_KEY / HOUSING_PERMIT_API_KEY를 설정한다.)
 */
export function getBuildingLedgerServiceKey(): string | undefined {
  return process.env.BUILDING_LEDGER_API_KEY || process.env.MOLIT_SERVICE_KEY;
}

export function getHousingPermitServiceKey(): string | undefined {
  return process.env.HOUSING_PERMIT_API_KEY || process.env.MOLIT_SERVICE_KEY;
}

export function getBuildingLedgerAdapter(): SourceAdapter<BuildingRecord> {
  const serviceKey = getBuildingLedgerServiceKey();
  return serviceKey ? new BuildingLedgerAdapter(serviceKey) : new MockBuildingLedgerAdapter();
}

export function getHousingPermitAdapter(): SourceAdapter<HousingPermitRecord> {
  const serviceKey = getHousingPermitServiceKey();
  return serviceKey ? new HousingPermitAdapter(serviceKey) : new MockHousingPermitAdapter();
}

export function isUsingMockBuildingData(): boolean {
  return !getBuildingLedgerServiceKey();
}

export function isUsingMockPermitData(): boolean {
  return !getHousingPermitServiceKey();
}

