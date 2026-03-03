import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export default function MemberInfoSettings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  // 获取账本详情
  const { data: ledgerData, isLoading } = trpc.ledger.getById.useQuery({
    ledgerId,
  });

  // 获取账本成员列表
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 获取所有成员的减肥配置
  const { data: allMemberConfigs } = trpc.diet.getAllMemberConfigs.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 保存成员信息的mutation
  const utils = trpc.useUtils();
  const saveMemberConfigMutation = trpc.diet.setMemberConfig.useMutation({
    onSuccess: () => {
      toast.success("成员信息已保存");
      setShowEditDialog(false);
      setSelectedMember(null);
      utils.diet.getAllMemberConfigs.invalidate({ ledgerId });
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  // 过滤成员列表（排除创建人和AI）
  const filteredMembers = useMemo(() => {
    const nonOwnerMembers = members?.filter((m: any) => m.role !== 'owner' && m.memberType !== 'ai') || [];
    if (!searchQuery.trim()) return nonOwnerMembers;
    return nonOwnerMembers.filter((m: any) =>
      (m.nickname || m.username || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [members, searchQuery]);

  // 打开编辑弹窗
  const handleEditMember = (member: any) => {
    const config = allMemberConfigs?.find((c: any) => c.userId === member.userId) || {};
    setSelectedMember(member);
    setEditForm({
      userId: member.userId,
      studentName: config.studentName || member.nickname || member.username || "",
      gender: config.gender || "female",
      height: config.height || "",
      initialWeight: config.initialWeight || "",
      targetWeight: config.targetWeight || "",
      startDate: config.startDate || new Date().toISOString().split('T')[0],
      chest: config.chest || "",
      waist: config.waist || "",
      hip: config.hip || "",
      notes: config.notes || "",
    });
    setShowEditDialog(true);
  };

  // 保存成员信息
  const handleSaveConfig = () => {
    if (!editForm.initialWeight || !editForm.targetWeight) {
      toast.error("初始体重和目标体重为必填项");
      return;
    }

    saveMemberConfigMutation.mutate({
      ledgerId,
      userId: editForm.userId,
      studentName: editForm.studentName,
      gender: editForm.gender,
      height: editForm.height ? parseFloat(editForm.height) : null,
      initialWeight: parseFloat(editForm.initialWeight),
      targetWeight: parseFloat(editForm.targetWeight),
      startDate: editForm.startDate,
      chest: editForm.chest ? parseFloat(editForm.chest) : null,
      waist: editForm.waist ? parseFloat(editForm.waist) : null,
      hip: editForm.hip ? parseFloat(editForm.hip) : null,
      notes: editForm.notes,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">账本不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">
            成员信息设置
          </h1>
          <div className="w-10"></div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="bg-white mt-3 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索成员..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* 成员列表 */}
      <div className="bg-white mt-3">
        {filteredMembers.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            {members?.length === 0 ? "暂无成员" : "未找到匹配的成员"}
          </div>
        ) : (
          filteredMembers.map((member: any) => {
            const config = allMemberConfigs?.find((c: any) => c.userId === member.userId);
            const hasConfig = !!config;
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <UserAvatar
                    username={member.username}
                    avatar={member.avatar}
                    nickname={member.nickname}
                    size="md"
                    className="w-12 h-12 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-gray-900 truncate">
                      {member.nickname || member.username}
                    </div>
                    {hasConfig && (
                      <div className="text-xs text-gray-400">
                        {config.initialWeight}kg → {config.targetWeight}kg
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleEditMember(member)}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-colors"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  编辑
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 编辑弹窗 */}
      {showEditDialog && selectedMember && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogTitle className="text-lg font-semibold">
              编辑 {selectedMember.nickname || selectedMember.username} 的信息
            </DialogTitle>

            <div className="space-y-4 mt-4">
              {/* 学员昵称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  学员昵称
                </label>
                <Input
                  type="text"
                  value={editForm.studentName}
                  onChange={(e) => setEditForm({ ...editForm, studentName: e.target.value })}
                  placeholder="输入学员昵称"
                />
              </div>

              {/* 性别 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  性别
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditForm({ ...editForm, gender: "female" })}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                      editForm.gender === "female"
                        ? "bg-[#D32F2F] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    女
                  </button>
                  <button
                    onClick={() => setEditForm({ ...editForm, gender: "male" })}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors ${
                      editForm.gender === "male"
                        ? "bg-[#D32F2F] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    男
                  </button>
                </div>
              </div>

              {/* 身高 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  身高 (cm)
                </label>
                <Input
                  type="number"
                  value={editForm.height}
                  onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
                  placeholder="输入身高"
                />
              </div>

              {/* 初始体重 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  初始体重 (kg) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  value={editForm.initialWeight}
                  onChange={(e) => setEditForm({ ...editForm, initialWeight: e.target.value })}
                  placeholder="输入初始体重"
                />
              </div>

              {/* 目标体重 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  目标体重 (kg) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  value={editForm.targetWeight}
                  onChange={(e) => setEditForm({ ...editForm, targetWeight: e.target.value })}
                  placeholder="输入目标体重"
                />
              </div>

              {/* 减肥开始日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  减肥开始日期
                </label>
                <Input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                />
              </div>

              {/* 详细信息 - 选填 */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">详细信息（选填）</p>

                {/* 胸围 */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-600 mb-1">
                    胸围 (cm)
                  </label>
                  <Input
                    type="number"
                    value={editForm.chest}
                    onChange={(e) => setEditForm({ ...editForm, chest: e.target.value })}
                    placeholder="输入胸围"
                  />
                </div>

                {/* 腰围 */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-600 mb-1">
                    腰围 (cm)
                  </label>
                  <Input
                    type="number"
                    value={editForm.waist}
                    onChange={(e) => setEditForm({ ...editForm, waist: e.target.value })}
                    placeholder="输入腰围"
                  />
                </div>

                {/* 臀围 */}
                <div className="mb-3">
                  <label className="block text-sm text-gray-600 mb-1">
                    臀围 (cm)
                  </label>
                  <Input
                    type="number"
                    value={editForm.hip}
                    onChange={(e) => setEditForm({ ...editForm, hip: e.target.value })}
                    placeholder="输入臀围"
                  />
                </div>

                {/* 备注 */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    备注
                  </label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="输入备注信息"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F]"
                    rows={3}
                  />
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  className="flex-1"
                >
                  取消
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveMemberConfigMutation.isPending}
                  className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
                >
                  {saveMemberConfigMutation.isPending ? "保存中..." : "保存"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
