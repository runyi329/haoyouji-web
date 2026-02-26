import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { trpc } from '../lib/trpc';
import QRCode from 'qrcode';

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
  { value: 'invite', label: '邀请海报' },
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
  const [previewPoster, setPreviewPoster] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [invitePoster, setInvitePoster] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 获取用户信息（包含邀请码）
  const { data: inviteData } = trpc.invite.getInviteInfo.useQuery();

  // 生成带二维码的海报
  const generatePosterWithQR = async (inviteCode: string) => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 设置画布尺寸为海报尺寸
    canvas.width = 1080;
    canvas.height = 1920;

    // 加载海报模板
    const posterImg = new Image();
    posterImg.crossOrigin = 'anonymous';
    
    return new Promise<string>((resolve, reject) => {
      posterImg.onload = async () => {
        // 绘制海报背景
        ctx.drawImage(posterImg, 0, 0, 1080, 1920);

        // 生成二维码
        const inviteLink = `https://jiangyuchen.cn/login?invite=${inviteCode}`;
        try {
          const qrDataUrl = await QRCode.toDataURL(inviteLink, {
            width: 180,
            margin: 0,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });

          // 加载二维码图片
          const qrImg = new Image();
          qrImg.onload = () => {
            // 在指定位置绘制二维码 (右下角白色方框区域)
            // 位置：X=630, Y=1230, 尺寸：180x180
            ctx.drawImage(qrImg, 630, 1230, 180, 180);

            // 转换为图片URL
            const finalImageUrl = canvas.toDataURL('image/png');
            resolve(finalImageUrl);
          };
          qrImg.onerror = reject;
          qrImg.src = qrDataUrl;
        } catch (error) {
          reject(error);
        }
      };
      posterImg.onerror = reject;
      posterImg.src = '/assets/invite_poster_template.png';
    });
  };

  // 当获取到邀请码后，生成海报
  useEffect(() => {
    if (inviteData?.inviteCode && !invitePoster && !isGenerating) {
      setIsGenerating(true);
      generatePosterWithQR(inviteData.inviteCode)
        .then((posterUrl) => {
          if (posterUrl) {
            setInvitePoster({
              id: 'invite',
              title: '我的邀请海报',
              description: '带有您专属邀请二维码的海报',
              category: 'invite',
              series: '邀请好友',
              url: posterUrl,
              thumbnailUrl: posterUrl,
              tags: ['邀请', '二维码', '专属']
            });
          }
          setIsGenerating(false);
        })
        .catch((error) => {
          console.error('Failed to generate poster:', error);
          setIsGenerating(false);
        });
    }
  }, [inviteData, invitePoster, isGenerating]);

  // 合并邀请海报和其他海报
  const allPosters = invitePoster ? [invitePoster, ...POSTERS] : POSTERS;

  // 筛选海报
  const filteredPosters = selectedCategory === 'all' 
    ? allPosters 
    : allPosters.filter(p => p.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
      {/* 隐藏的Canvas用于生成海报 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

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
            {filteredPosters.map((poster, index) => (
              <div
                key={poster.id}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setCurrentIndex(index);
                  setPreviewPoster(poster);
                }}
              >
                <div className="aspect-[9/16] bg-gray-100 relative">
                  {poster.id === 'invite' && (
                    <div className="absolute top-2 right-2 z-10 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                      专属
                    </div>
                  )}
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

      {/* 预览弹窗 - 支持左右滑动切换 */}
      {previewPoster && (
        <div
          className="fixed inset-0 bg-black z-50 flex items-center justify-center"
          onClick={() => setPreviewPoster(null)}
        >
          {/* 关闭按钮 */}
          <button
            onClick={() => setPreviewPoster(null)}
            className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full hover:bg-gray-100 transition-colors shadow-lg"
          >
            <X className="w-8 h-8 text-black" strokeWidth={3} />
          </button>

          {/* 页码显示 - 屏幕正中间 */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 px-4 py-2 bg-black bg-opacity-50 rounded-full text-white text-sm pointer-events-none">
            {currentIndex + 1} / {filteredPosters.length}
          </div>

          {/* 图片容器 - 支持触摸滑动 */}
          <div
            className="w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              setTouchStart(e.targetTouches[0].clientX);
            }}
            onTouchMove={(e) => {
              setTouchEnd(e.targetTouches[0].clientX);
            }}
            onTouchEnd={() => {
              if (touchStart - touchEnd > 75) {
                // 向左滑，下一张
                if (currentIndex < filteredPosters.length - 1) {
                  setCurrentIndex(currentIndex + 1);
                  setPreviewPoster(filteredPosters[currentIndex + 1]);
                }
              }
              if (touchStart - touchEnd < -75) {
                // 向右滑，上一张
                if (currentIndex > 0) {
                  setCurrentIndex(currentIndex - 1);
                  setPreviewPoster(filteredPosters[currentIndex - 1]);
                }
              }
            }}
          >
            <img
              src={previewPoster.url}
              alt={previewPoster.title}
              className="max-w-full max-h-full object-contain"
              onContextMenu={(e) => {
                // 允许长按保存，不阻止默认行为
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
