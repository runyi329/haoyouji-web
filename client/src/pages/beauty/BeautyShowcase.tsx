/**
 * 奢贝美容院 - 数据展示
 * 路径: /beauty/showcase
 * 展示照片对比和PPT对比
 */
import { Link } from "wouter";
import { ChevronLeft, ImageIcon, Presentation } from "lucide-react";
import { useState } from "react";

// 照片对比数据（待填充）
const PHOTO_COMPARISONS: {
  id: string;
  title: string;
  before: string;
  after: string;
  description: string;
}[] = [];

// PPT对比数据（待填充）
const PPT_COMPARISONS: {
  id: string;
  title: string;
  before: string;
  after: string;
  description: string;
}[] = [];

export default function BeautyShowcase() {
  const [activeTab, setActiveTab] = useState<'photo' | 'ppt'>('photo');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF5F7' }}>
      {/* 顶部导航栏 */}
      <div
        className="sticky top-0 z-50 px-4 pt-3 pb-3"
        style={{
          background: 'linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <Link href="/beauty">
            <button className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          </Link>
          <h1 className="text-lg font-bold text-white tracking-wide">数据展示</h1>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('photo')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: activeTab === 'photo' ? 'linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)' : '#fff',
              color: activeTab === 'photo' ? '#fff' : '#666',
              boxShadow: activeTab === 'photo' ? '0 4px 12px rgba(233,30,99,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <ImageIcon className="w-4 h-4" />
            照片对比
          </button>
          <button
            onClick={() => setActiveTab('ppt')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{
              background: activeTab === 'ppt' ? 'linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)' : '#fff',
              color: activeTab === 'ppt' ? '#fff' : '#666',
              boxShadow: activeTab === 'ppt' ? '0 4px 12px rgba(233,30,99,0.3)' : '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <Presentation className="w-4 h-4" />
            PPT对比
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="px-4 pb-24 pt-2">
        {activeTab === 'photo' && (
          <div>
            {PHOTO_COMPARISONS.length > 0 ? (
              <div className="space-y-4">
                {PHOTO_COMPARISONS.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                  >
                    <div className="p-3 pb-2">
                      <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    </div>
                    <div className="flex">
                      <div className="flex-1 relative">
                        <img src={item.before} alt="Before" className="w-full aspect-[3/4] object-cover" />
                        <span className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-full bg-black/50 text-white">Before</span>
                      </div>
                      <div className="w-px bg-gray-200" />
                      <div className="flex-1 relative">
                        <img src={item.after} alt="After" className="w-full aspect-[3/4] object-cover" />
                        <span className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(233,30,99,0.8)' }}>After</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)' }}>
                  <ImageIcon className="w-7 h-7" style={{ color: '#E91E63' }} />
                </div>
                <p className="text-sm font-medium text-gray-700">照片对比数据准备中</p>
                <p className="text-xs text-gray-400 mt-1">即将上线，敬请期待</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ppt' && (
          <div>
            {PPT_COMPARISONS.length > 0 ? (
              <div className="space-y-4">
                {PPT_COMPARISONS.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl overflow-hidden"
                    style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                  >
                    <div className="p-3 pb-2">
                      <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    </div>
                    <div className="flex">
                      <div className="flex-1 relative">
                        <img src={item.before} alt="Before" className="w-full aspect-video object-cover" />
                        <span className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-full bg-black/50 text-white">Before</span>
                      </div>
                      <div className="w-px bg-gray-200" />
                      <div className="flex-1 relative">
                        <img src={item.after} alt="After" className="w-full aspect-video object-cover" />
                        <span className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(233,30,99,0.8)' }}>After</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)' }}>
                  <Presentation className="w-7 h-7" style={{ color: '#E91E63' }} />
                </div>
                <p className="text-sm font-medium text-gray-700">PPT对比数据准备中</p>
                <p className="text-xs text-gray-400 mt-1">即将上线，敬请期待</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
