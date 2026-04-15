import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// 快捷按钮定义（与 LedgerDetail 右上角保持一致）
const SHORTCUT_BUTTONS = [
  {
    key: "gold",
    label: "黄金",
    desc: "MT5 黄金行情",
    icon: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663279996243/OPICjhxYcoKhRcPL.png",
  },
  {
    key: "qq",
    label: "QQ",
    desc: "QQ 快捷入口",
    icon: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/qq-icon-circle.png",
  },
  {
    key: "oil",
    label: "石油",
    desc: "石油业务入口",
    icon: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/oil-pump-icon-circle.png",
  },
  {
    key: "stock",
    label: "股票",
    desc: "股票行情（37号账本）",
    icon: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ths-stock-icon-circle.png",
  },
];

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { data: members, isLoading, refetch } = trpc.getShortcutButtons.useQuery(
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-base">快捷按钮管理</span>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-gray-400 mb-4">
          为每位成员单独开启或关闭右上角的快捷入口按钮。开启后，该成员进入账本时即可看到对应按钮。
        </p>

        {isLoading && (
          <div className="text-center text-gray-400 py-10 text-sm">加载中...</div>
        )}

        {!isLoading && members?.map((member: any) => (
          <div key={member.userId} className="bg-white rounded-xl mb-3 overflow-hidden shadow-sm">
            {/* 成员头部 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
              {member.avatar ? (
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#FFEBEE] flex items-center justify-center flex-shrink-0">
                  <span className="text-[#D32F2F] text-sm font-bold">
                    {member.name.slice(0, 1)}
                  </span>
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-gray-800">{member.name}</div>
                <div className="text-xs text-gray-400">ID: {member.userId}</div>
              </div>
            </div>

            {/* 快捷按钮开关列表 */}
            <div>
              {SHORTCUT_BUTTONS.map((btn, idx) => {
                const isOn = !!member.shortcuts?.[btn.key];
                const isLast = idx === SHORTCUT_BUTTONS.length - 1;
                return (
                  <div
                    key={btn.key}
                    className={`flex items-center gap-3 px-4 py-3 ${!isLast ? 'border-b border-gray-50' : ''}`}
                  >
                    <img
                      src={btn.icon}
                      alt={btn.label}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{btn.label}</div>
                      <div className="text-xs text-gray-400">{btn.desc}</div>
                    </div>
                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggle(member.userId, btn.key, isOn)}
                      disabled={updateMutation.isPending}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                        isOn ? 'bg-[#D32F2F]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          isOn ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!isLoading && (!members || members.length === 0) && (
          <div className="text-center text-gray-400 py-10 text-sm">暂无成员</div>
        )}
      </div>
    </div>
  );
}
