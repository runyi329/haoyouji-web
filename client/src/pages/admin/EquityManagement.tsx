import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Edit, Trash2, TrendingUp, Search, Check, ChevronDown, Save, X, Settings } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// 用户搜索选择器组件
function UserSelector({ value, onChange }: { value: string; onChange: (userId: string, userName: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedUserName, setSelectedUserName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: users } = trpc.admin.getUsers.useQuery();

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 过滤用户列表
  const filteredUsers = users?.filter((u) => {
    const keyword = searchText.toLowerCase();
    const name = u.name ?? "";
    const username = u.username ?? "";
    return (
      name.toLowerCase().includes(keyword) ||
      username.toLowerCase().includes(keyword) ||
      u.id.toString().includes(keyword)
    );
  }) || [];

  const handleSelect = (user: { id: number; name: string | null; username: string }) => {
    const displayName = user.name || user.username || `用户${user.id}`;
    onChange(user.id.toString(), displayName);
    setSelectedUserName(displayName);
    setSearchText("");
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className="flex items-center border rounded-md px-3 py-2 cursor-pointer hover:border-gray-400 transition-colors"
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        {value ? (
          <span className="flex-1 text-sm">{selectedUserName} (ID: {value})</span>
        ) : (
          <span className="flex-1 text-sm text-gray-400">点击选择用户...</span>
        )}
        <ChevronDown className="w-4 h-4 text-gray-400 ml-2" />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[#A80000]/20 focus:border-[#A80000]"
                placeholder="搜索用户名或昵称..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* 用户列表 */}
          <div className="overflow-y-auto max-h-48">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                    value === u.id.toString() ? "bg-red-50" : ""
                  }`}
                  onClick={() => handleSelect(u)}
                >
                  {/* 首字母头像 */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A80000] to-[#c44] flex items-center justify-center flex-shrink-0 mr-3">
                    <span className="text-white text-xs font-bold">
                      {(u.name || u.username || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name || u.username || `用户${u.id}`}</p>
                    <p className="text-xs text-gray-500">@{u.username} · ID: {u.id}</p>
                  </div>
                  {value === u.id.toString() && (
                    <Check className="w-4 h-4 text-[#A80000] flex-shrink-0 ml-2" />
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-gray-500">
                {users ? "未找到匹配的用户" : "加载中..."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 预定义的池类型颜色
const POOL_COLORS: Record<string, { bg: string; text: string }> = {
  investment_pool_percentage: { bg: "bg-red-50", text: "text-[#A80000]" },
  contribution_pool_percentage: { bg: "bg-blue-50", text: "text-blue-600" },
  option_pool_percentage: { bg: "bg-purple-50", text: "text-purple-600" },
  reserve_pool_percentage: { bg: "bg-green-50", text: "text-green-600" },
  founder_pool_percentage: { bg: "bg-amber-50", text: "text-amber-600" },
};

const POOL_LABELS: Record<string, string> = {
  investment_pool_percentage: "投资股份池",
  contribution_pool_percentage: "贡献股份池",
  option_pool_percentage: "期权池",
  reserve_pool_percentage: "预留池",
  founder_pool_percentage: "创始人池",
};

// 获取池的颜色（支持自定义池）
function getPoolColor(key: string, index: number) {
  if (POOL_COLORS[key]) return POOL_COLORS[key];
  const colors = [
    { bg: "bg-teal-50", text: "text-teal-600" },
    { bg: "bg-orange-50", text: "text-orange-600" },
    { bg: "bg-pink-50", text: "text-pink-600" },
    { bg: "bg-cyan-50", text: "text-cyan-600" },
    { bg: "bg-indigo-50", text: "text-indigo-600" },
  ];
  return colors[index % colors.length];
}

export default function EquityManagement() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<any>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  
  // 编辑模式状态
  const [isEditingPools, setIsEditingPools] = useState(false);
  const [isEditingRules, setIsEditingRules] = useState(false);
  const [editPoolData, setEditPoolData] = useState<{ key: string; label: string; value: string; description: string }[]>([]);
  const [editRuleData, setEditRuleData] = useState<{ key: string; value: string }[]>([]);
  
  // 新增池弹窗
  const [isAddPoolDialogOpen, setIsAddPoolDialogOpen] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolValue, setNewPoolValue] = useState("");
  const [newPoolKey, setNewPoolKey] = useState("");
  
  const [formData, setFormData] = useState({
    userId: "",
    investorName: "",
    investorIdCard: "",
    amount: "",
    investmentDate: new Date().toISOString().split('T')[0],
    notes: "",
  });

  const { data: investments, isLoading, refetch } = trpc.equity.getAllInvestments.useQuery();
  const { data: shareholders, refetch: refetchShareholders } = trpc.equity.getAllShareholders.useQuery();
  const { data: rules, refetch: refetchRules } = trpc.equity.getRules.useQuery();
  const { data: rulesDetail, refetch: refetchRulesDetail } = trpc.equity.getRulesDetail.useQuery();

  const addInvestmentMutation = trpc.equity.addInvestment.useMutation({
    onSuccess: () => {
      toast.success("添加成功");
      setIsAddDialogOpen(false);
      setFormData({ userId: "", investorName: "", investorIdCard: "", amount: "", investmentDate: new Date().toISOString().split('T')[0], notes: "" });
      setSelectedUserName("");
      refetch();
      refetchShareholders();
    },
    onError: (error) => {
      toast.error("添加失败", { description: error.message });
    },
  });

  const updateInvestmentMutation = trpc.equity.updateInvestment.useMutation({
    onSuccess: () => {
      toast.success("更新成功");
      setIsEditDialogOpen(false);
      setEditingInvestment(null);
      refetch();
      refetchShareholders();
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const deleteInvestmentMutation = trpc.equity.deleteInvestment.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      refetch();
      refetchShareholders();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const updateRulesMutation = trpc.equity.updateRules.useMutation({
    onSuccess: () => {
      toast.success("规则更新成功");
      refetchRules();
      refetchRulesDetail();
      refetchShareholders();
      setIsEditingPools(false);
      setIsEditingRules(false);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const deleteRuleMutation = trpc.equity.deleteRule.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetchRules();
      refetchRulesDetail();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  // 识别池类型和贡献规则
  const poolKeys = rulesDetail?.filter(r => r.ruleKey.endsWith('_pool_percentage')) || [];
  const contributionRuleKeys = rulesDetail?.filter(r => !r.ruleKey.endsWith('_pool_percentage')) || [];

  // 计算池总和
  const poolTotal = editPoolData.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);

  // 开始编辑股份池
  const startEditPools = () => {
    setEditPoolData(
      poolKeys.map(r => ({
        key: r.ruleKey,
        label: POOL_LABELS[r.ruleKey] || r.ruleDescription || r.ruleKey,
        value: r.ruleValue.toString(),
        description: r.ruleDescription || "",
      }))
    );
    setIsEditingPools(true);
  };

  // 保存股份池
  const savePoolConfig = () => {
    const total = editPoolData.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`所有股份池总和必须等于100%，当前为 ${total.toFixed(2)}%`);
      return;
    }
    updateRulesMutation.mutate({
      rules: editPoolData.map(p => ({
        ruleKey: p.key,
        ruleValue: parseFloat(p.value) || 0,
        ruleDescription: p.description || undefined,
      })),
    });
  };

  // 添加新池
  const handleAddPool = () => {
    if (!newPoolName || !newPoolValue) {
      toast.error("请填写池名称和比例");
      return;
    }
    // 生成key
    const key = newPoolKey || `${newPoolName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_pool_percentage`;
    const newPool = {
      key,
      label: newPoolName,
      value: newPoolValue,
      description: newPoolName,
    };
    setEditPoolData([...editPoolData, newPool]);
    setIsAddPoolDialogOpen(false);
    setNewPoolName("");
    setNewPoolValue("");
    setNewPoolKey("");
  };

  // 删除池
  const handleRemovePool = (index: number) => {
    const pool = editPoolData[index];
    if (pool.key === 'investment_pool_percentage' || pool.key === 'contribution_pool_percentage') {
      toast.error("投资股份池和贡献股份池不能删除");
      return;
    }
    const newData = editPoolData.filter((_, i) => i !== index);
    setEditPoolData(newData);
    // 如果这个key已经在数据库中，需要删除
    if (poolKeys.find(r => r.ruleKey === pool.key)) {
      deleteRuleMutation.mutate({ ruleKey: pool.key });
    }
  };

  // 开始编辑贡献规则
  const startEditRules = () => {
    setEditRuleData(
      contributionRuleKeys.map(r => ({
        key: r.ruleKey,
        value: r.ruleValue.toString(),
      }))
    );
    setIsEditingRules(true);
  };

  // 保存贡献规则
  const saveRulesConfig = () => {
    updateRulesMutation.mutate({
      rules: editRuleData.map(r => ({
        ruleKey: r.key,
        ruleValue: parseFloat(r.value) || 0,
      })),
    });
  };

  const handleAdd = () => {
    if (!formData.userId || !formData.amount) {
      toast.error("请填写必填项");
      return;
    }
    addInvestmentMutation.mutate({
      userId: parseInt(formData.userId),
      investorName: formData.investorName || undefined,
      investorIdCard: formData.investorIdCard || undefined,
      amount: parseFloat(formData.amount),
      investmentDate: formData.investmentDate,
      notes: formData.notes,
    });
  };

  const handleEdit = () => {
    if (!editingInvestment || !formData.amount) {
      toast.error("请填写必填项");
      return;
    }
    updateInvestmentMutation.mutate({
      id: editingInvestment.id,
      amount: parseFloat(formData.amount),
      investorName: formData.investorName || undefined,
      investorIdCard: formData.investorIdCard || undefined,
      investmentDate: formData.investmentDate,
      notes: formData.notes,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("确定要删除这条投资记录吗？")) {
      deleteInvestmentMutation.mutate({ id });
    }
  };

  const openEditDialog = (investment: any) => {
    setEditingInvestment(investment);
    setFormData({
      userId: investment.userId.toString(),
      investorName: investment.investorName || "",
      investorIdCard: investment.investorIdCard || "",
      amount: investment.investmentAmount,
      investmentDate: investment.investmentDate ? new Date(investment.investmentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      notes: investment.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center">
          <Link href="/admin">
            <button className="text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900">股权激励管理</h1>
          <div className="w-6"></div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 股份池配置 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">股份池配置</h2>
            {!isEditingPools ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startEditPools}
                className="text-gray-600 hover:text-[#A80000] hover:border-[#A80000]"
              >
                <Settings className="w-4 h-4 mr-1" />
                编辑配置
              </Button>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingPools(false)}
                >
                  <X className="w-4 h-4 mr-1" />
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={savePoolConfig}
                  className="bg-[#A80000] hover:bg-[#8a0000]"
                  disabled={updateRulesMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {updateRulesMutation.isPending ? "保存中..." : "保存"}
                </Button>
              </div>
            )}
          </div>

          {!isEditingPools ? (
            /* 展示模式 */
            <div className="grid grid-cols-2 gap-4">
              {poolKeys.map((pool, index) => {
                const color = getPoolColor(pool.ruleKey, index);
                const label = POOL_LABELS[pool.ruleKey] || pool.ruleDescription || pool.ruleKey;
                return (
                  <div key={pool.ruleKey} className={`p-4 ${color.bg} rounded-xl`}>
                    <p className="text-sm text-gray-600 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color.text}`}>
                      {pool.ruleValue.toFixed(2)}%
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 编辑模式 */
            <div className="space-y-4">
              {editPoolData.map((pool, index) => {
                const color = getPoolColor(pool.key, index);
                return (
                  <div key={pool.key} className={`p-4 ${color.bg} rounded-xl`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{pool.label}</span>
                      {pool.key !== 'investment_pool_percentage' && pool.key !== 'contribution_pool_percentage' && (
                        <button
                          onClick={() => handleRemovePool(index)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="删除此池"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={pool.value}
                        onChange={(e) => {
                          const newData = [...editPoolData];
                          newData[index].value = e.target.value;
                          setEditPoolData(newData);
                        }}
                        className="bg-white"
                      />
                      <span className={`text-lg font-bold ${color.text}`}>%</span>
                    </div>
                  </div>
                );
              })}

              {/* 添加新池按钮 */}
              <button
                onClick={() => setIsAddPoolDialogOpen(true)}
                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-[#A80000] hover:text-[#A80000] transition-colors flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>添加新的股份池</span>
              </button>

              {/* 总和提示 */}
              <div className={`p-3 rounded-lg flex items-center justify-between ${
                Math.abs(poolTotal - 100) < 0.01 ? "bg-green-50" : "bg-red-50"
              }`}>
                <span className="text-sm font-medium text-gray-700">所有池总和</span>
                <span className={`text-lg font-bold ${
                  Math.abs(poolTotal - 100) < 0.01 ? "text-green-600" : "text-red-600"
                }`}>
                  {poolTotal.toFixed(2)}% / 100%
                  {Math.abs(poolTotal - 100) < 0.01 ? " ✓" : " (需等于100%)"}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* 贡献规则 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">贡献股份规则</h2>
            {!isEditingRules ? (
              <Button
                variant="outline"
                size="sm"
                onClick={startEditRules}
                className="text-gray-600 hover:text-[#A80000] hover:border-[#A80000]"
              >
                <Settings className="w-4 h-4 mr-1" />
                编辑规则
              </Button>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingRules(false)}
                >
                  <X className="w-4 h-4 mr-1" />
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={saveRulesConfig}
                  className="bg-[#A80000] hover:bg-[#8a0000]"
                  disabled={updateRulesMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {updateRulesMutation.isPending ? "保存中..." : "保存"}
                </Button>
              </div>
            )}
          </div>

          {!isEditingRules ? (
            /* 展示模式 */
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">邀请新用户</span>
                <span className="font-bold text-[#A80000]">
                  {rules?.invite_per_user_percentage?.toFixed(2) || "0.05"}% / 人
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">被邀请人每100人脉</span>
                <span className="font-bold text-[#A80000]">
                  {rules?.referral_network_per_100_percentage?.toFixed(2) || "0.02"}%
                </span>
              </div>
            </div>
          ) : (
            /* 编辑模式 */
            <div className="space-y-3">
              {editRuleData.map((rule, index) => {
                const labels: Record<string, string> = {
                  invite_per_user_percentage: "邀请新用户（% / 人）",
                  referral_network_per_100_percentage: "被邀请人每100人脉（%）",
                };
                return (
                  <div key={rule.key} className="p-3 bg-gray-50 rounded-lg">
                    <Label className="text-sm text-gray-700 mb-2 block">
                      {labels[rule.key] || rule.key}
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={rule.value}
                        onChange={(e) => {
                          const newData = [...editRuleData];
                          newData[index].value = e.target.value;
                          setEditRuleData(newData);
                        }}
                        className="bg-white"
                      />
                      <span className="text-sm font-bold text-[#A80000]">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 股东股权总览 */}
        {shareholders && shareholders.length > 0 && (
          <Card className="p-6 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">股东股权总览</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">股东</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">总股份</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">投资股份</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">邀请贡献</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">人脉贡献</th>
                  </tr>
                </thead>
                <tbody>
                  {shareholders.map((shareholder: any) => (
                    <tr key={shareholder.userId} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm">{shareholder.userName}</td>
                      <td className="py-3 px-2 text-sm text-right font-bold text-[#A80000]">
                        {shareholder.totalEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.investmentEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.inviteEquity.toFixed(4)}%
                      </td>
                      <td className="py-3 px-2 text-sm text-right">
                        {shareholder.referralNetworkEquity.toFixed(4)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* 投资记录管理 */}
        <Card className="p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">投资记录管理</h2>
            <Button
              onClick={() => {
                setFormData({ userId: "", investorName: "", investorIdCard: "", amount: "", investmentDate: new Date().toISOString().split('T')[0], notes: "" });
                setSelectedUserName("");
                setIsAddDialogOpen(true);
              }}
              className="bg-[#A80000] hover:bg-[#8a0000]"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加投资
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">股东</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">投资金额</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">投资日期</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">备注</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {investments && investments.length > 0 ? (
                  investments.map((investment: any) => (
                    <tr key={investment.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm">{investment.userName || investment.username}</td>
                      <td className="py-3 px-2 text-sm text-right font-semibold">
                        ¥{Number(investment.investmentAmount).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {new Date(investment.investmentDate).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-600">{investment.notes || '-'}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditDialog(investment)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(investment.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      暂无投资记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 添加投资对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加投资记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>选择用户 *</Label>
              <div className="mt-1.5">
                <UserSelector
                  value={formData.userId}
                  onChange={(userId, userName) => {
                    setFormData({ ...formData, userId });
                    setSelectedUserName(userName);
                  }}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="investorName">投资人姓名</Label>
              <Input
                id="investorName"
                type="text"
                value={formData.investorName}
                onChange={(e) => setFormData({ ...formData, investorName: e.target.value })}
                placeholder="可选，不同于用户名"
              />
            </div>
            <div>
              <Label htmlFor="investorIdCard">投资人身份证</Label>
              <Input
                id="investorIdCard"
                type="text"
                maxLength={18}
                value={formData.investorIdCard}
                onChange={(e) => setFormData({ ...formData, investorIdCard: e.target.value })}
                placeholder="可选，18位身份证号"
              />
            </div>
            <div>
              <Label htmlFor="amount">投资金额（元）*</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="请输入投资金额"
              />
            </div>
            <div>
              <Label htmlFor="investmentDate">投资日期 *</Label>
              <Input
                id="investmentDate"
                type="date"
                value={formData.investmentDate}
                onChange={(e) => setFormData({ ...formData, investmentDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="notes">备注</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="可选"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleAdd}
              className="bg-[#A80000] hover:bg-[#8a0000]"
              disabled={addInvestmentMutation.isPending}
            >
              {addInvestmentMutation.isPending ? "添加中..." : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑投资对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑投资记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>股东</Label>
              <Input value={editingInvestment?.userName || editingInvestment?.username || ""} disabled />
            </div>
            <div>
              <Label htmlFor="edit-investorName">投资人姓名</Label>
              <Input
                id="edit-investorName"
                type="text"
                value={formData.investorName}
                onChange={(e) => setFormData({ ...formData, investorName: e.target.value })}
                placeholder="可选，不同于用户名"
              />
            </div>
            <div>
              <Label htmlFor="edit-investorIdCard">投资人身份证</Label>
              <Input
                id="edit-investorIdCard"
                type="text"
                maxLength={18}
                value={formData.investorIdCard}
                onChange={(e) => setFormData({ ...formData, investorIdCard: e.target.value })}
                placeholder="可选，18位身份证号"
              />
            </div>
            <div>
              <Label htmlFor="edit-amount">投资金额（元）*</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-investmentDate">投资日期 *</Label>
              <Input
                id="edit-investmentDate"
                type="date"
                value={formData.investmentDate}
                onChange={(e) => setFormData({ ...formData, investmentDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">备注</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleEdit}
              className="bg-[#A80000] hover:bg-[#8a0000]"
              disabled={updateInvestmentMutation.isPending}
            >
              {updateInvestmentMutation.isPending ? "更新中..." : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加新池对话框 */}
      <Dialog open={isAddPoolDialogOpen} onOpenChange={setIsAddPoolDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加新的股份池</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="poolName">池名称 *</Label>
              <Input
                id="poolName"
                type="text"
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                placeholder="例如：期权池、预留池"
              />
            </div>
            <div>
              <Label htmlFor="poolKey">池标识（英文，可选）</Label>
              <Input
                id="poolKey"
                type="text"
                value={newPoolKey}
                onChange={(e) => setNewPoolKey(e.target.value)}
                placeholder="例如：option_pool_percentage（留空自动生成）"
              />
            </div>
            <div>
              <Label htmlFor="poolValue">比例（%）*</Label>
              <Input
                id="poolValue"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={newPoolValue}
                onChange={(e) => setNewPoolValue(e.target.value)}
                placeholder="例如：10"
              />
            </div>
            <p className="text-xs text-gray-500">
              提示：添加后请确保所有池的总和等于100%，可以调整其他池的比例来平衡。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddPoolDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleAddPool}
              className="bg-[#A80000] hover:bg-[#8a0000]"
            >
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
