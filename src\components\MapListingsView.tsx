import React, { useCallback, useMemo, useState } from 'react';
import { RealEstateListing, AddressResolution, TargetPropertyConfig } from '../types';
import { KakaoMapWrapper } from './KakaoMapWrapper';
import { TransactionHistoryPanel } from './TransactionHistoryPanel';
import { SidebarController } from './SidebarController';
import {
  CheckSquare,
  Square,
  ArrowUpDown,
  Filter,
  Layers,
  Search,
  Plus,
  Edit3
} from 'lucide-react';

interface MapListingsViewProps {
  listings: RealEstateListing[];
  // 지도에는 위치가 검증된 거래만 전달한다. 표는 listings 전체를 표시한다.
  mapListings?: RealEstateListing[];
  otherMapListings?: RealEstateListing[];
  addressInfo: AddressResolution;
  searchRadiusM: number;
  selectedIds: string[];
  mapVisibleIds: string[];
  onToggleMapVisibility: (id: string) => void;
  onSetMapVisibility: (ids: string[], visible: boolean) => void;
  // 체크로 지도 표시를 켤 때 카카오 주소검색으로 확인한 좌표를 상위 상태에 반영한다.
  onResolveListingPosition?: (listing: RealEstateListing) => void;
  onToggleSelect: (id: string) => void;
  onSelectComparable: (listing: RealEstateListing) => void;
  onRelocateTarget?: (lat: number, lon: number, addressName?: string) => void;
  onEditListing?: (listing: RealEstateListing) => void;
  onOpenSearchComplex?: () => void;
  onAddCustomListing?: () => void;
  // 대상 사업지 검색바 - 이 탭의 요약 카드 줄에 같이 표시한다.
  addressInput: string;
  setAddressInput: (val: string) => void;
  propertyType: 'APT' | 'OPST' | 'VL';
  setPropertyType: (val: 'APT' | 'OPST' | 'VL') => void;
  targetConfig: TargetPropertyConfig;
  setTargetConfig: React.Dispatch<React.SetStateAction<TargetPropertyConfig>>;
  onSync: () => void;
  isLoading: boolean;
  setSearchRadiusM: (meters: number) => void;
}

