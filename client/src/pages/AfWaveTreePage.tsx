import { useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const YJH_USER_ID_CONST = 4957151;

type TreeUser = {
  id: number;
  name: string;
  invitedByUserId: number | null;
  payoutRatio: number;
};

// ===== 紧凑节点卡片 =====
function FamilyCard({
  user,
  yjhUserId,
  localRatios,
  ledgerId,
  onNavigate,
}: {
  user: TreeUser;
  yjhUserId: number;
  localRatios: Record<number, number>;
  ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  const currentRatio = localRatios[user.id] ?? user.payoutRatio;
  const isYJH = user.id === yjhUserId;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: isYJH ? "1.5px solid #C62828" : "1px solid #BDBDBD",
        backgroundColor: isYJH ? "#FFEBEE" : "#FAFAFA",
        borderRadius: 4,
        padding: "2px 4px",
        minWidth: 36,
        maxWidth: 48,
        cursor: "pointer",
        boxShadow: isYJH
          ? "0 1px 3px rgba(198,40,40,0.18)"
          : "0 1px 2px rgba(0,0,0,0.07)",
        userSelect: "none",
      }}
      onClick={() => onNavigate(`/ledger/${ledgerId}/af-ratio/${user.id}`)}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: isYJH ? "#C62828" : "#333",
          maxWidth: 44,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: "13px",
        }}
      >
        {isYJH ? "YJH" : user.name || "未知"}
      </span>
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          lineHeight: "12px",
          color: isYJH
            ? "#C62828"
            : currentRatio > 0
            ? "#E65100"
            : "#9E9E9E",
        }}
      >
        {`${currentRatio.toFixed(1)}%`}
      </span>
    </div>
  );
}

