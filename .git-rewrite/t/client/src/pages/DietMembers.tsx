/**
 * 减肥账本 - 学员管理页（教练专用）
 * 功能：搜索学员、查看列表、为学员设置/修改减肥档案
 */
import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, User, Edit2, CheckCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function DietMembers() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ledgerId = Number(params.id);

  const [searchText, setSearchText] = useState("");
  const [editingMember, setEditingMember] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // 档案编辑字段
  const [form, setForm] = useState({
    nickname: "",
    gender: "female" as "female" | "male",
    initialWeight: "",
    targetWeight: "",
    height: "",
  });

  // 获取账本成员列表
  const { data: members = [], isLoading: membersLoading } = trpc.diet.getLedgerMembers.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 获取所有学员档案
  const { data: configs = [], refetch: refetchConfigs } = trpc.diet.getAllMemberConfigs.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 保存档案
  const saveMutation = trpc.diet.saveMemberConfig.useMutation({
    onSuccess: () => {
      toast.success("档案已保存");
      setShowEditDialog(false);
      refetchConfigs();
    },
    onError: (e) => toast.error("保存失败：" + e.message),
  });

  // 过滤掉AI分身，只显示真实学员
  const realMembers = useMemo(() => {
    return (members as any[]).filter((m: any) => m.memberType !== 'ai');
  }, [members]);

  // 搜索过滤
  const filteredMembers = useMemo(() => {
    if (!searchText.trim()) return realMembers;
    const kw = searchText.toLowerCase();
    return realMembers.filter((m: any) => {
      const name = (m.nickname || m.username || "").toLowerCase();
      return name.includes(kw);
    });
  }, [realMembers, searchText]);

  // 获取某个成员的档案
  const getConfig = (userId: number) => {
    return (configs as any[]).find((c: any) => c.userId === userId);
  };

  // 打开编辑弹窗
  const openEdit = (member: any) => {
    const config = getConfig(member.userId);
    setEditingMember(member);
    setForm({
      nickname: config?.nickname || member.nickname || member.username || "",
      gender: config?.gender || "female",
      initialWeight: config?.initialWeight ? String(config.initialWeight) : "",
      targetWeight: config?.targetWeight ? String(config.targetWeight) : "",
      height: config?.height ? String(config.height) : "",
    });
    setShowEditDialog(true);
  };

  // 保存档案
  const handleSave = () => {
    if (!editingMember) return;
    if (!form.initialWeight || parseFloat(form.initialWeight) <= 0) {
      toast.error("请输入初始体重");
      return;
    }
    if (!form.targetWeight || parseFloat(form.targetWeight) <= 0) {
      toast.error("请输入目标体重");
      return;
    }
    saveMutation.mutate({
      ledgerId,
      userId: editingMember.userId,
      nickname: form.nickname || undefined,
      gender: form.gender,
      initialWeight: parseFloat(form.initialWeight),
      targetWeight: parseFloat(form.targetWeight),
      height: form.height ? parseFloat(form.height) : undefined,
    });
  };

  // 计算进度
  const calcProgress = (config: any) => {
    if (!config || !config.initialWeight || !config.targetWeight) return null;
    const initial = Number(config.initialWeight);
    const target = Number(config.targetWeight);
    const current = Number(config.currentWeight || config.initialWeight);
    const totalToLose = initial - target;
    if (totalToLose <= 0) return null;
    const lost = initial - current;
    const pct = Math.max(0, Math.min(100, Math.round((lost / totalToLose) * 100)));
    return { lost: lost.toFixed(1), pct, current: current.toFixed(1) };
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED]">
      {/* 顶部导航 */}
      <div className="text-white px-3 py-2.5 flex items-center sticky top-0 z-10"
        style={{ backgroundColor: 'var(--brand-red, #D32F2F)' }}>
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-medium pr-6">学员管理</h1>
      </div>

      <div className="p-4 space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索学员昵称或用户名..."
            className="pl-9 h-10 bg-white text-sm"
          />
        </div>

        {/* 统计 */}
        <div className="text-xs text-gray-500 px-1">
          共 {realMembers.length} 位学员
          {configs.length > 0 && `，已设置档案 ${configs.length} 位`}
        </div>

        {/* 学员列表 */}
        {membersLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">加载中...</div>
        ) : filteredMembers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {searchText ? "没有找到匹配的学员" : "暂无学员，邀请学员加入后在此管理"}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMembers.map((member: any) => {
              const config = getConfig(member.userId);
              const progress = calcProgress(config);
              const hasConfig = !!config?.initialWeight;

              return (
                <div key={member.id} className="bg-white rounded-xl p-3.5 shadow-sm">
                  <div className="flex items-center gap-3">
                    {/* 头像 */}
                    <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {member.avatar ? (
                        <img src={member.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-rose-400" />
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {config?.nickname || member.nickname || member.username || "未知学员"}
                        </span>
                        {member.role === 'owner' && (
                          <span className="text-[10px] bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full flex-shrink-0">教练</span>
                        )}
                      </div>

                      {hasConfig ? (
                        <div className="mt-1 space-y-1">
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>初始 {Number(config.initialWeight).toFixed(1)} 斤</span>
                            <span>目标 {Number(config.targetWeight).toFixed(1)} 斤</span>
                            {config.height && <span>{Number(config.height).toFixed(0)} cm</span>}
                          </div>
                          {progress && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-rose-400 rounded-full transition-all"
                                  style={{ width: `${progress.pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-rose-500 flex-shrink-0">
                                已减 {progress.lost} 斤 ({progress.pct}%)
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span className="text-xs text-amber-500">待设置档案</span>
                        </div>
                      )}
                    </div>

                    {/* 编辑按钮 */}
                    <button
                      onClick={() => openEdit(member)}
                      className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 hover:bg-rose-100 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 档案编辑弹窗 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-[90%] max-w-sm">
          <DialogTitle className="text-base font-medium">
            设置学员档案
            {editingMember && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                {editingMember.nickname || editingMember.username}
              </span>
            )}
          </DialogTitle>

          <div className="space-y-3 py-1">
            {/* 昵称 */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">学员昵称（选填）</Label>
              <Input
                value={form.nickname}
                onChange={(e) => setForm(f => ({ ...f, nickname: e.target.value }))}
                placeholder="留空则使用用户名"
                className="h-9 text-sm"
              />
            </div>

            {/* 性别 */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">性别</Label>
              <div className="flex gap-2">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, gender: g }))}
                    className={`flex-1 h-9 rounded-lg text-sm font-medium border transition-colors ${
                      form.gender === g
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {g === "female" ? "女" : "男"}
                  </button>
                ))}
              </div>
            </div>

            {/* 初始体重 */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">初始体重 <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type="number"
                  value={form.initialWeight}
                  onChange={(e) => setForm(f => ({ ...f, initialWeight: e.target.value }))}
                  placeholder="开始减肥时的体重"
                  className="h-9 text-sm pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">斤</span>
              </div>
            </div>

            {/* 目标体重 */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">目标体重 <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type="number"
                  value={form.targetWeight}
                  onChange={(e) => setForm(f => ({ ...f, targetWeight: e.target.value }))}
                  placeholder="希望减到多少斤"
                  className="h-9 text-sm pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">斤</span>
              </div>
              {form.initialWeight && form.targetWeight &&
                parseFloat(form.initialWeight) > 0 && parseFloat(form.targetWeight) > 0 && (
                  <p className="text-xs text-rose-500">
                    计划减重：{(parseFloat(form.initialWeight) - parseFloat(form.targetWeight)).toFixed(1)} 斤
                  </p>
                )}
            </div>

            {/* 身高 */}
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">身高（选填）</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={form.height}
                  onChange={(e) => setForm(f => ({ ...f, height: e.target.value }))}
                  placeholder="身高"
                  className="h-9 text-sm pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">cm</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-center">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="flex-1 h-9">
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex-1 h-9 text-white"
              style={{ backgroundColor: 'var(--brand-red, #D32F2F)' }}
            >
              {saveMutation.isPending ? "保存中..." : "保存档案"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