export const MapListingsView: React.FC<MapListingsViewProps> = ({
                                                                  listings,
                                                                  mapListings,
                                                                  otherMapListings = [],
                                                                  addressInfo,
                                                                  searchRadiusM,
                                                                  selectedIds,
                                                                  mapVisibleIds,
                                                                  onToggleMapVisibility,
                                                                  onSetMapVisibility,
                                                                  onResolveListingPosition,
                                                                  onToggleSelect,
                                                                  onSelectComparable,
                                                                  onRelocateTarget,
                                                                  onEditListing,
                                                                  onOpenSearchComplex,
                                                                  onAddCustomListing,
                                                                  addressInput,
                                                                  setAddressInput,
                                                                  propertyType,
                                                                  setPropertyType,
                                                                  targetConfig,
                                                                  setTargetConfig,
                                                                  onSync,
                                                                  isLoading,
                                                                  setSearchRadiusM
                                                                }) => {
  type ListingSortField = 'pricePerPyeong' | 'dedicatedPyeong' | 'priceManwon' | 'useApprovalDate' | 'totalHouseholds' | 'dealDate' | 'distance' | 'similarity';
  type TableSection = 'selected' | 'mapped' | 'other';
  const [selectedSortField, setSelectedSortField] = useState<ListingSortField>('pricePerPyeong');
  const [selectedSortAsc, setSelectedSortAsc] = useState(false);
  const [mappedSortField, setMappedSortField] = useState<ListingSortField>('pricePerPyeong');
  const [mappedSortAsc, setMappedSortAsc] = useState(false);
  const [otherSortField, setOtherSortField] = useState<ListingSortField>('distance');
  const [otherSortAsc, setOtherSortAsc] = useState(true);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [activeTransactionListing, setActiveTransactionListing] = useState<RealEstateListing | null>(null);
  const [isMappedExpanded, setIsMappedExpanded] = useState(false);
  const [isOtherExpanded, setIsOtherExpanded] = useState(false);
  const [draggedListingId, setDraggedListingId] = useState<string | null>(null);
  // 표에 표시할 면적 단위 - 기본은 평, 버튼으로 ㎡ 전환/복귀.
  const [areaUnit, setAreaUnit] = useState<'py' | 'm2'>('py');

  // 행 우클릭 컨텍스트 메뉴
  const [rowContextMenu, setRowContextMenu] = useState<{
    x: number;
    y: number;
    item: RealEstateListing;
    section: TableSection;
  } | null>(null);

  // 요약 통계는 listings가 바뀔 때만 다시 계산한다.
  const summaryMetrics = useMemo(() => {
    const totalCount = listings.length;

    if (totalCount === 0) {
      return {
        totalCount: 0,
        avgPyeongPrice: 0,
        maxPrice: 0,
        minPrice: 0,
        avgYear: null as number | null
      };
    }

    let priceSum = 0;
    let maxPrice = Number.NEGATIVE_INFINITY;
    let minPrice = Number.POSITIVE_INFINITY;
    let yearSum = 0;
    let yearCount = 0;

    for (const item of listings) {
      priceSum += item.pricePerPyeong;
      if (item.pricePerPyeong > maxPrice) maxPrice = item.pricePerPyeong;
      if (item.pricePerPyeong < minPrice) minPrice = item.pricePerPyeong;

      if (item.approvalYear !== null) {
        yearSum += item.approvalYear;
        yearCount += 1;
      }
    }

    return {
      totalCount,
      avgPyeongPrice: Math.round(priceSum / totalCount),
      maxPrice,
      minPrice,
      avgYear: yearCount > 0 ? Math.round(yearSum / yearCount) : null
    };
  }, [listings]);

  const {
    totalCount,
    avgPyeongPrice,
    maxPrice,
    minPrice,
    avgYear
  } = summaryMetrics;

  // 표 원본 + 지도 좌표 보완본 병합도 입력 목록이 바뀔 때만 수행한다.
  const allDisplayListings = useMemo(() => {
    const byId = new Map<string, RealEstateListing>();

    for (const item of listings) {
      byId.set(item.id, item);
    }

    for (const item of mapListings || []) {
      const existing = byId.get(item.id);
      byId.set(item.id, existing ? { ...existing, ...item } : item);
    }

    for (const item of otherMapListings) {
      const existing = byId.get(item.id);
      byId.set(item.id, existing ? { ...existing, ...item } : item);
    }

    return Array.from(byId.values());
  }, [listings, mapListings, otherMapListings]);

  const allListingsById = useMemo(() => {
    const byId = new Map<string, RealEstateListing>();

    for (const item of allDisplayListings) {
      byId.set(item.id, item);
    }

    return byId;
  }, [allDisplayListings]);

  // 거리 계산은 렌더링/정렬 때마다 삼각함수를 반복하지 않고 목록 변경 시 한 번만 계산한다.
  const distanceById = useMemo(() => {
    const result = new Map<string, number>();
    const earthRadius = 6371000;
    const toRadians = (value: number) => value * Math.PI / 180;
    const targetLatRad = toRadians(addressInfo.lat);

    for (const item of allDisplayListings) {
      if (
          !item.positionVerified ||
          !Number.isFinite(item.lat) ||
          !Number.isFinite(item.lon) ||
          !Number.isFinite(addressInfo.lat) ||
          !Number.isFinite(addressInfo.lon)
      ) {
        result.set(item.id, Number.POSITIVE_INFINITY);
        continue;
      }

      const dLat = toRadians(item.lat - addressInfo.lat);
      const dLon = toRadians(item.lon - addressInfo.lon);
      const itemLatRad = toRadians(item.lat);

      const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(targetLatRad) *
          Math.cos(itemLatRad) *
          Math.sin(dLon / 2) ** 2;

      result.set(
          item.id,
          earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      );
    }

    return result;
  }, [allDisplayListings, addressInfo.lat, addressInfo.lon]);

  const distanceFromTarget = useCallback(
      (item: RealEstateListing) =>
          distanceById.get(item.id) ?? Number.POSITIVE_INFINITY,
      [distanceById]
  );

  const normalizedFilterQuery = useMemo(
      () => filterQuery.trim().toLowerCase(),
      [filterQuery]
  );

  const matchesFilter = useCallback(
      (item: RealEstateListing) => {
        if (!normalizedFilterQuery) return true;

        return (
            item.articleName.toLowerCase().includes(normalizedFilterQuery) ||
            item.buildingName.toLowerCase().includes(normalizedFilterQuery) ||
            item.useApprovalDate.toLowerCase().includes(normalizedFilterQuery)
        );
      },
      [normalizedFilterQuery]
  );

  const getSortValue = useCallback(
      (item: RealEstateListing, field: ListingSortField): number => {
        if (field === 'useApprovalDate') return item.approvalYear || 0;
        if (field === 'totalHouseholds') return item.totalHouseholds ?? -1;
        if (field === 'dealDate') return Number((item.dealDate || '').replace(/\D/g, '')) || 0;
        if (field === 'distance') return distanceFromTarget(item);
        return Number(item[field]) || 0;
      },
      [distanceFromTarget]
  );

  type SimilarityTier = 'top20' | 'range20to40' | null;

  // 유사도 순위도 데이터/대상조건/좌표가 바뀔 때만 다시 계산한다.
  const similarityInfo = useMemo(() => {
    const targetArea = Number(targetConfig.targetPyeong) || 0;
    const targetHouseholds = Number(targetConfig.targetHouseholds) || 0;
    const rankMap = new Map<string, number>();

    if (targetArea <= 0 || targetHouseholds <= 0) {
      return {
        rankMap,
        top20Count: 0,
        top40Count: 0
      };
    }

    const candidates: Array<{ id: string; score: number }> = [];

    for (const item of allDisplayListings) {
      if (item.rletTpCd !== targetConfig.rletTpCd) continue;

      const distanceM = distanceById.get(item.id) ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(distanceM) || distanceM >= 2000) continue;
      if (!item.totalHouseholds || item.totalHouseholds <= 0) continue;

      const areaDiffRate =
          Math.abs(item.dedicatedPyeong - targetArea) / targetArea;

      const householdDiffRate =
          Math.abs(item.totalHouseholds - targetHouseholds) / targetHouseholds;

      candidates.push({
        id: item.id,
        score: areaDiffRate + householdDiffRate
      });
    }

    candidates.sort((a, b) => a.score - b.score);

    for (let index = 0; index < candidates.length; index += 1) {
      rankMap.set(candidates[index].id, index);
    }

    const count = candidates.length;

    return {
      rankMap,
      top20Count: count > 0 ? Math.max(1, Math.ceil(count * 0.2)) : 0,
      top40Count: count > 0 ? Math.max(1, Math.ceil(count * 0.4)) : 0
    };
  }, [
    allDisplayListings,
    distanceById,
    targetConfig.rletTpCd,
    targetConfig.targetPyeong,
    targetConfig.targetHouseholds
  ]);

  const getSimilarityTier = useCallback(
      (item: RealEstateListing): SimilarityTier => {
        const rank = similarityInfo.rankMap.get(item.id);

        if (rank === undefined) return null;
        if (rank < similarityInfo.top20Count) return 'top20';
        if (rank < similarityInfo.top40Count) return 'range20to40';

        return null;
      },
      [similarityInfo]
  );

  const sortTableItems = useCallback(
      (
          items: RealEstateListing[],
          field: ListingSortField,
          asc: boolean
      ) => {
        return [...items].sort((a, b) => {
          if (field === 'similarity') {
            const aRank = similarityInfo.rankMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const bRank = similarityInfo.rankMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            const difference = aRank - bRank;
            return asc ? difference : -difference;
          }

          const difference = getSortValue(a, field) - getSortValue(b, field);
          return asc ? difference : -difference;
        });
      },
      [getSortValue, similarityInfo]
  );

  const getSectionSort = (section: TableSection) => {
    if (section === 'selected') return { field: selectedSortField, asc: selectedSortAsc };
    if (section === 'mapped') return { field: mappedSortField, asc: mappedSortAsc };
    return { field: otherSortField, asc: otherSortAsc };
  };

  const toggleSort = (section: TableSection, field: ListingSortField) => {
    const current = getSectionSort(section);
    const nextAsc = current.field === field ? !current.asc : field === 'distance';

    if (section === 'selected') {
      setSelectedSortField(field);
      setSelectedSortAsc(nextAsc);
    } else if (section === 'mapped') {
      setMappedSortField(field);
      setMappedSortAsc(nextAsc);
    } else {
      setOtherSortField(field);
      setOtherSortAsc(nextAsc);
    }
  };

  const mappedListingIds = useMemo(
      () => new Set((mapListings || []).map(item => item.id)),
      [mapListings]
  );

  const selectedListingIds = useMemo(
      () => new Set(selectedIds),
      [selectedIds]
  );

  // 필터 + 정렬 결과도 관련 값이 바뀔 때만 다시 만든다.
  const mappedListings = useMemo(
      () =>
          sortTableItems(
              (mapListings || []).filter(matchesFilter),
              mappedSortField,
              mappedSortAsc
          ),
      [
        mapListings,
        matchesFilter,
        mappedSortField,
        mappedSortAsc,
        sortTableItems
      ]
  );

  const otherComparisonListings = useMemo(
      () =>
          sortTableItems(
              allDisplayListings.filter(
                  item =>
                      !mappedListingIds.has(item.id) &&
                      !selectedListingIds.has(item.id) &&
                      matchesFilter(item)
              ),
              otherSortField,
              otherSortAsc
          ),
      [
        allDisplayListings,
        mappedListingIds,
        selectedListingIds,
        matchesFilter,
        otherSortField,
        otherSortAsc,
        sortTableItems
      ]
  );

  const selectedComparisonListings = useMemo(
      () =>
          sortTableItems(
              selectedIds
                  .map(id => allListingsById.get(id))
                  .filter((item): item is RealEstateListing => Boolean(item)),
              selectedSortField,
              selectedSortAsc
          ),
      [
        selectedIds,
        allListingsById,
        selectedSortField,
        selectedSortAsc,
        sortTableItems
      ]
  );

  const formatPrice = (priceManwon: number) =>
      priceManwon >= 10000 ? `${(priceManwon / 10000).toFixed(1)}억원` : `${priceManwon.toLocaleString()}만원`;

  const addAsComparable = (listingId: string) => {
    if (!selectedIds.includes(listingId)) onToggleSelect(listingId);
  };

  const toggleSectionMapVisibility = (items: RealEstateListing[]) => {
    const ids = items.map(item => item.id);
    const allVisible = ids.length > 0 && ids.every(id => mapVisibleIds.includes(id));
    onSetMapVisibility(ids, !allVisible);
  };

  const renderListingRow = (item: RealEstateListing, section: TableSection) => {
    const isSelected = selectedIds.includes(item.id);
    const isMapVisible = mapVisibleIds.includes(item.id);
    const similarityTier = getSimilarityTier(item);
    const supplyPyeong = item.supplyPyeong ?? Number((item.dedicatedPyeong * 1.33).toFixed(1));
    const exclusiveRate = Math.round(item.exclusiveRate ?? ((item.dedicatedPyeong / supplyPyeong) * 100));
    const approvalYear = item.approvalYear ?? 0;
    const supplyAreaM2 = Number((supplyPyeong * 3.3058).toFixed(1));
    const pricePerM2 = Math.round(item.priceManwon / item.dedicatedAreaM2);
    const supplyPricePerM2 = Math.round(item.priceManwon / supplyAreaM2);
    const distanceM = distanceFromTarget(item);
    const distanceLabel = Number.isFinite(distanceM)
        ? (distanceM < 1000 ? `${Math.round(distanceM)}m` : `${(distanceM / 1000).toFixed(1)}km`)
        : '-';
    return (
        <React.Fragment key={item.id}>
          <tr
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('text/plain', item.id);
                setDraggedListingId(item.id);
              }}
              onDragEnd={() => setDraggedListingId(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setRowContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  item,
                  section
                });
              }}
              onClick={() => setActiveTransactionListing(current => current?.id === item.id ? null : item)}
              title={section === 'selected' ? '클릭: 실거래 이력 · 우클릭: 비교대상에서 삭제' : '클릭: 실거래 이력 · 우클릭: 비교대상 지정 · 끌어서 비교대상 칸에 놓기'}
              className={`cursor-pointer transition-colors ${
                  isSelected
                      ? 'bg-blue-50/80 font-medium hover:bg-blue-100/80'
                      : similarityTier === 'top20'
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : similarityTier === 'range20to40'
                              ? 'bg-emerald-50/70 hover:bg-emerald-100/80'
                              : 'hover:bg-blue-50/60'
              }`}
          >
            <td className="py-1.5 px-1 text-center">
              <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMapVisibility(item.id);
                  }}
                  className="text-slate-400 hover:text-emerald-600 focus:outline-none cursor-pointer"
                  aria-label={`${item.articleName} 지도 표시 선택`}
              >
                {isMapVisible ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4" />}
              </button>
            </td>
            <td className="py-1.5 px-1 w-[108px]">
              <div className="text-[10px] font-bold text-slate-900 leading-tight truncate">{item.articleName}</div>
              <div className="text-[9px] text-slate-500 mt-0.5 whitespace-nowrap truncate">{item.buildingName}</div>
            </td>
            <td className="py-1.5 px-0.5 text-center font-mono text-[9px] text-slate-500 whitespace-nowrap">{distanceLabel}</td>
            <td className="py-1.5 px-1 text-center font-mono text-slate-700 w-[58px]">
              <div className="whitespace-nowrap">{item.totalHouseholds ? `${item.totalHouseholds.toLocaleString()}세대` : '-'}</div>
              <div className="text-[10px] text-slate-400 whitespace-nowrap">{item.floorAreaRatio ? `(${item.floorAreaRatio}%)` : ''}</div>
            </td>
            <td className="py-1.5 px-1 whitespace-nowrap">
              <div className="text-xs text-slate-900">{item.useApprovalDate?.replace(/\s*\(\d{4}년식\)/g, '') || '-'}</div>
              <div className="text-[10px] text-slate-400">{approvalYear ? `(${new Date().getFullYear() - approvalYear}년차)` : '-'}</div>
            </td>
            <td className="py-1.5 px-1 whitespace-nowrap">
              {areaUnit === 'py' ? (
                  <>
                    <div className="font-bold text-slate-900">전용 {item.dedicatedPyeong}평</div>
                    <div className="text-[10px] text-slate-500">({supplyPyeong}평/ {exclusiveRate}%)</div>
                  </>
              ) : (
                  <>
                    <div className="font-bold text-slate-900">전용 {item.dedicatedAreaM2}㎡</div>
                    <div className="text-[10px] text-slate-500">({supplyAreaM2}㎡/ {exclusiveRate}%)</div>
                  </>
              )}
            </td>
            <td className="py-1.5 px-1 text-right font-bold text-slate-900 whitespace-nowrap">{formatPrice(item.priceManwon)}</td>
            <td className="py-1.5 px-1 text-center text-xs text-blue-700 font-semibold whitespace-nowrap">
              {item.dealDate || '-'}
            </td>
            <td className="py-1.5 px-1 text-right font-mono whitespace-nowrap">
              {areaUnit === 'py' ? (
                  <>
                    <div className="font-bold text-red-600">{item.pricePerPyeong.toLocaleString()}만원</div>
                    <div className="text-[10px] text-slate-400">
                      ({(item.supplyPricePerPyeong ?? Math.round(item.priceManwon / supplyPyeong)).toLocaleString()}만원)
                    </div>
                  </>
              ) : (
                  <>
                    <div className="font-bold text-red-600">{pricePerM2.toLocaleString()}만원</div>
                    <div className="text-[10px] text-slate-400">({supplyPricePerM2.toLocaleString()}만원)</div>
                  </>
              )}
            </td>
          </tr>
          {activeTransactionListing?.id === item.id && (
              <tr key={`${item.id}-history`}>
                <td colSpan={9} className="p-4 bg-slate-50/70">
                  <TransactionHistoryPanel listings={listings} focusedListing={activeTransactionListing} addressInfo={addressInfo} />
                </td>
              </tr>
          )}
        </React.Fragment>
    );
  };


  // 우측 패널에서도 면적·실거래가·체결일·평당가가 잘리지 않도록 열 폭을 고정한다.
  const renderTableColumns = () => (
      <colgroup>
        <col style={{ width: '4%' }} />
        <col style={{ width: '26%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '7%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '11%' }} />
        <col style={{ width: '9%' }} />
        <col style={{ width: '16%' }} />
      </colgroup>
  );

  const renderTableHeader = (section: TableSection, items: RealEstateListing[]) => {
    const allVisible = items.length > 0 && items.every(item => mapVisibleIds.includes(item.id));
    return (
        <thead className="sticky top-0 z-10 bg-slate-100/95 text-slate-700 font-semibold border-b border-slate-200 shadow-[0_1px_0_rgba(203,213,225,0.9)]">
        <tr>
          <th className="py-1.5 px-1 w-7 text-center">
            <button
                type="button"
                onClick={() => toggleSectionMapVisibility(items)}
                className="inline-flex text-slate-500 hover:text-emerald-600 cursor-pointer"
                aria-label="이 표의 물건 전체 지도 표시"
                title="이 표의 물건 전체 지도 표시"
            >
              {allVisible ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4" />}
            </button>
          </th>
          <th className="py-1.5 px-1 w-[108px]">매물/단지명<br /><span className="text-[9px] font-normal">(동)</span></th>
          <th onClick={() => toggleSort(section, 'distance')} className="py-1.5 px-0.5 text-center cursor-pointer hover:bg-slate-200 transition-colors"><div>거리</div><div className="h-3 flex justify-center"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div></th>
          <th onClick={() => toggleSort(section, 'totalHouseholds')} className="py-1.5 px-1 w-[58px] text-center cursor-pointer hover:bg-slate-200 transition-colors">
            <div>세대수</div><div className="text-[10px] font-normal">(용적률)</div><div className="h-3 flex justify-center"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
          <th onClick={() => toggleSort(section, 'useApprovalDate')} className="py-1.5 px-1 cursor-pointer hover:bg-slate-200 transition-colors">
            <div>준공일</div><div className="text-[10px] font-normal">(연식)</div><div className="h-3 flex justify-center"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
          <th onClick={() => toggleSort(section, 'dedicatedPyeong')} className="py-1.5 px-1 cursor-pointer hover:bg-slate-200 transition-colors">
            <div>전용면적</div><div className="text-[10px] font-normal whitespace-nowrap">(계약면적/전용률)</div><div className="h-3 flex justify-center"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
          <th onClick={() => toggleSort(section, 'priceManwon')} className="py-1.5 px-1 text-right cursor-pointer hover:bg-slate-200 transition-colors">
            <div>실거래가</div><div className="h-3 flex justify-end"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
          <th onClick={() => toggleSort(section, 'dealDate')} className="py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200 transition-colors">
            <div>체결일</div><div className="h-3 flex justify-center"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
          <th onClick={() => toggleSort(section, 'pricePerPyeong')} className="py-1.5 px-1 text-right cursor-pointer hover:bg-slate-200 transition-colors">
            <div>{areaUnit === 'py' ? '전용평당가' : '전용㎡당가'}</div><div className="text-[10px] font-normal">({areaUnit === 'py' ? '계약평당가' : '계약㎡당가'})</div><div className="h-3 flex justify-end"><ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
          </th>
        </tr>
        </thead>
    );
  };

  return (
      <div className="space-y-6" onClick={() => setRowContextMenu(null)}>
        {/* 0/1. 대상 사업지 검색바 + 요약 카드를 한 줄에 */}
        <div className="flex flex-col xl:flex-row gap-3.5 items-stretch">
          <SidebarController
              compact
              addressInput={addressInput}
              setAddressInput={setAddressInput}
              propertyType={propertyType}
              setPropertyType={setPropertyType}
              targetConfig={targetConfig}
              setTargetConfig={setTargetConfig}
              onSync={onSync}
              isLoading={isLoading}
              searchRadiusM={searchRadiusM}
              setSearchRadiusM={setSearchRadiusM}
          />
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>수집 실매물</span>
              </div>
              <div className="text-2xl font-display font-bold text-slate-900">
                {totalCount} <span className="text-xs font-normal text-slate-500">개 단지</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                반경 {searchRadiusM >= 1000 ? `${searchRadiusM / 1000}km` : `${searchRadiusM}m`} 이내 유효 표본
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>평균 전용평당가</span>
              </div>
              <div className="text-2xl font-display font-bold text-blue-700">
                {avgPyeongPrice.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">만원/평</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                범위 {minPrice.toLocaleString()} ~ {maxPrice.toLocaleString()}만원
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>평균 준공연식</span>
              </div>
              <div className="text-2xl font-display font-bold text-slate-900">
                {avgYear ? `${avgYear}년식` : '연식 미상'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {avgYear ? `신축(${new Date().getFullYear()}) 대비 약 ${new Date().getFullYear() - avgYear}년 경과` : '건축물대장 기준'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
                <span>비교사례 지정</span>
              </div>
              <div className="text-2xl font-display font-bold text-indigo-600">
                {selectedIds.length} <span className="text-xs font-normal text-slate-500">/ 3개 권장</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">거래사례비교법 분석 투입군</div>
            </div>
          </div>
        </div>

        {/* 2/3. 지도(왼쪽) + 수집 매물·비교단지 데이터셋(오른쪽) */}
        <div className="flex flex-col xl:flex-row gap-4 items-stretch">
          {/* 2. Interactive Kakao Map Container - 기존 지도 크기 유지 */}
          <div className="w-full xl:w-[1080px] xl:shrink-0 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs xl:sticky xl:top-4">
            {/* Real Kakao Map Component */}
            <KakaoMapWrapper
                listings={(mapListings || listings).filter(item => mapVisibleIds.includes(item.id))}
                otherListings={otherMapListings.filter(item => mapVisibleIds.includes(item.id))}
                unresolvedOtherListings={allDisplayListings.filter(item =>
                    !mappedListingIds.has(item.id) &&
                    !otherMapListings.some(resolved => resolved.id === item.id) &&
                    mapVisibleIds.includes(item.id)
                )}
                addressInfo={addressInfo}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onResolveListingPosition={onResolveListingPosition}
                onSelectComparable={onSelectComparable}
                onRelocateTarget={onRelocateTarget}
                onEditListing={onEditListing}
                onOpenSearchComplex={onOpenSearchComplex}
            />
          </div>

          {/* 3. Raw Listings Data Table */}
          <div className="w-full xl:flex-1 xl:min-w-0 xl:h-[814px] bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="shrink-0 p-3 border-b border-slate-200 flex flex-row items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2 shrink-0">
                <h3 className="font-bold text-slate-900 text-sm">비교단지 대상목록</h3>

                <span
                    className="inline-flex items-center gap-1 text-[10px] text-amber-700 whitespace-nowrap"
                    title="2km 미만 후보 중 전용면적·세대수 기준 유사도가 높은 상위 20%"
                >
                  <span className="inline-block w-2 h-2 rounded-sm bg-amber-200 border border-amber-300" />
                  유사도 상위 20%
                </span>

                <span
                    className="inline-flex items-center gap-1 text-[10px] text-emerald-700 whitespace-nowrap"
                    title="2km 미만 후보 중 유사도 순위 20% 초과 ~ 40% 이내"
                >
                  <span className="inline-block w-2 h-2 rounded-sm bg-emerald-100 border border-emerald-200" />
                  유사도 20~40%
                </span>
              </div>

              <div className="flex flex-nowrap items-center gap-1.5 min-w-0">
                <button
                    type="button"
                    onClick={() => setAreaUnit(unit => unit === 'py' ? 'm2' : 'py')}
                    className="shrink-0 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="면적/단가 표시 단위를 전환합니다."
                >
                  <span>{areaUnit === 'py' ? 'm² 전환' : '평 전환'}</span>
                </button>

                {onOpenSearchComplex && (
                    <button
                        onClick={onOpenSearchComplex}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>단지검색</span>
                    </button>
                )}

                {onAddCustomListing && (
                    <button
                        onClick={onAddCustomListing}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>등록</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => {
                      setSelectedSortField('similarity');
                      setSelectedSortAsc(true);
                      setMappedSortField('similarity');
                      setMappedSortAsc(true);
                      setOtherSortField('similarity');
                      setOtherSortAsc(true);
                    }}
                    className="shrink-0 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="대상 사업지와 유사한 순서로 정렬합니다."
                >
                  유사도순
                </button>

                <div className="relative min-w-0">
                  <input
                      type="text"
                      placeholder="매물명/연식 필터..."
                      value={filterQuery}
                      onChange={e => setFilterQuery(e.target.value)}
                      className="w-[118px] pl-7 pr-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const listingId = event.dataTransfer.getData('text/plain') || draggedListingId;
                  if (listingId) addAsComparable(listingId);
                  setDraggedListingId(null);
                }}
                className={`shrink-0 border-t border-slate-200 overflow-hidden transition-colors ${draggedListingId ? 'bg-violet-50' : 'bg-white'}`}
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-violet-800">비교대상 물건 <span className="text-xs font-normal text-violet-600">({selectedComparisonListings.length}건)</span></span>
              </div>
              {selectedComparisonListings.length > 0 ? (
                  <div className="max-h-[230px] overflow-y-auto overscroll-contain border-t border-slate-200">
                    <table className="w-full table-fixed text-left text-[10px]">
                      {renderTableColumns()}
                      {renderTableHeader('selected', selectedComparisonListings)}
                      <tbody className="divide-y divide-slate-200">
                      {selectedComparisonListings.map(item => renderListingRow(item, 'selected'))}
                      </tbody>
                    </table>
                  </div>
              ) : (
                  <div className="h-2" aria-label="비교대상 끌어놓기 영역" />
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200">
              <button
                  type="button"
                  onClick={() => setIsMappedExpanded(value => !value)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-50/60 transition-colors cursor-pointer"
              >
                <span className="text-sm font-bold text-blue-800">지도표시 물건 <span className="text-xs font-normal text-blue-600">({mappedListings.length}건)</span></span>
                <span className="text-xs font-semibold text-slate-500">{isMappedExpanded ? '표 접기' : '선택 시 표 펼치기'}</span>
              </button>
              {isMappedExpanded && (
                  <div className="max-h-[250px] overflow-y-auto overscroll-contain border-t border-slate-200">
                    <table className="w-full table-fixed text-left text-[10px]">
                      {renderTableColumns()}
                      {renderTableHeader('mapped', mappedListings)}
                      <tbody className="divide-y divide-slate-200">
                      {mappedListings.length > 0
                          ? mappedListings.map(item => renderListingRow(item, 'mapped'))
                          : <tr><td colSpan={9} className="py-7 text-center text-slate-400">지도에 표시된 비교대상이 없습니다.</td></tr>}
                      </tbody>
                    </table>
                  </div>
              )}
            </div>

            <div className="flex-1 min-h-0 border-t border-slate-200 flex flex-col overflow-hidden">
              <button
                  type="button"
                  onClick={() => setIsOtherExpanded(value => !value)}
                  className="shrink-0 w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span className="text-sm font-bold text-slate-700">그 외 비교물건 <span className="text-xs font-normal text-slate-500">({otherComparisonListings.length}건 · 대상지 거리순)</span></span>
                <span className="text-xs font-semibold text-slate-500">{isOtherExpanded ? '표 접기' : '선택 시 표 펼치기'}</span>
              </button>
              {isOtherExpanded && (
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-slate-200">
                    <table className="w-full table-fixed text-left text-[10px]">
                      {renderTableColumns()}
                      {renderTableHeader('other', otherComparisonListings)}
                      <tbody className="divide-y divide-slate-200">
                      {otherComparisonListings.length > 0
                          ? otherComparisonListings.map(item => renderListingRow(item, 'other'))
                          : <tr><td colSpan={9} className="py-7 text-center text-slate-400">지도 좌표를 확인 중인 비교물건이 없습니다.</td></tr>}
                      </tbody>
                    </table>
                  </div>
              )}
            </div>
          </div>
        </div>

        {rowContextMenu && (
            <div
                className="fixed z-[9999] min-w-[160px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
                style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
            >
              {rowContextMenu.section === 'selected' ? (
                  <button
                      type="button"
                      onClick={() => {
                        if (selectedIds.includes(rowContextMenu.item.id)) {
                          onToggleSelect(rowContextMenu.item.id);
                        }
                        if (activeTransactionListing?.id === rowContextMenu.item.id) {
                          setActiveTransactionListing(null);
                        }
                        setRowContextMenu(null);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    비교대상에서 삭제
                  </button>
              ) : (
                  <button
                      type="button"
                      onClick={() => {
                        addAsComparable(rowContextMenu.item.id);
                        setRowContextMenu(null);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    비교대상 지정
                  </button>
              )}
            </div>
        )}

      </div>
  );
};

