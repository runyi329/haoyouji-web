import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { 
  GraduationCap, 
  Home, 
  Users, 
  Tags, 
  MapPin, 
  Share2, 
  BarChart3, 
  Bell, 
  TrendingUp, 
  Search, 
  X, 
  Smartphone,
  Phone,
  Wallet,
  Heart,
  ArrowLeft
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AcademyModule {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color: string;
  bgColor: string;
  category: 'core' | 'advanced' | 'system';
  content: {
    introduction: string;
    features: string[];
    tips: string[];
  };
}

const academyModules: AcademyModule[] = [
  // 核心功能 - 使用红色系
  {
    id: "homepage",
    icon: Home,
    title: "首页统计",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]",
    category: "core",
    content: {
      introduction: "首页提供了19个可自定义排序的统计容器，帮助您快速了解人脉管理的整体情况。",
      features: [
        "人脉总数：显示您的人脉总数，包括自己添加的和其他用户共享给您的人脉",
        "本周/月/年新增：显示不同时间段新添加的人脉数量",
        "需要关注：基于标签的智能提醒系统，自动提醒您哪些人需要联络",
        "活跃统计：显示不同时间段有过联络记录的人脉数量",
        "提醒功能：显示今日/本周/本月需要关注的生日、纪念日等提醒事项"
      ],
      tips: [
        "您可以通过拖拽调整容器位置，系统会自动保存您的排序偏好",
        "为重要人脉打上周关注或月关注标签，系统会自动提醒您定期维护关系"
      ]
    }
  },
  {
    id: "contacts",
    icon: Users,
    title: "人脉管理",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]-light0",
    category: "core",
    content: {
      introduction: "全方位管理您的人脉关系，记录每一次联络，维护每一份关系。",
      features: [
        "添加人脉：填写基本信息和扩展信息，为人脉打上标签",
        "编辑信息：随时修改人脉的基本信息和扩展信息",
        "联络记录：快速记录联络情况，系统自动统计联络数据",
        "引荐人功能：设置引荐人，系统自动计算引荐贡献分"
      ],
      tips: [
        "扩展信息会显示在详情页的第一个容器中，方便查看",
        "定期记录联络可以帮助您更好地维护人脉关系"
      ]
    }
  },
  {
    id: "tags",
    icon: Tags,
    title: "标签系统",
    color: "text-rose-600",
    bgColor: "bg-rose-600",
    category: "core",
    content: {
      introduction: "采用两层标签系统，灵活分类管理您的人脉。",
      features: [
        "全局标签：所有人脉共用的标签，如客户、朋友、家人等",
        "个人标签：针对特定人脉的自定义标签，更灵活",
        "关注级别：周关注、月关注、季关注标签启用智能提醒功能"
      ],
      tips: [
        "所有标签都支持自定义，没有预设标签限制",
        "使用关注级别标签可以让系统自动提醒您维护重要关系"
      ]
    }
  },
  {
    id: "contact-record",
    icon: Phone,
    title: "联络记录",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]",
    category: "core",
    content: {
      introduction: "记录每一次联络，让人脉关系维护更有迹可循。",
      features: [
        "快速记录：一键记录联络时间和内容",
        "自动统计：系统自动计算上次联络时间、联络次数、平均间隔等",
        "联络提醒：根据标签自动提醒您哪些人需要联络",
        "联络历史：查看完整的联络历史记录"
      ],
      tips: [
        "及时记录联络可以帮助您更好地了解人脉关系的维护情况",
        "系统会根据您的联络频率自动调整提醒策略"
      ]
    }
  },
  // 高级功能 - 使用红色系
  {
    id: "region",
    icon: MapPin,
    title: "区域筛选",
    color: "text-rose-500",
    bgColor: "bg-rose-500",
    category: "advanced",
    content: {
      introduction: "按地区筛选人脉，方便管理不同地区的人脉关系。",
      features: [
        "地区统计：系统自动统计每个地区的人脉数量",
        "快速筛选：点击地区名称即可筛选该地区的人脉",
        "地区管理：支持自定义地区分类"
      ],
      tips: [
        "为人脉设置地区信息可以帮助您更好地管理跨地区的人脉关系"
      ]
    }
  },
  {
    id: "share",
    icon: Share2,
    title: "人脉共享",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]",
    category: "advanced",
    content: {
      introduction: "与团队成员共享人脉资源，实现人脉网络的协同管理。",
      features: [
        "共享人脉：选择人脉共享给团队成员",
        "查看权限：被共享的人脉只能查看，无法编辑",
        "共享管理：随时取消共享或调整共享范围"
      ],
      tips: [
        "共享人脉可以帮助团队更好地协作，但请注意保护隐私"
      ]
    }
  },
  {
    id: "stats",
    icon: BarChart3,
    title: "数据统计",
    color: "text-rose-700",
    bgColor: "bg-rose-700",
    category: "advanced",
    content: {
      introduction: "全方位的数据统计，让您更了解自己的人脉网络。",
      features: [
        "联络统计：查看详细的联络数据",
        "人脉分析：分析人脉分布和增长趋势",
        "自定义统计：配置显示哪些统计项"
      ],
      tips: [
        "定期查看数据统计可以帮助您更好地了解人脉管理情况"
      ]
    }
  },
  {
    id: "reminders",
    icon: Bell,
    title: "提醒功能",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]",
    category: "advanced",
    content: {
      introduction: "智能提醒系统，让您不错过任何重要的日子。",
      features: [
        "生日提醒：自动提醒人脉的生日",
        "纪念日提醒：自动提醒重要的纪念日",
        "联络提醒：根据标签自动提醒您哪些人需要联络"
      ],
      tips: [
        "为人脉设置生日和纪念日可以让系统自动提醒您"
      ]
    }
  },
  // 系统功能 - 使用红色系
  {
    id: "admin",
    icon: TrendingUp,
    title: "后台管理",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]",
    category: "system",
    content: {
      introduction: "超级管理员专属功能，管理整个系统。",
      features: [
        "用户管理：查看和管理所有用户账号",
        "邀请管理：管理邀请码和邀请记录",
        "知识库：管理系统知识库内容",
        "系统设置：配置全局系统参数"
      ],
      tips: [
        "只有超级管理员才能访问后台管理页面"
      ]
    }
  },
  {
    id: "pwa",
    icon: Smartphone,
    title: "PWA应用",
    color: "text-rose-400",
    bgColor: "bg-rose-400",
    category: "system",
    content: {
      introduction: "将脉动安装到手机桌面，像使用普通App一样打开和使用。",
      features: [
        "桌面图标：在手机桌面显示脉动图标，一键打开",
        "全屏体验：去除浏览器地址栏，获得更大的显示空间",
        "离线访问：支持离线缓存，无网络时也能浏览已缓存的内容",
        "快速启动：启动速度更快，无需等待浏览器加载"
      ],
      tips: [
        "Android手机：在Chrome浏览器中打开脉动，点击底部的安装提示",
        "iPhone/iPad：在Safari浏览器中打开脉动，点击分享按钮，选择添加到主屏幕"
      ]
    }
  },
  {
    id: "ledger",
    icon: Wallet,
    title: "账本管理",
    color: "text-rose-800",
    bgColor: "bg-rose-800",
    category: "system",
    content: {
      introduction: "管理您的财务账本，记录每一笔收支。",
      features: [
        "创建账本：创建多个账本，分类管理不同的财务",
        "记账功能：快速记录收入和支出",
        "成员管理：邀请成员共同管理账本",
        "数据统计：查看收支统计和趋势分析"
      ],
      tips: [
        "为账本设置成员权限可以实现多人协作记账"
      ]
    }
  },
  {
    id: "equity",
    icon: Heart,
    title: "权益中心",
    color: "text-[#D32F2F]",
    bgColor: "bg-[#D32F2F]-light0",
    category: "system",
    content: {
      introduction: "查看和管理您的会员权益。",
      features: [
        "积分查询：查看您的积分余额",
        "权益兑换：使用积分兑换各种权益",
        "邀请奖励：邀请好友获得积分奖励",
        "权益记录：查看权益使用记录"
      ],
      tips: [
        "多邀请好友可以获得更多积分奖励"
      ]
    }
  }
];

