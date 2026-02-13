import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GraduationCap, Home, Users, Tags, MapPin, Share2, BarChart3, Bell, TrendingUp, Search, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

interface FeatureSection {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color: string;
  content: {
    subtitle: string;
    text: string;
  }[];
}

const featureSections: FeatureSection[] = [
  {
    id: "homepage",
    icon: Home,
    title: "首页统计容器",
    color: "text-blue-600",
    content: [
      {
        subtitle: "功能概述",
        text: "首页提供了19个可自定义排序的统计容器，帮助您快速了解人脉管理的整体情况。您可以通过拖拽调整容器位置，系统会自动保存您的排序偏好。"
      },
      {
        subtitle: "1. 人脉总数",
        text: "显示您的人脉总数，包括自己添加的和其他用户共享给您的人脉。点击可查看完整人脉列表。"
      },
      {
        subtitle: "2. 本周新增",
        text: "显示本周新添加的人脉数量。点击可查看本周新增的人脉列表，方便您快速回顾最近添加的联系人。"
      },
      {
        subtitle: "3. 本月新增",
        text: "显示本月新添加的人脉数量。点击可查看本月新增的人脉列表，帮助您了解本月的人脉拓展情况。"
      },
      {
        subtitle: "4. 今年新增",
        text: "显示今年新添加的人脉数量。点击可查看今年新增的人脉列表，了解全年的人脉增长趋势。"
      },
      {
        subtitle: "5. 联络频率",
        text: "显示您的平均联络间隔天数，数值越小表示联络越频繁。这个指标帮助您了解自己维护人脉关系的活跃程度。"
      },
      {
        subtitle: "6. 需要关注 ⭐",
        text: "这是一个基于标签的智能提醒系统，会根据人脉的标签自动提醒您哪些人需要联络：\\n• 周关注标签：超过 7天 未联络会被标记\\n• 月关注标签：超过 30天 未联络会被标记\\n• 季关注标签：超过 90天 未联络会被标记\\n• 无标签：超过 180天 未联络会被标记\\n\\n💡 使用建议：为重要人脉打上周关注或月关注标签，系统会自动提醒您定期维护关系。点击可查看需要关注的人脉列表。"
      },
      {
        subtitle: "7. 本月活跃",
        text: "显示本月有过联络记录的人脉数量。点击可查看本月活跃的人脉列表，了解本月与哪些人保持了联系。"
      },
      {
        subtitle: "8. 本周活跃",
        text: "显示本周有过联络记录的人脉数量。点击可查看本周活跃的人脉列表，快速回顾本周的社交活动。"
      },
      {
        subtitle: "9. 今年活跃",
        text: "显示今年有过联络记录的人脉数量。点击可查看今年活跃的人脉列表，了解全年的社交活跃度。"
      },
      {
        subtitle: "10. 拉黑名单",
        text: "显示被拉黑的人脉数量。点击可查看拉黑名单，管理不希望继续联系的人脉。"
      },
      {
        subtitle: "11. 今日提醒",
        text: "显示今天需要关注的生日、纪念日等提醒事项数量。点击可查看今日提醒详情，避免错过重要日子。"
      },
      {
        subtitle: "12. 本周提醒",
        text: "显示本周需要关注的提醒事项数量（统计有提醒的人数，而非提醒事件总数）。点击可查看本周提醒详情。"
      },
      {
        subtitle: "13. 本月提醒",
        text: "显示本月需要关注的提醒事项数量（统计有提醒的人数，而非提醒事件总数）。点击可查看本月提醒详情。"
      },
      {
        subtitle: "14. 今日活跃",
        text: "显示今天有过联络记录的人脉数量。点击可查看今日活跃的人脉列表，了解今天的社交情况。"
      },
      {
        subtitle: "15. 休眠名单",
        text: "显示长时间未联络的人脉数量。点击可查看休眠名单，提醒您重新联系这些人脉。"
      },
      {
        subtitle: "16. 公司数量",
        text: "显示您的人脉分布在多少家不同的公司。这个指标帮助您了解人脉网络的广度和行业覆盖面。"
      },
      {
        subtitle: "17. 累计联络",
        text: "显示所有用户的累计联络次数总和，这是一个全局统计指标，展示整个系统的活跃度。"
      },
      {
        subtitle: "18. 累计标签",
        text: "显示所有用户的累计标签数量总和（包括全局标签和个人标签），这是一个全局统计指标。"
      },
      {
        subtitle: "19. 累计使用天数",
        text: "显示您使用好友记系统的累计天数，记录您的人脉管理历程。"
      }
    ]
  },
  {
    id: "contacts",
    icon: Users,
    title: "人脉管理",
    color: "text-green-600",
    content: [
      {
        subtitle: "添加人脉",
        text: "点击首页右上角的添加人脉按钮，填写人脉的基本信息（姓名、电话、微信等）和扩展信息（公司、职位等）。您还可以为人脉打上标签，方便分类管理。"
      },
      {
        subtitle: "编辑人脉信息",
        text: "在人脉详情页点击编辑信息按钮，可以修改基本信息和扩展信息。扩展信息会显示在详情页的第一个容器中，方便查看。"
      },
      {
        subtitle: "联络记录",
        text: "点击人脉详情页顶部的记录联络按钮，可以快速记录与该人脉的联络情况。系统会自动统计：\\n• 上次联络时间\\n• 联络次数\\n• 平均联络间隔\\n• 最长间隔\\n• 本月联络次数"
      },
      {
        subtitle: "引荐人功能",
        text: "在人脉详情页最底部的引荐人容器中，可以设置该人脉的引荐人。系统会自动计算引荐贡献分，帮助您了解人脉网络的来源和质量。"
      }
    ]
  },
  {
    id: "tags",
    icon: Tags,
    title: "标签系统",
    color: "text-[#A80000]",
    content: [
      {
        subtitle: "标签分类",
        text: "好友记采用两层标签系统：\\n• 全局标签：所有人脉共用的标签，如客户、朋友、家人等\\n• 个人标签：针对特定人脉的自定义标签，更灵活"
      },
      {
        subtitle: "关注级别标签",
        text: "使用以下标签可以启用智能提醒功能：\\n• 周关注：重要人脉，每周至少联络一次\\n• 月关注：常规人脉，每月至少联络一次\\n• 季关注：一般人脉，每季度至少联络一次"
      },
      {
        subtitle: "标签管理",
        text: "在人脉详情页的标签容器中，可以添加、编辑或删除标签。所有标签都支持自定义，没有预设标签限制。"
      }
    ]
  },
  {
    id: "region",
    icon: MapPin,
    title: "区域筛选",
    color: "text-orange-600",
    content: [
      {
        subtitle: "功能说明",
        text: "点击首页顶部的区域按钮，可以按地区筛选人脉。系统会自动统计每个地区的人脉数量，方便您管理不同地区的人脉关系。"
      }
    ]
  },
  {
    id: "share",
    icon: Share2,
    title: "人脉共享",
    color: "text-teal-600",
    content: [
      {
        subtitle: "功能说明",
        text: "通过共享功能，您可以与团队成员共享人脉资源，实现人脉网络的协同管理。被共享的人脉会显示在对方的人脉列表中，但无法编辑。"
      }
    ]
  },
  {
    id: "stats",
    icon: BarChart3,
    title: "数据统计",
    color: "text-indigo-600",
    content: [
      {
        subtitle: "联络统计",
        text: "在人脉详情页的联络统计容器中，可以查看该人脉的详细联络数据，包括上次联络时间、联络次数、平均间隔等。您还可以配置显示哪些统计项。"
      }
    ]
  },
  {
    id: "reminders",
    icon: Bell,
    title: "提醒功能",
    color: "text-yellow-600",
    content: [
      {
        subtitle: "生日提醒",
        text: "为人脉设置生日后，系统会在生日当天自动提醒您，避免错过重要的祝福时机。"
      }
    ]
  },
  {
    id: "admin",
    icon: TrendingUp,
    title: "后台管理",
    color: "text-red-600",
    content: [
      {
        subtitle: "权限说明",
        text: "只有超级管理员才能访问后台管理页面。在个人中心页面，超级管理员会看到管理功能板块，点击后台管理按钮即可进入。"
      },
      {
        subtitle: "功能模块",
        text: "• 用户管理：查看和管理所有用户账号\\n• 邀请管理：管理邀请码和邀请记录\\n• 知识库：管理系统知识库内容\\n• 系统设置：配置全局系统参数"
      }
    ]
  },
  {
    id: "pwa",
    icon: Smartphone,
    title: "PWA 桌面应用",
    color: "text-pink-600",
    content: [
      {
        subtitle: "什么是 PWA？",
        text: "PWA（Progressive Web App，渐进式 Web 应用）是一种结合了网页和原生应用优点的技术。您可以将脉动安装到手机桌面，像使用普通 App 一样打开和使用，无需从应用商店下载。"
      },
      {
        subtitle: "安装优势",
        text: "• 桌面图标：在手机桌面显示脉动图标，一键打开\\n• 全屏体验：去除浏览器地址栏，获得更大的显示空间\\n• 离线访问：支持离线缓存，无网络时也能浏览已缓存的内容\\n• 快速启动：启动速度更快，无需等待浏览器加载\\n• 自动更新：应用会自动更新到最新版本，无需手动下载"
      },
      {
        subtitle: "Android 手机安装步骤",
        text: "1、在 Chrome 或 Edge 浏览器中打开脉动\\n2、当页面底部弹出安装提示时，点击“立即安装”按钮\\n3、或者点击浏览器右上角菜单（三个点），选择“添加到主屏幕”\\n4、确认安装，等待几秒钟\\n5、安装完成后，桌面上会出现脉动图标\\n\\n💡 小贴士：如果没有看到安装提示，请尝试刷新页面或使用浏览器菜单手动添加。"
      },
      {
        subtitle: "iPhone/iPad 安装步骤",
        text: "1、在 Safari 浏览器中打开脉动\\n2、点击底部工具栏中间的“分享”按钮（方框+箭头图标）\\n3、在弹出菜单中向下滚动，找到并点击“添加到主屏幕”\\n4、点击右上角的“添加”按钮\\n5、安装完成后，主屏幕上会出现脉动图标\\n\\n💡 小贴士：iOS 设备必须使用 Safari 浏览器才能安装 PWA，Chrome 或其他浏览器不支持。"
      },
      {
        subtitle: "常见问题",
        text: "Q：安装后如何卸载？\\nA：Android 设备长按图标选择卸载；iOS 设备长按图标选择“删除 App”。\\n\\nQ：安装后会占用很多存储空间吗？\\nA：PWA 应用非常轻量，只会缓存必要的资源，通常只占用几 MB 空间。\\n\\nQ：安装后需要联网使用吗？\\nA：大部分功能需要联网，但已缓存的页面和数据可以离线浏览。\\n\\nQ：安装后如何更新？\\nA：应用会自动检测并更新到最新版本，无需手动操作。"
      },
      {
        subtitle: "技术原理",
        text: "脉动使用了 Service Worker 技术实现离线缓存和快速加载。当您访问过一次后，应用会自动缓存关键资源，下次打开时会优先使用缓存，大大提升加载速度。同时，应用会在后台自动检查更新，确保您始终使用最新版本。"
      }
    ]
  }
];

