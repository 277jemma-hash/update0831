import React, { useEffect, useRef, useState } from 'react';
import { AddressResolution } from '../types';
import { BuildingRecord, HousingPermitRecord, PermitStatus } from '../types/buildingPlatform';
import { AGE_BANDS, AGE_UNKNOWN_COLOR, calculateAge } from '../services/ageBands';

interface BuildingAgingMapViewProps {
  addressInfo: AddressResolution;
}

interface BuildingWithAge extends BuildingRecord {
  age: ReturnType<typeof calculateAge>;
}

const DEFAULT_KAKAO_KEY =
  (import.meta as any).env?.VITE_KAKAO_MAP_KEY || 'e68846c4f8263158c56c22cb1ecadbb1';

const PERMIT_STATUS_STYLE: Record<PermitStatus, { color: string; label: string }> = {
  permitted: { color: '#3B82F6', label: '인허가' },
  construction: { color: '#8B5CF6', label: '착공' },
  completed: { color: '#14B8A6', label: '준공' },
  unknown: { color: '#94A3B8', label: '정보 없음' }
};

/**
 * 건축물 노후도 + 주택인허가 시각화 지도. 설계 문서 11/12절 색상 체계를 그대로 따른다.
 * 데이터는 /api/building-platform/* 에서 오며, 서버가 Mock/실API 중 무엇을 쓰는지는
 * isMock 플래그로만 알려줄 뿐 이 컴포넌트는 신경 쓰지 않는다 - 그대로 렌더링만 한다.
 */
