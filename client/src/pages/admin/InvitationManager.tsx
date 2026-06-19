import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Copy, Link2, Users, CheckCircle, XCircle, Share, RefreshCw, Edit, UserPlus, X, Layers, HelpCircle, MoreHorizontal, ToggleLeft, ToggleRight, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { PageTag } from "@/components/PageTag";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function InvitationManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // 编辑推荐人对话框
  const [editReferrerDialog, setEditReferrerDialog] = useState<{
    open: boolean;
    userId: number | null;
    userName: string;
    currentReferrerId: number | null;
  }>({
    open: false,
    userId: null,
    userName: "",
    currentReferrerId: null,
  });

  const [referrerSearchQuery, setReferrerSearchQuery] = useState("");
  const [selectedReferrerId, setSelectedReferrerId] = useState<number | null>(null);

  // 版本设置对话框
  const [versionDialog, setVersionDialog] = useState<{
    open: boolean;
    userId: number | null;
    userName: string;
    // 默认版本：用户登录后默认落地的版本（对应 version_key）
    versionKey: string;
    // 开放版本集合：用户能看到/切换到哪些版本（对应 version_switch_scope）
    openScope: string[];
    // 该用户当前实际生效的版本（用于“当前”角标与来源说明）
    currentVersionKey: string;
    currentVersionText: string;
    // 影响范围（组合式）：
    // downlineScope：下线范围单选
    //   none=不含下线 / direct=仅直接下线 / old=已注册老下线 / new=今后新下线 / both=新老全部 / targeted=指定某人及其下线
    // includeSelf：是否含本人（downlineScope=none 时强制为 true）
    // targetUserId：仅 targeted 使用，指定的目标下线
    downlineScope: "none" | "direct" | "old" | "new" | "both" | "targeted";
    includeSelf: boolean;
    targetUserId: number | null;
    targetUserName: string;
  }>({
    open: false,
    userId: null,
    userName: "",
    versionKey: "",
    openScope: [],
    currentVersionKey: "",
    currentVersionText: "",
    downlineScope: "none",
    includeSelf: true,
    targetUserId: null,
    targetUserName: "",
  });

  // 继承上线规则说明弹窗
  const [inheritHelpOpen, setInheritHelpOpen] = useState(false);

  // 批量开关确认弹窗：null=关闭，true=确认全部开启，false=确认全部关闭
  const [batchConfirm, setBatchConfirm] = useState<boolean | null>(null);

  // 获取所有用户的邀请权限状态
  const { data: allUsers, refetch, isLoading } = trpc.invitePermission.getAllUsersInvitePermission.useQuery();

  // 获取版本列表（含禁用，管理员后台用）
  const { data: versions } = trpc.version.listVersions.useQuery({ includeDisabled: true });

  // 切换邀请权限
  const togglePermissionMutation = trpc.invitePermission.setUserInvitePermission.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 更新推荐人
  const updateReferrerMutation = trpc.invitePermission.updateUserReferrer.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
      setReferrerSearchQuery("");
      setSelectedReferrerId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 批量设置邀请权限
  const batchPermissionMutation = trpc.invitePermission.batchSetInvitePermission.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setBatchConfirm(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setBatchConfirm(null);
    },
  });

  // 设置用户版本
  const setUserVersionMutation = trpc.version.setUserVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`版本设置已保存（影响 ${data.affected} 个用户）`);
      setVersionDialog((prev) => ({ ...prev, open: false }));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 版本key -> 名称映射
  const versionNameMap: Record<string, string> = {};
  (versions || []).forEach((v) => {
    versionNameMap[v.versionKey] = v.name;
  });

  // 搜索过滤
  const filteredUsers = allUsers?.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.inviteCode?.toLowerCase().includes(query)
    );
  });

  // 推荐人候选列表(排除自己)
  const referrerCandidates = allUsers?.filter(user => {
    if (user.id === editReferrerDialog.userId) return false;
    if (!referrerSearchQuery) return true;
    const query = referrerSearchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.inviteCode?.toLowerCase().includes(query)
    );
  });

  // 复制邀请码
  const handleCopyCode = (code: string | null) => {
    if (!code) {
      toast.error("该用户还没有邀请码");
      return;
    }
    navigator.clipboard.writeText(code);
    toast.success("邀请码已复制");
  };

  // 复制邀请链接
  const handleCopyLink = (code: string | null) => {
    if (!code) {
      toast.error("该用户还没有邀请码");
      return;
    }
    const link = `https://jiangyuchen.cn/login?invite=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("邀请链接已复制");
  };

  // 切换权限
  const handleTogglePermission = (userId: number, currentEnabled: boolean) => {
    togglePermissionMutation.mutate({
      userId,
      enabled: !currentEnabled,
    });
  };

  // 打开编辑推荐人对话框
  const handleOpenEditReferrer = (user: any) => {
    setEditReferrerDialog({
      open: true,
      userId: user.id,
      userName: user.name || user.username,
      currentReferrerId: user.invitedByUserId || null,
    });
    setSelectedReferrerId(user.invitedByUserId || null);
    setReferrerSearchQuery("");
  };

  // 保存推荐人
  const handleSaveReferrer = () => {
    if (!editReferrerDialog.userId) return;
    updateReferrerMutation.mutate({
      userId: editReferrerDialog.userId,
      referrerId: selectedReferrerId,
    });
  };

  // 打开版本设置对话框
  const handleOpenVersionDialog = (user: any) => {
    // 解析该用户当前生效版本（本人设定 / 继承上线 / 默认脉动版）
    const current = resolveUserVersionLabel(user);
    const currentKey = current ? current.key : "maidong";
    // 默认版本：本人明确设过则用自己的，否则预选“当前生效版本”
    const presetVersionKey = (user.versionKey && String(user.versionKey).trim()) ? String(user.versionKey).trim() : currentKey;
    // 开放集合：未单独设过则回填为“当前生效版本”（例如脉动版），让它默认勾亮，与用户实际能看到的一致
    const rawScope = Array.isArray(user.versionSwitchScope) ? user.versionSwitchScope.filter(Boolean) : [];
    const presetScope = rawScope.length > 0
      ? Array.from(new Set([presetVersionKey, ...rawScope]))
      : [presetVersionKey];
    setVersionDialog({
      open: true,
      userId: user.id,
      userName: user.name || user.username,
      versionKey: presetVersionKey,
      openScope: presetScope,
      currentVersionKey: currentKey,
      currentVersionText: current ? current.sourceText : "默认",
      downlineScope: "none",
      includeSelf: true,
      targetUserId: null,
      targetUserName: "",
    });
  };

  // 保存版本设置：version_key=默认版本，version_switch_scope=开放版本集合
  // 开放版本数量决定切换器是否出现（>=2 才能切），不再使用 switchEnabled 总开关
  const handleSaveVersion = () => {
    if (!versionDialog.userId) return;
    // 默认版本必须有且只有一个，不允许为空
    if (!versionDialog.versionKey || !String(versionDialog.versionKey).trim()) {
      toast.error("请选择一个默认版本");
      return;
    }
    // 默认版本必须包含在开放集合里（兜底，UI 已保证）
    const scope = versionDialog.versionKey
      ? Array.from(new Set([versionDialog.versionKey, ...versionDialog.openScope]))
      : versionDialog.openScope;
    // downlineScope=none 时强制含本人（否则是空操作）
    const includeSelf = versionDialog.downlineScope === "none" ? true : versionDialog.includeSelf;
    if (versionDialog.downlineScope === "targeted" && !versionDialog.targetUserId) {
      toast.error("请先选择一个目标下线");
      return;
    }
    setUserVersionMutation.mutate({
      userId: versionDialog.userId,
      versionKey: versionDialog.versionKey,
      switchScope: scope,
      downlineScope: versionDialog.downlineScope,
      includeSelf,
      targetUserId: versionDialog.downlineScope === "targeted" ? versionDialog.targetUserId ?? undefined : undefined,
    });
  };

  // 执行批量开关（作用于当前搜索筛选出的用户）
  const handleBatchConfirm = () => {
    if (batchConfirm === null) return;
    const ids = (filteredUsers || []).map((u) => u.id);
    if (ids.length === 0) {
      toast.error("当前没有可操作的用户");
      setBatchConfirm(null);
      return;
    }
    batchPermissionMutation.mutate({ userIds: ids, enabled: batchConfirm });
  };

  // 「指定某人及其下线」搜索框输入
  const [targetSearch, setTargetSearch] = useState("");

  // 计算当前弹窗本人名下的全部下线（BFS，用于「指定某人」候选）
  const downlineCandidates = useMemo<any[]>(() => {
    const rootId = versionDialog.userId;
    if (!rootId || !allUsers) return [];
    // 构建 invitedByUserId -> children 映射
    const childrenMap = new Map<number, any[]>();
    for (const u of allUsers) {
      const pid = u.invitedByUserId != null ? Number(u.invitedByUserId) : null;
      if (pid == null) continue;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      (childrenMap.get(pid) as any[]).push(u);
    }
    const result: any[] = [];
    const visited = new Set<number>([rootId]);
    let frontier = [rootId];
    let depth = 0;
    while (frontier.length > 0 && depth < 100) {
      const next: number[] = [];
      for (const fid of frontier) {
        const kids = (childrenMap.get(fid) as any[]) || [];
        for (const k of kids) {
          const kid = Number(k.id);
          if (!visited.has(kid)) {
            visited.add(kid);
            result.push(k);
            next.push(kid);
          }
        }
      }
      frontier = next;
      depth++;
    }
    return result;
  }, [versionDialog.userId, allUsers]);

  // 按搜索词过滤候选下线
  const filteredDownlineCandidates = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return downlineCandidates.slice(0, 20);
    return downlineCandidates
      .filter((u: any) =>
        String(u.name || "").toLowerCase().includes(q) ||
        String(u.username || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [downlineCandidates, targetSearch]);

  // 切换某个版本的「开放」状态（多选）。默认版本不可取消开放（始终保留）。
  const toggleOpenVersion = (versionKey: string) => {
    setVersionDialog((prev) => {
      if (versionKey === prev.versionKey) return prev; // 默认版本强制开放，不允许取消
      const exists = prev.openScope.includes(versionKey);
      return {
        ...prev,
        openScope: exists
          ? prev.openScope.filter((k) => k !== versionKey)
          : [...prev.openScope, versionKey],
      };
    });
  };

  // 选择默认版本（单选）。选中后自动纳入开放集合。
  const selectDefaultVersion = (versionKey: string) => {
    setVersionDialog((prev) => ({
      ...prev,
      versionKey,
      openScope: Array.from(new Set([versionKey, ...prev.openScope])),
    }));
  };

  // 获取用户的推荐人信息
  const getUserReferrer = (userId: number) => {
    return allUsers?.find(u => u.id === userId);
  };

  // 统计某用户的「直接邀请 / 间接邀请（所有层级累计）」
  // 直接：invitedByUserId === 本人；间接：下线的下线一直往下的总和
  const inviteCountMap = useMemo(() => {
    const childrenMap = new Map<number, number[]>();
    (allUsers || []).forEach((u) => {
      const pid = u.invitedByUserId;
      if (pid) {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(u.id);
      }
    });
    const result = new Map<number, { direct: number; indirect: number }>();
    (allUsers || []).forEach((u) => {
      const direct = childrenMap.get(u.id)?.length || 0;
      // BFS 累计所有后代，减去直接一层即为间接
      let total = 0;
      const queue = [...(childrenMap.get(u.id) || [])];
      const seen = new Set<number>();
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        total++;
        const kids = childrenMap.get(cur);
        if (kids) queue.push(...kids);
      }
      result.set(u.id, { direct, indirect: Math.max(0, total - direct) });
    });
    return result;
  }, [allUsers]);

  // 计算某用户的「生效版本 + 来源」（与后端一致：自身设置优先，否则沿链追溯最顶层设置者）
  const resolveUserVersionLabel = (user: any): { key: string; name: string; sourceText: string } | null => {
    if (!allUsers || allUsers.length === 0) return null;
    const byId = new Map<number, any>();
    allUsers.forEach((u) => byId.set(u.id, u));

    // 1. 用户自己被明确设置过版本 → 以自己为准（本人设定，不被上线覆盖）
    if (user.versionKey && String(user.versionKey).trim()) {
      const selfKey = String(user.versionKey).trim();
      return { key: selfKey, name: versionNameMap[selfKey] || selfKey, sourceText: "本人设定" };
    }

    // 2. 自己未设置（继承上线）→ 沿推荐链向上，记录最顶层设置过 versionKey 的祖先
    let cur: any = user;
    let depth = 0;
    let topSetter: any = null;
    const visited = new Set<number>();
    while (cur && depth < 50) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (cur.versionKey && String(cur.versionKey).trim()) {
        topSetter = cur;
      }
      const parentId = cur.invitedByUserId;
      cur = parentId ? byId.get(parentId) : null;
      depth++;
    }

    if (!topSetter) {
      return { key: "maidong", name: versionNameMap["maidong"] || "脉动版", sourceText: "默认" };
    }
    const key = String(topSetter.versionKey).trim();
    const name = versionNameMap[key] || key;
    return { key, name, sourceText: `继承自 ${topSetter.name || topSetter.username}` };
  };

  // 「影响预览」名单搜索输入
  const [impactSearch, setImpactSearch] = useState("");

  // 影响预览：根据当前弹窗选择（默认版本 + 影响范围）实时计算会被写库的人，
  // 并对比「当前生效版本 → 改后版本」。new （今后新下线）面向未来，无具体名单。
  const impactPreview = useMemo(() => {
    const rootId = versionDialog.userId;
    const emptySummary = {
      includedCount: 0, changedCount: 0, versionChangedCount: 0,
      scopeIncreasedCount: 0, scopeDecreasedCount: 0, unchangedCount: 0,
    };
    if (!rootId || !allUsers) {
      return { affected: [] as any[], targetVersionKey: "", targetVersionName: "", futureNote: false, summary: emptySummary, scopeTransitionList: [] as { before: number; after: number; count: number }[] };
    }
    const byId = new Map<number, any>();
    allUsers.forEach((u) => byId.set(u.id, u));

    const ds = versionDialog.downlineScope;
    const includeSelf = ds === "none" ? true : versionDialog.includeSelf;

    // 收集受影响用户 id 集合（与后端口径一致）
    const ids = new Set<number>();
    if (includeSelf) ids.add(rootId);

    // 从 allUsers 构建 children 映射
    const childrenMap = new Map<number, any[]>();
    for (const u of allUsers) {
      const pid = u.invitedByUserId != null ? Number(u.invitedByUserId) : null;
      if (pid == null) continue;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      (childrenMap.get(pid) as any[]).push(u);
    }
    const collectSubtree = (startId: number): number[] => {
      const out: number[] = [];
      const seen = new Set<number>([startId]);
      let frontier = [startId];
      let depth = 0;
      while (frontier.length > 0 && depth < 100) {
        const next: number[] = [];
        for (const fid of frontier) {
          for (const k of (childrenMap.get(fid) || [])) {
            const kid = Number(k.id);
            if (!seen.has(kid)) { seen.add(kid); out.push(kid); next.push(kid); }
          }
        }
        frontier = next; depth++;
      }
      return out;
    };

    if (ds === "direct") {
      (childrenMap.get(rootId) || []).forEach((k) => ids.add(Number(k.id)));
    } else if (ds === "old" || ds === "both") {
      collectSubtree(rootId).forEach((id) => ids.add(id));
    } else if (ds === "targeted" && versionDialog.targetUserId) {
      ids.add(versionDialog.targetUserId);
      collectSubtree(versionDialog.targetUserId).forEach((id) => ids.add(id));
    }
    // ds === "none" / "new"：不加额外下线

    const targetVersionKey = String(versionDialog.versionKey || "").trim();
    const targetName = targetVersionKey ? (versionNameMap[targetVersionKey] || targetVersionKey) : "清除版本设置";
    // 改后开放集合（含默认版本，排序去重，用于比对）
    const targetScope = Array.from(new Set([targetVersionKey, ...versionDialog.openScope].filter(Boolean))).sort();
    const targetScopeNames = targetScope.map((k: string) => versionNameMap[k] || k);
    const scopeKey = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort().join(",");
    const targetScopeKey = scopeKey(targetScope);

    const affected = Array.from(ids)
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u) => {
        const before = resolveUserVersionLabel(u);
        const beforeKey = before ? before.key : "";
        const beforeName = before ? before.name : "-";
        // 该用户当前开放集合（未设过则视为仅含其当前生效版本）
        const rawSelfScope = Array.isArray(u.versionSwitchScope) ? u.versionSwitchScope.filter(Boolean) : [];
        const beforeScope = rawSelfScope.length > 0 ? rawSelfScope : (beforeKey ? [beforeKey] : []);
        const beforeScopeKey = scopeKey(beforeScope);
        // 默认版本变 或 开放集合变 → 视为变动
        const versionChanged = beforeKey !== targetVersionKey;
        const scopeChanged = beforeScopeKey !== targetScopeKey;
        const changed = versionChanged || scopeChanged;
        return {
          id: u.id,
          name: u.name || u.username,
          username: u.username,
          isRoot: u.id === rootId,
          beforeName,
          afterName: targetName,
          versionChanged,
          scopeChanged,
          beforeScopeText: beforeScope.map((k: string) => versionNameMap[k] || k).join("+") || "-",
          afterScopeText: targetScopeNames.join("+") || "-",
          changed,
        };
      });

    // 变动的排前面
    affected.sort((a, b) => (a.changed === b.changed ? 0 : a.changed ? -1 : 1));

    const futureNote = ds === "new" || ds === "both";

    // 汇总统计
    const scopeSize = (txt: string) => (txt === "-" ? 0 : txt.split("+").filter(Boolean).length);
    const summary = {
      includedCount: affected.length,            // 被纳入人数
      changedCount: 0,                           // 实际变动人数（默认版本或开放集合任一变）
      versionChangedCount: 0,                    // 默认版本改变人数
      scopeIncreasedCount: 0,                    // 开放版本数变多人数
      scopeDecreasedCount: 0,                    // 开放版本数变少人数
      unchangedCount: 0,                         // 无变化人数
    };
    // 开放版本数变化分组：键为 "before->after"，值为人数
    const scopeTransitions = new Map<string, { before: number; after: number; count: number }>();
    for (const u of affected) {
      if (u.changed) summary.changedCount++;
      else summary.unchangedCount++;
      if (u.versionChanged) summary.versionChangedCount++;
      if (u.scopeChanged) {
        const beforeN = scopeSize(u.beforeScopeText);
        const afterN = scopeSize(u.afterScopeText);
        if (afterN > beforeN) summary.scopeIncreasedCount++;
        else if (afterN < beforeN) summary.scopeDecreasedCount++;
        if (afterN !== beforeN) {
          const k = `${beforeN}->${afterN}`;
          const cur = scopeTransitions.get(k) || { before: beforeN, after: afterN, count: 0 };
          cur.count++;
          scopeTransitions.set(k, cur);
        }
      }
    }
    const scopeTransitionList = Array.from(scopeTransitions.values()).sort((a, b) => a.before - b.before || a.after - b.after);

    return { affected, targetVersionKey, targetVersionName: targetName, futureNote, summary, scopeTransitionList };
  }, [versionDialog.userId, versionDialog.downlineScope, versionDialog.includeSelf, versionDialog.targetUserId, versionDialog.versionKey, allUsers, versionNameMap]);

  // 名单过滤
  const filteredImpact = useMemo(() => {
    const q = impactSearch.trim().toLowerCase();
    if (!q) return impactPreview.affected;
    return impactPreview.affected.filter((u) =>
      String(u.name || "").toLowerCase().includes(q) ||
      String(u.username || "").toLowerCase().includes(q)
    );
  }, [impactPreview, impactSearch]);

  // 统计信息
  const stats = {
    total: allUsers?.length || 0,
    enabled: allUsers?.filter(u => u.inviteEnabled).length || 0,
    disabled: allUsers?.filter(u => !u.inviteEnabled).length || 0,
    totalInvites: allUsers?.reduce((sum, u) => sum + u.inviteCount, 0) || 0,
  };

  const filteredCount = filteredUsers?.length || 0;
  const filteredEnabled = filteredUsers?.filter((u) => u.inviteEnabled).length || 0;
  const filteredDisabled = filteredCount - filteredEnabled;

  return (
    <div className="space-y-5">
      <PageTag code="P230" />
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight">用户邀请权限管理</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            控制谁能邀请新用户、修改推荐关系、设置进入版本与切换权限
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="shrink-0">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="ml-1.5 hidden sm:inline">刷新</span>
        </Button>
      </div>

      {/* 统计条 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "总用户数", value: stats.total, color: "text-gray-900" },
          { label: "已开启", value: stats.enabled, color: "text-[#4CAF50]" },
          { label: "已关闭", value: stats.disabled, color: "text-gray-400" },
          { label: "累计邀请", value: stats.totalInvites, color: "text-[#1976D2]" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white border border-gray-100 shadow-sm px-3 py-2.5 text-center">
            <p className="text-xs text-muted-foreground whitespace-nowrap">{s.label}</p>
            <p className={`text-xl font-bold leading-tight mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 工具栏：搜索 + 批量开关（三段统一对齐） */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索用户名、昵称或邀请码..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-10"
          />
        </div>
        {/* 状态统计：两个等宽 chip，与下方按钮列对齐 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 flex items-center justify-center rounded-md bg-[#4CAF50]/10 text-[#4CAF50] text-xs font-medium">
            已开启 {filteredEnabled}
          </div>
          <div className="h-8 flex items-center justify-center rounded-md bg-gray-100 text-gray-500 text-xs font-medium">
            已关闭 {filteredDisabled}
          </div>
        </div>
        {/* 批量按钮：与上方 chip 等宽等高对齐 */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchConfirm(true)}
            disabled={isLoading || filteredCount === 0 || batchPermissionMutation.isPending}
            className="h-8 w-full text-xs border-[#4CAF50]/40 text-[#4CAF50] hover:bg-[#4CAF50]/5"
          >
            <ToggleRight className="w-3.5 h-3.5 mr-1" />
            全部开启
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchConfirm(false)}
            disabled={isLoading || filteredCount === 0 || batchPermissionMutation.isPending}
            className="h-8 w-full text-xs border-gray-300 text-gray-500 hover:bg-gray-50"
          >
            <ToggleLeft className="w-3.5 h-3.5 mr-1" />
            全部关闭
          </Button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="space-y-2.5">
        {isLoading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p>加载中...</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredUsers?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>没有找到匹配的用户</p>
              {searchQuery && (
                <p className="text-sm">尝试修改搜索关键词</p>
              )}
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredUsers?.map((user) => {
          const referrer = getUserReferrer(user.invitedByUserId || 0);
          const versionLabel = resolveUserVersionLabel(user);
          // 开放版本集合（version_switch_scope），并入默认版本；>=2 个即出现切换器
          const openVersionKeys = Array.from(new Set([
            ...(user.versionKey ? [String(user.versionKey).trim()] : []),
            ...(Array.isArray(user.versionSwitchScope) ? user.versionSwitchScope : []),
          ].filter(Boolean)));
          const openVersionCount = openVersionKeys.length;
          const canSwitch = openVersionCount >= 2;

          return (
            <Card
              key={user.id}
              className={`py-0 gap-0 transition-all cursor-pointer hover:border-gray-300 ${selectedUserId === user.id ? 'ring-1 ring-primary border-primary/40' : 'border-gray-100'}`}
              onClick={() => setSelectedUserId(selectedUserId === user.id ? null : user.id)}
            >
              <CardContent className="px-3.5 py-3.5">
                <div className="flex items-stretch gap-3">
                  {/* 用户信息（左侧占满） */}
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* 第一行：身份信息——昵称 + 账号 + 身份标签（同一行不换行） */}
                    <div className="flex items-baseline gap-x-2 min-w-0">
                      <span className="flex items-baseline gap-1 min-w-0 shrink">
                        <span className="shrink-0 text-[11px] text-muted-foreground">昵称：</span>
                        <span className="font-semibold truncate text-base">{user.name || "（未设）"}</span>
                      </span>
                      <span className="flex items-baseline gap-1 text-[13px] text-muted-foreground min-w-0 shrink">
                        <span className="shrink-0 text-muted-foreground/70">账号：</span>
                        <span className="truncate">{user.username}</span>
                      </span>
                      {user.role === 'super_admin' ? (
                        <Badge className="text-[11px] px-1.5 py-0 leading-5 shrink-0 bg-[#D32F2F] text-white hover:bg-[#D32F2F]">管理员</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0 leading-5 shrink-0 border-[#7E57C2]/50 text-[#7E57C2]">普通用户</Badge>
                      )}
                    </div>
                    {/* 第二行：版本信息（默认版本徽标 + 开放状态） */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">版本</span>
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0 leading-5 border-[#1976D2]/40 text-[#1976D2] shrink-0">
                        {versionLabel ? versionLabel.name : "默认版本"}
                      </Badge>
                      <span
                        title={canSwitch ? `已开放 ${openVersionCount} 个版本，可切换` : '仅开放 1 个版本，固定'}
                        className={`text-[11px] px-1.5 leading-5 rounded-md border shrink-0 ${canSwitch ? 'border-[#4CAF50]/40 text-[#4CAF50]' : 'border-gray-300 text-gray-400'}`}
                      >
                        {canSwitch ? `可切 ${openVersionCount} 版` : '固定'}
                      </span>
                    </div>
                    {/* 第三行：邀请信息 */}
                    <div className="flex items-center gap-x-3 text-[13px] text-muted-foreground truncate">
                      <span className="text-[11px] text-muted-foreground">邀请</span>
                      <span className="whitespace-nowrap">已邀 {user.inviteCount} 人</span>
                      <span className={`whitespace-nowrap ${user.inviteEnabled ? 'text-[#4CAF50]' : 'text-gray-400'}`}>
                        {user.inviteEnabled ? '权限已开启' : '权限已关闭'}
                      </span>
                    </div>
                  </div>

                  {/* 右侧：上—更多菜单，下—头像 */}
                  <div className="flex flex-col items-end justify-between shrink-0" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="px-1.5 h-7 -mr-1 -mt-0.5" title="更多操作">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => handleOpenVersionDialog(user)}>
                          <Layers className="w-4 h-4 mr-2" /> 设置版本
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenEditReferrer(user)}>
                          <UserPlus className="w-4 h-4 mr-2" /> 编辑推荐人
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!user.inviteCode} onClick={() => handleCopyCode(user.inviteCode)}>
                          <Copy className="w-4 h-4 mr-2" /> 复制邀请码
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!user.inviteCode} onClick={() => handleCopyLink(user.inviteCode)}>
                          <Link2 className="w-4 h-4 mr-2" /> 复制邀请链接
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {/* 头像占位（右下角） */}
                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#1976D2]/15 to-[#1976D2]/5 flex items-center justify-center text-sm font-semibold text-[#1976D2]">
                      {(user.name || user.username || '?').slice(0, 1).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* 展开详情：版本详情 / 邀请详情 两个分区 */}
                {selectedUserId === user.id && (
                  <div className="mt-3.5 pt-3.5 border-t space-y-3">
                    {/* —— 区域一：版本详情 —— */}
                    <div className="rounded-xl border border-[#1976D2]/20 bg-[#E3F2FD]/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1976D2]/10">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1976D2]">
                          <Layers className="w-3.5 h-3.5" />版本详情
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-[#1976D2] hover:bg-[#1976D2]/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenVersionDialog(user);
                          }}
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />设置
                        </Button>
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-[#1976D2]">{versionLabel ? versionLabel.name : "默认版本"}</span>
                          <span className="text-xs text-muted-foreground">
                            {canSwitch ? `开放 ${openVersionCount} 个·可切换` : '仅开放 1 个·固定'}
                          </span>
                        </div>
                        {versionLabel && (
                          <p className="text-xs text-muted-foreground mt-0.5">来源：{versionLabel.sourceText}</p>
                        )}
                        {openVersionCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            开放：{openVersionKeys.map((k) => versionNameMap[k] || k).join("、")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* —— 区域二：邀请详情 —— */}
                    <div className="rounded-xl border border-[#D32F2F]/20 bg-[#FFEBEE]/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-[#D32F2F]/10">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#D32F2F]">
                          <Share className="w-3.5 h-3.5" />邀请详情
                        </span>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-xs ${user.inviteEnabled ? 'text-[#4CAF50]' : 'text-gray-400'}`}>
                            {user.inviteEnabled ? '邀请已开启' : '邀请已关闭'}
                          </span>
                          <Switch
                            checked={user.inviteEnabled}
                            onCheckedChange={() => handleTogglePermission(user.id, user.inviteEnabled)}
                          />
                        </div>
                      </div>
                      <div className="px-3 py-2.5 space-y-2.5">
                        {/* 推荐人一行 */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 text-sm">
                            <span className="text-muted-foreground shrink-0">推荐人</span>
                            {referrer ? (
                              <>
                                <span className="text-xs text-muted-foreground shrink-0">昵称：</span>
                                <span className="font-medium truncate">{referrer.name || "（未设）"}</span>
                                <span className="text-xs text-muted-foreground truncate"><span className="text-muted-foreground/70">账号：</span>{referrer.username}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">暂无</span>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-[#D32F2F] hover:bg-[#D32F2F]/10"
                            title={referrer ? "修改推荐人" : "添加推荐人"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditReferrer(user);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* 邀请码 + 链接同一行 */}
                        {user.inviteCode && (
                          <div className="flex items-stretch gap-2">
                            <div className="shrink-0">
                              <Label className="text-xs text-muted-foreground">邀请码</Label>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(user.inviteCode)}
                                className="mt-1 flex items-center gap-1.5 h-9 px-2.5 rounded-md border bg-background font-mono text-sm hover:bg-gray-50 transition-colors"
                              >
                                <span>{user.inviteCode}</span>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              </button>
                            </div>
                            <div className="min-w-0 flex-1">
                              <Label className="text-xs text-muted-foreground">邀请链接</Label>
                              <button
                                type="button"
                                onClick={() => handleCopyLink(user.inviteCode)}
                                className="mt-1 flex items-center gap-1.5 h-9 w-full px-2.5 rounded-md border bg-background font-mono text-xs hover:bg-gray-50 transition-colors"
                              >
                                <span className="truncate text-muted-foreground">{`https://jiangyuchen.cn/login?invite=${user.inviteCode}`}</span>
                                <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 邀请统计：直接 / 间接 */}
                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <div className="rounded-lg bg-white/70 border border-[#D32F2F]/10 px-3 py-2 text-center">
                            <p className="text-xs text-muted-foreground">直接邀请</p>
                            <p className="text-lg font-bold text-[#D32F2F] leading-tight mt-0.5">{inviteCountMap.get(user.id)?.direct ?? 0}</p>
                          </div>
                          <div className="rounded-lg bg-white/70 border border-[#D32F2F]/10 px-3 py-2 text-center">
                            <p className="text-xs text-muted-foreground">间接邀请</p>
                            <p className="text-lg font-bold text-gray-600 leading-tight mt-0.5">{inviteCountMap.get(user.id)?.indirect ?? 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 显示结果数量 */}
      {!isLoading && filteredUsers && filteredUsers.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          显示 {filteredUsers.length} / {allUsers?.length} 个用户
        </p>
      )}

      {/* 版本设置对话框 */}
      <Dialog open={versionDialog.open} onOpenChange={(open) => {
        if (!open) setVersionDialog((prev) => ({ ...prev, open: false }));
      }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">设置版本 - {versionDialog.userName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* 区域一：默认版本（单选） */}
            <div className="rounded-lg bg-[#E3F2FD]/50 border border-[#1976D2]/20 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#1976D2]" />
                <p className="text-sm font-semibold text-[#1976D2]">默认版本</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">用户登录后默认进入的版本，必须选一个（选中后会自动开放给该用户）。</p>
              {versionDialog.currentVersionKey && (
                <p className="text-[11px] text-gray-600">
                  当前所处：
                  <span className="font-medium text-[#1976D2]">{versionNameMap[versionDialog.currentVersionKey] || versionDialog.currentVersionKey}</span>
                  <span className="text-muted-foreground">（{versionDialog.currentVersionText}）</span>
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {(versions || []).map((v) => {
                  const selected = versionDialog.versionKey === v.versionKey;
                  const isCurrent = versionDialog.currentVersionKey === v.versionKey;
                  const accent = (v as any).color || '#1976D2';
                  return (
                    <button
                      key={v.versionKey}
                      type="button"
                      title={`${v.versionKey} · 落地 ${v.landingPath}`}
                      className={`relative rounded-xl border p-2.5 flex flex-col items-center gap-1.5 transition-all bg-white ${
                        selected ? 'border-[#1976D2] ring-1 ring-[#1976D2]' : 'border-gray-200 hover:bg-gray-50'
                      } ${!v.enabled ? 'opacity-60' : ''}`}
                      onClick={() => selectDefaultVersion(v.versionKey)}
                    >
                      {selected && <CheckCircle className="w-4 h-4 text-[#1976D2] absolute top-1 right-1" />}
                      {isCurrent && !selected && (
                        <span className="absolute top-1 right-1 text-[9px] leading-none text-[#1976D2] bg-[#E3F2FD] rounded px-1 py-0.5">当前</span>
                      )}
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-semibold shrink-0"
                        style={{ backgroundColor: accent }}
                      >
                        {(v.name || v.versionKey || '?').trim().charAt(0)}
                      </span>
                      <span className="text-xs font-medium text-center leading-tight line-clamp-2 break-all">
                        {v.name}
                      </span>
                      {!v.enabled && <span className="text-[10px] text-gray-400 leading-none">已停用</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 区域二：开放版本（多选） */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <ToggleRight className="w-3.5 h-3.5 text-[#4CAF50]" />
                <p className="text-sm font-semibold text-gray-800">开放版本</p>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                点亮即对该用户开放。开放 <span className="font-medium text-gray-700">2 个及以上</span> 才会出现切换器，只开 1 个则固定在该版本。默认版本始终开放，不可取消。
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(versions || []).filter((v) => v.enabled).map((v) => {
                  const isDefault = versionDialog.versionKey === v.versionKey;
                  const checked = isDefault || versionDialog.openScope.includes(v.versionKey);
                  return (
                    <button
                      key={v.versionKey}
                      type="button"
                      onClick={() => toggleOpenVersion(v.versionKey)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-sm transition-all ${
                        checked
                          ? 'border-[#4CAF50] bg-[#4CAF50]/10 text-[#2E7D32] font-medium shadow-sm'
                          : 'border-dashed border-gray-300 bg-gray-100 text-gray-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      {checked ? <CheckCircle className="w-4 h-4 shrink-0 text-[#4CAF50]" /> : <span className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />}
                      <span className="truncate">{v.name}</span>
                      {isDefault && <span className="text-[10px] text-[#1976D2] shrink-0 ml-auto">默认</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                当前开放 <span className="font-medium text-gray-700">{(versionDialog.versionKey ? Array.from(new Set([versionDialog.versionKey, ...versionDialog.openScope])) : versionDialog.openScope).length}</span> 个版本
              </p>
            </div>

            {/* 影响范围：下线范围单选 + 含本人勾选 + 指定某人搜索 */}
            <div className="rounded-lg bg-[#FFF3E0] px-3 py-2">
              <p className="text-sm font-medium">影响范围</p>
              <p className="text-[11px] text-muted-foreground mb-1.5">先选「改谁的下线」，再决定是否连本人一起改。下线指其推荐链下的人。</p>

              {/* 下线范围（单选） */}
              <div className="grid grid-cols-1 gap-1.5">
                {([
                  { key: "none", title: "不含下线", desc: "只作用于本人，不动任何下线" },
                  { key: "direct", title: "仅直接下线（下一级）", desc: "只改他直接邀请的那一层，不含更深层" },
                  { key: "old", title: "已注册老下线（整棵子树）", desc: "把现有全部下线一次性强制改为该版本" },
                  { key: "new", title: "今后新下线", desc: "老下线不动；今后新注册且选继承的下线自动跟随" },
                  { key: "both", title: "新老下线全部", desc: "既改写现有下线，新下线也继承跟随" },
                  { key: "targeted", title: "指定某人及其下线", desc: "只改你选定的某个下线 + 他名下的全部" },
                ] as const).map((opt) => {
                  const active = versionDialog.downlineScope === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setVersionDialog((prev) => ({
                          ...prev,
                          downlineScope: opt.key,
                          // 选「不含下线」时强制含本人；离开 targeted 时清空选人
                          includeSelf: opt.key === "none" ? true : prev.includeSelf,
                          targetUserId: opt.key === "targeted" ? prev.targetUserId : null,
                          targetUserName: opt.key === "targeted" ? prev.targetUserName : "",
                        }));
                        if (opt.key !== "targeted") setTargetSearch("");
                      }}
                      className={`w-full text-left rounded-md border px-2.5 py-1.5 flex items-center justify-between transition-all ${
                        active ? 'border-[#E65100] bg-white' : 'border-transparent bg-white/50 hover:bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{opt.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</p>
                      </div>
                      {active
                        ? <CheckCircle className="w-4 h-4 text-[#E65100] shrink-0" />
                        : <span className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* 指定某人：搜索框 + 候选列表 */}
              {versionDialog.downlineScope === "targeted" && (
                <div className="mt-2 rounded-md border border-[#E65100]/40 bg-white p-2">
                  {versionDialog.targetUserId ? (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">已选目标下线</p>
                        <p className="text-sm font-medium text-gray-800 truncate">{versionDialog.targetUserName}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setVersionDialog((prev) => ({ ...prev, targetUserId: null, targetUserName: "" }))}
                      >
                        重选
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={targetSearch}
                          onChange={(e) => setTargetSearch(e.target.value)}
                          placeholder="搜索他名下的下线（姓名/账号）"
                          className="h-8 pl-7 text-sm"
                        />
                      </div>
                      <div className="mt-1.5 max-h-40 overflow-y-auto">
                        {downlineCandidates.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground px-1 py-2">该用户名下暂无下线</p>
                        ) : filteredDownlineCandidates.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground px-1 py-2">未找到匹配的下线</p>
                        ) : (
                          filteredDownlineCandidates.map((u: any) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => setVersionDialog((prev) => ({
                                ...prev,
                                targetUserId: Number(u.id),
                                targetUserName: u.name || u.username,
                              }))}
                              className="w-full text-left rounded px-2 py-1.5 hover:bg-[#FFF3E0] transition-colors"
                            >
                              <span className="text-sm text-gray-800">{u.name || u.username}</span>
                              {u.username && u.name && (
                                <span className="text-[11px] text-muted-foreground ml-1.5">@{u.username}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 是否含本人（downlineScope=none 时锁定） */}
              <label
                className={`mt-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 ${
                  versionDialog.downlineScope === "none" ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#E65100]"
                  checked={versionDialog.downlineScope === "none" ? true : versionDialog.includeSelf}
                  disabled={versionDialog.downlineScope === "none"}
                  onChange={(e) => setVersionDialog((prev) => ({ ...prev, includeSelf: e.target.checked }))}
                />
                <span className="text-sm text-gray-800">同时修改本人版本</span>
                {versionDialog.downlineScope === "none" && (
                  <span className="text-[11px] text-muted-foreground">（不含下线时必须含本人）</span>
                )}
              </label>
            </div>

            {/* 影响预览：随选择实时刷新，保存前看清会改哪些人 */}
            <div className="rounded-lg border border-[#1976D2]/25 bg-[#E3F2FD] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">影响预览</p>
                <div className="text-[11px] text-gray-600">
                  被纳入 <span className="font-semibold text-[#1976D2]">{impactPreview.summary.includedCount}</span> 人
                  · 实际变动 <span className="font-semibold text-[#E65100]">{impactPreview.summary.changedCount}</span> 人
                </div>
              </div>

              {/* 详细叙述统计 */}
              {versionDialog.versionKey && impactPreview.summary.includedCount > 0 && (
                <div className="mt-2 rounded-md bg-white/70 border border-[#1976D2]/15 px-2.5 py-2 space-y-1">
                  <p className="text-[12px] text-gray-700 leading-relaxed">
                    本次将影响 <span className="font-semibold text-[#1976D2]">{impactPreview.summary.includedCount}</span> 人，其中
                    <span className="font-semibold text-[#E65100]"> {impactPreview.summary.changedCount} </span>人实际变动、
                    <span className="font-medium text-gray-500">{impactPreview.summary.unchangedCount}</span> 人无变化。
                  </p>
                  {impactPreview.summary.versionChangedCount > 0 && (
                    <p className="text-[12px] text-gray-700 leading-relaxed">
                      <span className="font-semibold text-[#E65100]">{impactPreview.summary.versionChangedCount}</span> 人的默认版本将切换为
                      <span className="font-medium text-[#1976D2]"> {impactPreview.targetVersionName}</span>。
                    </p>
                  )}
                  {impactPreview.scopeTransitionList.map((t) => (
                    <p key={`${t.before}-${t.after}`} className="text-[12px] text-gray-700 leading-relaxed">
                      <span className="font-semibold text-[#2E7D32]">{t.count}</span> 人的开放版本数量将从
                      <span className="font-medium"> {t.before} </span>个
                      {t.after > t.before ? "增加到" : "减少到"}
                      <span className={`font-medium ${t.after > t.before ? "text-[#2E7D32]" : "text-[#C62828]"}`}> {t.after} </span>个。
                    </p>
                  ))}
                  {impactPreview.summary.changedCount === 0 && (
                    <p className="text-[12px] text-gray-500">所选人员的默认版本与开放版本均与当前一致，保存后不会产生变化。</p>
                  )}
                </div>
              )}

              {!versionDialog.versionKey ? (
                <p className="text-[12px] text-gray-600 mt-1.5">请先选择默认版本，以便预览每个人的「改后版本」。</p>
              ) : impactPreview.affected.length === 0 ? (
                <p className="text-[12px] text-gray-600 mt-1.5">当前选择不会写库任何人（例如只选了“今后新下线”且未含本人）。</p>
              ) : (
                <>
                  {impactPreview.affected.length > 20 && (
                    <div className="relative mt-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={impactSearch}
                        onChange={(e) => setImpactSearch(e.target.value)}
                        placeholder="在名单中搜索（姓名/账号）"
                        className="h-8 pl-7 text-sm bg-white"
                      />
                    </div>
                  )}
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-[#1976D2]/15 bg-white divide-y divide-gray-100">
                    {filteredImpact.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground px-2 py-3">未找到匹配的人</p>
                    ) : (
                      filteredImpact.map((u) => {
                        const beforeN = u.beforeScopeText === "-" ? 0 : u.beforeScopeText.split("+").filter(Boolean).length;
                        const afterN = u.afterScopeText === "-" ? 0 : u.afterScopeText.split("+").filter(Boolean).length;
                        return (
                        <div key={u.id} className="px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-gray-800 truncate">{u.name}</span>
                            {u.isRoot && <span className="text-[10px] text-[#1976D2] bg-[#E3F2FD] rounded px-1 py-0.5 shrink-0">本人</span>}
                            {!u.changed && <span className="text-[10px] text-gray-400 ml-auto shrink-0">无变化</span>}
                          </div>
                          <div className="mt-0.5 flex flex-col gap-0.5">
                            {/* 默认版本 */}
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-gray-400 w-12 shrink-0">默认版</span>
                              <span className="text-gray-500">{u.beforeName}</span>
                              <span className="text-gray-400">→</span>
                              <span className={u.versionChanged ? "font-medium text-[#E65100]" : "text-gray-400"}>{u.afterName}</span>
                              {!u.versionChanged && <span className="text-gray-300">(不变)</span>}
                            </div>
                            {/* 开放版本 */}
                            <div className="flex items-center gap-1 text-[11px]">
                              <span className="text-gray-400 w-12 shrink-0">开放版</span>
                              <span className="text-gray-500">{beforeN} 个</span>
                              <span className="text-gray-400">→</span>
                              {u.scopeChanged ? (
                                <span className={`font-medium ${afterN > beforeN ? "text-[#2E7D32]" : "text-[#C62828]"}`}>
                                  {afterN} 个 {afterN > beforeN ? `(+${afterN - beforeN})` : `(-${beforeN - afterN})`}
                                </span>
                              ) : (
                                <span className="text-gray-400">{afterN} 个 (不变)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {impactPreview.futureNote && (
                <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">另：“今后新下线”面向未来，无具体名单；今后新注册且选继承的下线将自动跟随。</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersionDialog((prev) => ({ ...prev, open: false }))}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSaveVersion}
              disabled={setUserVersionMutation.isPending}
            >
              {setUserVersionMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 继承上线规则说明弹窗 */}
      <Dialog open={inheritHelpOpen} onOpenChange={setInheritHelpOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">继承上线（不单独设置）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-gray-700">
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
              <p className="font-medium text-gray-800 mb-1">对本人</p>
              <p className="text-[13px] text-muted-foreground leading-snug">
                不为他单独设版本。他自己也沿推荐链一路向上，跟随“最顶层设置过版本的人”，而不是直接上线。
              </p>
            </div>
            <div className="rounded-lg bg-[#FFF3E0] border border-[#FFCC80] px-3 py-2.5">
              <p className="font-medium text-gray-800 mb-1">对下线</p>
              <p className="text-[13px] text-muted-foreground leading-snug">
                因为本人没单独设，下线选“继承”时会<span className="text-[#E65100] font-medium">跳过本人</span>，继续往上追到最顶层设置者；只有当本人就是链顶时，下线才跟随本人。
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="font-medium text-gray-800 mb-1.5">举例</p>
              <p className="text-[12px] text-muted-foreground mb-1.5">推荐链：A（顶）→ B → C</p>
              <ul className="space-y-1.5 text-[13px] text-gray-700">
                <li className="flex gap-1.5">
                  <span className="text-primary shrink-0">·</span>
                  <span>A 设“脉动版”，B、C 都选“继承上线” → <span className="font-medium">B 和 C 都用 A 的脉动版</span>。</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-primary shrink-0">·</span>
                  <span>再给 B 单独设“牙伴版” → B 用牙伴版；但 C 选“继承”仍追到最顶层的 A，<span className="font-medium">C 还是脉动版</span>（不会继承直接上线 B）。</span>
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setInheritHelpOpen(false)}>我知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量开关确认弹窗 */}
      <AlertDialog open={batchConfirm !== null} onOpenChange={(open) => { if (!open) setBatchConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchConfirm ? "全部开启邀请权限" : "全部关闭邀请权限"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作将对当前筛选出的 <span className="font-semibold text-gray-700">{filteredCount}</span> 个用户
              {batchConfirm ? "统一开启" : "统一关闭"}邀请权限。
              {searchQuery ? "（仅限当前搜索结果）" : "（当前未搜索，即全部用户）"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchConfirm}
              className={batchConfirm ? "bg-[#4CAF50] hover:bg-[#43A047]" : ""}
            >
              {batchPermissionMutation.isPending ? "处理中..." : "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 编辑推荐人对话框 */}
      <Dialog open={editReferrerDialog.open} onOpenChange={(open) => {
        if (!open) {
          setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
          setReferrerSearchQuery("");
          setSelectedReferrerId(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑推荐人 - {editReferrerDialog.userName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 当前推荐人 */}
            {editReferrerDialog.currentReferrerId && (
              <div className="p-3 bg-[#FFEBEE] rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">当前推荐人</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      <span className="text-xs text-muted-foreground mr-1">昵称：</span>
                      {getUserReferrer(editReferrerDialog.currentReferrerId)?.name || "（未设）"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-muted-foreground/70 mr-1">账号：</span>
                      {getUserReferrer(editReferrerDialog.currentReferrerId)?.username}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedReferrerId(null)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    清除
                  </Button>
                </div>
              </div>
            )}

            {/* 搜索推荐人 */}
            <div className="space-y-2">
              <Label>选择新推荐人</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名、昵称或邀请码..."
                  value={referrerSearchQuery}
                  onChange={(e) => setReferrerSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* 推荐人候选列表 */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {referrerCandidates?.map((candidate) => (
                <Card
                  key={candidate.id}
                  className={`cursor-pointer transition-all ${
                    selectedReferrerId === candidate.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedReferrerId(candidate.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">昵称：</span>
                          <span className="font-medium">{candidate.name || "（未设）"}</span>
                          {candidate.role === 'super_admin' && (
                            <Badge variant="secondary" className="text-xs">管理员</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span><span className="text-muted-foreground/70 mr-1">账号：</span>{candidate.username}</span>
                          {candidate.inviteCode && (
                            <span className="font-mono">{candidate.inviteCode}</span>
                          )}
                          <span>已邀请: {candidate.inviteCount}人</span>
                        </div>
                      </div>
                      {selectedReferrerId === candidate.id && (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {referrerCandidates?.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>没有找到匹配的用户</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditReferrerDialog({ open: false, userId: null, userName: "", currentReferrerId: null });
                setReferrerSearchQuery("");
                setSelectedReferrerId(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveReferrer}
              disabled={updateReferrerMutation.isPending || selectedReferrerId === editReferrerDialog.currentReferrerId}
            >
              {updateReferrerMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