// ===== 递归节点 =====
function FamilyNode({
  node,
  allUsers,
  yjhUserId,
  localRatios,
  collapsedIds,
  toggleCollapse,
  ledgerId,
  onNavigate,
}: {
  node: TreeUser;
  allUsers: TreeUser[];
  yjhUserId: number;
  localRatios: Record<number, number>;
  collapsedIds: Set<number>;
  toggleCollapse: (id: number) => void;
  ledgerId: number;
  onNavigate: (path: string) => void;
}) {
  const children = allUsers.filter((u) => u.invitedByUserId === node.id);
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = children.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", paddingBottom: hasChildren ? 6 : 0 }}>
        <FamilyCard
          user={node}
          yjhUserId={yjhUserId}
          localRatios={localRatios}
          ledgerId={ledgerId}
          onNavigate={onNavigate}
        />
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(node.id);
            }}
            style={{
              position: "absolute",
              bottom: -2,
              left: "50%",
              transform: "translateX(-50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: isCollapsed ? "#C62828" : "#9E9E9E",
              color: "#fff",
              border: "1.5px solid #fff",
              fontSize: 9,
              cursor: "pointer",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              padding: 0,
            }}
          >
            {isCollapsed ? "+" : "−"}
          </button>
        )}
      </div>

      {hasChildren && !isCollapsed && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 1, height: 10, backgroundColor: "#BDBDBD" }} />
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              position: "relative",
              gap: 0,
            }}
          >
            {children.map((child, idx) => (
              <div
                key={child.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingLeft: idx > 0 ? 6 : 0,
                  paddingRight: idx < children.length - 1 ? 6 : 0,
                }}
              >
                <div style={{ width: 1, height: 10, backgroundColor: "#BDBDBD" }} />
                <FamilyNode
                  node={child}
                  allUsers={allUsers}
                  yjhUserId={yjhUserId}
                  localRatios={localRatios}
                  collapsedIds={collapsedIds}
                  toggleCollapse={toggleCollapse}
                  ledgerId={ledgerId}
                  onNavigate={onNavigate}
                />
              </div>
            ))}
            {children.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  height: 1,
                  backgroundColor: "#BDBDBD",
                  width: "calc(100% - 12px)",
                  zIndex: 1,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AfWaveTreePage() {
  const [, params] = useRoute("/ledger/:id/af-wave-tree");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;
  const { data: user } = trpc.auth.me.useQuery();

  // 账本基本信息（判断权限，与 AfInviteTreePage 保持一致）
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const ledgerLoaded = !ledgerLoading && !!ledgerData;

  // isYJH 判断（与 AfInviteTreePage 保持一致）
  const isYJH =
    (user as any)?.id === YJH_USER_ID_CONST ||
    (user as any)?.id === 870413 ||
    isOwner ||
    isAdmin;

  // viewAsUserId 逻辑：owner/admin 且不是 YJH 本人时，以 YJH 视角查询
  const inviteTreeViewAsId = ledgerLoaded
    ? ((isOwner || isAdmin) && (user as any)?.id !== YJH_USER_ID_CONST
        ? YJH_USER_ID_CONST
        : undefined)
    : undefined;

  const { data: inviteTreeData, isLoading } = trpc.ledger.afGetInviteTree.useQuery(
    { ledgerId, ...(inviteTreeViewAsId ? { viewAsUserId: inviteTreeViewAsId } : {}) },
    { enabled: ledgerLoaded && !!ledgerId }
  );;

  const [localRatios] = useState<Record<number, number>>({});
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const toggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const treeUsers: TreeUser[] = (inviteTreeData?.users ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    invitedByUserId: u.invitedByUserId ?? null,
    payoutRatio: localRatios[u.id] ?? u.payoutRatio ?? 0,
  }));

  // 链完整性检查
  const chainWarnings: { memberName: string; total: number; gap: number }[] = [];
  if (treeUsers.length > 0) {
    const childIds = new Set(
      treeUsers.filter((u) => u.invitedByUserId !== null).map((u) => u.invitedByUserId!)
    );
    const leafUsers = treeUsers.filter(
      (u) => u.id !== YJH_USER_ID_CONST && !childIds.has(u.id)
    );
    for (const leaf of leafUsers) {
      let chainTotal = 0;
      let cur: TreeUser | undefined = leaf;
      while (cur) {
        chainTotal += parseFloat((localRatios[cur.id] ?? cur.payoutRatio).toFixed(1));
        if (cur.invitedByUserId === null) break;
        cur = treeUsers.find((u) => u.id === cur!.invitedByUserId);
      }
      const yjhUser = treeUsers.find((u) => u.id === YJH_USER_ID_CONST);
      if (yjhUser) {
        chainTotal += parseFloat((localRatios[yjhUser.id] ?? yjhUser.payoutRatio).toFixed(1));
      }
      const rounded = parseFloat(chainTotal.toFixed(1));
      if (rounded !== 100.0) {
        chainWarnings.push({
          memberName: leaf.name || `用户${leaf.id}`,
          total: rounded,
          gap: parseFloat((100.0 - rounded).toFixed(1)),
        });
      }
    }
  }

  const rootNodes = treeUsers.filter(
    (u) => u.invitedByUserId === null || u.id === YJH_USER_ID_CONST
  );

  if (!isYJH) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">无权限查看</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F5F5" }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100"
        style={{ backgroundColor: "#fff" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/af-invite-tree`)}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">波比树状图</div>
          <div className="text-xs text-gray-400">
            共 {treeUsers.length} 人 · 点击节点可编辑波比
          </div>
        </div>
        {/* 链完整性状态 */}
        <div className="flex-shrink-0">
          {chainWarnings.length === 0 ? (
            <span className="text-xs font-medium" style={{ color: "#388E3C" }}>
              ✓ 全链 100%
            </span>
          ) : (
            <span className="text-xs font-bold" style={{ color: "#D32F2F" }}>
              ⚠️ {chainWarnings.length} 条异常
            </span>
          )}
        </div>
      </div>

      {/* 链异常提示 */}
      {chainWarnings.length > 0 && (
        <div className="mx-4 mt-3 space-y-1">
          {chainWarnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ backgroundColor: "#FFF3F3", border: "1px solid #FFCDD2" }}
            >
              <span className="text-xs" style={{ color: "#B71C1C" }}>
                {w.memberName} 链合计 {w.total.toFixed(1)}%
              </span>
              <span className="text-xs font-bold" style={{ color: "#D32F2F" }}>
                {w.gap > 0
                  ? `缺 ${w.gap.toFixed(1)}%`
                  : `超 ${Math.abs(w.gap).toFixed(1)}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 树状图主体 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : treeUsers.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无成员数据</div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "16px 12px 24px",
            }}
          >
            <div style={{ minWidth: "max-content" }}>
              {/* 根节点横排 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {rootNodes.map((node) => (
                  <FamilyNode
                    key={node.id}
                    node={node}
                    allUsers={treeUsers}
                    yjhUserId={YJH_USER_ID_CONST}
                    localRatios={localRatios}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    ledgerId={ledgerId}
                    onNavigate={setLocation}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-3 border-t border-gray-100" style={{ backgroundColor: "#fff" }}>
        <p className="text-xs text-gray-400 leading-relaxed">
          · 点击节点跳转到该成员的波比编辑页<br />
          · 红色节点为 YJH（根节点）<br />
          · 点击节点下方的 −/+ 可折叠/展开子树
        </p>
      </div>
    </div>
  );
}
