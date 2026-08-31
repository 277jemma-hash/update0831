import React from 'react';
import { RealEstateListing, ComparableCaseDetail, ComparableAdjustment, TargetPropertyConfig } from '../types';
import { Scale, Sliders, Calendar, ArrowRight, AlertCircle, Info, Check, Trash2, Plus, Sparkles, Edit3 } from 'lucide-react';

interface SalesComparisonAnalyzerProps {
  comparableCases: ComparableCaseDetail[];
  allListings: RealEstateListing[];
  targetConfig: TargetPropertyConfig;
  onUpdateAdjustment: (listingId: string, updates: Partial<ComparableAdjustment>) => void;
  onRemoveCase: (listingId: string) => void;
  onAddCase: (listing: RealEstateListing) => void;
  onAutoSelectTop3: () => void;
  onGoToReport: () => void;
  onEditListing?: (listing: RealEstateListing) => void;
}

export const SalesComparisonAnalyzer: React.FC<SalesComparisonAnalyzerProps> = ({
  comparableCases,
  allListings,
  targetConfig,
  onUpdateAdjustment,
  onRemoveCase,
  onAddCase,
  onAutoSelectTop3,
  onGoToReport,
  onEditListing
}) => {
  const selectedIds = comparableCases.map(c => c.listing.id);
  const unselectedListings = allListings.filter(l => !selectedIds.includes(l.id));

  // Compute overall weighted average unit price
  const totalWeightedSum = comparableCases.reduce((acc, cur) => acc + (cur.adjustedPricePerPyeong * (cur.adjustment.weight || 1)), 0);
  const totalWeight = comparableCases.reduce((acc, cur) => acc + (cur.adjustment.weight || 1), 0);
  const finalUnitPrice = totalWeight > 0 ? Math.round(totalWeightedSum / totalWeight) : 0;
  const totalTargetExpectedValue = Math.round(finalUnitPrice * targetConfig.targetPyeong);
  const totalEok = (totalTargetExpectedValue / 10000).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              거래사례비교법 요인보정 시뮬레이터 ($P_0 \times T_i \times L_i \times S_i \times A_i$)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            선택된 비교 매물의 <strong>준공일(준공연식)</strong>과 개별적 격차 요인을 보정하여 대상 사업지의 최적 분양 전용평당가를 산정합니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {comparableCases.length < 3 && (
            <button
              onClick={onAutoSelectTop3}
              className="text-xs px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-xl border border-blue-200 flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> 대표 사례 3개 자동 선별
            </button>
          )}
          <button
            onClick={onGoToReport}
            className="text-xs px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all"
          >
            <span>최종 리포트 확인</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Target Spec Reference Card */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-5 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded">
              평가 대상 사업지 (Target Property)
            </span>
            <h3 className="text-lg font-display font-bold text-white mt-1">
              {targetConfig.address} • {targetConfig.rletTpCd === 'APT' ? '아파트' : targetConfig.rletTpCd === 'OPST' ? '오피스텔' : '다세대빌라'}
            </h3>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300 mt-2 font-mono">
              <div>
                목표 전용면적: <b className="text-white">{targetConfig.targetPyeong}평</b> ({targetConfig.targetAreaM2}㎡)
              </div>
              <div>
                기준 준공년도: <b className="text-emerald-400">{targetConfig.targetApprovalYear}년식 (신축)</b>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-5 py-3.5 rounded-xl border border-white/10 text-right">
            <div className="text-xs text-slate-300">현재 보정 산정 전용평당가</div>
            <div className="text-2xl font-black text-white font-mono">
              {finalUnitPrice.toLocaleString()} <span className="text-sm font-normal text-blue-200">만원/평</span>
            </div>
            <div className="text-xs text-emerald-400 font-bold mt-0.5">
              총 기대가치: {totalEok}억원 ({totalTargetExpectedValue.toLocaleString()}만원)
            </div>
          </div>
        </div>
      </div>

      {/* Selected Comparable Cards */}
      {comparableCases.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-300">
          <Scale className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h4 className="font-bold text-slate-700">선택된 비교 사례가 없습니다</h4>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            지도 탭에서 매물을 직접 선택하거나, 상단의 '대표 사례 3개 자동 선별' 버튼을 눌러주세요.
          </p>
          <button
            onClick={onAutoSelectTop3}
            className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            대표 사례 3개 자동 선택하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {comparableCases.map((caseItem, idx) => {
            const { listing, adjustment, totalFactor, adjustedPricePerPyeong } = caseItem;
            const ageDiff = (targetConfig.targetApprovalYear || 2026) - (listing.approvalYear || 2020);
            
            return (
              <div
                key={listing.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-md mb-1">
                        비교사례 {idx + 1}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm line-clamp-1">
                        {listing.articleName}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {listing.buildingName} ({listing.floorInfo}) • 전용 {listing.dedicatedPyeong}평 ({listing.dedicatedAreaM2}㎡)
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {onEditListing && (
                        <button
                          onClick={() => onEditListing(listing)}
                          className="text-slate-400 hover:text-blue-600 p-1 transition-colors rounded hover:bg-slate-100"
                          title="사례 정보(실거래가/단지명/연식) 직접 수정"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveCase(listing.id)}
                        className="text-slate-400 hover:text-red-600 p-1 transition-colors rounded hover:bg-slate-100"
                        title="사례 제외"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* HIGH-LIGHTED USE APPROVAL DATE (준공일) */}
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-700" />
                        준공일
                      </span>
                      <span className="text-xs font-black text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded font-mono">
                        {listing.useApprovalDate ? listing.useApprovalDate.replace(/\s*\(\d{4}년식\)/g, '') : `${String(listing.approvalYear || 2020).slice(-2)}.06`}
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-800 mt-1.5 leading-snug">
                      💡 사업지(신축) 대비 <strong>{ageDiff > 0 ? `${ageDiff}년 노후` : '유사 연식'}</strong>
                      {ageDiff > 5 && (
                        <span className="block text-amber-900 font-semibold mt-0.5">
                          → 개별/연식요인($S_i$) 슬라이더 상향 보정(+{(ageDiff * 1.0).toFixed(0)}%) 추천
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Base Pricing Box */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-4 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">기준 실거래가</span>
                      <b className="text-slate-900 font-bold block text-sm">
                        {listing.priceManwon >= 10000
                          ? `${(listing.priceManwon / 10000).toFixed(1)}억원`
                          : `${listing.priceManwon.toLocaleString()}만원`}
                      </b>
                      {listing.dealDate && (
                        <span className="text-[10px] text-blue-600 font-medium block mt-0.5">{listing.dealDate}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">전용평당가(계약평당가)</span>
                      <b className="text-red-600 block">
                        {listing.pricePerPyeong.toLocaleString()}만원/평<span className="text-slate-400 font-normal">({listing.supplyPricePerPyeong
                          ? listing.supplyPricePerPyeong.toLocaleString()
                          : Math.round(listing.priceManwon / (listing.dedicatedPyeong * 1.33)).toLocaleString()} 만원/평)</span>
                      </b>
                    </div>
                  </div>

                  {/* Adjustment Sliders */}
                  <div className="space-y-3 pt-1 border-t border-slate-100">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1 mb-1">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      격차율 보정 슬라이더 ($T_i, L_i, S_i, A_i$)
                    </div>

                    {/* Ti: Time Factor */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">시점수정 ($T_i$)</span>
                        <span className="font-mono font-bold text-slate-900">
                          {adjustment.timeFactor.toFixed(2)}배
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={adjustment.timeFactor}
                        onChange={(e) =>
                          onUpdateAdjustment(listing.id, { timeFactor: parseFloat(e.target.value) })
                        }
                        className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                      />
                    </div>

                    {/* Li: Location Factor */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">지역요인 ($L_i$)</span>
                        <span className="font-mono font-bold text-slate-900">
                          {adjustment.locationFactor.toFixed(2)}배
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={adjustment.locationFactor}
                        onChange={(e) =>
                          onUpdateAdjustment(listing.id, { locationFactor: parseFloat(e.target.value) })
                        }
                        className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                      />
                    </div>

                    {/* Si: Individual / Age Factor */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium flex items-center gap-1">
                          개별•연식요인 ($S_i$)
                          <span className="text-[10px] text-amber-600 font-bold bg-amber-100 px-1 rounded">연식보정</span>
                        </span>
                        <span className="font-mono font-bold text-amber-700">
                          {adjustment.individualAgeFactor.toFixed(2)}배
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={adjustment.individualAgeFactor}
                        onChange={(e) =>
                          onUpdateAdjustment(listing.id, {
                            individualAgeFactor: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-amber-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                      />
                    </div>

                    {/* Ai: Area / Other Factor */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 font-medium">면적•기타요인 ($A_i$)</span>
                        <span className="font-mono font-bold text-slate-900">
                          {adjustment.areaFactor.toFixed(2)}배
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={adjustment.areaFactor}
                        onChange={(e) =>
                          onUpdateAdjustment(listing.id, { areaFactor: parseFloat(e.target.value) })
                        }
                        className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Formula Result Box for this Case */}
                <div className="mt-5 pt-3 border-t border-slate-200 bg-slate-50 p-3 rounded-xl">
                  <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between mb-1">
                    <span>총합 보정계수:</span>
                    <span className="font-bold text-slate-900">
                      {totalFactor.toFixed(3)}배
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-600 bg-white p-2 rounded border border-slate-200 mb-2 leading-relaxed">
                    $P_{'{'}t{idx + 1}{'}'} = {listing.pricePerPyeong.toLocaleString()} \times {adjustment.timeFactor.toFixed(2)} \times {adjustment.locationFactor.toFixed(2)} \times {adjustment.individualAgeFactor.toFixed(2)} \times {adjustment.areaFactor.toFixed(2)}$
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">사례 {idx + 1} 보정단가:</span>
                    <span className="text-base font-black text-red-600 font-mono">
                      {adjustedPricePerPyeong.toLocaleString()} 만원/평
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add more comparables drawer if less than 6 */}
      {unselectedListings.length > 0 && comparableCases.length < 6 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            수집 매물 중에서 추가 비교 사례 등록하기
          </div>
          <div className="flex flex-wrap gap-2">
            {unselectedListings.map((listing) => (
              <button
                key={listing.id}
                onClick={() => onAddCase(listing)}
                className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 font-medium rounded-lg border border-slate-200 flex items-center gap-1.5 transition-all"
              >
                <span>{listing.articleName}</span>
                <span className="text-amber-700 font-mono">({listing.useApprovalDate})</span>
                <span className="text-blue-600 font-bold">{listing.pricePerPyeong.toLocaleString()}만</span>
                <Plus className="w-3 h-3 text-blue-600" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

