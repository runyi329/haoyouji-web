import { useState } from 'react';
import { ArrowLeft, Download, X } from 'lucide-react';
import { useLocation } from 'wouter';

// 硬编码的海报数据
const POSTERS = [
  {
    id: 1,
    title: 'KTV版宣传海报',
    description: '用别人的老婆赚钱 → KTV看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/BIdmlhaAMFmWlZUX.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/BIdmlhaAMFmWlZUX.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 2,
    title: '滴滴版宣传海报',
    description: '用别人的汽车赚钱 → 滴滴看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/DoomGMXoSjZsKEqJ.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/DoomGMXoSjZsKEqJ.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 3,
    title: '抖音版宣传海报',
    description: '用别人的才艺赚钱 → 抖音看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/QSPiOfWTShXrGIVA.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/QSPiOfWTShXrGIVA.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 4,
    title: '美团版宣传海报',
    description: '用别人的厨房赚钱 → 美团看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/PLMlWEvujJloqzez.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/PLMlWEvujJloqzez.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 5,
    title: '银行版宣传海报',
    description: '用别人的金钱赚钱 → 银行看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/NKpRvVPDdxJHWlqe.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/NKpRvVPDdxJHWlqe.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  },
  {
    id: 6,
    title: '保险版宣传海报',
    description: '用别人的生命赚钱 → 保险看到了',
    category: 'marketing',
    series: '脉动网宣传系列',
    url: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hJkCQwvjpIMuwwlz.png',
    thumbnailUrl: 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/hJkCQwvjpIMuwwlz.png?x-oss-process=image/resize,w_400',
    tags: ['营销', '宣传', '脉动网']
  }
];

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'marketing', label: '营销类' },
  { value: 'product', label: '产品教程' },
  { value: 'target', label: '特定对象' },
  { value: 'brand', label: '品牌宣传' },
  { value: 'event', label: '活动类' },
  { value: 'other', label: '其他' }
];

export default function PosterFavorites() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewPoster, setPreviewPoster] = useState<typeof POSTERS[0] | null>(null);

  // 筛选海报
  const filteredPosters = selectedCategory === 'all' 
    ? POSTERS 
    : POSTERS.filter(p => p.category === selectedCategory);

  // 下载海报
  const handleDownload = (poster: typeof POSTERS[0]) => {
    const link = document.createElement('a');
    link.href = poster.url;
    link.download = `${poster.title}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/parent/profile')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">我的收藏</h1>
          <div className="w-9" />
        </div>
      </div>

      {/* 分类筛选器 */}
      <div className="bg-white px-4 py-3 border-b">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
      </div>

      {/* 海报网格 */}
      <div className="p-4">
        {filteredPosters.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 text-6xl mb-4">📷</div>
            <p className="text-gray-500 text-lg">暂无收藏的海报</p>
            <p className="text-gray-400 text-sm mt-2">快去创建你的第一张海报吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredPosters.map(poster => (
              <div
                key={poster.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setPreviewPoster(poster)}
              >
                <div className="aspect-[9/16] bg-gray-100 relative">
                  <img
                    src={poster.thumbnailUrl}
                    alt={poster.title}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate">{poster.title}</h3>
                  <p className="text-xs text-gray-500 truncate mt-1">{poster.series}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {CATEGORIES.find(c => c.value === poster.category)?.label || '其他'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 预览弹窗 */}
      {previewPoster && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPoster(null)}
        >
          <div className="relative max-w-md max-h-[90vh] w-full">
            <button
              onClick={() => setPreviewPoster(null)}
              className="absolute -top-12 right-0 p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="bg-white rounded-lg overflow-hidden">
              <img
                src={previewPoster.url}
                alt={previewPoster.title}
                className="w-full h-auto object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1">{previewPoster.title}</h3>
                <p className="text-gray-600 text-sm mb-3">{previewPoster.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {previewPoster.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(previewPoster);
                  }}
                  className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  下载海报
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
