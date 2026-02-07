import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Tag, MapPin, Share2, BarChart3, LogIn, LogOut, User, UserCircle, RefreshCcw, Bot, Settings, Square, Play } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReferrerPodium } from "@/components/ReferrerPodium";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
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
function ContactsStatsCard({ totalContacts, onClick, dragListeners, isBreathing }: { totalContacts: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`group hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-blue" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400">人脉总数</p>
        <p className="font-bold text-blue-700 dark:text-blue-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - totalContacts.toString().length * 0.175)}rem, 1.05rem)` }}>
          {totalContacts}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能2卡片 - 本周新增
function WeeklyNewCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-green" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-green-600 dark:text-green-400">本周新增</p>
        <p className="font-bold text-green-700 dark:text-green-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}
        </p>
      </CardContent>
    </Card>
  );
}

// 功能3卡片 - 本月新增
function MonthlyNewCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-orange" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-3 px-3">
        <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">本月新增</p>
        <p className="font-bold text-orange-700 dark:text-orange-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能4卡片 - 本年新增
function YearlyNewCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border-purple-200 dark:border-purple-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-purple" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-purple-600 dark:text-purple-400">今年新增</p>
        <p className="font-bold text-purple-700 dark:text-purple-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能5卡片 - 账目总数
function TotalEntriesCard({ count, dragListeners, isBreathing }: { count: number; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center ${
        isBreathing ? "animate-breathing-border-teal" : ""
      }`}>
      <CardContent {...dragListeners} className="flex flex-col items-center justify-center gap-1 py-2.5 px-2 md:cursor-grab md:active:cursor-grabbing">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">账目总数</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">条</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能6卡片 - 需要关注
function NeedsAttentionCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 border-red-200 dark:border-red-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-red" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">需要关注</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能7卡片 - 本月活跃
function MonthlyActiveCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-indigo" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400">本月活跃</p>
        <p className="font-bold text-indigo-700 dark:text-indigo-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能8卡片 - 本周活跃
function WeeklyActiveCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-teal" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">本周活跃</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能9卡片 - 今年活跃
function YearlyActiveCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 border-violet-200 dark:border-violet-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-violet-600 dark:text-violet-400">今年活跃</p>
        <p className="font-bold text-violet-700 dark:text-violet-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能10卡片 - 拉黑名单
function BlacklistCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 border-red-200 dark:border-red-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-red" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">拉黑名单</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能11卡片 - 今日提醒
function TodayRemindersCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 border-red-300 dark:border-red-700 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">今日提醒</p>
        <p className="font-bold text-red-700 dark:text-red-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能12卡片 - 本周提醒
function WeekRemindersCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30 border-orange-300 dark:border-orange-700 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-orange-600 dark:text-orange-400">本周提醒</p>
        <p className="font-bold text-orange-700 dark:text-orange-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能13卡片 - 本月提醒
function MonthRemindersCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-300 dark:border-yellow-700 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">本月提醒</p>
        <p className="font-bold text-yellow-700 dark:text-yellow-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能14卡片 - 今日活跃
function TodayActiveCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/30 border-cyan-200 dark:border-cyan-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-cyan-600 dark:text-cyan-400">今日活跃</p>
        <p className="font-bold text-cyan-700 dark:text-cyan-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能15卡片 - 休眠名单
function DormantCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/30 dark:to-slate-950/30 border-gray-300 dark:border-gray-700 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">休眠名单</p>
        <p className="font-bold text-gray-700 dark:text-gray-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能16卡片 - 公司数量
function CompanyCountCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 border-teal-200 dark:border-teal-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-teal" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-teal-600 dark:text-teal-400">公司数量</p>
        <p className="font-bold text-teal-700 dark:text-teal-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">家</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能17卡片 - 累计联络
function TotalInteractionCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30 border-pink-200 dark:border-pink-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-pink" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-2 py-2 px-3">
        <p className="text-xs sm:text-sm text-pink-600 dark:text-pink-400">累计联络</p>
        <p className="font-bold text-pink-700 dark:text-pink-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">次</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能18卡片 - 累计标签
function TotalTagCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-200 dark:border-indigo-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-indigo" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400">累计标签</p>
        <p className="font-bold text-indigo-700 dark:text-indigo-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">个</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能19卡片 - 累计使用天数
function TotalUsageDaysCard({ days, dragListeners, isBreathing }: { days: number; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-amber-200 dark:border-amber-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border" : ""
      }`}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">累计使用</p>
        <p className="font-bold text-amber-700 dark:text-amber-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - days.toString().length * 0.175)}rem, 1.05rem)` }}>
          {days}<span className="text-xs sm:text-sm font-normal">天</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能20卡片 - 我的积分
function MyPointsCard({ points, onClick, dragListeners, isBreathing }: { points: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-200 dark:border-yellow-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-yellow" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-yellow-600 dark:text-yellow-400">我的积分</p>
        <p className="font-bold text-yellow-700 dark:text-yellow-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - points.toString().length * 0.175)}rem, 1.05rem)` }}>
          {points}<span className="text-xs sm:text-sm font-normal">分</span>
        </p>
      </CardContent>
    </Card>
  );
}

// 功能21卡片 - 邀请好友
function InviteFriendsCard({ count, onClick, dragListeners, isBreathing }: { count: number; onClick?: () => void; dragListeners?: any; isBreathing?: boolean }) {
  return (
    <Card 
      {...dragListeners}
      className={`hover:shadow-lg transition-shadow relative h-full bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30 border-rose-200 dark:border-rose-800 flex flex-col justify-center cursor-pointer select-none ${
        isBreathing ? "animate-breathing-border-rose" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center justify-center gap-1 py-2.5 px-3">
        <p className="text-xs sm:text-sm text-rose-600 dark:text-rose-400">邀请好友</p>
        <p className="font-bold text-rose-700 dark:text-rose-300" style={{ fontSize: `clamp(0.7rem, ${Math.max(0.84, 1.68 - count.toString().length * 0.175)}rem, 1.05rem)` }}>
          {count}<span className="text-xs sm:text-sm font-normal">人</span>
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
  monthlyActive: number;
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
  totalLedgerEntries: number;
  inviteCount: number;
}

function SortableFeatureCard({ feature, stats, isBreathing }: { feature: Feature; stats: StatsData; isBreathing: boolean }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
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
          totalContacts={stats?.totalContacts || 0} 
          onClick={() => setLocation('/parent/contacts/list')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能2显示本周新增
  if (feature.id === 2) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeeklyNewCard 
          count={stats?.newThisWeek || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisWeek')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能3显示本月新增
  if (feature.id === 3) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthlyNewCard 
          count={stats?.newThisMonth || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisMonth')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能4显示本年新增
  if (feature.id === 4) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <YearlyNewCard 
          count={stats?.newThisYear || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=thisYear')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能5显示账目总数
  if (feature.id === 5) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalEntriesCard count={stats?.totalLedgerEntries || 0} dragListeners={listeners} isBreathing={isBreathing} />
      </div>
    );
  }

  // 功能6显示需要关注
  if (feature.id === 6) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <NeedsAttentionCard 
          count={stats?.needsAttentionCount || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=needsAttention')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能7显示本月活跃
  if (feature.id === 7) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthlyActiveCard 
          count={stats?.monthlyActive || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=monthlyActive')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能8显示本周活跃
  if (feature.id === 8) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeeklyActiveCard 
          count={stats?.weeklyActive || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=weeklyActive')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能9显示今年活跃
  if (feature.id === 9) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <YearlyActiveCard 
          count={stats?.yearlyActive || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=yearlyActive')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能10显示拉黑名单
  if (feature.id === 10) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <BlacklistCard 
          count={stats?.blacklistCount || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=blacklist')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能11显示今日提醒
  if (feature.id === 11) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TodayRemindersCard 
          count={stats?.todayReminders || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=todayReminders')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能12显示本周提醒
  if (feature.id === 12) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <WeekRemindersCard 
          count={stats?.weekReminders || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=weekReminders')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能13显示本月提醒
  if (feature.id === 13) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MonthRemindersCard 
          count={stats?.monthReminders || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=monthReminders')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能14显示今日活跃
  if (feature.id === 14) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TodayActiveCard 
          count={stats?.todayActive || 0} 
          onClick={() => setLocation('/parent/contacts/list?filter=todayActive')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能15显示休眠名单
  if (feature.id === 15) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <DormantCard 
          count={stats?.dormantCount || 0} 
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能16显示公司数量
  if (feature.id === 16) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <CompanyCountCard 
          count={stats?.companyCount || 0} 
          dragListeners={listeners}
          isBreathing={isBreathing}
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
          count={stats?.totalInteractionCount || 0} 
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能18显示累计标签
  if (feature.id === 18) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalTagCard 
          count={stats?.totalTagCount || 0} 
          dragListeners={listeners}
          isBreathing={isBreathing}
          onClick={() => setLocation('/parent/contacts/tag-analytics')}
        />
      </div>
    );
  }

  // 功能19显示累计使用天数
  if (feature.id === 19) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <TotalUsageDaysCard 
          days={stats?.totalUsageDays || 0} 
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能20显示我的积分
  if (feature.id === 20) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <MyPointsCard 
          points={user?.points || 0} 
          onClick={() => setLocation('/parent/profile')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  // 功能21显示邀请好友
  if (feature.id === 21) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className="aspect-square touch-none">
        <InviteFriendsCard 
          count={stats?.inviteCount || 0} 
          onClick={() => setLocation('/parent/profile/invite')}
          dragListeners={listeners}
          isBreathing={isBreathing}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing aspect-square">
      {/* 手机端使用更紧凑的卡片样式 */}
      <Card className={`hover:shadow-lg transition-shadow h-full ${
        isBreathing ? "animate-breathing-border" : ""
      }`}>
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
  
  // 添加滑动手势支持
  useSwipeGesture({
    onSwipeLeft: () => {
      // 向左滑动,切换到钱脉页面
      setLocation('/ledger');
      toast.success('切换到钱脉', { duration: 1000 });
    },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // 监控searchQuery变化，追踪是什么触发了查询
  useEffect(() => {
    console.log('[ContactsManagement] searchQuery变化:', searchQuery);
    console.trace('[ContactsManagement] searchQuery变化堆栈:');
  }, [searchQuery]);
  
  // 呼吸灯效果状态
  const [breathingCardId, setBreathingCardId] = useState<number | null>(null);
  
  // 随机呼吸灯效果
  useEffect(() => {
    const switchCard = () => {
      // 随机选择1-20之间的卡片ID
      const randomId = Math.floor(Math.random() * 20) + 1;
      setBreathingCardId(randomId);
      
      // 随机间隔3-5秒后切换下一个
      const randomDelay = 3000 + Math.random() * 2000; // 3000-5000ms
      setTimeout(switchCard, randomDelay);
    };
    
    // 初始启动
    switchCard();
    
    return () => {}; // cleanup不需要做什么,因为使用setTimeout
  }, []);
  
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
  const { data: stats, error: statsError, isLoading: statsLoading, refetch: refetchStats } = trpc.contacts.stats.useQuery(undefined, {
    refetchOnMount: 'always', // 确保页面重新进入时刷新数据
    staleTime: 0, // 设置数据立即过期，确保每次都重新获取
  });
  
  // 调试日志
  console.log('[ContactsManagement] stats数据:', stats);
  console.log('[ContactsManagement] stats错误:', statsError);
  console.log('[ContactsManagement] stats加载中:', statsLoading);
  
  // 获取人脉健康度统计数据
  const { data: overviewStats, refetch: refetchOverviewStats } = trpc.contacts.overviewStats.useQuery(undefined);
  
  // 获取提醒统计数据
  const { data: todayReminders, refetch: refetchTodayReminders } = trpc.contacts.reminders.todayCount.useQuery();
  const { data: weekReminders, refetch: refetchWeekReminders } = trpc.contacts.reminders.weekCount.useQuery();
  const { data: monthReminders, refetch: refetchMonthReminders } = trpc.contacts.reminders.monthCount.useQuery();
  
  // 获取累计联络次数
  const { data: totalInteractionCount, refetch: refetchTotalInteractionCount } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取累计标签数量
  const { data: totalTagCount, refetch: refetchTotalTagCount } = trpc.contacts.totalTagCount.useQuery();
  
  // 获取累计使用天数
  const { data: totalUsageDays, refetch: refetchTotalUsageDays } = trpc.contacts.getTotalUsageDays.useQuery();
  
  // 获取账目总数
  const { data: totalLedgerEntries, refetch: refetchTotalLedgerEntries } = trpc.contacts.totalLedgerEntries.useQuery();
  
  // 获取邀请统计
  const { data: inviteInfo } = trpc.invite.getMyInviteInfo.useQuery();
  
  // 自动生成模拟人脉功能状态
  const [showAutoGenerateDialog, setShowAutoGenerateDialog] = useState(false);
  const [dailyNewContacts, setDailyNewContacts] = useState("5");  // 每天生成新人脉数量
  const [dailyRandomInteractions, setDailyRandomInteractions] = useState("10");  // 每天随机联络数量
  const [dailyRandomTags, setDailyRandomTags] = useState("20");  // 每天随机打标签数量
  const [autoGenerateOptions, setAutoGenerateOptions] = useState({
    includePhone: true,
    includeEmail: true,
    includeAddress: true,
    includeBankAccount: true,
    includeCompany: true,
    includeInvoiceInfo: true,
  });
  
  // 检查自动生成权限
  const { data: autoGeneratePermission } = trpc.contacts.autoGenerate.checkPermission.useQuery();
  
  // 获取自动生成状态
  const { data: autoGenerateStatus, refetch: refetchAutoGenerateStatus } = trpc.contacts.autoGenerate.status.useQuery(undefined, {
    enabled: autoGeneratePermission?.allowed === true,
    refetchInterval: 5000, // 每5秒刷新一次状态
  });
  
  // 启动自动生成
  const startAutoGenerateMutation = trpc.contacts.autoGenerate.start.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setShowAutoGenerateDialog(false);
      refetchAutoGenerateStatus();
      refetchStats();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 停止自动生成
  const stopAutoGenerateMutation = trpc.contacts.autoGenerate.stop.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchAutoGenerateStatus();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  
  // 处理自动生成按钮点击
  const handleAutoGenerateClick = () => {
    if (autoGenerateStatus?.isRunning) {
      // 如果正在运行，确认是否停止
      if (confirm('自动生成正在运行中，是否停止？')) {
        stopAutoGenerateMutation.mutate();
      }
    } else {
      // 如果没有运行，打开设置弹窗
      setShowAutoGenerateDialog(true);
    }
  };
  
  // 启动自动生成
  const handleStartAutoGenerate = () => {
    startAutoGenerateMutation.mutate({
      dailyNewContacts: parseInt(dailyNewContacts) || 0,
      dailyRandomInteractions: parseInt(dailyRandomInteractions) || 0,
      dailyRandomTags: parseInt(dailyRandomTags) || 0,
      options: autoGenerateOptions,
    });
  };
  
  // 刷新状态
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  
  // 刷新所有数据
  const handleRefresh = async () => {
    if (isRefreshing) return; // 防止重复点击
    
    setIsRefreshing(true);
    try {
      // 强制重新获取数据，忽略缓存
      await Promise.all([
        refetchStats(),
        refetchOverviewStats(),
        refetchTodayReminders(),
        refetchWeekReminders(),
        refetchMonthReminders(),
        refetchTotalInteractionCount(),
        refetchTotalTagCount(),
        refetchTotalUsageDays(),
        refetchTotalLedgerEntries()
      ]);
      console.log('[handleRefresh] 数据刷新完成');
    } catch (error) {
      console.error('[handleRefresh] 刷新失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // 获取当前用户信息
  const { user, isAuthenticated, logout } = useAuth();
  
  // 共享功能对所有用户开放，不再需要权限检查
  const hasSharingPermission = true;
  
  // 获取人脉列表（支持搜索）
  // 注意：只在有搜索关键词时才查询，避免加载大量数据导致崩溃
  const { data: contacts, isLoading } = trpc.contacts.list.useQuery(
    {
      searchQuery: searchQuery || undefined,
    },
    {
      enabled: !!searchQuery, // 只在有searchQuery时才执行查询
    }
  );
  
  // 获取共享给我的人脉列表
  // 注意：禁用自动加载，因为当共享联系人很多时会导致页面卡顿/崩溃
  // 如果需要使用，应该在特定页面按需加载
  // const { data: sharedContacts } = trpc.sharing.getSharedContacts.useQuery();
  
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
    if (featureOrderData && featureOrderData.length > 0) {
      console.log('[ContactsManagement] 加载用户容器排序数据:', featureOrderData);
      
      const apiFeatures = featureOrderData.map(f => ({
        id: f.featureId,
        title: f.title,
      }));
      
      console.log('[ContactsManagement] 转换后的features:', apiFeatures);
      
      // 如果API返回的功能数量少于21，自动补充到21个
      if (apiFeatures.length < 21) {
        // 使用reduce避免栈溢出（Math.max(...array)在数组很大时会崩溃）
        const maxId = apiFeatures.reduce((max, f) => Math.max(max, f.id), 0);
        const additionalFeatures = Array.from(
          { length: 21 - apiFeatures.length },
          (_, i) => ({
            id: maxId + i + 1,
            title: `功能${maxId + i + 1}`,
          })
        );
        const finalFeatures = [...apiFeatures, ...additionalFeatures];
        console.log('[ContactsManagement] 最终features（包含补充）:', finalFeatures);
        setFeatures(finalFeatures);
      } else {
        console.log('[ContactsManagement] 最终features（无需补充）:', apiFeatures);
        setFeatures(apiFeatures);
      }
    }
  }, [featureOrderData]);

  // 生成21个默认功能容器（fallback）
  function generateDefaultFeatures(): Feature[] {
    return Array.from({ length: 21 }, (_, i) => ({
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
  
  // 处理数据分析按钮点击 - 直接跳转，不需要密码验证
  const handleDataClick = () => {
    setLocation('/parent/contacts/data-comparison');
  };
  
  // 处理共享按钮点击 - 直接跳转，不需要密码验证
  const handleShareClick = () => {
    setLocation('/parent/contacts/sharing');
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
    <div className="container py-4 sm:py-8 px-1 sm:px-4 pb-24 max-w-full overflow-x-hidden" style={{ touchAction: 'pan-y pinch-zoom' }}>
      {/* 页面标题 - 手机端更紧凑 */}
      <div className="mb-4 sm:mb-8">
        <div className="flex items-center justify-between mb-1 sm:mb-2">
          <div className="flex items-center gap-2">
            {/* Logo: 文字 + SVG 心电图 */}
            <div className="flex items-center gap-1">
              <span className="text-xl md:text-2xl font-bold text-foreground">脉动</span>
              <svg width="40" height="24" viewBox="0 0 40 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="-ml-1">
                <path d="M2 12 L8 12 L10 8 L12 16 L14 4 L16 20 L18 12 L22 12 L24 10 L26 14 L28 12 L38 12" 
                      stroke="#FF6B35" 
                      strokeWidth="2.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      fill="none" />
              </svg>
            </div>
            {user && <span className="text-lg sm:text-xl md:text-2xl text-muted-foreground font-normal">×{user.name || user.username}</span>}
          </div>
          
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
                    onClick={async () => {
                      await logout();
                      toast.success("已退出登录");
                      // 退出后跳转到登录页面
                      window.location.href = "/login";
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
        <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-6">让人脉动起来</p>
        

        
        {/* 标签管理和添加按钮 */}
        <div className="flex gap-2 sm:gap-4">
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
          <Button 
            onClick={handleRefresh}
            size="sm" 
            variant="outline"
            disabled={isRefreshing}
            className={`h-8 sm:h-10 px-2 sm:px-4 transition-colors ${isRefreshing ? 'bg-gray-200 text-gray-400' : ''}`}
          >
            <RefreshCcw className={`h-3 w-3 sm:h-4 sm:w-4 sm:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button onClick={handleAddContact} size="sm" className="h-8 sm:h-10 px-2 sm:px-4">
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">添加人脉</span>
          </Button>
          {/* 自动生成按钮 - 仅对有权限的用户显示 */}
          {autoGeneratePermission?.allowed && (
            <Button 
              onClick={handleAutoGenerateClick} 
              size="sm" 
              variant={autoGenerateStatus?.isRunning ? "destructive" : "outline"}
              className={`h-8 sm:h-10 px-2 sm:px-4 ${autoGenerateStatus?.isRunning ? 'animate-pulse' : ''}`}
            >
              {autoGenerateStatus?.isRunning ? (
                <>
                  <Square className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">停止</span>
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                  <span className="hidden sm:inline">自动</span>
                </>
              )}
            </Button>
          )}
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
          {/* 手机端4列,平板3列,桌面4列 - 使用min-w-0确保容器可以收缩 */}
          <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 gap-1 sm:gap-3 md:gap-4 touch-none w-full">
            {features.map((feature) => (
              <SortableFeatureCard 
                key={feature.id} 
                feature={feature}
                isBreathing={breathingCardId === feature.id}
                stats={{
                  totalContacts: totalContactsWithShared,
                  newThisWeek: stats?.newThisWeek || 0,
                  newThisMonth: stats?.newThisMonth || 0,
                  newThisYear: stats?.newThisYear || 0,
                  averageInteractionInterval: overviewStats?.averageInteractionInterval || 0,
                  needsAttentionCount: overviewStats?.needsAttentionCount || 0,
                  monthlyActive: stats?.monthlyActive || 0,
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
                  totalLedgerEntries: totalLedgerEntries || 0,
                  inviteCount: inviteInfo?.inviteCount || 0,
                }} 
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 人脉列表已移至独立页面 /parent/contacts/list */}

      {/* 介绍人贡献排行榜已移除 */}
      
      {/* 底部导航栏 */}
      <BottomNav />
      
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
      
      {/* 自动生成设置对话框 */}
      <Dialog open={showAutoGenerateDialog} onOpenChange={setShowAutoGenerateDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>自动生成设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* 每天生成新人脉 */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">每天生成新人脉</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={dailyNewContacts}
                  onChange={(e) => setDailyNewContacts(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">个/天</span>
              </div>
              
              {/* 生成内容选项 */}
              <div className="ml-4 space-y-2">
                <p className="text-sm text-muted-foreground">生成内容选项：</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includePhone"
                      checked={autoGenerateOptions.includePhone}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includePhone: !!checked }))}
                    />
                    <Label htmlFor="includePhone" className="text-sm">手机</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeEmail"
                      checked={autoGenerateOptions.includeEmail}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includeEmail: !!checked }))}
                    />
                    <Label htmlFor="includeEmail" className="text-sm">邮箱</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeAddress"
                      checked={autoGenerateOptions.includeAddress}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includeAddress: !!checked }))}
                    />
                    <Label htmlFor="includeAddress" className="text-sm">快递地址</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeBankAccount"
                      checked={autoGenerateOptions.includeBankAccount}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includeBankAccount: !!checked }))}
                    />
                    <Label htmlFor="includeBankAccount" className="text-sm">银行账号</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeCompany"
                      checked={autoGenerateOptions.includeCompany}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includeCompany: !!checked }))}
                    />
                    <Label htmlFor="includeCompany" className="text-sm">公司名称</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeInvoiceInfo"
                      checked={autoGenerateOptions.includeInvoiceInfo}
                      onCheckedChange={(checked) => setAutoGenerateOptions(prev => ({ ...prev, includeInvoiceInfo: !!checked }))}
                    />
                    <Label htmlFor="includeInvoiceInfo" className="text-sm">开票信息</Label>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 每天随机联络 */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">每天随机联络</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={dailyRandomInteractions}
                  onChange={(e) => setDailyRandomInteractions(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">次/天</span>
              </div>
              <p className="text-xs text-muted-foreground ml-4">随机选择已有人脉进行联络，联络方式和备注随机生成</p>
            </div>
            
            {/* 每天随机打标签 */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">每天随机打标签</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="200"
                  value={dailyRandomTags}
                  onChange={(e) => setDailyRandomTags(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">个/天（总量）</span>
              </div>
              <p className="text-xs text-muted-foreground ml-4">系统自动分配给不同人脉，标签内容由系统随机生成</p>
            </div>
            
            {/* 当前状态显示 */}
            {autoGenerateStatus?.isRunning && autoGenerateStatus?.config && (
              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">当前任务进度（今日）</p>
                <div className="text-xs text-green-600 dark:text-green-400 space-y-1">
                  <p>新人脉: {autoGenerateStatus.config.todayNewCount}/{autoGenerateStatus.config.dailyNewContacts}</p>
                  <p>随机联络: {autoGenerateStatus.config.todayInteractionCount}/{autoGenerateStatus.config.dailyRandomInteractions}</p>
                  <p>随机标签: {autoGenerateStatus.config.todayTagCount}/{autoGenerateStatus.config.dailyRandomTags}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoGenerateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleStartAutoGenerate} disabled={startAutoGenerateMutation.isPending}>
              {startAutoGenerateMutation.isPending ? '启动中...' : '启动自动任务'}
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
