/**
 * 牙伴齿科管理 - 员工档案
 * 路由：/yaban/staff-profile
 * 展示本门店在职员工列表（复用 listClinicMembers），点击查看基本信息。
 * 严禁 Emoji，仅用 lucide-react 图标，配色沿用牙伴蓝青系。
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Search, User } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

const ROLE_COLORS: Record<string, string> = {
  owner: "#E8973A",
  doctor: "#2196C8",
  assistant: "#4DB8E8",
  receptionist: "#7C5CFC",
  finance: "#2BA471",
};

export default function YabanStaffProfile() {
  const [, setLocation] = useLocation();
  const [keyword, setKeyword] = useState("");
  const membersQuery = trpc.yabanCustomer.listClinicMembers.useQuery();
  const members = (membersQuery.data || []).filter((m) =>
    m.name.toLowerCase().includes(keyword.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P401" />
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setLocation("/yaban/features")} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">员工档案</span>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-20">
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索员工姓名"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
        </div>

        <div className="px-3 mt-2 text-xs text-gray-400">
          共 {members.length} 名在职员工
        </div>

        <div className="bg-white mx-3 mt-2 rounded-xl divide-y divide-gray-100">
          {membersQuery.isLoading && (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          )}
          {!membersQuery.isLoading && members.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">暂无员工记录</div>
          )}
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                style={{ background: ROLE_COLORS[m.roleKey] || "#2196C8" }}
              >
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{m.name}</div>
                <div className="text-xs text-gray-400 truncate">{m.roleName || m.roleKey}</div>
              </div>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: (ROLE_COLORS[m.roleKey] || "#2196C8") + "1A",
                  color: ROLE_COLORS[m.roleKey] || "#2196C8",
                }}
              >
                {m.roleName || m.roleKey}
              </span>
            </div>
          ))}
        </div>
      </div>

      <YabanTabBar />
    </div>
  );
}
