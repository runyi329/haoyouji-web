import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Building2, Pencil, Trash2, Users, ChevronRight, Check, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCenterToast } from "@/components/ui/center-toast";

type Company = {
  id: number;
  ledger_id: number;
  name: string;
  tax_no?: string | null;
  address?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  remark?: string | null;
  enabledCount?: number;
};

type AccessMember = {
  userId: number;
  name: string;
  username: string;
  avatar?: string | null;
  role: string;
  isEnabled: boolean;
};

// ========== 报销类型标准目录 ==========
export const EXPENSE_CATEGORIES = [
  {
    key: "travel",
    label: "差旅费",
    items: [
      { key: "flight", label: "机票" },
      { key: "train", label: "高铁/动车" },
      { key: "train_regular", label: "普通火车" },
      { key: "bus", label: "长途汽车" },
      { key: "hotel", label: "住宿费" },
      { key: "local_transport", label: "市内交通（出租/滴滴）" },
      { key: "allowance", label: "出差补贴" },
      { key: "toll", label: "过路过桥费" },
    ],
  },
  {
    key: "entertainment",
    label: "业务招待费",
    items: [
      { key: "dining", label: "餐饮宴请" },
      { key: "gift", label: "礼品礼金" },
      { key: "tea", label: "茶水饮品" },
      { key: "reception", label: "商务活动接待" },
    ],
  },
  {
    key: "meeting",
    label: "会议费",
    items: [
      { key: "venue", label: "会议场地租金" },
      { key: "materials", label: "会议资料印刷" },
      { key: "meeting_hotel", label: "会议住宿" },
      { key: "meeting_dining", label: "会议餐饮" },
      { key: "registration", label: "培训注册费" },
    ],
  },
  {
    key: "office",
    label: "办公费",
    items: [
      { key: "supplies", label: "办公用品" },
      { key: "print", label: "文件打印复印" },
      { key: "express", label: "快递邮寄" },
      { key: "utilities", label: "水电杂费" },
      { key: "consumables", label: "设备耗材" },
    ],
  },
  {
    key: "communication",
    label: "通讯费",
    items: [
      { key: "phone", label: "手机话费" },
      { key: "internet", label: "网络宽带" },
      { key: "video_conf", label: "视频会议工具" },
    ],
  },
  {
    key: "transport",
    label: "交通费",
    items: [
      { key: "taxi", label: "市内打车/公交/地铁" },
      { key: "parking", label: "停车费" },
      { key: "fuel", label: "加油费" },
      { key: "car_repair", label: "车辆维修保养" },
    ],
  },
  {
    key: "maintenance",
    label: "维修维护费",
    items: [
      { key: "equipment", label: "办公设备维修" },
      { key: "vehicle", label: "车辆维修" },
      { key: "building", label: "房屋维修" },
    ],
  },
  {
    key: "rental",
    label: "租赁费",
    items: [
      { key: "office_rent", label: "办公场地租金" },
      { key: "equipment_rent", label: "设备租赁" },
      { key: "car_rent", label: "车辆租赁" },
    ],
  },
  {
    key: "marketing",
    label: "广告宣传费",
    items: [
      { key: "ad", label: "广告投放" },
      { key: "promo_material", label: "宣传物料" },
      { key: "market_promo", label: "市场推广" },
      { key: "exhibition", label: "展会费用" },
    ],
  },
  {
    key: "welfare",
    label: "员工福利费",
    items: [
      { key: "holiday", label: "节日福利" },
      { key: "medical", label: "员工体检" },
      { key: "team_building", label: "团建活动" },
      { key: "labor_protection", label: "劳保用品" },
    ],
  },
  {
    key: "training",
    label: "培训教育费",
    items: [
      { key: "external_training", label: "外部培训" },
      { key: "certification", label: "考证费用" },
      { key: "books", label: "书籍资料" },
      { key: "online_course", label: "在线课程" },
    ],
  },
  {
    key: "other",
    label: "其他专项",
    items: [
      { key: "project_advance", label: "项目垫付" },
      { key: "misc_purchase", label: "零星采购" },
      { key: "unclassified", label: "不可归类支出" },
    ],
  },
];

