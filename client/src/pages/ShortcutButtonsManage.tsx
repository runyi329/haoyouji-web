import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";

const SHORTCUT_KEYS = ["gold", "qq", "oil", "stock"] as const;
const SHORTCUT_LABELS: Record<string, string> = {
  gold: "黄金",
  qq: "QQ",
  oil: "石油",
  stock: "股票",
};

const DEFAULT_SHORTCUTS = { gold: false, qq: false, oil: false, stock: false };

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ledgerId = Number(id);

  // 复用成员权限页面的同一个接口获取成员列表
  const { data: permData } = trpc.ledger.getMemberPermissions.useQuery({ ledgerId });
  const members = permData?.members || [];

  // 获取所有成员的快捷按钮配置（shortcutMap: { userId: { gold, qq, oil, stock } }）
  const { data: shortcutMap } = trpc.ledger.getShortcutButtons.useQuery({ ledgerId });

  const utils = trpc.useUtils();
  const updateMutation = trpc.ledger.updateShortcutButtons.useMutation({
    onSuccess: () => {
      utils.ledger.getShortcutButtons.invalidate({ ledgerId });
    },
    onError: (err) => {
      toast.error(err.message || "保存失败");
    },
  });

  const handleToggle = (userId: number, key: string) => {
    const current = shortcutMap?.[userId] || DEFAULT_SHORTCUTS;
    const newShortcuts = {
      ...DEFAULT_SHORTCUTS,
      ...current,
      [key]: !current[key],
    };
    updateMutation.mutate({
      ledgerId,
      targetUserId: userId,
      shortcuts: newShortcuts,
    });
  };

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
        className="border-b border-gray-300 text-sm text-gray-700 font-medium bg-white sticky top-0 z-10 shadow-sm"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)",
        }}
      >
        <div className="py-3 px-2 text-center">成员</div>
        {SHORTCUT_KEYS.map((key) => (
          <div key={key} className="py-3 px-2 text-center border-l border-gray-200">
            {SHORTCUT_LABELS[key]}
          </div>
        ))}
      </div>

      {/* 成员列表 */}
      <div className="bg-white">
        {members.map((member: any) => {
          const shortcuts = shortcutMap?.[member.userId] || DEFAULT_SHORTCUTS;
          return (
            <div
              key={member.id}
              className="border-b border-gray-100"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)",
              }}
            >
              {/* 成员头像+名字 */}
              <div className="py-3 px-2 flex flex-col items-center justify-center gap-1">
                <UserAvatar
                  username={member.userName}
                  avatar={member.userAvatar}
                  size="sm"
                />
                <span className="text-xs text-gray-600 truncate max-w-[60px] text-center">
                  {member.userName}
                </span>
              </div>
              {/* 4个开关 */}
              {SHORTCUT_KEYS.map((key) => {
                const isOn = !!(shortcuts as any)[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-center border-l border-gray-100 cursor-pointer"
                    onClick={() => handleToggle(member.userId, key)}
                  >
                    <span
                      className={`text-sm font-medium ${
                        isOn ? "text-[#4CAF50]" : "text-[#D32F2F]"
                      }`}
                    >
                      {isOn ? "开" : "关"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
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
