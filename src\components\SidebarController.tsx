import React, { useState } from 'react';
import { Search, RefreshCw, Calendar, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { TargetPropertyConfig } from '../types';

interface SidebarControllerProps {
  addressInput: string;
  setAddressInput: (val: string) => void;
  propertyType: 'APT' | 'OPST' | 'VL';
  setPropertyType: (val: 'APT' | 'OPST' | 'VL') => void;
  targetConfig: TargetPropertyConfig;
  setTargetConfig: React.Dispatch<React.SetStateAction<TargetPropertyConfig>>;
  onSync: () => void;
  isLoading: boolean;
  searchRadiusM: number;
  setSearchRadiusM: (meters: number) => void;
  // true면 상단 전체폭 바가 아니라, 다른 요소와 같은 줄에 낄 수 있는 카드형으로 렌더링한다.
  compact?: boolean;
}

export const SidebarController: React.FC<SidebarControllerProps> = ({
  addressInput,
  setAddressInput,
  propertyType,
  setPropertyType,
  targetConfig,
  setTargetConfig,
  onSync,
  isLoading,
  searchRadiusM,
  setSearchRadiusM,
  compact = false
}) => {
  const toPyeong = (m2: number) => parseFloat((m2 / 3.3058).toFixed(1));

  const handleM2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val) || val <= 0) return;
    // 입력값을 기준으로 기본 비교 범위를 자동 세팅한다. (59㎡ → 49~68㎡)
    const minM2 = val >= 200 ? 200 : Math.max(10, Math.round(val - 10));
    const maxM2 = val >= 200 ? 200 : Math.min(200, Math.round(val + 9));
    setTargetConfig(prev => ({
      ...prev,
      targetPyeong: toPyeong(val),
      targetAreaM2: val,
      comparableMinPyeong: toPyeong(minM2),
      comparableMaxPyeong: toPyeong(maxM2)
    }));
  };

  const handleTargetHouseholdsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.round(Number(e.target.value));
    if (!Number.isFinite(val) || val <= 0) return;
    setTargetConfig(prev => ({
      ...prev,
      targetHouseholds: val,
      comparableMinHouseholds: Math.max(1, Math.round(val * 0.75)),
      comparableMaxHouseholds: val >= 3000 ? 3000 : Math.round(val * 1.25)
    }));
  };

  const handleComparableAreaRangeChange = (field: 'comparableMinPyeong' | 'comparableMaxPyeong', value: string) => {
    const parsedM2 = parseFloat(value);
    if (isNaN(parsedM2) || parsedM2 <= 0) return;
    const parsed = toPyeong(parsedM2);
    setTargetConfig(prev => {
      const next = { ...prev, [field]: parsed };
      if (next.comparableMinPyeong > next.comparableMaxPyeong) {
        if (field === 'comparableMinPyeong') next.comparableMaxPyeong = parsed;
        else next.comparableMinPyeong = parsed;
      }
      return next;
    });
  };

  const handleHouseholdRangeChange = (field: 'comparableMinHouseholds' | 'comparableMaxHouseholds', value: string) => {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setTargetConfig(prev => {
      const next = { ...prev, [field]: parsed };
      if (next.comparableMinHouseholds > next.comparableMaxHouseholds) {
        if (field === 'comparableMinHouseholds') next.comparableMaxHouseholds = parsed;
        else next.comparableMinHouseholds = parsed;
      }
      return next;
    });
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const yr = parseInt(e.target.value, 10) || 2026;
    setTargetConfig(prev => ({
      ...prev,
      targetApprovalYear: yr
    }));
  };

  // 세부필터(비교대상군 범위 조정)는 평소엔 접어 두고, 버튼을 눌렀을 때만 펼친다.
  const [isDetailFilterOpen, setIsDetailFilterOpen] = useState(false);

  return (
    <div className={compact
      ? 'bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 w-full xl:w-[440px] xl:shrink-0'
      : 'w-full bg-white border-b border-slate-200 p-4 lg:p-5 shadow-xs space-y-3'
    }>
      {/* 1행: 사업지 주소 검색 */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none" aria-hidden="true" />
          <input
            id="address-input"
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSync();
            }}
            placeholder="도로명/지번/동 입력 (예: 역삼동 825, 판교역)"
            className="w-full h-10 pl-9 pr-9 bg-white border-2 border-blue-600 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 transition-all placeholder:text-slate-400"
          />
          <button
            onClick={onSync}
            disabled={isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-50 cursor-pointer"
            title="검색 및 좌표 동기화"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Main Trigger Button */}
        <button
          id="btn-sync-realtime"
          onClick={onSync}
          disabled={isLoading}
          className="shrink-0 h-10 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-slate-900 hover:from-blue-700 hover:to-slate-800 text-white font-bold text-sm shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? '동기화 중...' : '동기화'}</span>
        </button>
      </div>

      {/* 2행: 계획중인 면적/세대수/유형 + 세부필터 */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center gap-1 h-7 flex-[1.35] min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <span className="text-[10px] font-bold text-slate-500 shrink-0">면적</span>
          <input id="target-area-m2-input" type="number" step="0.01" min="10" max="500"
            value={targetConfig.targetAreaM2} onChange={handleM2Change}
            className="w-12 bg-transparent text-xs font-bold text-slate-900 focus:outline-none" />
          <span className="text-[10px] text-slate-400 shrink-0">㎡</span>
          <span className="text-[10px] text-blue-600 font-semibold shrink-0 whitespace-nowrap">({targetConfig.targetPyeong}평)</span>
        </div>
        <div className="flex items-center justify-center gap-1 h-7 flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <span className="text-[10px] font-bold text-slate-500 shrink-0">세대수</span>
          <input id="target-households-input" type="number" step="1" min="1" max="3000"
            value={targetConfig.targetHouseholds} onChange={handleTargetHouseholdsChange}
            className="w-12 bg-transparent text-xs font-bold text-slate-900 focus:outline-none" />
          <span className="text-[10px] text-slate-400 shrink-0">세대</span>
        </div>
        <select
          id="property-type-select"
          value={propertyType}
          onChange={(e) => {
            const code = e.target.value as 'APT' | 'OPST' | 'VL';
            setPropertyType(code);
            setTargetConfig(prev => ({ ...prev, rletTpCd: code }));
          }}
          className="h-7 w-[76px] shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <option value="APT">아파트</option>
          <option value="OPST">오피스텔</option>
          <option value="VL">다세대빌라</option>
        </select>

        <button
          type="button"
          onClick={() => setIsDetailFilterOpen(value => !value)}
          aria-label="세부필터"
          title="세부필터"
          className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-lg transition-colors cursor-pointer ${
            isDetailFilterOpen
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 세부필터: 사업지 준공 계획 + 비교대상군(면적/세대수 범위) 조정 - 평소엔 숨김, 버튼을 눌렀을 때만 표시 */}
      {isDetailFilterOpen && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 uppercase tracking-wider mb-2">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              사업지 준공 계획
            </label>
            <div className="max-w-[160px]">
              <div className="text-[11px] text-slate-500 mb-1">준공 예정년도</div>
              <input
                type="number"
                min="2020"
                max="2035"
                value={targetConfig.targetApprovalYear}
                onChange={handleYearChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-900 mb-2">반경 내 유효 표본</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[300, 500, 1000, 2000].map(meters => (
                <button
                  key={meters}
                  type="button"
                  onClick={() => setSearchRadiusM(meters)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    searchRadiusM === meters
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {meters >= 1000 ? `${meters / 1000}km` : `${meters}m`}
                </button>
              ))}
            </div>
          </div>

          <label className="text-xs font-bold text-slate-900 block">
            비교대상군 세부 조정
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-600">전용면적 범위</span>
                <span className="text-blue-700">전용 {Math.round(targetConfig.comparableMinPyeong * 3.3058)}㎡ ~ {targetConfig.comparableMaxPyeong >= 60.5 ? '200㎡ 이상' : `${Math.round(targetConfig.comparableMaxPyeong * 3.3058)}㎡`}</span>
              </div>
              <div className="comparable-range" aria-label="전용면적 범위 슬라이더"
                style={{
                  '--range-start': `${((targetConfig.comparableMinPyeong * 3.3058 - 10) / 1.9).toFixed(2)}%`,
                  '--range-end': `${((targetConfig.comparableMaxPyeong * 3.3058 - 10) / 1.9).toFixed(2)}%`
                } as React.CSSProperties}>
                <input aria-label="전용면적 최소" type="range" min="10" max="200" step="1"
                  value={Math.round(targetConfig.comparableMinPyeong * 3.3058)}
                  onChange={e => handleComparableAreaRangeChange('comparableMinPyeong', e.target.value)} />
                <input aria-label="전용면적 최대" type="range" min="10" max="200" step="1"
                  value={Math.round(targetConfig.comparableMaxPyeong * 3.3058)}
                  onChange={e => handleComparableAreaRangeChange('comparableMaxPyeong', e.target.value)} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400"><span>10㎡</span><span>200㎡ 이상</span></div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-600">세대수 범위</span>
                <span className="text-blue-700">{targetConfig.comparableMinHouseholds}세대 ~ {targetConfig.comparableMaxHouseholds >= 3000 ? '3,000세대 이상' : `${targetConfig.comparableMaxHouseholds}세대`}</span>
              </div>
              <div className="comparable-range" aria-label="세대수 범위 슬라이더"
                style={{
                  '--range-start': `${((targetConfig.comparableMinHouseholds - 1) / 29.99).toFixed(2)}%`,
                  '--range-end': `${((targetConfig.comparableMaxHouseholds - 1) / 29.99).toFixed(2)}%`
                } as React.CSSProperties}>
                <input aria-label="세대수 최소" type="range" min="1" max="3000" step="10"
                  value={targetConfig.comparableMinHouseholds}
                  onChange={e => handleHouseholdRangeChange('comparableMinHouseholds', e.target.value)} />
                <input aria-label="세대수 최대" type="range" min="1" max="3000" step="10"
                  value={targetConfig.comparableMaxHouseholds}
                  onChange={e => handleHouseholdRangeChange('comparableMaxHouseholds', e.target.value)} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400"><span>1세대</span><span>3,000세대 이상</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

