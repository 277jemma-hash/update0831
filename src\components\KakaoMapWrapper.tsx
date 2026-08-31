import React, { useEffect, useRef, useState } from 'react';
import { RealEstateListing, AddressResolution } from '../types';
import {
  MapPin,
  Layers,
  Camera,
  Compass,
  Plus,
  Minus,
  Key,
  Copy,
  Check,
  ExternalLink,
  X,
  Edit3,
  Settings,
  Navigation,
  AlertCircle
} from 'lucide-react';

interface KakaoMapWrapperProps {
  listings: RealEstateListing[];
  otherListings?: RealEstateListing[];
  // 표에서 체크됐지만 최초 동기화 때 좌표 보완이 끝나지 않은 물건.
  unresolvedOtherListings?: RealEstateListing[];
  // 체크한 미확정 물건의 주소 지오코딩 결과를 표에도 저장한다.
  onResolveListingPosition?: (listing: RealEstateListing) => void;
  addressInfo: AddressResolution;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectComparable: (listing: RealEstateListing) => void;
  onRelocateTarget?: (lat: number, lon: number, addressName?: string) => void;
  onEditListing?: (listing: RealEstateListing) => void;
  onOpenSearchComplex?: () => void;
}

const DEFAULT_KAKAO_KEY =
    (import.meta as any).env?.VITE_KAKAO_MAP_KEY ||
    'e68846c4f8263158c56c22cb1ecadbb1';

