import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";

// 快捷按钮定义（与 LedgerDetail 右上角保持一致）
const SHORTCUT_BUTTONS = [
  { key: "gold", label: "黄金" },
  { key: "qq", label: "QQ" },
  { key: "oil", label: "石油" },
  { key: "stock", label: "股票" },
];

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");
  const [, setLocation] = useLocation();

  const { data: members, refetch } = trpc.getShortcutButtons.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const updateMutation = trpc.updateShortcutButtons.useMutation({
    onSuccess: () => {
      refetch();
      toast("已保存");
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const handleToggle = (userId: number, key: string, currentVal: boolean) => {
    const member = members?.find((m: any) => m.userId === userId);
    if (!member) return;
    const newShortcuts = { ...member.shortcuts, [key]: !currentVal };
    updateMutation.mutate({ ledgerId, targetUserId: userId, shortcuts: newShortcuts });
  };

  // 列数 = 1(成员) + 快捷按钮数量
  const totalCols = 1 + SHORTCUT_BUTTONS.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white p-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          快捷按钮管理
        </h1>
      </div>

      {/* 表格 */}
      <div className="bg-white">
        {/* 表头 */}
        <div
          className="border-b border-gray-200 text-sm text-gray-700 font-medium bg-white sticky top-0 z-10 shadow-sm"
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(72px, 1fr) repeat(${SHORTCUT_BUTTONS.length}, 1fr)`,
          }}
        >
          <div className="py-3 px-2 text-center flex items-center justify-center">成员</div>
          {SHORTCUT_BUTTONS.map((btn) => (
            <div
              key={btn.key}
              className="py-3 px-2 text-center border-l border-gray-200 flex items-center justify-center"
            >
              {btn.label}
            </div>
          ))}
        </div>

        {/* 成员列表 */}
        {members?.map((member: any) => (
          <div
            key={member.userId}
            className="border-b border-gray-100"
            style={{
              display: "grid",
              gridTemplateColumns: `minmax(72px, 1fr) repeat(${SHORTCUT_BUTTONS.length}, 1fr)`,
            }}
          >
            {/* 成员信息 */}
            <div className="py-4 px-2 flex flex-col items-center justify-center gap-1">
              <UserAvatar
                username={member.name}
                avatar={member.avatar}
                size="sm"
              />
              <span className="text-xs text-gray-600 truncate max-w-[60px] text-center">
                {member.name}
              </span>
            </div>

            {/* 各快捷按钮开关 */}
            {SHORTCUT_BUTTONS.map((btn) => {
              const isOn = !!member.shortcuts?.[btn.key];
              return (
                <div
                  key={btn.key}
                  className="py-4 px-2 flex items-center justify-center border-l border-gray-100"
                >
                  <button
                    onClick={() => handleToggle(member.userId, btn.key, isOn)}
                    disabled={updateMutation.isPending}
                    className={`font-medium text-sm ${
                      isOn ? "text-[#4CAF50]" : "text-[#D32F2F]"
                    }`}
                  >
                    {isOn ? "开" : "关"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}

        {/* 空状态 */}
        {members && members.length === 0 && (
          <div className="text-center text-gray-400 py-10 text-sm">暂无成员</div>
        )}
      </div>

      {/* 说明文字 */}
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
