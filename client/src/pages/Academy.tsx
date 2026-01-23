import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GraduationCap, Home, Users, Tags, MapPin, Share2, BarChart3, Bell, TrendingUp, Search, X } from "lucide-react";
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
        subtitle: "核心容器说明",
        text: "人脉总数：显示您的人脉总数（包括自己添加的和共享给您的）\\n本周新增：本周新添加的人脉数量\\n本月新增：本月新添加的人脉数量\\n今年新增：今年新添加的人脉数量\\n联络频率：您的平均联络间隔天数，数值越小表示联络越频繁"
      },
      {
        subtitle: "需要关注（智能提醒）",
        text: "这是一个基于标签的分级关注系统，会根据人脉的标签自动提醒您哪些人需要联络：\\n周关注标签：超过 7天 未联络会被标记\\n月关注标签：超过 30天 未联络会被标记\\n季关注标签：超过 90天 未联络会被标记\\n无标签：超过 180天 未联络会被标记\\n使用建议：为重要人脉打上周关注或月关注标签，系统会自动提醒您定期维护关系。"
      },
      {
        subtitle: "活跃度统计",
        text: "本月活跃：本月有过联络记录的人脉数量\\n本周活跃：本周有过联络记录的人脉数量\\n今日活跃：今天有过联络记录的人脉数量\\n休眠人脉：长时间未联络的人脉数量"
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
        text: "点击人脉详情页顶部的记录联络按钮，可以快速记录与该人脉的联络情况。系统会自动统计：\\n上次联络时间\\n联络次数\\n平均联络间隔\\n最长间隔\\n本月联络次数"
      }
    ]
  },
  {
    id: "tags",
    icon: Tags,
    title: "标签系统",
    color: "text-purple-600",
    content: [
      {
        subtitle: "标签分类",
        text: "好友记采用两层标签系统：\\n全局标签：所有人脉共用的标签，如客户、朋友、家人等\\n个人标签：针对特定人脉的自定义标签，更灵活"
      },
      {
        subtitle: "关注级别标签",
        text: "使用以下标签可以启用智能提醒功能：\\n周关注：重要人脉，每周至少联络一次\\n月关注：常规人脉，每月至少联络一次\\n季关注：一般人脉，每季度至少联络一次"
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
      }
    ]
  }
];

export default function Academy() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container max-w-4xl py-8 px-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <GraduationCap className="h-12 w-12 text-indigo-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              脉动学院
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">
            掌握好友记的每一个功能，让人脉管理更高效
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setLocation("/parent/profile")}
          className="mb-6"
        >
          <Home className="h-4 w-4 mr-2" />
          返回个人中心
        </Button>

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
                  <AccordionItem key={section.id} value={section.id}>
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

        <Card className="mt-6 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
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