export default function Academy() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // 检查 URL 锤点，自动展开对应模块
  useEffect(() => {
    const hash = window.location.hash.slice(1); // 移除 # 号
    if (hash && featureSections.some(s => s.id === hash)) {
      setExpandedItems([hash]);
      // 等待 DOM 渲染后滚动到目标位置
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, []);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return featureSections;
    }

    const query = searchQuery.toLowerCase();
    return featureSections.filter(section => {
      if (section.title.toLowerCase().includes(query)) {
        return true;
      }
      return section.content.some(item => 
        item.subtitle.toLowerCase().includes(query) || 
        item.text.toLowerCase().includes(query)
      );
    });
  }, [searchQuery]);

  useMemo(() => {
    if (searchQuery.trim() && filteredSections.length > 0) {
      setExpandedItems(filteredSections.map(s => s.id));
    } else if (!searchQuery.trim()) {
      setExpandedItems([]);
    }
  }, [searchQuery, filteredSections]);

  const highlightText = (text: string) => {
    if (!searchQuery.trim()) {
      return text;
    }

    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return parts.map((part, index) => {
      if (part.toLowerCase() === searchQuery.toLowerCase()) {
        return <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{part}</mark>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container max-w-4xl py-8 px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <GraduationCap className="h-12 w-12 text-indigo-600" />
            <h1 className="text-4xl font-bold text-[#A80000]">
              脉动学院
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            掌握好友记的每一个功能，让人脉管理更高效
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="搜索功能说明..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-sm text-muted-foreground mt-2">
                找到 {filteredSections.length} 个相关功能模块
              </p>
            )}
          </CardContent>
        </Card>

        {filteredSections.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>功能使用指南</CardTitle>
              <CardDescription>点击展开查看详细说明</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion 
                type="multiple" 
                value={expandedItems}
                onValueChange={setExpandedItems}
                className="w-full"
              >
                {filteredSections.map((section) => (
                  <AccordionItem key={section.id} value={section.id} id={section.id}>
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <section.icon className={`h-5 w-5 ${section.color}`} />
                        <span className="font-semibold">{highlightText(section.title)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 text-sm">
                      {section.content.map((item, index) => (
                        <div key={index}>
                          <h4 className="font-semibold mb-2">{highlightText(item.subtitle)}</h4>
                          <div className="text-muted-foreground whitespace-pre-line">
                            {highlightText(item.text)}
                          </div>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">未找到匹配的功能说明</p>
              <Button
                variant="link"
                onClick={() => setSearchQuery("")}
                className="mt-2"
              >
                清除搜索
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
          <CardContent className="pt-6">
            <p className="text-sm text-center text-muted-foreground">
              💡 <strong>小贴士：</strong>如果您在使用过程中遇到问题，可以随时返回脉动学院查看相关功能说明。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