export default function Academy() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<AcademyModule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) {
      return academyModules;
    }

    const query = searchQuery.toLowerCase();
    return academyModules.filter(module => {
      if (module.title.toLowerCase().includes(query)) {
        return true;
      }
      return module.content.introduction.toLowerCase().includes(query) ||
        module.content.features.some(f => f.toLowerCase().includes(query)) ||
        module.content.tips.some(t => t.toLowerCase().includes(query));
    });
  }, [searchQuery]);

  const coreModules = filteredModules.filter(m => m.category === 'core');
  const advancedModules = filteredModules.filter(m => m.category === 'advanced');
  const systemModules = filteredModules.filter(m => m.category === 'system');

  const handleModuleClick = (module: AcademyModule) => {
    setSelectedModule(module);
    setIsDialogOpen(true);
  };

  const ModuleIcon = ({ module }: { module: AcademyModule }) => {
    const Icon = module.icon;
    return (
      <button
        onClick={() => handleModuleClick(module)}
        className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
      >
        <div className={`w-14 h-14 ${module.bgColor} rounded-full flex items-center justify-center shadow-sm`}>
          <Icon className="w-7 h-7 text-white" />
        </div>
        <span className="text-xs text-[#424242] text-center leading-tight">{module.title}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部装饰区 */}
      <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-b-3xl pb-20 relative">
        <div className="px-4 pt-4">
          <button
            onClick={() => setLocation("/profile")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        </div>
        <div className="px-4 pt-6 pb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <GraduationCap className="h-10 w-10 text-white" />
            <h1 className="text-3xl font-bold text-white">
              脉动学院
            </h1>
          </div>
          <p className="text-white/80 text-sm">
            掌握每一个功能，让人脉管理更高效
          </p>
        </div>
      </div>

      {/* 搜索区域 - 修改为白色背景 */}
      <div className="px-4 -mt-16 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#757575]" />
            <Input
              type="text"
              placeholder="搜索功能说明..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 border-divider bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#757575] hover:text-[#757575]"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-[#757575] mt-2">
              找到 {filteredModules.length} 个相关功能
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 space-y-4">
        {/* 核心功能 */}
        {coreModules.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[#222222] mb-4">核心功能</h2>
            <div className="grid grid-cols-4 gap-4">
              {coreModules.map(module => (
                <ModuleIcon key={module.id} module={module} />
              ))}
            </div>
          </div>
        )}

        {/* 高级功能 */}
        {advancedModules.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[#222222] mb-4">高级功能</h2>
            <div className="grid grid-cols-4 gap-4">
              {advancedModules.map(module => (
                <ModuleIcon key={module.id} module={module} />
              ))}
            </div>
          </div>
        )}

        {/* 系统功能 */}
        {systemModules.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-base font-semibold text-[#222222] mb-4">系统功能</h2>
            <div className="grid grid-cols-4 gap-4">
              {systemModules.map(module => (
                <ModuleIcon key={module.id} module={module} />
              ))}
            </div>
          </div>
        )}

        {/* 无搜索结果提示 */}
        {searchQuery && filteredModules.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-[#757575]">未找到相关功能</p>
            <p className="text-sm text-[#757575] mt-2">请尝试其他关键词</p>
          </div>
        )}

        {/* 底部提示 */}
        <div className="bg-[#FAF3ED] rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-[#FFA726] text-center">
            💡 小贴士：如需在使用过程中遇到问题，可以随时返回这里查看相关功能说明。
          </p>
        </div>
      </div>

      {/* 功能详情弹窗 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedModule && (
                <>
                  <div className={`w-10 h-10 ${selectedModule.bgColor} rounded-full flex items-center justify-center`}>
                    <selectedModule.icon className="w-5 h-5 text-white" />
                  </div>
                  <span>{selectedModule.title}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-left space-y-4 pt-4">
              {selectedModule && (
                <>
                  <div>
                    <h4 className="font-medium text-[#222222] mb-2">功能介绍</h4>
                    <p className="text-sm text-[#757575]">{selectedModule.content.introduction}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-[#222222] mb-2">主要功能</h4>
                    <ul className="space-y-2">
                      {selectedModule.content.features.map((feature, index) => (
                        <li key={index} className="text-sm text-[#757575] flex items-start gap-2">
                          <span className="text-[#D32F2F] mt-0.5">•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-[#222222] mb-2">使用技巧</h4>
                    <ul className="space-y-2">
                      {selectedModule.content.tips.map((tip, index) => (
                        <li key={index} className="text-sm text-[#757575] flex items-start gap-2">
                          <span className="text-[#FFA726] mt-0.5">💡</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
