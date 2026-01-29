import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import ChinaMap from '@/components/ChinaMap';
import ChinaGlobeParticles from '@/components/ChinaGlobeParticles';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';

// 省份简称映射
const provinceShortNames: Record<string, string> = {
  '北京市': '北京', '天津市': '天津', '上海市': '上海', '重庆市': '重庆',
  '河北省': '河北', '山西省': '山西', '辽宁省': '辽宁', '吉林省': '吉林', '黑龙江省': '黑龙江',
  '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽', '福建省': '福建', '江西省': '江西', '山东省': '山东',
  '河南省': '河南', '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '海南省': '海南',
  '四川省': '四川', '贵州省': '贵州', '云南省': '云南', '陕西省': '陕西', '甘肃省': '甘肃', '青海省': '青海',
  '内蒙古自治区': '内蒙', '广西壮族自治区': '广西', '西藏自治区': '西藏', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
  '台湾省': '台湾', '香港特别行政区': '香港', '澳门特别行政区': '澳门',
  '海外': '海外', '其他': '其他'
};

// 所有省份列表(包括海外和其他)
const allProvinces = [
  '北京市', '天津市', '上海市', '重庆市',
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省',
  '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省',
  '河南省', '湖北省', '湖南省', '广东省', '海南省',
  '四川省', '贵州省', '云南省', '陕西省', '甘肃省', '青海省',
  '内蒙古自治区', '广西壮族自治区', '西藏自治区', '宁夏回族自治区', '新疆维吾尔自治区',
  '台湾省', '香港特别行政区', '澳门特别行政区',
  '海外', '其他'
];

export default function RegionMap() {
  const [, setLocation] = useLocation();
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isMobile = !useMediaQuery("(min-width: 768px)");

  // 获取区域统计数据
  const { data: regionStatsData = [] } = trpc.contacts.regions.stats.useQuery();

  // 获取选中省份的人脉列表
  const { data: provinceContacts = [] } = trpc.contacts.regions.list.useQuery(
    { region: selectedProvince || '' },
    { enabled: !!selectedProvince }
  );

  // 使用后端返回的动态排序结果（已按人脉数量降序，海外和其他在最后）
  const provinceStats = useMemo(() => {
    // 直接使用后端返回的排序结果
    return regionStatsData;
  }, [regionStatsData]);

  const totalContacts = regionStatsData.reduce((sum, s) => sum + s.value, 0);
  const activeProvinces = regionStatsData.filter(s => s.value > 0).length;

  // 当选择省份时，如果是移动端，打开抽屉
  useEffect(() => {
    if (selectedProvince && isMobile) {
      setIsDrawerOpen(true);
    }
  }, [selectedProvince, isMobile]);

  const handleDrawerOpenChange = (open: boolean) => {
    setIsDrawerOpen(open);
    if (!open) {
      setTimeout(() => setSelectedProvince(null), 300);
    }
  };

  const handleProvinceClick = (provinceName: string) => {
    setSelectedProvince(provinceName);
  };

  const handleContactClick = (contactId: number) => {
    setLocation(`/parent/contacts/${contactId}`);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-background border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/parent/contacts')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </Button>
          <h1 className="font-semibold text-lg">区域分布</h1>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{totalContacts} 人脉</span>
          <span>{activeProvinces} 省份</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* 粒子动画展示区 */}
        <div className="w-full h-64 bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 relative border-b border-gray-800">
          <ChinaGlobeParticles />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h2 className="text-xl font-bold text-white opacity-30">人脉网络·全球视角</h2>
          </div>
        </div>
        
        {/* Map Area */}
        <div className={`
          relative bg-white w-full transition-all duration-300 ease-in-out
          ${isMobile ? 'h-[38vh] shrink-0 border-b border-gray-100' : 'flex-1 h-full'}
        `}>
          {/* 地图层 */}
          <ChinaMap
            data={provinceStats}
            onProvinceClick={handleProvinceClick}
            selectedProvince={selectedProvince}
          />
        </div>

        {/* Mobile Stats List */}
        {isMobile && (
          <div className="flex-1 bg-gray-50/30 overflow-y-auto relative">
            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">省份统计</h2>
              <span className="text-xs text-gray-500">{activeProvinces} 个省份</span>
            </div>

            <div className="p-2 pt-2">
              <div className="grid grid-cols-6 gap-1.5">
                {provinceStats
                  .map((stat) => (
                    <button
                      key={stat.name}
                      onClick={() => handleProvinceClick(stat.name)}
                      className={`
                        aspect-square rounded-lg border transition-all duration-200
                        flex flex-col items-center justify-center gap-0.5 p-1
                        ${selectedProvince === stat.name
                          ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                          : stat.value > 0
                          ? 'bg-white border-gray-200 hover:border-primary hover:shadow-sm active:scale-95'
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                        }
                      `}
                    >
                      <span className={`
                        text-base font-bold leading-none
                        ${selectedProvince === stat.name ? 'text-primary-foreground' : 'text-primary'}
                      `}>
                        {stat.value}
                      </span>
                      <span className="text-[10px] leading-none">
                        {provinceShortNames[stat.name] || stat.name}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar */}
        {!isMobile && selectedProvince && (
          <div className="w-80 bg-background border-l border-border overflow-y-auto">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {selectedProvince}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                共 {provinceContacts.length} 位人脉
              </p>
            </div>

            <div className="p-4 space-y-2">
              {provinceContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  该地区暂无人脉
                </p>
              ) : (
                provinceContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleContactClick(contact.id)}
                    className="w-full p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left"
                  >
                    <div className="font-medium">{contact.name}</div>
                    {contact.title && (
                      <div className="text-sm text-muted-foreground">{contact.title}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer open={isDrawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {selectedProvince}
              </DrawerTitle>
              <p className="text-sm text-muted-foreground">
                共 {provinceContacts.length} 位人脉
              </p>
            </DrawerHeader>

            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {provinceContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  该地区暂无人脉
                </p>
              ) : (
                provinceContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleContactClick(contact.id)}
                    className="w-full p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left"
                  >
                    <div className="font-medium">{contact.name}</div>
                    {contact.title && (
                      <div className="text-sm text-muted-foreground">{contact.title}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
