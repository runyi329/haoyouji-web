import { useLocation } from "wouter";
import { ArrowLeft, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Wallet, Copy, Check, RefreshCw } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

interface WalletAddress {
  id: number;
  address: string;
  network: string;
  label: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export default function WalletAddressManager() {
  const [, setLocation] = useLocation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAddress, setEditingAddress] = useState<WalletAddress | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // 表单状态
  const [formAddress, setFormAddress] = useState("");
  const [formNetwork, setFormNetwork] = useState("TRC20");
  const [formLabel, setFormLabel] = useState("");

  const utils = trpc.useUtils();

  // 获取系统统计信息（包含所有地址）
  const statsQuery = trpc.recharge.adminGetSystemStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const allAddresses: WalletAddress[] = (statsQuery.data?.allWalletAddresses as any[]) || [];

  // 添加地址
  const addMutation = trpc.recharge.adminAddWalletAddress.useMutation({
    onSuccess: () => {
      toast.success("收款地址添加成功");
      setShowAddDialog(false);
      resetForm();
      utils.recharge.adminGetSystemStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "添加失败");
    },
  });

  // 更新地址
  const updateMutation = trpc.recharge.adminUpdateWalletAddress.useMutation({
    onSuccess: () => {
      toast.success("收款地址更新成功");
      setEditingAddress(null);
      resetForm();
      utils.recharge.adminGetSystemStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "更新失败");
    },
  });

  // 删除地址
  const deleteMutation = trpc.recharge.adminDeleteWalletAddress.useMutation({
    onSuccess: () => {
      toast.success("收款地址已删除");
      utils.recharge.adminGetSystemStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "删除失败");
    },
  });

  const resetForm = () => {
    setFormAddress("");
    setFormNetwork("TRC20");
    setFormLabel("");
  };

  const handleAdd = () => {
    if (!formAddress.trim()) {
      toast.error("请输入钱包地址");
      return;
    }
    addMutation.mutate({
      address: formAddress.trim(),
      network: formNetwork,
      label: formLabel.trim() || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingAddress) return;
    if (!formAddress.trim()) {
      toast.error("请输入钱包地址");
      return;
    }
    updateMutation.mutate({
      id: editingAddress.id,
      address: formAddress.trim(),
      network: formNetwork,
      label: formLabel.trim() || undefined,
    });
  };

  const handleToggleEnabled = (addr: WalletAddress) => {
    updateMutation.mutate({
      id: addr.id,
      enabled: addr.enabled === 1 ? 0 : 1,
    });
  };

  const handleDelete = (addr: WalletAddress) => {
    if (confirm(`确定要删除地址 "${addr.label || addr.address.slice(0, 12) + '...'}" 吗？`)) {
      deleteMutation.mutate({ id: addr.id });
    }
  };

  const handleEdit = (addr: WalletAddress) => {
    setEditingAddress(addr);
    setFormAddress(addr.address);
    setFormNetwork(addr.network);
    setFormLabel(addr.label || "");
  };

  const handleCopy = async (address: string, id: number) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      toast.success("地址已复制");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const networkColors: Record<string, string> = {
    TRC20: "bg-red-100 text-red-700",
    ERC20: "bg-blue-100 text-blue-700",
    BEP20: "bg-yellow-100 text-yellow-700",
    APTOS: "bg-green-100 text-green-700",
    SOLANA: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => setLocation("/admin/recharge-monitor")} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">收款地址管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => statsQuery.refetch()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              className="flex items-center gap-1 bg-[#D32F2F] text-white px-3 py-2 rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              添加
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 统计概览 */}
        <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-4 text-white">
          <div className="flex items-center mb-2">
            <Wallet className="w-5 h-5 mr-2" />
            <span className="text-sm opacity-90">收款地址概览</span>
          </div>
          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-3xl font-bold">{allAddresses.length}</div>
              <div className="text-sm opacity-90">总地址数</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {allAddresses.filter((a) => a.enabled === 1).length}
              </div>
              <div className="text-sm opacity-90">已启用</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {allAddresses.filter((a) => a.enabled === 0).length}
              </div>
              <div className="text-sm opacity-90">已禁用</div>
            </div>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <p>系统会在用户创建充值订单时，从<strong>已启用</strong>的地址中随机选择一个作为收款地址。</p>
          <p className="mt-1">区块链扫描器会自动扫描所有已启用地址的入账交易。</p>
        </div>

        {/* 地址列表 */}
        {allAddresses.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">暂无收款地址</p>
            <button
              onClick={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              className="bg-[#D32F2F] text-white px-4 py-2 rounded-lg text-sm"
            >
              添加第一个地址
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {allAddresses.map((addr) => (
              <div
                key={addr.id}
                className={`bg-white rounded-lg p-4 border ${
                  addr.enabled === 1 ? "border-green-200" : "border-gray-200 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        networkColors[addr.network] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {addr.network}
                    </span>
                    {addr.label && (
                      <span className="text-sm font-medium text-gray-700">{addr.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 启用/禁用开关 */}
                    <button
                      onClick={() => handleToggleEnabled(addr)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        addr.enabled === 1
                          ? "text-green-600 hover:bg-green-50"
                          : "text-gray-400 hover:bg-gray-50"
                      }`}
                      title={addr.enabled === 1 ? "点击禁用" : "点击启用"}
                    >
                      {addr.enabled === 1 ? (
                        <ToggleRight className="w-6 h-6" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                    {/* 编辑 */}
                    <button
                      onClick={() => handleEdit(addr)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {/* 删除 */}
                    <button
                      onClick={() => handleDelete(addr)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 地址 */}
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs font-mono text-gray-600 break-all flex-1">
                    {addr.address}
                  </code>
                  <button
                    onClick={() => handleCopy(addr.address, addr.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="复制地址"
                  >
                    {copiedId === addr.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* 状态标签 */}
                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>
                    {addr.enabled === 1 ? (
                      <span className="text-green-600">● 已启用</span>
                    ) : (
                      <span className="text-gray-400">○ 已禁用</span>
                    )}
                  </span>
                  <span>
                    添加于{" "}
                    {new Date(addr.created_at).toLocaleDateString("zh-CN", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑对话框 */}
      {(showAddDialog || editingAddress) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl p-6 animate-in slide-in-from-bottom">
            <h3 className="text-lg font-semibold mb-4">
              {editingAddress ? "编辑收款地址" : "添加收款地址"}
            </h3>

            <div className="space-y-4">
              {/* 网络类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">网络类型</label>
                <select
                  value={formNetwork}
                  onChange={(e) => setFormNetwork(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                >
                  <option value="TRC20">TRC20 - 推荐 • 快速到账 • 低手续费</option>
                  <option value="APTOS">Aptos - 新一代公链 • 快速安全</option>
                  <option value="ERC20">ERC20 - 以太坊网络 • 手续费较高</option>
                  <option value="SOLANA">Solana - 高性能公链 • 极速到账</option>
                  <option value="BEP20">BSC(BEP20) - 币安智能链 • 快速低费</option>
                </select>
              </div>

              {/* 钱包地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">钱包地址</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder={
                    formNetwork === "TRC20"
                      ? "T开头的TRC20地址"
                      : formNetwork === "ERC20"
                      ? "0x开头的ERC20地址"
                      : formNetwork === "BEP20"
                      ? "0x开头的BEP20地址"
                      : formNetwork === "APTOS"
                      ? "Aptos钱包地址"
                      : "Solana钱包地址"
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                />
              </div>

              {/* 备注名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  备注名称 <span className="text-gray-400">(可选)</span>
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="如：主钱包、备用钱包"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setEditingAddress(null);
                  resetForm();
                }}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={editingAddress ? handleUpdate : handleAdd}
                disabled={addMutation.isPending || updateMutation.isPending}
                className="flex-1 py-2.5 bg-[#D32F2F] text-white rounded-lg text-sm font-medium hover:bg-[#B71C1C] disabled:opacity-50"
              >
                {addMutation.isPending || updateMutation.isPending
                  ? "处理中..."
                  : editingAddress
                  ? "保存修改"
                  : "添加地址"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