export const KakaoMapWrapper: React.FC<KakaoMapWrapperProps> = ({
                                                                  listings,
                                                                  otherListings = [],
                                                                  unresolvedOtherListings = [],
                                                                  onResolveListingPosition,
                                                                  addressInfo,
                                                                  selectedIds,
                                                                  onToggleSelect,
                                                                  onSelectComparable,
                                                                  onRelocateTarget,
                                                                  onEditListing,
                                                                  onOpenSearchComplex
                                                                }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const roadviewContainerRef = useRef<HTMLDivElement>(null);

  const [kakaoKey, setKakaoKey] = useState<string>(() => {
    return localStorage.getItem('kakao_map_app_key') || DEFAULT_KAKAO_KEY;
  });

  // 대상지 GPS / 카카오 키 설정 팝오버 - 예전엔 좌측 하단 사이드바에 항상 펼쳐진 패널이었는데,
  // 지도 툴바의 설정(⚙) 버튼을 눌러야만 나타나는 팝오버로 옮겼다.
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState<boolean>(false);
  const [isGpsEditing, setIsGpsEditing] = useState<boolean>(false);
  const [customKeyInput, setCustomKeyInput] = useState<string>('');
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const [coordLatInput, setCoordLatInput] = useState<string>('');
  const [coordLonInput, setCoordLonInput] = useState<string>('');

  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Map view controls state
  const [mapType, setMapType] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP');
  const [showCadastral, setShowCadastral] = useState<boolean>(false); // 지적편집도
  const [showTraffic, setShowTraffic] = useState<boolean>(false); // 교통정보
  const [showRoadview, setShowRoadview] = useState<boolean>(false); // 로드뷰 모드
  const [isMapOptionsOpen, setIsMapOptionsOpen] = useState<boolean>(false);
  const [isPinModeActive, setIsPinModeActive] = useState<boolean>(true); // Click to relocate pin
  const [roadviewError, setRoadviewError] = useState<string | null>(null);

  const [activeListingPopup, setActiveListingPopup] = useState<RealEstateListing | null>(null);

  // References to keep Kakao Map instances
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const circleRefs = useRef<any[]>([]);
  const radiusLabelOverlayRefs = useRef<any[]>([]);
  const targetOverlayRef = useRef<any>(null);
  // 우클릭한 좌표의 주소를 잠시 보여 주는 확인창이다.
  const addressLookupOverlayRef = useRef<any>(null);
  // 목록 체크로 오버레이만 갱신할 때는 사용자가 보고 있던 지도 중심을 유지한다.
  const targetCoordinateRef = useRef<string | null>(null);
  const roadviewInstanceRef = useRef<any>(null);
  const roadviewClientRef = useRef<any>(null);

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : '';

  // 1. Dynamic Kakao Map SDK Script Loader
  useEffect(() => {
    let isMounted = true;

    const loadKakaoSDK = () => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          if (isMounted) {
            setIsLoaded(true);
            setLoadError(null);
          }
        });
        return;
      }

      const existingScript = document.getElementById('kakao-map-sdk');
      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement('script');
      script.id = 'kakao-map-sdk';
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services,clusterer,drawing&autoload=false`;
      script.async = true;

      script.onload = () => {
        if (!window.kakao || !window.kakao.maps) {
          if (isMounted) setLoadError('카카오 지도 SDK 로딩 중 오류가 발생했습니다.');
          return;
        }
        window.kakao.maps.load(() => {
          if (isMounted) {
            setIsLoaded(true);
            setLoadError(null);
          }
        });
      };

      script.onerror = () => {
        if (isMounted) {
          setLoadError(
              '카카오 지도 스크립트를 불러올 수 없습니다. 카카오 개발자 콘솔에서 도메인을 등록하거나 JS AppKey를 확인해주세요.'
          );
        }
      };

      document.head.appendChild(script);
    };

    loadKakaoSDK();

    return () => {
      isMounted = false;
    };
  }, [kakaoKey]);

  // 2. Initialize and Update Kakao Map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || !window.kakao?.maps) return;

    const centerLat = addressInfo.lat || 37.4784;
    const centerLon = addressInfo.lon || 126.9320;
    const centerLatLng = new window.kakao.maps.LatLng(centerLat, centerLon);
    const targetCoordinateKey = `${centerLat.toFixed(6)},${centerLon.toFixed(6)}`;

    if (!mapInstanceRef.current) {
      const options = {
        center: centerLatLng,
        level: 3 // Detailed scale
      };
      const map = new window.kakao.maps.Map(mapContainerRef.current, options);
      mapInstanceRef.current = map;
      targetCoordinateRef.current = targetCoordinateKey;

      // 우클릭은 사업지 좌표를 바꾸지 않고, 클릭한 지점의 주소만 확인한다.
      window.kakao.maps.event.addListener(map, 'rightclick', (mouseEvent: any) => {
        const latLng = mouseEvent.latLng;
        const lat = latLng.getLat();
        const lon = latLng.getLng();
        const showAddress = (roadAddress?: string, parcelAddress?: string) => {
          if (addressLookupOverlayRef.current) addressLookupOverlayRef.current.setMap(null);
          const content = document.createElement('div');
          content.style.cssText = 'position:relative;min-width:205px;max-width:310px;padding:9px 28px 9px 10px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(255,255,255,.97);box-shadow:0 4px 14px rgba(15,23,42,.18);font-family:IBM Plex Sans KR,sans-serif;font-size:11px;line-height:1.35;color:#1e3a5f;word-break:keep-all;';
          const title = document.createElement('strong');
          title.style.cssText = 'display:block;margin-bottom:4px;font-size:11px;color:#1e6fa8;';
          title.textContent = '주소 확인';
          content.appendChild(title);
          if (roadAddress) {
            const road = document.createElement('div');
            road.style.cssText = 'margin-bottom:2px;';
            road.textContent = `도로명: ${roadAddress}`;
            content.appendChild(road);
          }
          if (parcelAddress && parcelAddress !== roadAddress) {
            const parcel = document.createElement('div');
            parcel.style.cssText = 'color:#475569;';
            parcel.textContent = `지번: ${parcelAddress}`;
            content.appendChild(parcel);
          }
          if (!roadAddress && !parcelAddress) {
            const coordinate = document.createElement('div');
            coordinate.textContent = `위도 ${lat.toFixed(6)} · 경도 ${lon.toFixed(6)}`;
            content.appendChild(coordinate);
          }
          const closeButton = document.createElement('button');
          closeButton.type = 'button';
          closeButton.setAttribute('aria-label', '닫기');
          closeButton.textContent = '×';
          closeButton.style.cssText = 'position:absolute;right:7px;top:5px;border:0;background:transparent;color:#64748b;font-size:16px;line-height:1;cursor:pointer;';
          content.appendChild(closeButton);
          const overlay = new window.kakao.maps.CustomOverlay({
            position: latLng,
            content,
            xAnchor: 0.5,
            yAnchor: 1.16,
            zIndex: 50
          });
          closeButton.addEventListener('click', event => {
            event.stopPropagation();
            overlay.setMap(null);
            if (addressLookupOverlayRef.current === overlay) addressLookupOverlayRef.current = null;
          });
          overlay.setMap(map);
          addressLookupOverlayRef.current = overlay;
        };

        if (!window.kakao?.maps?.services?.Geocoder) {
          showAddress();
          return;
        }
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2Address(lon, lat, (result: any[], status: any) => {
          if (status === window.kakao.maps.services.Status.OK && result?.[0]) {
            const item = result[0];
            showAddress(item.road_address?.address_name, item.address?.address_name);
          } else {
            showAddress();
          }
        });
      });

      // 지도 탐색/매물 선택은 사업지 좌표를 바꾸지 않는다.
      // 사업지 변경은 하단의 '좌표 수정'으로만 명시적으로 실행한다.
    } else if (targetCoordinateRef.current !== targetCoordinateKey) {
      // 사업지 좌표 자체가 바뀐 경우에만 새 대상지로 이동한다.
      mapInstanceRef.current.setCenter(centerLatLng);
      targetCoordinateRef.current = targetCoordinateKey;
    }

    const map = mapInstanceRef.current;

    // Clear previous overlays & circles
    overlaysRef.current.forEach(overlay => overlay.setMap(null));
    overlaysRef.current = [];

    circleRefs.current.forEach(c => c.setMap(null));
    circleRefs.current = [];
    radiusLabelOverlayRefs.current.forEach(o => o.setMap(null));
    radiusLabelOverlayRefs.current = [];
    if (targetOverlayRef.current) {
      targetOverlayRef.current.setMap(null);
    }

    // 3. Draw static reference circles (dashed gray outline, no fill) at 300m/500m/1km so the
    // 대상지 주변 거리감을 한눈에 볼 수 있다 - 예전엔 검색 반경 선택값(searchRadiusM) 하나만
    // 그렸는데, 이제 선택 UI 자체를 없애고 항상 세 반경을 동시에 참고용으로 표시한다.
    const metersPerDegLat = 111320;
    const REFERENCE_RADII_M = [300, 500, 1000, 2000];
    REFERENCE_RADII_M.forEach(radiusM => {
      const circle = new window.kakao.maps.Circle({
        center: centerLatLng,
        radius: radiusM,
        strokeWeight: 1.5,
        strokeColor: '#9ca3af',
        strokeOpacity: 0.8,
        strokeStyle: 'dashed',
        fillOpacity: 0
      });
      circle.setMap(map);
      circleRefs.current.push(circle);

      // 반경 값 라벨 - 원 상단 가장자리에, 채움 없이 회색 글씨로만 표시
      const radiusLabelLat = centerLat + radiusM / metersPerDegLat;
      const radiusLabelLatLng = new window.kakao.maps.LatLng(radiusLabelLat, centerLon);
      const radiusLabelContent = document.createElement('div');
      radiusLabelContent.style.cssText = `
        color: #6b7280;
        font-size: 10px;
        font-weight: 400;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.9), 0 0 4px rgba(255, 255, 255, 0.9);
      `;
      radiusLabelContent.textContent = radiusM >= 1000 ? `${radiusM / 1000}km` : `${radiusM}m`;
      const radiusLabelOverlay = new window.kakao.maps.CustomOverlay({
        position: radiusLabelLatLng,
        content: radiusLabelContent,
        xAnchor: 0.5,
        yAnchor: 1.2,
        zIndex: 20
      });
      radiusLabelOverlay.setMap(map);
      radiusLabelOverlayRefs.current.push(radiusLabelOverlay);
    });

    // 4. 사업지 마커에는 동·지번만 간략히 표시한다.
    const targetShortAddress = (() => {
      const match = (addressInfo.address || '').match(/([가-힣]+\d*동(?:\d+가)?\s*\d+(?:-\d+)?)/);
      return match ? match[1].replace(/\s+/g, '') : (addressInfo.address || '').split(' ').slice(-2).join(' ');
    })();
    const targetContent = document.createElement('div');
    targetContent.className = 'kakao-target-overlay';
    targetContent.style.cursor = 'default';
    targetContent.innerHTML = `
      <div style="position: relative; width: 74px; height: 74px; pointer-events: none; font-family: 'IBM Plex Sans KR', sans-serif;">
        <svg viewBox="0 0 74 74" width="74" height="74" style="position: absolute; inset: 0; filter: drop-shadow(0 2px 5px rgba(170,45,35,.28));">
          <defs><linearGradient id="subject-pin" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e85d4a" stop-opacity=".7" /><stop offset="100%" stop-color="#c24632" stop-opacity=".7" /></linearGradient></defs>
          <path d="M37 2C18.3 2 4 16.3 4 33.2c0 18.8 22.2 29.8 33 38.8 10.8-9 33-20 33-38.8C70 16.3 55.7 2 37 2Z" fill="url(#subject-pin)" stroke="#c24632" stroke-opacity=".85" stroke-width="1.4" /><path d="M18 15C23 9 31 7 37 7" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="2" stroke-linecap="round" />
        </svg>
        <div style="position: absolute; top: 15px; left: 5px; right: 5px; text-align: center; color: #ffffff; font-size: 12px; font-weight: 400; line-height: 1.1; text-shadow: -1.3px -1.3px 0 #c24632, 1.3px -1.3px 0 #c24632, -1.3px 1.3px 0 #c24632, 1.3px 1.3px 0 #c24632, 0 1px 2px rgba(0,0,0,.3);">
          <div>사업지</div><div style="font-size: 9px; font-weight: 400; margin-top: 3px; line-height: 1.05; letter-spacing: -.35px; word-break: break-all;">(${targetShortAddress || '-'})</div>
        </div>
      </div>
    `;

    const targetOverlay = new window.kakao.maps.CustomOverlay({
      position: centerLatLng,
      content: targetContent,
      xAnchor: 0.5,
      yAnchor: 1.0,
      zIndex: 30
    });
    targetOverlay.setMap(map);
    targetOverlayRef.current = targetOverlay;

    // 5. Create Overlays for Listings
    // 위치가 검증된 국토부 실거래는 데이터가 어떤 목록(listings / otherListings)으로 들어왔는지와
    // 관계없이 모두 동일한 정보형 오버레이로 표시한다. 예전에는 otherListings를 작은 초록 핀으로만
    // 표시해, 주소 지오코딩에 성공했는데도 가격/면적/준공정보 플로팅이 보이지 않는 문제가 있었다.
    const renderedListingIds = new Set<string>();
    let isCurrentMapRender = true;

    const addListingOverlay = (
        listing: RealEstateListing,
        lat: number = listing.lat,
        lon: number = listing.lon
    ) => {
      if (!isCurrentMapRender) return;
      if (renderedListingIds.has(listing.id)) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return;

      renderedListingIds.add(listing.id);

      const isSelected = selectedIds.includes(listing.id);
      const listingLatLng = new window.kakao.maps.LatLng(lat, lon);

      const listingEl = document.createElement('div');
      listingEl.className = 'kakao-listing-overlay';
      listingEl.title = `${listing.articleName} · ${listing.buildingName}`;

      // 선택/미선택 색과 글자 효과는 유지하고, 본체는 기존 집 모양 + 점선 연결 마커를 사용한다.
      listingEl.innerHTML = `
        <div style="position: relative; width: 108px; height: 94px; cursor: pointer; font-family: 'IBM Plex Sans KR', sans-serif;">
          <svg viewBox="0 0 108 94" width="108" height="94" style="position: absolute; inset: 0; filter: drop-shadow(0 2px 4px rgba(55,65,81,.25));">
            <defs><linearGradient id="listing-pin-${listing.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${isSelected ? '#4e9ad1' : '#c8d0da'}" stop-opacity=".52" /><stop offset="48%" stop-color="${isSelected ? '#2875b0' : '#a8b2bf'}" stop-opacity=".48" /><stop offset="100%" stop-color="${isSelected ? '#123f6a' : '#8290a0'}" stop-opacity=".44" /></linearGradient></defs>
            <path d="M30 25L66 6L102 25H96V62H36V25H30Z" fill="url(#listing-pin-${listing.id})" stroke="#ffffff" stroke-opacity=".85" stroke-width="1.2" stroke-linejoin="miter" />
            <path d="M54 68V90" fill="none" stroke="${isSelected ? '#173b69' : '#7b838f'}" stroke-opacity=".52" stroke-width="5" stroke-dasharray="5 5" />
          </svg>
          <div style="position: absolute; top: 23px; left: 36px; right: 12px; color: #ffffff; text-align: center; line-height: 1; font-weight: 400; text-shadow: -1.3px -1.3px 0 ${isSelected ? '#172a4b' : '#2f343d'}, 1.3px -1.3px 0 ${isSelected ? '#172a4b' : '#2f343d'}, -1.3px 1.3px 0 ${isSelected ? '#172a4b' : '#2f343d'}, 1.3px 1.3px 0 ${isSelected ? '#172a4b' : '#2f343d'};">
            <div style="font-size: 12px; letter-spacing: -.5px;">${listing.pricePerPyeong.toLocaleString()}만원</div>
            <div style="font-size: 9px; margin-top: 3px;">${listing.priceManwon >= 10000 ? (listing.priceManwon / 10000).toFixed(1) + '억' : listing.priceManwon.toLocaleString() + '만원'} / ${Number(listing.dedicatedPyeong).toFixed(1)}평</div>
            <div style="font-size: 9px; margin-top: 3px;">${listing.useApprovalDate ? `'${listing.useApprovalDate.replace(/\s*\(\d{4}년식\)/g, '')}` : '-'} / ${listing.totalHouseholds ? listing.totalHouseholds.toLocaleString() : '-'}</div>
          </div>
        </div>
      `;

      listingEl.addEventListener('click', event => {
        event.stopPropagation();
        setActiveListingPopup({ ...listing, lat, lon, positionVerified: true });
      });

      listingEl.addEventListener('dblclick', event => {
        event.stopPropagation();
        // 비교대상 선택/해제는 두 번 클릭으로만 실행한다.
        onToggleSelect(listing.id);
        setActiveListingPopup({ ...listing, lat, lon, positionVerified: true });
      });

      const listingOverlay = new window.kakao.maps.CustomOverlay({
        position: listingLatLng,
        content: listingEl,
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: isSelected ? 8 : 4
      });

      listingOverlay.setMap(map);
      overlaysRef.current.push(listingOverlay);
    };

    // 기본 지도 목록: 이미 검증된 좌표를 그대로 사용한다.
    listings.forEach(listing => {
      addListingOverlay(listing);
    });

    // 주소 지오코딩까지 끝난 보조 목록도 더 이상 초록 핀으로 축약하지 않고
    // 기본 목록과 동일한 실거래 정보형 오버레이로 표시한다.
    otherListings.forEach(listing => {
      addListingOverlay(listing);
    });

    // 표에서 새로 체크한 미확정 물건은 해당 실거래의 지번 주소로 즉시 좌표를 확인한다.
    // 성공하면 상위 상태에 좌표를 저장하는 동시에, 현재 지도에도 같은 정보형 오버레이를 즉시 표시한다.
    if (unresolvedOtherListings.length > 0 && window.kakao?.maps?.services?.Geocoder) {
      const addressParts = (addressInfo.address || '').trim().split(/\s+/).filter(Boolean);
      const districtIndex = addressParts.findIndex((part, index) => index > 0 && /(?:시|군|구)$/.test(part));
      const regionPrefix = districtIndex >= 0 ? addressParts.slice(0, districtIndex + 1).join(' ') : '';
      const geocoder = new window.kakao.maps.services.Geocoder();

      unresolvedOtherListings.forEach(listing => {
        const query = regionPrefix ? `${regionPrefix} ${listing.buildingName}` : listing.buildingName;

        geocoder.addressSearch(query, (result: any[], status: any) => {
          if (!isCurrentMapRender || status !== window.kakao.maps.services.Status.OK || !result?.[0]) return;

          const lat = Number(result[0].y);
          const lon = Number(result[0].x);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

          const resolvedListing: RealEstateListing = {
            ...listing,
            lat,
            lon,
            positionVerified: true
          };

          onResolveListingPosition?.(resolvedListing);
          addListingOverlay(resolvedListing, lat, lon);
        });
      });
    }

    return () => {
      isCurrentMapRender = false;
    };
  }, [isLoaded, listings, otherListings, unresolvedOtherListings, addressInfo, selectedIds, onResolveListingPosition]);


  // 5.1 Kakao Maps doesn't auto-detect container resizes (e.g. wider layout,
  // roadview split toggle) - without relayout() the map's pixel<->coordinate
  // mapping goes stale and overlays stop appearing in the right place.
  useEffect(() => {
    if (!mapContainerRef.current || !window.kakao?.maps) return;
    const container = mapContainerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.relayout();
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [isLoaded]);

  // 6. Map Type (Roadmap vs Skyview)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.kakao?.maps) return;
    const map = mapInstanceRef.current;
    if (mapType === 'SKYVIEW') {
      map.setMapTypeId(window.kakao.maps.MapTypeId.SKYVIEW);
    } else {
      map.setMapTypeId(window.kakao.maps.MapTypeId.ROADMAP);
    }
  }, [mapType]);

  // 7. Cadastral Layer Overlay
  useEffect(() => {
    if (!mapInstanceRef.current || !window.kakao?.maps) return;
    const map = mapInstanceRef.current;
    if (showCadastral) {
      map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    } else {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    }
  }, [showCadastral]);

  // 8. Traffic Layer Overlay
  useEffect(() => {
    if (!mapInstanceRef.current || !window.kakao?.maps) return;
    const map = mapInstanceRef.current;
    if (showTraffic) {
      map.addOverlayMapTypeId(window.kakao.maps.MapTypeId.TRAFFIC);
    } else {
      map.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.TRAFFIC);
    }
  }, [showTraffic]);

  // 9. Kakao Roadview (로드뷰) Handler
  useEffect(() => {
    if (!showRoadview || !roadviewContainerRef.current || !window.kakao?.maps) return;

    try {
      const centerLat = activeListingPopup
          ? activeListingPopup.lat
          : addressInfo.lat || 37.4784;
      const centerLon = activeListingPopup
          ? activeListingPopup.lon
          : addressInfo.lon || 126.9320;
      const targetLatLng = new window.kakao.maps.LatLng(centerLat, centerLon);

      if (!roadviewInstanceRef.current) {
        const roadview = new window.kakao.maps.Roadview(roadviewContainerRef.current);
        const roadviewClient = new window.kakao.maps.RoadviewClient();
        roadviewInstanceRef.current = roadview;
        roadviewClientRef.current = roadviewClient;
      }

      const roadview = roadviewInstanceRef.current;
      const roadviewClient = roadviewClientRef.current;

      roadviewClient.getNearestPanoId(targetLatLng, 100, (panoId: any) => {
        if (panoId) {
          setRoadviewError(null);
          roadview.setPanoId(panoId, targetLatLng);
        } else {
          setRoadviewError('해당 좌표 반경 100m 이내에 카카오 로드뷰 데이터가 없습니다.');
        }
      });
    } catch (e) {
      console.warn('[Roadview Init Warning]', e);
    }
  }, [showRoadview, activeListingPopup, addressInfo]);

  // Zoom Helpers
  const handleZoomIn = () => {
    if (!mapInstanceRef.current) return;
    const currentLevel = mapInstanceRef.current.getLevel();
    mapInstanceRef.current.setLevel(currentLevel - 1);
  };

  const handleZoomOut = () => {
    if (!mapInstanceRef.current) return;
    const currentLevel = mapInstanceRef.current.getLevel();
    mapInstanceRef.current.setLevel(currentLevel + 1);
  };

  const handleCenterTarget = () => {
    if (!mapInstanceRef.current || !window.kakao?.maps) return;
    const lat = addressInfo.lat || 37.4784;
    const lon = addressInfo.lon || 126.9320;
    mapInstanceRef.current.panTo(new window.kakao.maps.LatLng(lat, lon));
  };

  const handleToggleSettingsPanel = () => {
    if (!isSettingsPanelOpen) {
      setCoordLatInput(String(addressInfo.lat || 37.4784));
      setCoordLonInput(String(addressInfo.lon || 126.9320));
      setIsGpsEditing(false);
    }
    setIsSettingsPanelOpen(value => !value);
  };

  const handleApplyCoordinates = () => {
    const lat = parseFloat(coordLatInput);
    const lon = parseFloat(coordLonInput);
    if (!isNaN(lat) && !isNaN(lon) && lat > 30 && lat < 45 && lon > 120 && lon < 135) {
      if (window.kakao?.maps?.services?.Geocoder) {
        const geocoder = new window.kakao.maps.services.Geocoder();
        geocoder.coord2Address(lon, lat, (result: any[], status: any) => {
          let addrName = `위도 ${lat.toFixed(5)}, 경도 ${lon.toFixed(5)}`;
          if (status === window.kakao.maps.services.Status.OK && result && result.length > 0) {
            addrName =
                result[0].road_address?.address_name ||
                result[0].address?.address_name ||
                addrName;
          }
          if (onRelocateTarget) {
            onRelocateTarget(lat, lon, addrName);
          }
        });
      } else if (onRelocateTarget) {
        onRelocateTarget(lat, lon);
      }
      setIsGpsEditing(false);
    }
  };

  const handleSaveCustomKey = () => {
    if (customKeyInput.trim()) {
      localStorage.setItem('kakao_map_app_key', customKeyInput.trim());
      setKakaoKey(customKeyInput.trim());
      setIsSettingsPanelOpen(false);
      window.location.reload();
    }
  };

  const handleCopyDomain = () => {
    navigator.clipboard.writeText(currentDomain);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2000);
  };

  return (
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100">
        {/* 1. Top Bar: Kakao Map Type & Layer Controls */}
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          {/* Left Side: 기본 지도 버튼 + 펼침형 지도 옵션 */}
          <div className="relative pointer-events-auto">
            <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200/90 shadow-sm">
              <button
                  onClick={() => setMapType('ROADMAP')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${mapType === 'ROADMAP' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`}
              >
                카카오 지도
              </button>
              <button
                  onClick={() => setIsMapOptionsOpen(open => !open)}
                  className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${isMapOptionsOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  aria-expanded={isMapOptionsOpen}
              >
                더보기 {isMapOptionsOpen ? '▴' : '▾'}
              </button>
            </div>

            {isMapOptionsOpen && (
                <div className="absolute left-full top-0 ml-1.5 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200/90 shadow-md whitespace-nowrap">
                  <button
                      onClick={() => setMapType('SKYVIEW')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${mapType === 'SKYVIEW' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    스카이뷰(항공)
                  </button>
                  <button
                      onClick={() => setShowCadastral(value => !value)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${showCadastral ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    지적도
                  </button>
                  <button
                      onClick={() => setShowTraffic(value => !value)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${showTraffic ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    교통
                  </button>
                  <button
                      onClick={() => setShowRoadview(value => !value)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${showRoadview ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    카카오 로드뷰
                  </button>
                </div>
            )}
          </div>

          {/* Right Side: Search Complex & Key Settings */}
          <div className="relative flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200/90 shadow-sm pointer-events-auto">
            {onOpenSearchComplex && (
                <button
                    onClick={onOpenSearchComplex}
                    className="px-2.5 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                    title="실제 아파트/단지명 전국 장소 DB 검색 및 추가"
                >
                  <span>단지 검색추가</span>
                </button>
            )}
            <button
                onClick={handleToggleSettingsPanel}
                className={`p-1.5 rounded-lg transition-colors ${
                    isSettingsPanelOpen ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="대상지 GPS / 카카오 키 설정"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* 대상지 GPS / 카카오 키 설정 팝오버 */}
            {isSettingsPanelOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-xl p-3 space-y-3 text-[11px] z-30">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-700">대상지 GPS</div>
                    <button
                        onClick={() => setIsGpsEditing(value => !value)}
                        className="text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> 수정
                    </button>
                  </div>
                  {isGpsEditing ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                            value={coordLatInput}
                            onChange={e => setCoordLatInput(e.target.value)}
                            type="number"
                            step="0.000001"
                            aria-label="위도"
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                        <input
                            value={coordLonInput}
                            onChange={e => setCoordLonInput(e.target.value)}
                            type="number"
                            step="0.000001"
                            aria-label="경도"
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                        <button
                            onClick={handleApplyCoordinates}
                            className="col-span-2 py-1.5 bg-blue-600 text-white rounded font-bold"
                        >
                          좌표 적용 및 재검색
                        </button>
                      </div>
                  ) : (
                      <div className="font-mono text-slate-500">
                        위도 {Number(addressInfo?.lat || 0).toFixed(6)} · 경도 {Number(addressInfo?.lon || 0).toFixed(6)}
                      </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <label className="font-semibold text-slate-500 flex items-center gap-1">
                      <Key className="w-3.5 h-3.5" /> 카카오 키 설정
                    </label>
                    <div className="flex items-center justify-between bg-slate-50 px-2 py-1.5 rounded border border-slate-200 font-mono text-[10px]">
                      <span className="text-slate-500 truncate select-all">{currentDomain}</span>
                      <button
                          onClick={handleCopyDomain}
                          className="ml-2 px-1.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-semibold flex items-center gap-1 shrink-0"
                          title="카카오 개발자 콘솔에 등록할 도메인 복사"
                      >
                        {copiedDomain ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDomain ? '복사됨' : '도메인 복사'}</span>
                      </button>
                    </div>
                    <a
                        href="https://developers.kakao.com/console/app"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-700 underline font-semibold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Kakao Developers 콘솔 바로가기
                    </a>
                    <div className="flex gap-1.5 pt-0.5">
                      <input
                          value={customKeyInput}
                          onChange={e => setCustomKeyInput(e.target.value)}
                          type="password"
                          autoComplete="off"
                          placeholder="JavaScript AppKey"
                          className="min-w-0 flex-1 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                      />
                      <button
                          onClick={handleSaveCustomKey}
                          className="px-2 py-1.5 bg-slate-300 hover:bg-slate-400 text-slate-600 rounded font-semibold"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
            )}
          </div>
        </div>

        {/* 4. Floating Right Zoom & Center Controls */}
        <div className="absolute right-3 bottom-5 z-20 flex flex-col gap-1.5">
          <button
              onClick={handleCenterTarget}
              className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 shadow-md transition-all active:scale-95 cursor-pointer"
              title="사업 대상지로 지도 이동"
          >
            <Compass className="w-4 h-4 text-red-500" />
          </button>
          <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
            <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-slate-50 text-slate-700 border-b border-slate-100 transition-colors active:scale-95 cursor-pointer"
                title="확대"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-slate-50 text-slate-700 transition-colors active:scale-95 cursor-pointer"
                title="축소"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 5. Main Map Container (Split with Roadview if enabled) */}
        <div className="relative w-full h-[780px] flex flex-col lg:flex-row">
          {/* Kakao 2D/Skyview Map Box */}
          <div
              ref={mapContainerRef}
              id="kakao-map-viewport"
              className={`w-full h-full cursor-crosshair transition-all duration-300 ${
                  showRoadview ? 'lg:w-1/2 h-[390px] lg:h-full border-b lg:border-b-0 lg:border-r border-slate-300' : 'w-full'
              }`}
          />

          {/* Kakao Roadview Box (When toggled) */}
          {showRoadview && (
              <div className="w-full lg:w-1/2 h-[390px] lg:h-full relative bg-slate-900 flex flex-col">
                <div className="p-2 bg-slate-900/90 text-white flex items-center justify-between text-xs px-3 border-b border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    <span>카카오 360° 고해상도 로드뷰</span>
                    {activeListingPopup && (
                        <span className="text-[11px] text-blue-300">({activeListingPopup.articleName})</span>
                    )}
                  </div>
                  <button
                      onClick={() => setShowRoadview(false)}
                      className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {roadviewError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                      <p className="text-xs">{roadviewError}</p>
                      <span className="text-[11px] text-slate-500 mt-1">지도의 다른 매물을 클릭해보세요.</span>
                    </div>
                ) : (
                    <div ref={roadviewContainerRef} className="flex-1 w-full h-full" />
                )}
              </div>
          )}
        </div>

        {/* 6. Active Listing Detail Popup Box */}
        {activeListingPopup && (
            <div className="absolute bottom-16 left-4 z-30 max-w-sm w-[calc(100%-2rem)] bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 p-4 shadow-xl animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                  {activeListingPopup.rletTpCd === 'APT' ? '아파트' : '오피스텔'}
                </span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                  📅 준공일: {activeListingPopup.useApprovalDate ? activeListingPopup.useApprovalDate.replace(/\s*\(\d{4}년식\)/g, '') : `${String(activeListingPopup.approvalYear || 2020).slice(-2)}.06`}
                </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">{activeListingPopup.articleName}</h4>
                  <p className="text-xs text-slate-500">
                    {activeListingPopup.buildingName} • 전용 {activeListingPopup.dedicatedPyeong}평 ({activeListingPopup.dedicatedAreaM2}㎡)
                  </p>
                  <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                    계약 {activeListingPopup.supplyPyeong ? `${activeListingPopup.supplyPyeong}평형` : `${(activeListingPopup.dedicatedPyeong * 1.33).toFixed(1)}평형`} (전용률 {Math.round(activeListingPopup.exclusiveRate || (activeListingPopup.supplyPyeong ? (activeListingPopup.dedicatedPyeong / activeListingPopup.supplyPyeong) * 100 : 75))}%)
                  </p>
                  <p className="text-[11px] text-slate-600 font-semibold mt-1">
                    세대수 {activeListingPopup.totalHouseholds ? `${activeListingPopup.totalHouseholds.toLocaleString()}세대` : '-'} · 용적률 {activeListingPopup.floorAreaRatio ? `${activeListingPopup.floorAreaRatio}%` : '-'}
                  </p>
                </div>
                <button
                    onClick={() => setActiveListingPopup(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono mb-3">
                <div>
              <span className="text-[10px] text-slate-500 block">
                {activeListingPopup.isEstimated ? '참고 시세' : '국토부 실거래가'}
                {activeListingPopup.isEstimated && (
                    <span
                        className="ml-1 px-1 py-[1px] rounded bg-amber-100 text-amber-700 text-[9px] font-semibold"
                        title="실거래가 확인 불가로 인근 시세를 참고해 추정한 가격입니다"
                    >
                    추정
                  </span>
                )}
              </span>
                  <b className="text-slate-900 font-bold text-sm block">
                    {activeListingPopup.priceManwon >= 10000
                        ? `${(activeListingPopup.priceManwon / 10000).toFixed(1)}억원`
                        : `${activeListingPopup.priceManwon.toLocaleString()}만원`}
                  </b>
                  {activeListingPopup.dealDate && (
                      <span className="text-[10px] text-blue-600 font-medium block mt-0.5">{activeListingPopup.dealDate}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">전용평당가(계약평당가)</span>
                  <div className="text-red-600 font-bold">
                    {activeListingPopup.pricePerPyeong.toLocaleString()}만원/평
                    <span className="text-[10px] font-normal text-slate-400">({activeListingPopup.supplyPricePerPyeong
                        ? activeListingPopup.supplyPricePerPyeong.toLocaleString()
                        : Math.round(activeListingPopup.priceManwon / (activeListingPopup.dedicatedPyeong * 1.33)).toLocaleString()} 만원/평)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onEditListing && (
                    <button
                        onClick={() => {
                          onEditListing(activeListingPopup);
                          setActiveListingPopup(null);
                        }}
                        className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1 border border-slate-300"
                        title="단지명, 실거래가, 면적, 연식 직접 수정"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      <span>수정</span>
                    </button>
                )}
                <button
                    onClick={() => {
                      onToggleSelect(activeListingPopup.id);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                        selectedIds.includes(activeListingPopup.id)
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                    }`}
                >
                  {selectedIds.includes(activeListingPopup.id) ? '✓ 비교사례 해제' : '+ 비교사례로 추가'}
                </button>
                <button
                    onClick={() => {
                      onSelectComparable(activeListingPopup);
                    }}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all"
                >
                  비교분석 바로가기
                </button>
              </div>
            </div>
        )}

      </div>
  );
};

