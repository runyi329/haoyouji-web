import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldAlert, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface EncryptionConfig {
  id: number;
  tableName: string;
  fieldName: string;
  fieldLabel: string;
  fieldGroup: string;
  isEnabled: number;
  encryptedAt: string | null;
}

interface EncryptionStats {
  [key: string]: { total: number; encrypted: number };
}

export default function DataSecurityPanel() {
  const [configs, setConfigs] = useState<EncryptionConfig[]>([]);
  const [stats, setStats] = useState<EncryptionStats>({});
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 初始化加密配置
  const initMutation = trpc.encryption.init.useMutation({
    onSuccess: () => {
      toast.success("加密配置初始化成功");
      setInitialized(true);
      fetchConfig();
    },
    onError: (err: any) => {
      toast.error("初始化失败: " + err.message);
    },
  });

  // 切换加密开关
  const toggleMutation = trpc.encryption.toggleField.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(`操作成功，已处理 ${data.processedCount} 条数据`);
        fetchConfig();
      } else {
        toast.error(data.error || "操作失败");
      }
      setToggling(null);
    },
    onError: (err: any) => {
      toast.error("操作失败: " + err.message);
      setToggling(null);
    },
  });

  // 获取配置
  const configQuery = trpc.encryption.getConfig.useQuery(undefined, {
    enabled: true,
    retry: false,
  });

  useEffect(() => {
    if (configQuery.data) {
      setConfigs(configQuery.data.configs || []);
      setStats(configQuery.data.stats || {});
      setKeyConfigured(configQuery.data.keyConfigured);
      setLoading(false);
      if ((configQuery.data.configs || []).length > 0) {
        setInitialized(true);
      }
    }
    if (configQuery.error) {
      setLoading(false);
    }
  }, [configQuery.data, configQuery.error]);

  const fetchConfig = () => {
    configQuery.refetch();
  };

  const handleToggle = (configId: number, currentEnabled: boolean) => {
    if (!keyConfigured) {
      toast.error("未配置加密密钥，请联系系统管理员在服务器设置 ENCRYPTION_KEY 环境变量");
      return;
    }

    const action = currentEnabled ? "关闭" : "开启";
    const config = configs.find(c => c.id === configId);
    const label = config?.fieldLabel || "";

    if (!confirm(`确定要${action}「${label}」的加密吗？\n\n${currentEnabled ? "关闭后，该字段的所有加密数据将被解密还原为明文。" : "开启后，该字段的所有现有数据将被加密处理。"}\n\n此操作可能需要一些时间，请耐心等待。`)) {
      return;
    }

    setToggling(configId);
    toggleMutation.mutate({ configId, enable: !currentEnabled });
  };

  // 按分组组织配置
  const groupedConfigs: Record<string, EncryptionConfig[]> = {};
  configs.forEach(config => {
    if (!groupedConfigs[config.fieldGroup]) {
      groupedConfigs[config.fieldGroup] = [];
    }
    groupedConfigs[config.fieldGroup].push(config);
  });

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 标题和状态 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[#D32F2F]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">数据安全管理</h2>
            <p className="text-sm text-gray-500">管理敏感数据的字段级AES-256加密</p>
          </div>
        </div>

        {/* 密钥状态 */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${keyConfigured ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {keyConfigured ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-700">加密密钥已配置</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-red-700">加密密钥未配置 — 请在服务器设置 ENCRYPTION_KEY 环境变量</span>
            </>
          )}
        </div>
      </div>

      {/* 初始化按钮（首次使用时） */}
      {!initialized && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">首次使用需要初始化加密配置</span>
          </div>
          <button
            onClick={() => initMutation.mutate()}
            disabled={initMutation.isPending}
            className="px-4 py-2 bg-[#D32F2F] text-white rounded-xl text-sm font-medium hover:bg-[#D32F2F]-dark disabled:opacity-50"
          >
            {initMutation.isPending ? "初始化中..." : "初始化加密配置"}
          </button>
        </div>
      )}

      {/* 加密开关列表 */}
      {initialized && Object.entries(groupedConfigs).map(([group, items]) => (
        <div key={group} className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#D32F2F]" />
            {group}
          </h3>
          <div className="space-y-3">
            {items.map(config => {
              const statKey = `${config.tableName}.${config.fieldName}`;
              const stat = stats[statKey] || { total: 0, encrypted: 0 };
              const isEnabled = config.isEnabled === 1;
              const isProcessing = toggling === config.id;

              return (
                <div
                  key={config.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    isEnabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isEnabled ? (
                        <Lock className="w-4 h-4 text-green-600" />
                      ) : (
                        <Unlock className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-gray-800">{config.fieldLabel}</span>
                      <span className="text-xs text-gray-400">({config.tableName}.{config.fieldName})</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-6">
                      <span className="text-xs text-gray-500">
                        共 {stat.total} 条数据
                      </span>
                      {stat.encrypted > 0 && (
                        <span className="text-xs text-green-600 font-medium">
                          已加密 {stat.encrypted} 条
                        </span>
                      )}
                      {isEnabled && config.encryptedAt && (
                        <span className="text-xs text-gray-400">
                          启用于 {new Date(config.encryptedAt).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggle(config.id, isEnabled)}
                    disabled={isProcessing || !keyConfigured}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                      isEnabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white mx-auto" />
                    ) : (
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                          isEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 安全说明 */}
      {initialized && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            安全说明
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• 加密算法：AES-256-GCM，业界最高安全标准</p>
            <p>• 加密密钥仅存储在服务器环境变量中，其他管理员无法查看</p>
            <p>• 开启加密后，数据库中存储的是密文，直接查看数据库无法获取明文</p>
            <p>• 关闭加密会将所有密文还原为明文，请谨慎操作</p>
            <p>• <strong className="text-red-600">重要：请务必备份加密密钥，密钥丢失将导致加密数据无法恢复</strong></p>
          </div>
        </div>
      )}
    </div>
  );
}
