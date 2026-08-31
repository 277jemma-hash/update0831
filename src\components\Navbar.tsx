import React from 'react';
import { AddressResolution } from '../types';

interface NavbarProps {
  activeTab: 'map' | 'comparison' | 'report';
  setActiveTab: (tab: 'map' | 'comparison' | 'report') => void;
  addressInfo: AddressResolution;
  isLoading: boolean;
  selectedCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
                                                activeTab,
                                                setActiveTab,
                                                addressInfo,
                                                isLoading,
                                                selectedCount
                                              }) => {
  return (
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Title and Badge */}
            <div className="flex items-center gap-3">
              <div>
                <p className="hidden md:block leading-tight">
                  <span className="block text-[18px] text-slate-500">주변 시세조사를 통한</span>
                  <span className="block text-[30px] font-extrabold text-slate-900">사업지 적정가격 찾기</span>
                </p>
              </div>
            </div>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 bg-blue-100 p-1 rounded-xl border border-blue-200 shadow-sm">
              <button
                  id="tab-btn-map"
                  onClick={() => setActiveTab('map')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'map'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-blue-700 hover:bg-white/60'
                  }`}
              >
                <span>입지지도 & 매물</span>
              </button>

              <button
                  id="tab-btn-comparison"
                  onClick={() => setActiveTab('comparison')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                      activeTab === 'comparison'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-blue-700 hover:bg-white/60'
                  }`}
              >
                <span>거래사례비교</span>

                {selectedCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                  {selectedCount}
                </span>
                )}
              </button>

              <button
                  id="tab-btn-report"
                  onClick={() => setActiveTab('report')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'report'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-blue-700 hover:bg-white/60'
                  }`}
              >
                <span>가치산정 리포트</span>
              </button>
            </nav>
          </div>
        </div>
      </header>
  );
};