export const BuildingAgingMapView: React.FC<BuildingAgingMapViewProps> = ({ addressInfo }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<BuildingWithAge[]>([]);
  const [permits, setPermits] = useState<HousingPermitRecord[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataIsMock, setDataIsMock] = useState<{ buildings: boolean; permits: boolean }>({
    buildings: true,
    permits: true
  });

  const [showBuildings, setShowBuildings] = useState(true);
  const [showPermits, setShowPermits] = useState(true);
  const [selected, setSelected] = useState<
    { kind: 'building'; data: BuildingWithAge } | { kind: 'permit'; data: HousingPermitRecord } | null
  >(null);

  // 1. Kakao Maps SDK 로드 (KakaoMapWrapper와 동일한 방식)
  useEffect(() => {
    let isMounted = true;
    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => isMounted && setIsSdkLoaded(true));
      return () => {
        isMounted = false;
      };
    }

    const existing = document.getElementById('kakao-map-sdk');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${DEFAULT_KAKAO_KEY}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        if (isMounted) setSdkError('카카오 지도 SDK 로딩 중 오류가 발생했습니다.');
        return;
      }
      window.kakao.maps.load(() => isMounted && setIsSdkLoaded(true));
    };
    script.onerror = () => isMounted && setSdkError('카카오 지도 스크립트를 불러올 수 없습니다.');
    document.head.appendChild(script);

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. 대상지가 바뀔 때마다 건축물대장 + 주택인허가 mock/실API 데이터 조회
  useEffect(() => {
    const cortarNo = addressInfo.cortarNo || '1162010200';
    const sigunguCd = cortarNo.slice(0, 5);
    const bjdongCd = cortarNo.slice(5, 10);
    const centerLat = addressInfo.lat || 37.4784;
    const centerLon = addressInfo.lon || 126.932;

    let cancelled = false;
    setIsDataLoading(true);

    Promise.all([
      fetch('/api/building-platform/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sigunguCd, bjdongCd, centerLat, centerLon })
      }).then(r => r.json()),
      fetch('/api/building-platform/housing-permits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sigunguCd, bjdongCd, centerLat, centerLon })
      }).then(r => r.json())
    ])
      .then(([buildingRes, permitRes]) => {
        if (cancelled) return;
        setBuildings(buildingRes.success ? buildingRes.data : []);
        setPermits(permitRes.success ? permitRes.data : []);
        setDataIsMock({
          buildings: !!buildingRes.isMock,
          permits: !!permitRes.isMock
        });
      })
      .catch(err => console.error('[BuildingAgingMapView] 데이터 조회 실패', err))
      .finally(() => !cancelled && setIsDataLoading(false));

    return () => {
      cancelled = true;
    };
  }, [addressInfo.cortarNo, addressInfo.lat, addressInfo.lon]);

  // 3. 지도 생성 + 마커 렌더링
  useEffect(() => {
    if (!isSdkLoaded || !mapContainerRef.current || !window.kakao?.maps) return;

    const centerLat = addressInfo.lat || 37.4784;
    const centerLon = addressInfo.lon || 126.932;
    const centerLatLng = new window.kakao.maps.LatLng(centerLat, centerLon);

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
        center: centerLatLng,
        level: 4
      });
    } else {
      mapInstanceRef.current.setCenter(centerLatLng);
    }
    const map = mapInstanceRef.current;

    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    if (showBuildings) {
      buildings.forEach(b => {
        if (b.lat === null || b.lon === null) return;
        const color = b.age ? b.age.band.colorHex : AGE_UNKNOWN_COLOR;

        const el = document.createElement('div');
        el.style.cssText = `
          width: 16px; height: 16px; border-radius: 50%;
          background: ${color}; opacity: 0.85;
          border: 2px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        `;
        el.addEventListener('click', () => setSelected({ kind: 'building', data: b }));

        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(b.lat, b.lon),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 5
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }

    if (showPermits) {
      permits.forEach(p => {
        if (p.lat === null || p.lon === null) return;
        const style = PERMIT_STATUS_STYLE[p.status];

        const el = document.createElement('div');
        el.style.cssText = `
          width: 15px; height: 15px; transform: rotate(45deg);
          background: #ffffff; border: 3px solid ${style.color};
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        `;
        el.addEventListener('click', () => setSelected({ kind: 'permit', data: p }));

        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(p.lat, p.lon),
          content: el,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 6
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }
  }, [isSdkLoaded, buildings, permits, showBuildings, showPermits, addressInfo.lat, addressInfo.lon]);

  if (sdkError) {
    return <div className="p-6 text-sm text-red-600 bg-red-50 rounded-xl border border-red-200">{sdkError}</div>;
  }

  return (
    <div className="space-y-4">
      {(dataIsMock.buildings || dataIsMock.permits) && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5">
          공공데이터포털 API 키가 아직 없어 Mock 데이터로 표시 중입니다. 키가 발급되면 자동으로 실제 데이터로 전환됩니다.
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <button
          onClick={() => setShowBuildings(v => !v)}
          className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
            showBuildings ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          기존 건축물 ({buildings.length})
        </button>
        <button
          onClick={() => setShowPermits(v => !v)}
          className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
            showPermits ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
          }`}
        >
          주택인허가 ({permits.length})
        </button>
        {isDataLoading && <span className="text-slate-400">불러오는 중...</span>}
      </div>

      <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-[600px]" />

        {/* 범례 */}
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-md p-3 text-[11px] space-y-2">
          <div>
            <div className="font-bold text-slate-700 mb-1">건축물 노후도</div>
            <div className="flex flex-col gap-1">
              {AGE_BANDS.map(band => (
                <div key={band.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: band.colorHex }} />
                  <span className="text-slate-600">
                    {band.label} ({band.minYears}
                    {band.maxYears === null ? '년+' : `~${band.maxYears}년`})
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: AGE_UNKNOWN_COLOR }} />
                <span className="text-slate-600">정보 없음</span>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <div className="font-bold text-slate-700 mb-1">주택인허가</div>
            <div className="flex flex-col gap-1">
              {(['permitted', 'construction', 'completed'] as PermitStatus[]).map(status => (
                <div key={status} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 inline-block"
                    style={{
                      background: '#fff',
                      border: `2px solid ${PERMIT_STATUS_STYLE[status].color}`,
                      transform: 'rotate(45deg)'
                    }}
                  />
                  <span className="text-slate-600">{PERMIT_STATUS_STYLE[status].label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 상세정보 팝업 */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-[340px] z-20 bg-white rounded-2xl border border-slate-200 shadow-lg p-4 text-xs">
            <div className="flex items-start justify-between mb-2">
              <span className="font-bold text-slate-900 text-sm">
                {selected.kind === 'building' ? selected.data.bldName || '건축물' : selected.data.projectName || '주택인허가'}
              </span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            {selected.kind === 'building' ? (
              <BuildingDetail data={selected.data} />
            ) : (
              <PermitDetail data={selected.data} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const BuildingDetail: React.FC<{ data: BuildingWithAge }> = ({ data }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-600">
    <Row label="주소" value={data.addressJibun || '정보 없음'} span2 />
    <Row label="준공일" value={data.useAprDay || '정보 없음'} />
    <Row label="경과연수" value={data.age ? `${data.age.years}년` : '정보 없음'} />
    <Row
      label="노후도 등급"
      value={data.age ? data.age.band.label : '정보 없음'}
      valueColor={data.age ? data.age.band.colorHex : AGE_UNKNOWN_COLOR}
    />
    <Row label="주용도" value={data.mainPurpsNm || '정보 없음'} />
    <Row label="연면적" value={data.totalAreaM2 ? `${data.totalAreaM2}㎡` : '정보 없음'} />
    <Row label="건축면적" value={data.archAreaM2 ? `${data.archAreaM2}㎡` : '정보 없음'} />
    <Row label="대지면적" value={data.platAreaM2 ? `${data.platAreaM2}㎡` : '정보 없음'} />
    <Row label="층수" value={`지상 ${data.floorGroundCnt ?? '-'} / 지하 ${data.floorUnderCnt ?? '-'}`} />
    <Row label="구조" value={data.structNm || '정보 없음'} />
  </div>
);

const PermitDetail: React.FC<{ data: HousingPermitRecord }> = ({ data }) => (
  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-600">
    <Row label="주소" value={data.addressJibun || '정보 없음'} span2 />
    <Row label="인허가일" value={data.permitDay || '정보 없음'} />
    <Row label="세대수" value={data.householdCnt ? `${data.householdCnt}세대` : '정보 없음'} />
    <Row label="연면적" value={data.totalAreaM2 ? `${data.totalAreaM2}㎡` : '정보 없음'} />
    <Row label="층수" value={`지상 ${data.floorGroundCnt ?? '-'} / 지하 ${data.floorUnderCnt ?? '-'}`} />
    <Row
      label="사업 상태"
      value={PERMIT_STATUS_STYLE[data.status].label}
      valueColor={PERMIT_STATUS_STYLE[data.status].color}
    />
    <Row label="착공여부" value={data.startCnstwkDay || '착공 전'} />
    <Row label="준공여부" value={data.useInspectDay || '준공 전'} />
  </div>
);

const Row: React.FC<{ label: string; value: string; span2?: boolean; valueColor?: string }> = ({
  label,
  value,
  span2,
  valueColor
}) => (
  <div className={span2 ? 'col-span-2' : undefined}>
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className="font-semibold" style={valueColor ? { color: valueColor } : undefined}>
      {value}
    </div>
  </div>
);

