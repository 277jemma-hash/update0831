import React, { useEffect, useMemo, useState } from 'react';
import { AddressResolution } from '../types';
import { RefreshCw } from 'lucide-react';
import { RealEstateListing } from '../types';

interface TransactionHistoryPanelProps {
  listings: RealEstateListing[];
  focusedListing: RealEstateListing | null;
  addressInfo: AddressResolution;
}

type DealRow = RealEstateListing & { year: number | null; month: number | null; day: number | null };

const parseDealDate = (value?: string): Pick<DealRow, 'year' | 'month' | 'day'> => {
  const raw = (value || '').trim();
  if (!raw) return { year: null, month: null, day: null };

  const parts = raw.match(/^(\d{2,4})[^\d]?(\d{1,2})?[^\d]?(\d{1,2})?/);
  if (!parts) return { year: null, month: null, day: null };

  let year = parts[1] ? Number(parts[1]) : null;
  if (year !== null && year < 100) year += 2000;

  return {
    year,
    month: parts[2] ? Number(parts[2]) : null,
    day: parts[3] ? Number(parts[3]) : null
  };
};

const formatPrice = (price: number) => {
  if (price >= 10000) {
    const eok = price / 10000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1)}억`;
  }
  return `${price.toLocaleString()}만원`;
};

const formatShortDate = (row: DealRow) =>
    row.month && row.day ? `${String(row.month).padStart(2, '0')}.${String(row.day).padStart(2, '0')}.` : '-';

const formatRegistrationDate = (value?: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 8) return '-';
  return `${digits.slice(4, 6)}.${digits.slice(6, 8)}.`;
};

// 층·호수 표기는 단지 식별에서 제거한다. 이력은 단지명/지번주소와 전용면적으로만 묶는다.
const normalizeIdentity = (value?: string) => (value || '')
    .replace(/\s*(\d+\s*층|\d+\s*호|\([^)]*층[^)]*\))/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
const isSameComplex = (listing: RealEstateListing, focused: RealEstateListing) => {
  const focusedKeys = [focused.articleName, focused.buildingName].map(normalizeIdentity).filter(Boolean);
  const candidateKeys = [listing.articleName, listing.buildingName].map(normalizeIdentity).filter(Boolean);
  return focusedKeys.some(key => candidateKeys.some(candidate =>
      candidate === key || candidate.includes(key) || key.includes(candidate)
  ));
};

export const TransactionHistoryPanel: React.FC<TransactionHistoryPanelProps> = ({ listings, focusedListing, addressInfo }) => {
  const [historyListings, setHistoryListings] = useState<RealEstateListing[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    if (!focusedListing) {
      setHistoryListings([]);
      return;
    }

    const localMatches = listings.filter(listing =>
        !listing.isEstimated && isSameComplex(listing, focusedListing)
    );
    setHistoryListings(localMatches);
    setIsHistoryLoading(true);

    fetch('/api/molit-real-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lawdCd: addressInfo.cortarNo,
        dongName: addressInfo.address,
        lat: addressInfo.lat,
        lon: addressInfo.lon,
        rletTpCd: focusedListing.rletTpCd,
        // 층수는 조회 조건에서 제외한다. 단지명 또는 지번주소로 같은 단지를 묶는다.
        complexNames: [focusedListing.articleName, focusedListing.buildingName],
        months: 36
      })
    })
        .then(response => response.ok ? response.json() : null)
        .then(payload => {
          if (payload?.success && Array.isArray(payload.data)) {
            // 표에 보였던 최근 거래와 3년 이력 응답을 합쳐, 같은 층만 남는 일을 막는다.
            const merged = [...localMatches, ...payload.data];
            const seen = new Set<string>();
            setHistoryListings(merged.filter(item => {
              const key = [normalizeIdentity(item.articleName), normalizeIdentity(item.buildingName), Math.round(item.dedicatedAreaM2), item.dealDate, item.priceManwon, item.floorInfo].join('|');
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }));
          }
        })
        .catch(() => {
          // 최근 지도 거래는 이미 localMatches로 보여주고, 추가 이력만 생략한다.
        })
        .finally(() => setIsHistoryLoading(false));
  }, [focusedListing?.id, addressInfo.cortarNo]);

  const verifiedListings = useMemo(
      () => historyListings.filter(listing => !listing.isEstimated && listing.priceManwon > 0),
      [historyListings]
  );
  const complexListings = useMemo(
      () => focusedListing
          ? verifiedListings.filter(listing => isSameComplex(listing, focusedListing))
          : [],
      [verifiedListings, focusedListing?.id]
  );

  const areaOptions = useMemo(() => {
    const groups = new Map<number, RealEstateListing[]>();
    complexListings.forEach(listing => {
      const key = Math.round(listing.dedicatedAreaM2);
      groups.set(key, [...(groups.get(key) || []), listing]);
    });
    return [...groups.entries()]
        .map(([areaM2, values]) => ({ areaM2, pyeong: Math.round((values.reduce((sum, item) => sum + item.dedicatedPyeong, 0) / values.length) * 10) / 10, count: values.length }))
        .sort((a, b) => b.areaM2 - a.areaM2);
  }, [complexListings]);

  const [selectedAreaM2, setSelectedAreaM2] = useState<number | null>(null);

  useEffect(() => {
    const focusedArea = Math.round(focusedListing?.dedicatedAreaM2 || 0);
    const preferred = areaOptions.find(option => option.areaM2 === focusedArea)?.areaM2 ?? areaOptions[0]?.areaM2 ?? null;
    setSelectedAreaM2(preferred);
  }, [areaOptions, focusedListing?.id]);

  const history = useMemo<DealRow[]>(() => {
    if (selectedAreaM2 === null) return [];
    return complexListings
        .filter(listing => Math.round(listing.dedicatedAreaM2) === selectedAreaM2)
        .map(listing => ({ ...listing, ...parseDealDate(listing.dealDate) }))
        .sort((a, b) => {
          const dateA = a.year ? new Date(a.year, (a.month || 1) - 1, a.day || 1).getTime() : 0;
          const dateB = b.year ? new Date(b.year, (b.month || 1) - 1, b.day || 1).getTime() : 0;
          return dateB - dateA;
        });
  }, [selectedAreaM2, complexListings]);

  const recentThreeYears = useMemo(() => {
    const cutoff = new Date().getFullYear() - 2;
    return history.filter(row => row.year === null || row.year >= cutoff);
  }, [history]);

  const highest = recentThreeYears.length ? Math.max(...recentThreeYears.map(row => row.priceManwon)) : null;
  const lowest = recentThreeYears.length ? Math.min(...recentThreeYears.map(row => row.priceManwon)) : null;

  const yearlyGroups = useMemo(() => {
    const groups = new Map<string, DealRow[]>();
    history.forEach(row => {
      const key = row.year ? `${row.year}년 계약` : '계약일 미상';
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    return [...groups.entries()];
  }, [history]);

  const selectedOption = areaOptions.find(option => option.areaM2 === selectedAreaM2);

  return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-900 text-white px-3 py-1.5 text-sm font-bold">매매</span>
          <select value={selectedAreaM2 ?? ''} onChange={event => setSelectedAreaM2(Number(event.target.value))} className="rounded-full bg-slate-800 text-white px-3 py-1.5 text-sm font-bold border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer" aria-label="실거래가 전용면적 선택">
            {areaOptions.map(option => <option key={option.areaM2} value={option.areaM2}>{option.areaM2}㎡ (전용 {option.pyeong}평) · {option.count}건</option>)}
          </select>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500"><RefreshCw className={`w-3.5 h-3.5 ${isHistoryLoading ? 'animate-spin' : ''}`} />{isHistoryLoading ? '최근 3년 실거래가 조회 중' : '국토부 최근 3년 실거래가'}</span>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">실거래가{focusedListing ? ` · ${focusedListing.articleName}` : ''}</h3>
            <span className="text-sm text-slate-600">동일 단지·동일면적 전체 거래{selectedOption ? ` · 전용 ${selectedOption.pyeong}평` : ''}</span>
          </div>

          {!focusedListing ? (
              <p className="py-8 text-center text-sm text-slate-500">위 거래 행을 누르면 같은 단지(또는 주소)·같은 전용면적의 실거래가를 표시합니다.</p>
          ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">선택한 단지·전용면적의 검증된 실거래가가 없습니다.</p>
          ) : (
              <>
                <div className="divide-y divide-slate-100 border-y border-slate-100 mb-7">
                  <div className="flex justify-between py-3 text-sm"><span className="text-slate-600">3년 내 최고</span><span className="font-bold text-slate-900">{highest !== null && formatPrice(highest)}</span></div>
                  <div className="flex justify-between py-3 text-sm"><span className="text-slate-600">3년 내 최저</span><span className="font-bold text-slate-900">{lowest !== null && formatPrice(lowest)}</span></div>
                </div>

                <div className="space-y-7">
                  {yearlyGroups.map(([yearLabel, rows]) => (
                      <div key={yearLabel}>
                        <h4 className="font-bold text-slate-900 mb-3">{yearLabel}</h4>
                        <div className="border border-slate-100">
                          <div className="grid grid-cols-[72px_72px_48px_1fr] bg-slate-50 text-xs text-slate-500"><span className="px-3 py-2.5">계약일</span><span className="px-3 py-2.5">등기일</span><span className="px-3 py-2.5">층</span><span className="px-3 py-2.5 text-right">가격</span></div>
                          <div className="divide-y divide-slate-100">
                            {rows.map(row => (
                                <div key={row.id} className="grid grid-cols-[72px_72px_48px_1fr] text-sm items-center min-h-10">
                                  <span className="px-3 py-2.5 text-slate-600">{formatShortDate(row)}</span><span className="px-3 py-2.5 text-slate-500">{formatRegistrationDate(row.registrationDate)}</span><span className="px-3 py-2.5 text-slate-600">{row.floorInfo || '-'}</span><span className="px-3 py-2.5 text-right font-bold text-slate-900">{formatPrice(row.priceManwon)}</span>
                                </div>
                            ))}
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
              </>
          )}
        </div>
      </section>
  );
};

