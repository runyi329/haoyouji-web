import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Tag, MapPin, Share2, BarChart3, LogIn, LogOut, User, UserCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReferrerPodium } from "@/components/ReferrerPodium";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Feature {
  id: number;
  title: string;
}



// 功能1卡片 - 人脉总数统计
function ContactsStatsCard({ totalContacts, onClick, dragListeners }: { totalContacts: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="group hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400">人脉总数</p>
        <p className="font-bold text-blue-700 dark:text-blue-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - totalContacts.toString().length * 0.3)}rem, 1.875rem)` }}>
          {totalContacts}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能2卡片 - 本周新增
function WeeklyNewCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">本周新增</p>
        <p className="font-bold text-green-700 dark:text-green-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}
        </p>
      </CardContent>
    </Card>
  );
}

// 功能3卡片 - 本月新增
function MonthlyNewCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">本月新增</p>
        <p className="font-bold text-orange-700 dark:text-orange-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能4卡片 - 本年新增
function YearlyNewCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border-purple-200 dark:border-purple-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-purple-600 dark:text-purple-400">今年新增</p>
        <p className="font-bold text-purple-700 dark:text-purple-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能5卡片 - 平均联络间隔
function AverageIntervalCard({ days, dragListeners }: { days: number; dragListeners?: any }) {
  return (
    <Card className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center">
      <CardContent {...dragListeners} className="flex flex-col items-center justify-center gap-2 py-3 px-2 md:cursor-grab md:active:cursor-grabbing">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">联络频率</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - days.toString().length * 0.3)}rem, 1.875rem)` }}>
          {days}<span className="text-xs sm:text-sm font-normal">天</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能6卡片 - 需要关注
function NeedsAttentionCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 border-red-200 dark:border-red-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">需要关注</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能7卡片 - 本月活跃
function MonthlyActiveCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400">本月活跃</p>
        <p className="font-bold text-indigo-700 dark:text-indigo-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能8卡片 - 本周活跃
function WeeklyActiveCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">本周活跃</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能9卡片 - 今年活跃
function YearlyActiveCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200 dark:border-violet-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-violet-600 dark:text-violet-400">今年活跃</p>
        <p className="font-bold text-violet-700 dark:text-violet-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能10卡片 - 拉黑名单
function BlacklistCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-red-200 dark:border-red-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">拉黑名单</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能11卡片 - 今日提醒
function TodayRemindersCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 border-red-300 dark:border-red-700 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">今日提醒</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能12卡片 - 本周提醒
function WeekRemindersCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30 border-orange-300 dark:border-orange-700 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">本周提醒</p>
        <p className="font-bold text-orange-700 dark:text-orange-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能13卡片 - 本月提醒
function MonthRemindersCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-300 dark:border-yellow-700 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">本月提醒</p>
        <p className="font-bold text-yellow-700 dark:text-yellow-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能14卡片 - 今日活跃
function TodayActiveCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30 border-cyan-200 dark:border-cyan-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-cyan-600 dark:text-cyan-400">今日活跃</p>
        <p className="font-bold text-cyan-700 dark:text-cyan-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能15卡片 - 休眠名单
function DormantCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/30 dark:to-slate-950/30 border-gray-300 dark:border-gray-700 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">休眠名单</p>
        <p className="font-bold text-gray-700 dark:text-gray-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能16卡片 - 公司数量
function CompanyCountCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">公司数量</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">家</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能17卡片 - 累计联络
function TotalInteractionCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30 border-pink-200 dark:border-pink-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-pink-600 dark:text-pink-400">累计联络</p>
        <p className="font-bold text-pink-700 dark:text-pink-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">次</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能18卡片 - 累计标签
function TotalTagCard({ count, onClick, dragListeners }: { count: number; onClick?: () => void; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 flex flex-col justify-center cursor-pointer select-none"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400">累计标签</p>
        <p className="font-bold text-indigo-700 dark:text-indigo-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - count.toString().length * 0.3)}rem, 1.875rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">个</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能19卡片 - 累计使用天数
function TotalUsageDaysCard({ days, dragListeners }: { days: number; dragListeners?: any }) {
  return (
    <Card 
      {...dragListeners}
      className="hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800 flex flex-col justify-center cursor-pointer select-none"
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-3 px-2">
        <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">累计使用</p>
        <p className="font-bold text-amber-700 dark:text-amber-300" style={{ fontSize: `clamp(1.25rem, ${Math.max(1.5, 3 - days.toString().length * 0.3)}rem, 1.875rem)` }}>
          {days}<span className="text-xs sm:text-sm font-normal">天</span>
        </p>
      </CardContent>
    </Card>
  );
}

interface StatsData {
  totalContacts: number;
  newThisWeek: number;
  newThisMonth: number;
  newThisYear: number;
  averageInteractionInterval: number;
  needsAttentionCount: number;
  monthlyActiveCount: number;
  weeklyActive: number;
  yearlyActive: number;
  blacklistCount: number;
  todayReminders: number;
  weekReminders: number;
  monthReminders: number;
  todayActive: number;
  dormantCount: number;
  companyCount: number;
  totalInteractionCount: number;
  totalTagCount: number;
  totalUsageDays: number;
}

function SortableFeatureCard({ feature, stats }: { feature: Feature; stats: StatsData }) {
  const [, setLocation] = useLocation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    // 拖拽时放大5%，增加视觉反馈
    scale: isDragging ? 1.05 : 1,
    // 拖拽时增加阴影，更明显的悬浮效果
    boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.15)' : undefined,
    // 阻止触摸滚动，避免拖拽时页面跟着移动
    touchAction: 'none',
  };

  // 功能1显示人脉总数
  if (feature.id === 1) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <ContactsStatsCard 
          totalContacts={stats.totalContacts} 
          onClick={() => setLocation('/parent/contacts/list')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能2显示本周新增
  if (feature.id === 2) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeeklyNewCard 
          count={stats.newThisWeek} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisWeek')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能3显示本月新增
  if (feature.id === 3) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthlyNewCard 
          count={stats.newThisMonth} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisMonth')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能4显示本年新增
  if (feature.id === 4) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <YearlyNewCard 
          count={stats.newThisYear} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisYear')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能5显示平均联络间隔
  if (feature.id === 5) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <AverageIntervalCard days={stats.averageInteractionInterval} dragListeners={listeners} />
      </div>
    );
  }

  // 功能6显示需要关注
  if (feature.id === 6) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <NeedsAttentionCard 
          count={stats.needsAttentionCount} 
          onClick={() => setLocation('/parent/contacts/list?filter=needsAttention')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能7显示本月活跃
  if (feature.id === 7) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthlyActiveCard 
          count={stats.monthlyActiveCount} 
          onClick={() => setLocation('/parent/contacts/list?filter=monthlyActive')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能8显示本周活跃
  if (feature.id === 8) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeeklyActiveCard 
          count={stats.weeklyActive} 
          onClick={() => setLocation('/parent/contacts/list?filter=weeklyActive')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能9显示今年活跃
  if (feature.id === 9) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <YearlyActiveCard 
          count={stats.yearlyActive} 
          onClick={() => setLocation('/parent/contacts/list?filter=yearlyActive')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能10显示拉黑名单
  if (feature.id === 10) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <BlacklistCard 
          count={stats.blacklistCount} 
          onClick={() => setLocation('/parent/contacts/list?filter=blacklist')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能11显示今日提醒
  if (feature.id === 11) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TodayRemindersCard 
          count={stats.todayReminders} 
          onClick={() => setLocation('/parent/contacts/list?filter=todayReminders')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能12显示本周提醒
  if (feature.id === 12) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeekRemindersCard 
          count={stats.weekReminders} 
          onClick={() => setLocation('/parent/contacts/list?filter=weekReminders')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能13显示本月提醒
  if (feature.id === 13) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthRemindersCard 
          count={stats.monthReminders} 
          onClick={() => setLocation('/parent/contacts/list?filter=monthReminders')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能14显示今日活跃
  if (feature.id === 14) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TodayActiveCard 
          count={stats.todayActive} 
          onClick={() => setLocation('/parent/contacts/list?filter=todayActive')}
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能15显示休眠名单
  if (feature.id === 15) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <DormantCard 
          count={stats.dormantCount} 
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能16显示公司数量
  if (feature.id === 16) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <CompanyCountCard 
          count={stats.companyCount} 
          dragListeners={listeners}
          onClick={() => setLocation('/parent/contacts/list?view=company')}
        />
      </div>
    );
  }

  // 功能17显示累计联络
  if (feature.id === 17) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalInteractionCard 
          count={stats.totalInteractionCount} 
          dragListeners={listeners}
        />
      </div>
    );
  }

  // 功能18显示累计标签
  if (feature.id === 18) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalTagCard 
          count={stats.totalTagCount} 
          dragListeners={listeners}
          onClick={() => setLocation('/parent/contacts/tag-search')}
        />
      </div>
    );
  }

  // 功能19显示累计使用天数
  if (feature.id === 19) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalUsageDaysCard 
          days={stats.totalUsageDays} 
          dragListeners={listeners}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing aspect-square">
      {/* 手机端使用更紧凑的卡片样式 */}
      <Card className="hover:shadow-lg transition-shadow h-full">
        <CardHeader className="p-2 sm:p-4 pb-1 sm:pb-2">
          <CardTitle className="text-center text-muted-foreground text-xs sm:text-sm md:text-base">
            {feature.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center p-2 sm:p-4 pt-1 sm:pt-2">
          <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground">待添加</p>
        </CardContent>
      </Card>
    </div>
  );
}

const SEARCH_HISTORY_KEY = "contactsSearchHistory";
const MAX_HISTORY_ITEMS = 5;

export default function ContactsManagement() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // 邀请码验证相关state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteTarget, setInviteTarget] = useState<"data" | "share" | null>(null);
  
  // 从 localStorage 读取搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  
  // 获取人脉统计数据
  const { data: stats } = trpc.contacts.stats.useQuery();
  
  // 获取人脉健康度统计数据
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery(undefined);
  
  // 获取提醒统计数据
  const { data: todayReminders } = trpc.contacts.reminders.todayCount.useQuery();
  const { data: weekReminders } = trpc.contacts.reminders.weekCount.useQuery();
  const { data: monthReminders } = trpc.contacts.reminders.monthCount.useQuery();
  
  // 获取累计联络次数
  const { data: totalInteractionCount } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取累计标签数量
  const { data: totalTagCount } = trpc.contacts.totalTagCount.useQuery();
  
  // 获取累计使用天数
  const { data: totalUsageDays } = trpc.contacts.getTotalUsageDays.useQuery();
  
  // 获取当前用户信息
  const { user, isAuthenticated, logout } = useAuth();
  
  // 共享功能对所有用户开放，不再需要权限检查
  const hasSharingPermission = true;
  
  // 获取人脉列表（支持搜索）
  const { data: contacts, isLoading } = trpc.contacts.list.useQuery({
    searchQuery: searchQuery || undefined,
  });
  
  // 获取共享给我的人脉列表
  const { data: sharedContacts } = trpc.sharing.getSharedContacts.useQuery();
  
  // stats.totalContacts 已经包含了自己的 + 共享的联系人总数，不需要再加
  const totalContactsWithShared = stats?.totalContacts || 0;
  
  // 点击外部关闭下拉列表和历史记录
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // 搜索框输入时显示下拉列表
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowDropdown(e.target.value.trim().length > 0);
    setShowHistory(false);
  };
  
  // 搜索框获得焦点时显示历史记录
  const handleSearchFocus = () => {
    if (!searchQuery && searchHistory.length > 0) {
      setShowHistory(true);
    }
  };
  
  // 保存搜索历史
  const saveSearchHistory = (query: string) => {
    if (!query.trim()) return;
    
    const newHistory = [query, ...searchHistory.filter(item => item !== query)].slice(0, MAX_HISTORY_ITEMS);
    setSearchHistory(newHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };
  
  // 点击人脉项跳转到详情页
  const handleContactClick = (contactId: number) => {
    // 保存搜索历史
    if (searchQuery.trim()) {
      saveSearchHistory(searchQuery.trim());
    }
    
    setShowDropdown(false);
    setShowHistory(false);
    setSearchQuery("");
    setLocation(`/parent/contacts/${contactId}`);
  };
  
  // 点击历史记录项
  const handleHistoryClick = (query: string) => {
    setSearchQuery(query);
    setShowHistory(false);
    setShowDropdown(true);
  };
  
  // 删除单条历史记录
  const handleDeleteHistory = (query: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = searchHistory.filter(item => item !== query);
    setSearchHistory(newHistory);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };
  
  // 清空所有历史记录
  const handleClearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setShowHistory(false);
  };
  
  // 获取人脉的全局字段值（公司、职位等）
  const { data: fieldCategories } = trpc.contacts.fieldCategories.list.useQuery();
  
  const getFieldValue = (contact: any, fieldName: string) => {
    if (!contact.fieldValues || !fieldCategories) return "";
    const category = fieldCategories.find(c => c.name === fieldName);
    if (!category) return "";
    const fieldValue = contact.fieldValues.find((fv: any) => fv.categoryId === category.id);
    return fieldValue?.value || "";
  };
  
  // 限制下拉列表最多显示10条
  const dropdownContacts = contacts?.slice(0, 10) || [];
  
  // 从数据库加载容器顺序
  const { data: featureOrderData, isLoading: isLoadingOrder } = trpc.contacts.featureOrder.get.useQuery();
  const saveFeatureOrderMutation = trpc.contacts.featureOrder.save.useMutation();

  // features状态：从API加载或使用默认值
  const [features, setFeatures] = useState<Feature[]>(() => {
    // 初始化时使用默认顺序，等待API返回
    return generateDefaultFeatures();
  });

  // 当API返回数据时，更新features
  useEffect(() => {
    if (featureOrderData) {
      const apiFeatures = featureOrderData.map(f => ({
        id: f.featureId,
        title: f.title,
      }));
      
      // 如果API返回的功能数量少于19，自动补充到19个
      if (apiFeatures.length < 19) {
        const maxId = Math.max(...apiFeatures.map(f => f.id), 0);
        const additionalFeatures = Array.from(
          { length: 19 - apiFeatures.length },
          (_, i) => ({
            id: maxId + i + 1,
            title: `功能${maxId + i + 1}`,
          })
        );
        setFeatures([...apiFeatures, ...additionalFeatures]);
      } else {
        setFeatures(apiFeatures);
      }
    }
  }, [featureOrderData]);

  // 生成19个默认功能容器（fallback）
  function generateDefaultFeatures(): Feature[] {
    return Array.from({ length: 19 }, (_, i) => ({
      id: i + 1,
      title: `功能${i + 1}`,
    }));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,  // 长按250ms后才激活拖拽（从500ms减少到250ms，更灵敏）
        tolerance: 8,  // 允许8px的移动误差（增加容错）
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 拖拽开始时触发震动反馈
  const handleDragStart = () => {
    // 检查浏览器是否支持Vibration API
    if ('vibrate' in navigator) {
      // 震动50毫秒，轻微的触觉反馈
      navigator.vibrate(50);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFeatures((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // 保存到数据库
        saveFeatureOrderMutation.mutate({
          orders: newItems.map((item, index) => ({
            featureId: item.id,
            position: index,
          })),
        }, {
          onError: (error) => {
            console.error('保存容器顺序失败:', error);
            toast.error('保存失败，请重试');
          },
        });
        
        return newItems;
      });
      toast.success("位置已调整");
    }
  };

  const handleAddContact = () => {
    setLocation("/parent/contacts/add");
  };
  
  // 处理数据分析按钮点击
  const handleDataClick = () => {
    setInviteTarget("data");
    setShowInviteDialog(true);
  };
  
  // 处理共享按钮点击
  const handleShareClick = () => {
    setInviteTarget("share");
    setShowInviteDialog(true);
  };
  
  // 验证邀请码
  const handleInviteCodeSubmit = () => {
    if (inviteCode === "1116") {
      setShowInviteDialog(false);
      setInviteCode("");
      
      // 根据目标跳转到相应页面
      if (inviteTarget === "data") {
        setLocation('/parent/contacts/data-comparison');
      } else if (inviteTarget === "share") {
        setLocation('/parent/contacts/sharing');
      }
      setInviteTarget(null);
    } else {
      toast.error("邀请码错误，请重试");
    }
  };

  return (
    <div className="container py-4 sm:py-8 px-2 sm:px-4">
      {/* 页面标题 - 手机端更紧凑 */}
      <div className="mb-4 sm:mb-8">
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">
            好友记{user && <span className="text-muted-foreground font-normal">×{user.name || user.username}</span>}
          </h1>
          
          {/* 登录/用户按钮 */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white overflow-hidden p-0"
                  >
                    {user?.avatar ? (
                      <img 
                        src={user.avatar} 
                        alt="用户头像" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => window.location.href = "/parent/profile"}>
                    <UserCircle className="mr-2 h-4 w-4" />
                    个人中心
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      logout();
                      toast.success("已退出登录");
                    }}
                    className="text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge
                variant="outline"
                className="cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors px-3 py-1.5 text-sm font-normal"
                onClick={() => window.location.href = "/login"}
              >
                <LogIn className="h-3.5 w-3.5 mr-1.5" />
                登录
              </Badge>
            )}
          </div>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-6">管理您的社交网络，维护重要关系</p>
        

        
        {/* 搜索框、标签管理和添加按钮 */}
        <div className="flex gap-2 sm:gap-4">
          <div ref={searchRef} className="relative flex-1">
            <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground z-10" />
            <Input
              placeholder="搜索人脉..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              className="pl-7 sm:pl-10 h-8 sm:h-10 text-sm"
            />
            
            {/* 搜索下拉列表 */}
            {showDropdown && dropdownContacts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                {dropdownContacts.map((contact: any) => {
                  const company = getFieldValue(contact, "公司");
                  const position = getFieldValue(contact, "职位");
                  
                  return (
                    <div
                      key={contact.id}
                      onClick={() => handleContactClick(contact.id)}
                      className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm sm:text-base truncate">{contact.name}</span>
                            {contact.title && (
                              <span className="text-xs sm:text-sm text-muted-foreground truncate">{contact.title}</span>
                            )}
                          </div>
                          {(company || position) && (
                            <div className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                              {company && <span>{company}</span>}
                              {company && position && <span className="mx-1">·</span>}
                              {position && <span>{position}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* 搜索无结果提示 */}
            {showDropdown && searchQuery && dropdownContacts.length === 0 && !isLoading && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50">
                <p className="text-sm text-muted-foreground text-center">未找到匹配的人脉</p>
              </div>
            )}
            
            {/* 搜索历史记录 */}
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs sm:text-sm text-muted-foreground">搜索历史</span>
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    清空
                  </button>
                </div>
                {searchHistory.map((query, index) => (
                  <div
                    key={index}
                    onClick={() => handleHistoryClick(query)}
                    className="px-3 sm:px-4 py-2 sm:py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Search className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{query}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteHistory(query, e)}
                      className="text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                    >
                      <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button 
            onClick={() => setLocation('/parent/contacts/list')}
            size="sm" 
            variant="outline"
            className="h-8 sm:h-10 px-2 sm:px-4"
          >
            <Tag className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">标签</span>
          </Button>
          <Button 
            onClick={() => setLocation('/parent/contacts/map')}
            size="sm" 
            variant="outline"
            className="h-8 sm:h-10 px-2 sm:px-4"
          >
            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">区域</span>
          </Button>
          <Button 
            onClick={handleShareClick}
            size="sm" 
            variant="outline"
            disabled={!hasSharingPermission}
            className="h-8 sm:h-10 px-2 sm:px-4"
          >
            <Share2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">共享</span>
          </Button>
          <Button 
            onClick={handleDataClick}
            size="sm" 
            variant="outline"
            className="h-8 sm:h-10 px-2 sm:px-4"
          >
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">数据</span>
          </Button>
          <Button onClick={handleAddContact} size="sm" className="h-8 sm:h-10 px-2 sm:px-4">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">添加人脉</span>
          </Button>
        </div>
      </div>

      {/* 4×4网格布局（手机端）- 支持拖拽排序 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={features} strategy={rectSortingStrategy}>
          {/* 手机端4列，平板3列，桌面4列 */}
          <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-3 md:gap-4 touch-none">
            {features.map((feature) => (
              <SortableFeatureCard 
                key={feature.id} 
                feature={feature} 
                stats={{
                  totalContacts: totalContactsWithShared,
                  newThisWeek: stats?.newThisWeek || 0,
                  newThisMonth: stats?.newThisMonth || 0,
                  newThisYear: stats?.newThisYear || 0,
                  averageInteractionInterval: overviewStats?.averageInteractionInterval || 0,
                  needsAttentionCount: overviewStats?.needsAttentionCount || 0,
                  monthlyActiveCount: overviewStats?.monthlyActiveCount || 0,
                  weeklyActive: stats?.weeklyActive || 0,
                  yearlyActive: stats?.yearlyActive || 0,
                  blacklistCount: stats?.blacklistCount || 0,
                  todayReminders: todayReminders || 0,
                  weekReminders: weekReminders || 0,
                  monthReminders: monthReminders || 0,
                  todayActive: stats?.todayActive || 0,
                  dormantCount: stats?.dormantCount || 0,
                  companyCount: stats?.companyCount || 0,
                  totalInteractionCount: totalInteractionCount || 0,
                  totalTagCount: totalTagCount || 0,
                  totalUsageDays: totalUsageDays || 0,
                }} 
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 人脉列表已移至独立页面 /parent/contacts/list */}

      {/* 介绍人贡献排行榜 - 领奖台 */}
      <ReferrerLeaderboardSection />
      
      {/* 邀请码验证对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>请输入邀请码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              type="password"
              placeholder="请输入邀请码"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleInviteCodeSubmit();
                }
              }}
              autoFocus
            />
            <p className="text-sm text-muted-foreground">
              该功能正在建设中，需要邀请码才能访问
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowInviteDialog(false);
              setInviteCode("");
              setInviteTarget(null);
            }}>
              取消
            </Button>
            <Button onClick={handleInviteCodeSubmit}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 介绍人排行榜区域组件
function ReferrerLeaderboardSection() {
  const { data: referrerStats, isLoading } = trpc.contacts.referrerStats.leaderboard.useQuery();

  if (isLoading) {
    return null; // 不显示加载中状态
  }

  if (!referrerStats || referrerStats.length === 0) {
    return null; // 没有介绍人数据时不显示
  }

  // 获取前3名
  const topThree = referrerStats.slice(0, 3);

  return (
    <div className="mt-8 p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <ReferrerPodium topThree={topThree} />
    </div>
  );
}
