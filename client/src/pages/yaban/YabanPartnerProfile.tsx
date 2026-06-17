/**
 * 牙伴齿科管理 - 合伙人档案
 * 路由：/yaban/partner-profile
 * 展示门店合伙人（owner 角色）名单与持股说明入口。
 * 持股/分红等明细数据后续接入；本页先提供合伙人名单与档案框架。
 * 严禁 Emoji，仅用 lucide-react 图标，配色沿用牙伴蓝青系。
 */
import { useLocation } from "wouter";
import { ChevronLeft, User, Briefcase } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

export default function YabanPartnerProfile() {
  const [, setLocation] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const membersQuery = trpc.yabanCustomer.listClinicMembers.useQuery();
  const partners = (membersQuery.data || []).filter((m) => m.roleKey === "owner");

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P402" />
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setLocation("/yaban/features")} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">合伙人档案</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-20">
        <div className="bg-white mx-3 mt-3 rounded-xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#2196C8]/10">
            <Briefcase className="w-6 h-6 text-[#2196C8]" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">合伙人管理</div>
            <div className="text-xs text-gray-400 mt-0.5">门店股东与合伙人档案，持股与分红明细陆续开放</div>
          </div>
        </div>

        <div className="px-3 mt-3 text-xs text-gray-400">
          共 {partners.length} 名合伙人
        </div>

        <div className="bg-white mx-3 mt-2 rounded-xl divide-y divide-gray-100">
          {membersQuery.isLoading && (
            <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
          )}
          {!membersQuery.isLoading && partners.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400">暂无合伙人记录</div>
          )}
          {partners.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 bg-[#E8973A]">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{m.name}</div>
                <div className="text-xs text-gray-400 truncate">合伙人 / {m.roleName || "股东"}</div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E8973A]/10 text-[#E8973A]">
                合伙人
              </span>
            </div>
          ))}
        </div>
      </div>

      <YabanTabBar />
    </div>
  );
}
