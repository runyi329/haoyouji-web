import { useParams, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { useState } from "react";

const SHORTCUT_KEYS = ["gold", "qq", "oil", "stock"] as const;
const SHORTCUT_LABELS: Record<string, string> = {
  gold: "黄金",
  qq: "QQ",
  oil: "石油",
  stock: "股票",
};
const DEFAULT_SHORTCUTS = { gold: false, qq: false, oil: false, stock: false };

type ShortcutMap = Record<string, { gold: boolean; qq: boolean; oil: boolean; stock: boolean }>;

export default function ShortcutButtonsManage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ledgerId = Number(id);

  // 乐观更新：本地状态覆盖服务器数据
  const [localMap, setLocalMap] = useState<ShortcutMap>({});
  // 正在保存的按钮 key: `${userId}-${key}`
  const [savingSet, setSavingSet] = useState<Set<string>>(new Set());

  // 获取成员列表
  const { data: permData, isLoading: membersLoading } = trpc.ledger.getMemberPermissions.useQuery({ ledgerId });
  const members = permData?.members || [];

  // 获取所有成员的快捷按钮配置
  const { data: serverMap, isLoading: shortcutLoading } = trpc.ledger.getShortcutButtons.useQuery(
    { ledgerId },
    {
      onSuccess: (data: any) => {
        // 服务器数据加载后，同步到本地状态
        const normalized: ShortcutMap = {};
        for (const [uid, val] of Object.entries(data || {})) {
          normalized[String(uid)] = {
            gold: !!(val as any)?.gold,
            qq: !!(val as any)?.qq,
            oil: !!(val as any)?.oil,
            stock: !!(val as any)?.stock,
          };
        }
        setLocalMap(normalized);
      },
    }
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.ledger.updateShortcutButtons.useMutation({
    onSuccess: () => {
      utils.ledger.getShortcutButtons.invalidate({ ledgerId });
    },
    onError: (err, variables) => {
      // 回滚乐观更新
      const uid = String(variables.targetUserId);
      const serverVal = (serverMap as any)?.[variables.targetUserId] || (serverMap as any)?.[uid];
      setLocalMap(prev => ({
        ...prev,
        [uid]: serverVal
          ? { gold: !!serverVal.gold, qq: !!serverVal.qq, oil: !!serverVal.oil, stock: !!serverVal.stock }
          : DEFAULT_SHORTCUTS,
      }));
      toast.error(err.message || "保存失败，请重试");
    },
    onSettled: (_data, _err, variables) => {
      const uid = String(variables.targetUserId);
      setSavingSet(prev => {
        const next = new Set(prev);
        SHORTCUT_KEYS.forEach(k => next.delete(`${uid}-${k}`));
        return next;
      });
    },
  });

  const handleToggle = (userId: number, key: typeof SHORTCUT_KEYS[number]) => {
    const uid = String(userId);
    const current = localMap[uid] || DEFAULT_SHORTCUTS;
    const newShortcuts = { ...current, [key]: !current[key] };

    // 乐观更新本地状态
    setLocalMap(prev => ({ ...prev, [uid]: newShortcuts }));
    setSavingSet(prev => new Set(prev).add(`${uid}-${key}`));

    updateMutation.mutate({
      ledgerId,
      targetUserId: userId,
      shortcuts: newShortcuts,
    });
  };

  const isLoading = membersLoading || shortcutLoading;

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

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#A80000]" />
        </div>
      ) : (
        <>
          {/* 表头 */}
          <div
            className="border-b border-gray-300 text-sm text-gray-700 font-medium bg-white sticky top-0 z-10 shadow-sm"
            style={{ display: "grid", gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)" }}
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
              const uid = String(member.userId);
              const shortcuts = localMap[uid] || DEFAULT_SHORTCUTS;
              return (
                <div
                  key={member.id}
                  className="border-b border-gray-100"
                  style={{ display: "grid", gridTemplateColumns: "minmax(72px, 1fr) repeat(4, 1fr)" }}
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
                    const isOn = shortcuts[key];
                    const isSaving = savingSet.has(`${uid}-${key}`);
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-center border-l border-gray-100 cursor-pointer active:opacity-60 transition-opacity ${isSaving ? "opacity-50 pointer-events-none" : ""}`}
                        onClick={() => handleToggle(member.userId, key)}
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                        ) : (
                          <span
                            className={`text-sm font-bold px-2 py-1 rounded ${
                              isOn
                                ? "text-white bg-[#4CAF50]"
                                : "text-white bg-[#D32F2F]"
                            }`}
                          >
                            {isOn ? "开" : "关"}
                          </span>
                        )}
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
        </>
      )}
    </div>
  );
}
