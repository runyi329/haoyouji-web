import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ledgerId = Number(id);

  // 直接复用成员权限页面的同一个接口，已验证能秒出成员
  const { data } = trpc.ledger.getMemberPermissions.useQuery({ ledgerId });
  const members = data?.members || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white p-3 flex items-center">
        <button onClick={() => navigate(`/ledger/${ledgerId}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          快捷按钮管理
        </h1>
      </div>

      {/* 表头 */}
      <div
        className="border-b border-gray-200 text-sm text-gray-700 font-medium bg-white sticky top-0 z-10 shadow-sm"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)",
        }}
      >
        <div className="py-3 px-2 text-center">成员</div>
        <div className="py-3 px-2 text-center border-l border-gray-200">黄金</div>
        <div className="py-3 px-2 text-center border-l border-gray-200">QQ</div>
        <div className="py-3 px-2 text-center border-l border-gray-200">石油</div>
        <div className="py-3 px-2 text-center border-l border-gray-200">股票</div>
      </div>

      {/* 成员列表 */}
      <div className="bg-white">
        {members.map((member: any) => (
          <div
            key={member.id}
            className="border-b border-gray-100"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)",
            }}
          >
            <div className="py-4 px-2 flex flex-col items-center justify-center gap-1">
              <UserAvatar
                username={member.userName}
                avatar={member.userAvatar}
                size="sm"
              />
              <span className="text-xs text-gray-600 truncate max-w-[60px] text-center">
                {member.userName}
              </span>
            </div>
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100 text-sm text-gray-400">-</div>
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100 text-sm text-gray-400">-</div>
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100 text-sm text-gray-400">-</div>
            <div className="py-4 px-2 flex items-center justify-center border-l border-gray-100 text-sm text-gray-400">-</div>
          </div>
        ))}
      </div>

      {/* 说明 */}
      <div className="p-4 text-xs text-gray-500">
        <p className="mb-2">
          <span className="text-[#4CAF50] font-medium">开</span>：该成员进入账本时可看到对应快捷按钮
        </p>
        <p>
          <span className="text-[#D32F2F] font-medium">关</span>：该成员进入账本时不显示对应快捷按钮
        </p>
      </div>
    </div>
  );
}
