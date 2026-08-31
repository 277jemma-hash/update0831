import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  AppraisalResult,
  AiAppraisalReport,
  TargetPropertyConfig,
  ComparableCaseDetail
} from '../types';
import {
  Award,
  Sparkles,
  Download,
  Printer,
  Copy,
  Check,
  TrendingUp,
  Building2,
  Calendar,
  AlertTriangle,
  FileText,
  DollarSign
} from 'lucide-react';

interface FinalValuationReportProps {
  appraisalResult: AppraisalResult;
  onGenerateAiReport: () => Promise<void>;
  aiReport: AiAppraisalReport | null;
  isAiLoading: boolean;
}

export const FinalValuationReport: React.FC<FinalValuationReportProps> = ({
  appraisalResult,
  onGenerateAiReport,
  aiReport,
  isAiLoading
}) => {
  const [copied, setCopied] = useState(false);

  const {
    targetConfig,
    comparableCases,
    finalAdjustedPricePerPyeong,
    totalExpectedValueManwon,
    totalExpectedValueEok
  } = appraisalResult;

  // Trigger celebration confetti
  const handleCelebrate = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Prepare chart data
  const chartData = comparableCases.map((c, idx) => ({
    name: `사례 ${idx + 1} (${c.listing.useApprovalDate})`,
    '기준 실거래 단가': c.listing.pricePerPyeong,
    '요인 보정 단가': c.adjustedPricePerPyeong,
    '최종 산정 단가': finalAdjustedPricePerPyeong
  }));

  // CSV Export logic
  const handleExportCsv = () => {
    const headers = [
      '구분',
      '매물명',
      '동/층',
      '전용면적(평)',
      '준공일',
      '기준단가(만원/평)',
      '시점수정(Ti)',
      '지역요인(Li)',
      '개별연식요인(Si)',
      '면적요인(Ai)',
      '총보정계수',
      '보정단가(만원/평)'
    ];

    const rows = comparableCases.map((c, i) => [
      `사례 ${i + 1}`,
      `"${c.listing.articleName}"`,
      `"${c.listing.buildingName} ${c.listing.floorInfo}"`,
      c.listing.dedicatedPyeong,
      c.listing.useApprovalDate,
      c.listing.pricePerPyeong,
      c.adjustment.timeFactor,
      c.adjustment.locationFactor,
      c.adjustment.individualAgeFactor,
      c.adjustment.areaFactor,
      c.totalFactor.toFixed(3),
      c.adjustedPricePerPyeong
    ]);

    // Target summary row
    rows.push([
      '최종 평가 대상지',
      `"${targetConfig.address}"`,
      '신축 기준',
      targetConfig.targetPyeong,
      `${targetConfig.targetApprovalYear}년식`,
      '-',
      '-',
      '-',
      '-',
      '-',
      '1.000',
      finalAdjustedPricePerPyeong
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `부동산_거래사례비교_가치평가서_${targetConfig.address}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopySummary = () => {
    const text = `
[부동산 거래사례비교법 최종 가치산정 리포트]
- 대상 사업지: ${targetConfig.address} (${targetConfig.rletTpCd})
- 목표 전용면적: ${targetConfig.targetPyeong}평 (${targetConfig.targetAreaM2}㎡)
- 준공 계획: ${targetConfig.targetApprovalYear}년식 (신축)
- 최종 산정 전용평당가: ${finalAdjustedPricePerPyeong.toLocaleString()} 만원/평
- 총 기대 분양가치: ${totalExpectedValueEok.toFixed(2)}억원 (${totalExpectedValueManwon.toLocaleString()}만원)
- 분석 대상 비교사례 수: ${comparableCases.length}건
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Hero Valuation Showcase Card */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-blue-100 border border-white/20 mb-3">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              거래사례비교법 최종 가치산정 결과서 (Appraisal Statement)
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              {targetConfig.address}
            </h2>
            <p className="text-sm text-blue-100 mt-1">
              목표 전용면적 <strong>{targetConfig.targetPyeong}평</strong> ({targetConfig.targetAreaM2}㎡) • <strong>{targetConfig.targetApprovalYear}년 신축</strong> 기준
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-left md:text-right min-w-[280px]">
            <div className="text-xs text-blue-200 uppercase tracking-wider font-semibold">
              사업지 목표 전용면적 총 기대가치
            </div>
            <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-1">
              {totalExpectedValueEok.toFixed(2)} <span className="text-xl font-bold text-amber-300">억원</span>
            </div>
            <div className="text-xs text-blue-100 mt-1 font-mono">
              ({totalExpectedValueManwon.toLocaleString()} 만원)
            </div>

            <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
              <span className="text-blue-200">최종 산정 전용평당가</span>
              <span className="text-lg font-black text-white font-mono">
                {finalAdjustedPricePerPyeong.toLocaleString()} <span className="text-xs font-normal">만원/평</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action bar on hero */}
        <div className="mt-6 pt-5 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 relative z-10">
          <div className="text-xs text-blue-200">
            📊 비교사례 <strong>{comparableCases.length}건</strong> 통합 가중 산출 완료
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '복사 완료' : '요약 복사'}</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV 내보내기</span>
            </button>
            <button
              onClick={handleCelebrate}
              className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>평가 확정 축하</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Chart Visualizer (Recharts) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              사례별 기준 실거래가 vs 보정 전용평당가 비교 차트 (만원/평)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              준공일(연식 감가) 및 개별 요인 보정에 따른 단가 변동 궤적을 확인합니다.
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg">
            목표 최종단가: {finalAdjustedPricePerPyeong.toLocaleString()} 만원/평
          </span>
        </div>

        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 12, fill: '#475569' }} domain={['dataMin - 300', 'dataMax + 300']} />
              <Tooltip
                formatter={(val: any) => [`${Number(val).toLocaleString()} 만원/평`, '']}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <ReferenceLine
                y={finalAdjustedPricePerPyeong}
                label={{
                  value: `최종평가단가 (${finalAdjustedPricePerPyeong.toLocaleString()}만)`,
                  position: 'top',
                  fill: '#dc2626',
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
                stroke="#dc2626"
                strokeDasharray="4 4"
                strokeWidth={2}
              />
              <Bar dataKey="기준 실거래 단가" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="요인 보정 단가" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Detailed Appraisal Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 text-sm">
            거래사례비교법 정밀 산출 근거표 (Appraisal Matrix)
          </h3>
          <p className="text-xs text-slate-500">
            $P_0 \times T_i \times L_i \times S_i \times A_i = P_t$ 산출 과정 일람
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">구분</th>
                <th className="py-3 px-4">매물명</th>
                <th className="py-3 px-3">준공일</th>
                <th className="py-3 px-3">전용(평)</th>
                <th className="py-3 px-3 text-right">기준단가(만원)</th>
                <th className="py-3 px-2 text-center">시점($T_i$)</th>
                <th className="py-3 px-2 text-center">지역($L_i$)</th>
                <th className="py-3 px-2 text-center text-amber-700 font-bold">개별•연식($S_i$)</th>
                <th className="py-3 px-2 text-center">면적($A_i$)</th>
                <th className="py-3 px-3 text-center">보정계수</th>
                <th className="py-3 px-4 text-right font-bold text-red-700">최종보정단가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {comparableCases.map((c, i) => (
                <tr key={c.listing.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-blue-700">사례 {i + 1}</td>
                  <td className="py-3 px-4 font-medium text-slate-900">{c.listing.articleName}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px]">
                      {c.listing.useApprovalDate}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono">{c.listing.dedicatedPyeong}평</td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                    {c.listing.pricePerPyeong.toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-center font-mono">{c.adjustment.timeFactor.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center font-mono">{c.adjustment.locationFactor.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-amber-700 bg-amber-50/50">
                    {c.adjustment.individualAgeFactor.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-center font-mono">{c.adjustment.areaFactor.toFixed(2)}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                    {c.totalFactor.toFixed(3)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-red-600 text-sm">
                    {c.adjustedPricePerPyeong.toLocaleString()} 만원/평
                  </td>
                </tr>
              ))}
              <tr className="bg-blue-50/60 font-bold text-slate-900 border-t-2 border-blue-200">
                <td colSpan={10} className="py-3 px-4 text-right text-blue-900">
                  가중 산술평균 최종 산정단가:
                </td>
                <td className="py-3 px-4 text-right text-red-700 font-mono text-base">
                  {finalAdjustedPricePerPyeong.toLocaleString()} 만원/평
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. AI Professional Valuation & PF Opinion Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-base">
                AI 감정평가사 종합의견 및 PF 심사의견서 (Gemini AI Engine)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              비교사례 연식 격차와 입지 특성을 종합 분석한 전문 감정평가 및 사업성 검토의견을 생성합니다.
            </p>
          </div>

          <button
            onClick={onGenerateAiReport}
            disabled={isAiLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${isAiLoading ? 'animate-spin' : ''}`} />
            <span>{isAiLoading ? 'AI 종합 분석의견서 생성 중...' : 'AI 종합의견서 생성'}</span>
          </button>
        </div>

        {aiReport ? (
          <div className="mt-5 space-y-4 text-xs text-slate-700">
            {/* Executive Summary */}
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl leading-relaxed">
              <span className="font-bold text-indigo-950 text-sm block mb-1">📌 핵심 감정평가 총평</span>
              <p className="text-indigo-900 text-xs font-medium">{aiReport.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Market Trend */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl leading-relaxed">
                <span className="font-bold text-slate-900 block mb-1">🏢 입지 및 시장 동향</span>
                <p className="text-slate-600">{aiReport.marketTrend}</p>
              </div>

              {/* Age Analysis */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl leading-relaxed">
                <span className="font-bold text-amber-950 block mb-1">⏳ 준공연식(노후도) 감가 분석</span>
                <p className="text-amber-900">{aiReport.buildingAgeAnalysis}</p>
              </div>
            </div>

            {/* Recommended Range */}
            <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-slate-300 font-semibold block">권장 적정 분양단가 밴드</span>
                <div className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                  {aiReport.recommendedPriceRange.minPricePerPyeong.toLocaleString()} 만원 ~{' '}
                  {aiReport.recommendedPriceRange.maxPricePerPyeong.toLocaleString()} 만원 / 평
                </div>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[11px] text-slate-300 font-semibold block">목표 총가치 밴드</span>
                <div className="text-sm font-bold text-amber-300 font-mono mt-0.5">
                  {(aiReport.recommendedPriceRange.totalMinValuation / 10000).toFixed(2)}억 ~{' '}
                  {(aiReport.recommendedPriceRange.totalMaxValuation / 10000).toFixed(2)}억원
                </div>
              </div>
            </div>

            {/* PF Risks */}
            <div className="p-4 bg-red-50/60 border border-red-200 rounded-xl">
              <span className="font-bold text-red-950 block mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                PF 심사 및 분양 리스크 검토사항
              </span>
              <ul className="list-disc list-inside space-y-1 text-red-900">
                {aiReport.pfRiskFactors.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            {/* Final Opinion */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl leading-relaxed">
              <span className="font-bold text-slate-900 block mb-1">⚖️ 감정평가사 분양전략 의견</span>
              <p className="text-slate-700">{aiReport.valuationOpinion}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p>우측 상단의 'AI 종합의견서 생성' 버튼을 클릭하면 감정평가사 관점의 상세 보고서가 도출됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

