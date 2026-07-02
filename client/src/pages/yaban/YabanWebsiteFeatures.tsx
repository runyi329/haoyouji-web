/**
 * 牙伴齿科管理 - 网站功能管理
 * 路由：/yaban/settings/website-features
 * 权限：院长 + 创始人可见
 * 功能：顾客来源设置（第1项），后续可扩展更多配置项
 * 注意：「聊天功能设置」创始人(isPureFounder)、创始股东(isCoFounder)、普通股东(shareholder) 均可见
 */
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, ChevronRight, Tags, Users, Heart, MessageSquare, CalendarClock, LayoutGrid } from "lucide-react";
import YabanClinicHeader from "./YabanClinicHeader";
import { trpc } from "@/lib/trpc";

export default function YabanWebsiteFeatures() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/profile");

  // 获取当前用户身份
  const meQuery = trpc.yabanRole.myMembership.useQuery();
  const isPureFounder: boolean = !!(meQuery.data as any)?.isPureFounder;
  const isCoFounder: boolean = !!(meQuery.data as any)?.isCoFounder;
  const isShareholder: boolean = !!((meQuery.data as any)?.roleBadges as string[] | undefined)?.includes("shareholder");
  // 聊天功能设置：创始人 / 创始股东 / 普通股东 均可见
  const canSeeChatSetting: boolean = isPureFounder || isCoFounder || isShareholder;

  const baseItems = [
    {
      key: "appt-config",
      icon: <CalendarClock className="w-5 h-5 text-[#1E88D6]" />,
      label: "客户预约设置",
      hint: "自定义新建预约的步骤数量和每步字段",
      onClick: () => navigate("/yaban/settings/appt-config"),
    },
    {
      key: "patient-type",
      icon: <Users className="w-5 h-5 text-[#1E88D6]" />,
      label: "顾客类型设置",
      hint: "自定义新建顾客时的顾客类型选项",
      onClick: () => navigate("/yaban/settings/patient-type"),
    },
    {
      key: "customer-source",
      icon: <Tags className="w-5 h-5 text-[#1E88D6]" />,
      label: "顾客来源设置",
      hint: "自定义新建顾客时的来源渠道选项",
      onClick: () => navigate("/yaban/settings/customer-source"),
    },
    {
      key: "relation-type",
      icon: <Heart className="w-5 h-5 text-[#1E88D6]" />,
      label: "亲友关系设置",
      hint: "自定义新建顾客时的亲友关系类型选项",
      onClick: () => navigate("/yaban/settings/relation-type"),
    },
    {
      key: "room-dept",
      icon: <LayoutGrid className="w-5 h-5 text-[#1E88D6]" />,
      label: "诊室科室设置",
      hint: "自定义诊室和科室名称，用于新建预约时选择",
      onClick: () => navigate("/yaban/settings/room-dept"),
    },
  ];

  // 创始人/股东专属入口
  const founderItems = canSeeChatSetting
    ? [
        {
          key: "chat-overview",
          icon: <MessageSquare className="w-5 h-5 text-[#1E88D6]" />,
          label: "聊天功能设置",
          hint: "查看客户与 AI 助手的全部对话记录",
          onClick: () => navigate("/yaban/settings/chat-overview"),
        },
      ]
    : [];

  const items = [...baseItems, ...founderItems];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">网站功能管理</span>
        </div>
        {/* 医院切换帽檐 */}
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-5">
        <div className="bg-white rounded overflow-hidden shadow-sm">
          {items.map((item, idx) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 ${
                idx < items.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="w-9 h-9 rounded-md bg-[#EBF4FC] flex items-center justify-center flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{item.label}</div>
                {item.hint && (
                  <div className="text-xs text-gray-400 mt-0.5 truncate">{item.hint}</div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