// 生成默认全部启用的配置
export function getDefaultExpenseConfig() {
  const config: Record<string, { enabled: boolean; items: Record<string, boolean> }> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    config[cat.key] = {
      enabled: true,
      items: Object.fromEntries(cat.items.map((item) => [item.key, true])),
    };
  }
  return config;
}

// ========== 报销类型配置面板 ==========
function ExpenseTypePanel({
  ledgerId,
  company,
  onClose,
}: {
  ledgerId: number;
  company: Company;
  onClose: () => void;
}) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();

  const { data: savedConfig, isLoading } = trpc.ledger.ajGetCompanyExpenseTypes.useQuery({
    ledgerId,
    companyId: company.id,
  });

  const [config, setConfig] = useState<Record<string, { enabled: boolean; items: Record<string, boolean> }> | null>(null);

  // 当数据加载完成后初始化config
  const effectiveConfig = config ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());

  const saveMutation = trpc.ledger.ajSetCompanyExpenseTypes.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanyExpenseTypes.invalidate({ ledgerId, companyId: company.id });
      toast.success("报销类型配置已保存");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleCategory = (catKey: string) => {
    const current = effectiveConfig;
    const newConfig = {
      ...current,
      [catKey]: {
        ...current[catKey],
        enabled: !current[catKey].enabled,
      },
    };
    setConfig(newConfig);
  };

  const toggleItem = (catKey: string, itemKey: string) => {
    const current = effectiveConfig;
    const newConfig = {
      ...current,
      [catKey]: {
        ...current[catKey],
        items: {
          ...current[catKey].items,
          [itemKey]: !current[catKey].items[itemKey],
        },
      },
    };
    setConfig(newConfig);
  };

  const handleSave = () => {
    saveMutation.mutate({
      ledgerId,
      companyId: company.id,
      config: effectiveConfig,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">报销类型配置（默认全部启用）</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : (
            EXPENSE_CATEGORIES.map((cat) => {
              const catConfig = effectiveConfig[cat.key] ?? { enabled: true, items: {} };
              return (
                <div key={cat.key} className="bg-gray-50 rounded-xl overflow-hidden">
                  {/* 大类标题行 */}
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <span className="font-medium text-sm text-gray-800">{cat.label}</span>
                    <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${catConfig.enabled ? "bg-[#C0392B]" : "bg-gray-300"}`}>
                      <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-200 ${catConfig.enabled ? "translate-x-[20px]" : "translate-x-0"}`} />
                    </div>
                  </button>
                  {/* 子项列表（大类启用时才显示） */}
                  {catConfig.enabled && (
                    <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                      {cat.items.map((item) => {
                        const itemEnabled = catConfig.items[item.key] !== false;
                        return (
                          <button
                            key={item.key}
                            onClick={() => toggleItem(cat.key, item.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                              itemEnabled
                                ? "bg-white text-[#C0392B] border-2 border-[#C0392B]"
                                : "bg-white text-gray-400 border border-gray-200"
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 ${itemEnabled ? "bg-[#C0392B]" : "border border-gray-300"}`}>
                              {itemEnabled && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <Button
            className="w-full rounded-xl bg-[#C0392B] hover:bg-[#a93226] text-white"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "保存中..." : "保存配置"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<Company>;
  onSubmit: (data: Omit<Company, "id" | "ledger_id" | "enabledCount">) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [taxNo, setTaxNo] = useState(initial?.tax_no || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [bankName, setBankName] = useState(initial?.bank_name || "");
  const [bankAccount, setBankAccount] = useState(initial?.bank_account || "");
  const [remark, setRemark] = useState(initial?.remark || "");

  const fields = [
    { label: "企业名称 *", value: name, onChange: setName, placeholder: "请输入企业全称", required: true },
    { label: "统一社会信用代码", value: taxNo, onChange: setTaxNo, placeholder: "选填" },
    { label: "开票地址", value: address, onChange: setAddress, placeholder: "选填" },
    { label: "开票电话", value: phone, onChange: setPhone, placeholder: "选填" },
    { label: "开户银行", value: bankName, onChange: setBankName, placeholder: "选填" },
    { label: "银行账号", value: bankAccount, onChange: setBankAccount, placeholder: "选填" },
    { label: "备注", value: remark, onChange: setRemark, placeholder: "选填" },
  ];

  return (
    <div className="bg-white rounded-2xl p-4 space-y-3">
      {fields.map((f) => (
        <div key={f.label}>
          <div className="text-xs text-gray-500 mb-1">{f.label}</div>
          <Input
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            placeholder={f.placeholder}
            className="h-10 text-sm border-gray-200 rounded-xl"
          />
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="flex-1 rounded-xl border-gray-200"
          onClick={onCancel}
          disabled={loading}
        >
          取消
        </Button>
        <Button
          className="flex-1 rounded-xl bg-[#C0392B] hover:bg-[#a93226] text-white"
          onClick={() =>
            onSubmit({
              name,
              tax_no: taxNo || undefined,
              address: address || undefined,
              phone: phone || undefined,
              bank_name: bankName || undefined,
              bank_account: bankAccount || undefined,
              remark: remark || undefined,
            })
          }
          disabled={loading || !name.trim()}
        >
          {loading ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

function AccessPanel({
  ledgerId,
  company,
  onClose,
}: {
  ledgerId: number;
  company: Company;
  onClose: () => void;
}) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.ledger.ajGetCompanyAccess.useQuery({
    companyId: company.id,
    ledgerId,
  });

  const toggleMutation = trpc.ledger.ajToggleCompanyAccess.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanyAccess.invalidate({ companyId: company.id, ledgerId });
      utils.ledger.ajGetCompanies.invalidate({ ledgerId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">成员访问权限</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : !members || members.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无成员
              <div className="text-xs mt-1">请先在账本中邀请成员加入</div>
            </div>
          ) : (
            <div className="space-y-3">
              {(members as AccessMember[]).map((m) => (
                <div key={m.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    {m.avatar ? (
                      <img src={m.avatar} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                        {(m.name || m.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-800">{m.name || m.username}</div>
                      <div className="text-xs text-gray-400">
                        {m.role === 'owner' ? '创始人' : m.role === 'admin' ? '企业主' : m.role === 'funder' ? '厂家' : '业务员'}
                        {m.username ? ` · @${m.username}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      toggleMutation.mutate({
                        companyId: company.id,
                        ledgerId,
                        userId: m.userId,
                        isEnabled: !m.isEnabled,
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                      m.isEnabled ? "bg-[#C0392B]" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-200 ${
                        m.isEnabled ? "translate-x-[20px]" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AJCompanyManager() {
  const params = useParams<{ ledgerId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const [, setLocation] = useLocation();
  const toast = useCenterToast();
  const utils = trpc.useUtils();

  const [showAdd, setShowAdd] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [accessCompany, setAccessCompany] = useState<Company | null>(null);
  const [expenseTypeCompany, setExpenseTypeCompany] = useState<Company | null>(null);

  const { data: companies, isLoading } = trpc.ledger.ajGetCompanies.useQuery({ ledgerId });

  const createMutation = trpc.ledger.ajCreateCompany.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanies.invalidate({ ledgerId });
      setShowAdd(false);
      toast.success("企业添加成功");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.ledger.ajUpdateCompany.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanies.invalidate({ ledgerId });
      setEditingCompany(null);
      toast.success("企业信息已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.ledger.ajDeleteCompany.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanies.invalidate({ ledgerId });
      toast.success("企业已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDelete = (company: Company) => {
    if (!window.confirm(`确定删除企业「${company.name}」？删除后所有业务员的访问权限也将清除。`)) return;
    deleteMutation.mutate({ companyId: company.id, ledgerId });
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="bg-[#C0392B] text-white px-4 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold flex-1">企业管理</h1>
          <button
            onClick={() => { setShowAdd(true); setEditingCompany(null); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 添加企业表单 */}
        {showAdd && (
          <div>
            <div className="text-sm font-medium text-gray-600 mb-2">新增企业</div>
            <CompanyForm
              onSubmit={(data) => createMutation.mutate({
                ledgerId,
                name: data.name,
                taxNo: data.tax_no || undefined,
                address: data.address || undefined,
                phone: data.phone || undefined,
                bankName: data.bank_name || undefined,
                bankAccount: data.bank_account || undefined,
                remark: data.remark || undefined,
              })}
              onCancel={() => setShowAdd(false)}
              loading={createMutation.isPending}
            />
          </div>
        )}

        {/* 企业列表 */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : !companies || companies.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <div className="text-gray-400 text-sm">暂无企业</div>
            <div className="text-gray-300 text-xs mt-1">点击右上角「+」添加企业</div>
          </div>
        ) : (
          <div className="space-y-3">
            {(companies as Company[]).map((company) => (
              <div key={company.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {editingCompany?.id === company.id ? (
                  <div className="p-4">
                    <div className="text-sm font-medium text-gray-600 mb-2">编辑企业信息</div>
                    <CompanyForm
                      initial={company}
                      onSubmit={(data) =>
                        updateMutation.mutate({
                          companyId: company.id,
                          ledgerId,
                          name: data.name,
                          taxNo: data.tax_no || undefined,
                          address: data.address || undefined,
                          phone: data.phone || undefined,
                          bankName: data.bank_name || undefined,
                          bankAccount: data.bank_account || undefined,
                          remark: data.remark || undefined,
                        })
                      }
                      onCancel={() => setEditingCompany(null)}
                      loading={updateMutation.isPending}
                    />
                  </div>
                ) : (
                  <div>
                    {/* 企业基本信息 */}
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-5 h-5 text-[#C0392B]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-800 truncate">{company.name}</div>
                            {company.tax_no && (
                              <div className="text-xs text-gray-400 mt-0.5 truncate">税号：{company.tax_no}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <button
                            onClick={() => setEditingCompany(company)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                          >
                            <Pencil className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(company)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>

                      {/* 开票信息 */}
                      {(company.address || company.phone || company.bank_name || company.bank_account) && (
                        <div className="mt-3 space-y-1 pl-13">
                          {company.address && (
                            <div className="text-xs text-gray-500">地址：{company.address}</div>
                          )}
                          {company.phone && (
                            <div className="text-xs text-gray-500">电话：{company.phone}</div>
                          )}
                          {company.bank_name && (
                            <div className="text-xs text-gray-500">开户行：{company.bank_name}</div>
                          )}
                          {company.bank_account && (
                            <div className="text-xs text-gray-500">账号：{company.bank_account}</div>
                          )}
                          {company.remark && (
                            <div className="text-xs text-gray-400 italic">备注：{company.remark}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 报销类型设置入口 */}
                    <button
                      onClick={() => setExpenseTypeCompany(company)}
                      className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ClipboardList className="w-4 h-4 text-gray-400" />
                        <span>报销类型设置</span>
                        <span className="text-xs text-gray-400">（默认全部启用）</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>

                    {/* 业务员权限管理入口 */}
                    <button
                      onClick={() => setAccessCompany(company)}
                      className="w-full flex items-center justify-between px-4 py-3 border-t border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>业务员访问权限</span>
                        {(company.enabledCount ?? 0) > 0 && (
                          <span className="bg-[#C0392B] text-white text-xs px-2 py-0.5 rounded-full">
                            {company.enabledCount} 人已开启
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 说明文字 */}
        <div className="text-xs text-gray-400 text-center pb-4">
          添加企业后，可为每位业务员单独开启访问权限
          <br />
          业务员只能看到已开启的企业，并为其申请报销
        </div>
      </div>

      {/* 业务员权限面板 */}
      {accessCompany && (
        <AccessPanel
          ledgerId={ledgerId}
          company={accessCompany}
          onClose={() => setAccessCompany(null)}
        />
      )}

      {/* 报销类型配置面板 */}
      {expenseTypeCompany && (
        <ExpenseTypePanel
          ledgerId={ledgerId}
          company={expenseTypeCompany}
          onClose={() => setExpenseTypeCompany(null)}
        />
      )}
    </div>
  );
}
