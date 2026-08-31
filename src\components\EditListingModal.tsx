import React, { useState, useEffect } from 'react';
import { RealEstateListing } from '../types';
import { findKnownComplex } from '../data/complexDatabase';
import { X, Check, Edit3, Trash2, Sparkles, Building2 } from 'lucide-react';

interface EditListingModalProps {
  listing: RealEstateListing | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: RealEstateListing) => void;
  onDelete?: (id: string) => void;
}

export const EditListingModal: React.FC<EditListingModalProps> = ({
  listing,
  isOpen,
  onClose,
  onSave,
  onDelete
}) => {
  if (!isOpen || !listing) return null;

  const [articleName, setArticleName] = useState(listing.articleName);
  const [buildingName, setBuildingName] = useState(listing.buildingName);
  const [floorInfo, setFloorInfo] = useState(listing.floorInfo);
  const [dedicatedPyeong, setDedicatedPyeong] = useState(listing.dedicatedPyeong);
  const [supplyPyeong, setSupplyPyeong] = useState(
    listing.supplyPyeong || parseFloat((listing.dedicatedPyeong * 1.33).toFixed(1))
  );
  const [priceManwon, setPriceManwon] = useState(listing.priceManwon);
  const [dealDate, setDealDate] = useState(listing.dealDate || '24.05');
  const [approvalYear, setApprovalYear] = useState(listing.approvalYear || 2020);
  const [lat, setLat] = useState(listing.lat);
  const [lon, setLon] = useState(listing.lon);
  const [matchedDb, setMatchedDb] = useState(findKnownComplex(listing.articleName));

  useEffect(() => {
    if (listing) {
      setArticleName(listing.articleName);
      setBuildingName(listing.buildingName);
      setFloorInfo(listing.floorInfo);
      setDedicatedPyeong(listing.dedicatedPyeong);
      setSupplyPyeong(listing.supplyPyeong || parseFloat((listing.dedicatedPyeong * 1.325).toFixed(1)));
      setPriceManwon(listing.priceManwon);
      setDealDate(listing.dealDate || '24.05');
      setApprovalYear(listing.approvalYear || 2020);
      setLat(listing.lat);
      setLon(listing.lon);
      setMatchedDb(findKnownComplex(listing.articleName));
    }
  }, [listing]);

  // Handle complex name changes and check DB
  const handleNameChange = (newName: string) => {
    setArticleName(newName);
    const found = findKnownComplex(newName);
    setMatchedDb(found);
  };

  const applyDatabasePreset = () => {
    if (!matchedDb) return;
    setArticleName(matchedDb.officialName);
    setApprovalYear(matchedDb.approvalYear);
    setDedicatedPyeong(matchedDb.typicalPyeong);
    setSupplyPyeong(matchedDb.supplyPyeong);
    setPriceManwon(matchedDb.recentPriceManwon);
    setDealDate(matchedDb.dealDate);
    if (matchedDb.lat && matchedDb.lon) {
      setLat(matchedDb.lat);
      setLon(matchedDb.lon);
    }
  };

  // Calculations
  const calculatedPricePerPyeong = dedicatedPyeong > 0 ? Math.round(priceManwon / dedicatedPyeong) : 0;
  const calculatedSupplyPricePerPyeong = supplyPyeong > 0 ? Math.round(priceManwon / supplyPyeong) : 0;
  const calculatedAreaM2 = parseFloat((dedicatedPyeong * 3.305785).toFixed(2));
  const calculatedExclusiveRate = supplyPyeong > 0 ? parseFloat(((dedicatedPyeong / supplyPyeong) * 100).toFixed(1)) : 75;

  const handlePyeongChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setDedicatedPyeong(val);
    setSupplyPyeong(parseFloat((val * 1.325).toFixed(1)));
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) || 0;
    setPriceManwon(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: RealEstateListing = {
      ...listing,
      articleName: articleName.trim() || '실거래 비교단지',
      buildingName: buildingName.trim() || '101동',
      floorInfo: floorInfo.trim() || '중간층',
      dedicatedPyeong: dedicatedPyeong > 0 ? dedicatedPyeong : 25.7,
      dedicatedAreaM2: calculatedAreaM2,
      supplyPyeong: supplyPyeong > 0 ? supplyPyeong : 34.0,
      exclusiveRate: calculatedExclusiveRate,
      priceManwon: priceManwon > 0 ? priceManwon : 50000,
      pricePerPyeong: calculatedPricePerPyeong,
      supplyPricePerPyeong: calculatedSupplyPricePerPyeong,
      dealDate,
      approvalYear: approvalYear > 1950 ? approvalYear : 2020,
      useApprovalDate: `${String(approvalYear > 1950 ? approvalYear : 2020).slice(-2)}.06`,
      lat: lat || listing.lat,
      lon: lon || listing.lon
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">실거래/비교단지 정보 정밀 수정</h3>
              <p className="text-xs text-slate-500">실제 준공일 및 실거래가·평당가를 실측값으로 조정합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {matchedDb && (
          <div className="mt-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="font-bold text-indigo-950">공식 DB 확인: {matchedDb.officialName}</span>
                <p className="text-[11px] text-indigo-700">
                  준공: {matchedDb.approvalYear}년 • 최근 실거래: {(matchedDb.recentPriceManwon / 10000).toFixed(1)}억 (공급 {matchedDb.supplyPyeong}평형)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={applyDatabasePreset}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] shrink-0"
            >
              공식값 적용
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="py-4 space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-slate-800 block mb-1">
              아파트/단지명 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={articleName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="예: e편한세상서울대입구2차, 신림현대아파트"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-800 block mb-1">동 / 호수 정보</label>
              <input
                type="text"
                value={buildingName}
                onChange={e => setBuildingName(e.target.value)}
                placeholder="예: 201동"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="font-bold text-slate-800 block mb-1">층수 정보</label>
              <input
                type="text"
                value={floorInfo}
                onChange={e => setFloorInfo(e.target.value)}
                placeholder="예: 11층/18층"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="font-bold text-slate-800 block mb-1">
                전용면적 (평)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="200"
                value={dedicatedPyeong}
                onChange={handlePyeongChange}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold font-mono text-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">{calculatedAreaM2}㎡</span>
            </div>

            <div>
              <label className="font-bold text-slate-800 block mb-1">
                공급/분양 (평)
              </label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="200"
                value={supplyPyeong}
                onChange={e => setSupplyPyeong(parseFloat(e.target.value) || 0)}
                placeholder="예: 34"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold font-mono text-indigo-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">예: 34평형</span>
            </div>

            <div>
              <label className="font-bold text-slate-800 block mb-1">
                준공일(연식) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1960"
                max="2030"
                value={approvalYear}
                onChange={e => setApprovalYear(parseInt(e.target.value, 10) || 2020)}
                className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl font-bold text-amber-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-[10px] text-amber-700 mt-0.5 block">
                {new Date().getFullYear() - approvalYear === 0 ? '신축' : `${new Date().getFullYear() - approvalYear}년 경과`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-800 block mb-1">
                실거래 매매가 (만원 단위) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="100"
                min="1000"
                value={priceManwon}
                onChange={handlePriceChange}
                placeholder="예: 112000 (11억 2천만원)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-base font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] font-bold text-blue-600 mt-1 block">
                {priceManwon >= 10000 ? `${(priceManwon / 10000).toFixed(1)}억원` : `${priceManwon.toLocaleString()}만원`}
              </span>
            </div>

            <div>
              <label className="font-bold text-slate-800 block mb-1">
                실거래 계약일자 <span className="text-slate-400 font-normal text-xs">(체결일)</span>
              </label>
              <input
                type="text"
                value={dealDate}
                onChange={e => setDealDate(e.target.value)}
                placeholder="예: 24.05.18"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                전용률: <strong className="text-indigo-600">{calculatedExclusiveRate}%</strong>
              </span>
            </div>
          </div>
            
            {/* Real Estate Dual Pyeong-price Metrics */}
            <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500 text-[11px] block">전용면적 기준 평당가:</span>
                <span className="font-mono font-black text-red-600 text-sm">
                  {calculatedPricePerPyeong.toLocaleString()}
                  <span className="text-xs font-normal text-slate-600"> 만원/전용평</span>
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">공급(분양)면적 기준 평당가:</span>
                <span className="font-mono font-black text-indigo-600 text-sm">
                  {calculatedSupplyPricePerPyeong.toLocaleString()}
                  <span className="text-xs font-normal text-slate-600"> 만원/공급평</span>
                </span>
              </div>
            </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(listing.id);
                  onClose();
                }}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>수정 내용 반영</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

