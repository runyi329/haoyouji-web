import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Building2, Pencil, Trash2, Users, ChevronRight, Check, X, ClipboardList, Clock, CheckCircle, XCircle } from "lucide-react";
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
  isFunderEnabled: boolean;
  isWorkerEnabled: boolean;
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

  const [showAddFunder, setShowAddFunder] = useState(false);
  const [showAddWorker, setShowAddWorker] = useState(false);

  // 以企业为视角（仅限 AJ 账本）：
  // - 创始人：owner（固定）
  // - 资方权限（funder）：可查看该企业报销汇总，限 admin 角色成员
  // - 劳方权限（worker）：可向该企业提交报销，所有非 owner 成员均可
  // 同一人可同时拥有两种权限（两条独立记录）
  const ownerMembers = (members as AccessMember[] | undefined)?.filter(m => m.role === 'owner') ?? [];
  // 已开通资方权限的成员（isFunderEnabled=true）
  const enabledFunders = (members as AccessMember[] | undefined)?.filter(m => m.isFunderEnabled === true) ?? [];
  // 已开通劳方权限的成员（isWorkerEnabled=true）
  const enabledWorkers = (members as AccessMember[] | undefined)?.filter(m => m.isWorkerEnabled === true) ?? [];
  // 可添加为资方：只有 admin 角色，且资方权限未开通
  const enabledFunderIds = new Set(enabledFunders.map(m => m.userId));
  const availableFunders = (members as AccessMember[] | undefined)?.filter(m => m.role === 'admin' && !enabledFunderIds.has(m.userId)) ?? [];
  // 可添加为劳方：所有非 owner 成员，且劳方权限未开通（已开通资方权限的人也可被添加为劳方）
  const enabledWorkerIds = new Set(enabledWorkers.map(m => m.userId));
  const availableWorkers = (members as AccessMember[] | undefined)?.filter(m => m.role !== 'owner' && !enabledWorkerIds.has(m.userId)) ?? [];

  // 已开通成员行（带移除按钮）
  // accessType: 'funder' | 'worker' — 移除时传入对应的权限类型
  const renderEnabledRow = (m: AccessMember, accessType: 'funder' | 'worker') => (
    <div key={`${m.userId}-${accessType}`} className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-3">
        {m.avatar ? (
          <img src={m.avatar} className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
            {(m.name || m.username || '?')[0].toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-gray-800">{m.name || m.username}</div>
          {m.username && <div className="text-xs text-gray-400">@{m.username}</div>}
        </div>
      </div>
      <button
        onClick={() => toggleMutation.mutate({ companyId: company.id, ledgerId, userId: m.userId, isEnabled: false, accessType })}
        className="text-xs text-red-400 border border-red-200 px-2 py-1 rounded-full hover:bg-red-50 transition-colors"
      >
        移除
      </button>
    </div>
  );

  // 添加选人弹窗
  const AddMemberPicker = ({ available, onAdd, onClose: onCloseInner, title }: {
    available: AccessMember[];
    onAdd: (userId: number) => void;
    onClose: () => void;
    title: string;
  }) => (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[60vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          <button onClick={onCloseInner} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-3">
          {available.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">暂无可添加的成员</div>
          ) : (
            available.map(m => (
              <button
                key={m.userId}
                onClick={() => { onAdd(m.userId); onCloseInner(); }}
                className="w-full flex items-center gap-3 py-3 px-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
              >
                {m.avatar ? (
                  <img src={m.avatar} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                    {(m.name || m.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-gray-800">{m.name || m.username}</div>
                  {m.username && <div className="text-xs text-gray-400">@{m.username}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <div className="font-semibold text-gray-800">{company.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">成员访问权限管理</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : (
            <div className="space-y-1">
              {/* 创始人区块（固定，不可修改） */}
              {ownerMembers.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 font-medium mb-2 px-1">创始人（默认可见所有企业）</div>
                  {ownerMembers.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between py-2 px-1">
                      <div className="flex items-center gap-3">
                        {m.avatar ? (
                          <img src={m.avatar} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                            {(m.name || m.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-800">{m.name || m.username}</div>
                          {m.username && <div className="text-xs text-gray-400">@{m.username}</div>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">默认可见</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 资方区块（admin角色，仅显示已开通，可添加/移除） */}
              <div className="mb-4">
                <div className="border-t border-gray-100 mb-3" />
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="text-xs text-gray-400 font-medium">企业主（资方）— 可查看该企业报销汇总</div>
                  <button
                    onClick={() => setShowAddFunder(true)}
                    className="flex items-center gap-1 text-xs text-[#C0392B] font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加
                  </button>
                </div>
                {enabledFunders.length === 0 ? (
                  <div className="text-xs text-gray-300 px-1 py-2">暂未添加资方成员</div>
                ) : (
                  enabledFunders.map(m => renderEnabledRow(m, 'funder'))
                )}
              </div>

              {/* 劳方区块（非owner非admin，仅显示已开通，可添加/移除） */}
              <div>
                <div className="border-t border-gray-100 mb-3" />
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="text-xs text-gray-400 font-medium">业务员（劳方）— 可向该企业提交报销</div>
                  <button
                    onClick={() => setShowAddWorker(true)}
                    className="flex items-center gap-1 text-xs text-[#C0392B] font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加
                  </button>
                </div>
                {enabledWorkers.length === 0 ? (
                  <div className="text-xs text-gray-300 px-1 py-2">暂未添加劳方成员</div>
                ) : (
                  enabledWorkers.map(m => renderEnabledRow(m, 'worker'))
                )}
              </div>

              <div className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* 添加资方选人弹窗 */}
      {showAddFunder && (
        <AddMemberPicker
          available={availableFunders}
          title="选择要添加的企业主（资方）"
          onAdd={(userId) => toggleMutation.mutate({ companyId: company.id, ledgerId, userId, isEnabled: true, accessType: 'funder' })}
          onClose={() => setShowAddFunder(false)}
        />
      )}

      {/* 添加劳方选人弹窗 */}
      {showAddWorker && (
        <AddMemberPicker
          available={availableWorkers}
          title="选择要添加的业务员（劳方）"
          onAdd={(userId) => toggleMutation.mutate({ companyId: company.id, ledgerId, userId, isEnabled: true, accessType: 'worker' })}
          onClose={() => setShowAddWorker(false)}
        />
      )}
    </div>
  );
}


export default function AJCompanyManager() {
  const params = useParams<{ ledgerId: string }>();
  const ledgerId = parseInt(params.ledgerId || "0");
  const [, setLocation] = useLocation();
  const toast = useCenterToast();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState<'companies' | 'requests'>('companies');
  const [showAdd, setShowAdd] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [accessCompany, setAccessCompany] = useState<Company | null>(null);
  const [expenseTypeCompany, setExpenseTypeCompany] = useState<Company | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const { data: companies, isLoading } = trpc.ledger.ajGetCompanies.useQuery({ ledgerId });
  const { data: pendingRequests, isLoading: requestsLoading } = (trpc as any).ledger.ajAdminGetPendingRequests.useQuery({ ledgerId });
  const pendingCount = (pendingRequests as any[] | undefined)?.filter((r: any) => r.status === 'pending').length || 0;

  const reviewMutation = (trpc as any).ledger.ajAdminReviewRequest.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setReviewingId(null);
      setReviewComment('');
      toast.success('审核完成');
    },
    onError: (e: any) => toast.error(e.message),
  });

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
          {activeTab === 'companies' && (
            <button
              onClick={() => { setShowAdd(true); setEditingCompany(null); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>
        {/* Tab 切换 */}
        <div className="flex mt-3 rounded-xl overflow-hidden bg-white/10">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors rounded-xl ${activeTab === 'companies' ? 'bg-white text-[#C0392B]' : 'text-white/80'}`}
            onClick={() => setActiveTab('companies')}
          >
            企业列表
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors rounded-xl relative ${activeTab === 'requests' ? 'bg-white text-[#C0392B]' : 'text-white/80'}`}
            onClick={() => setActiveTab('requests')}
          >
            企业申请审核
            {pendingCount > 0 && (
              <span className="absolute top-1 right-3 w-4 h-4 bg-amber-400 text-white text-xs rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ===== 企业申请审核 Tab ===== */}
        {activeTab === 'requests' && (
          <>
            {requestsLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
            ) : !pendingRequests || (pendingRequests as any[]).length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <div className="text-gray-400 text-sm">暂无企业申请</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(pendingRequests as any[]).map((req: any) => (
                  <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {req.status === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : req.status === 'approved' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-gray-400" />}
                        <span className={`text-sm font-medium ${req.status === 'pending' ? 'text-amber-600' : req.status === 'approved' ? 'text-green-600' : 'text-gray-400'}`}>
                          {req.status === 'pending' ? '待审核' : req.status === 'approved' ? '已通过' : '已拒绝'}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {req.request_type === 'add' ? '新增企业' : req.request_type === 'update' ? '修改企业' : '删除企业'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(req.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 mb-1">{req.name}</div>
                    {req.tax_no && <div className="text-xs text-gray-400">税号：{req.tax_no}</div>}
                    {req.address && <div className="text-xs text-gray-400">地址：{req.address}</div>}
                    {req.phone && <div className="text-xs text-gray-400">电话：{req.phone}</div>}
                    {req.bank_name && <div className="text-xs text-gray-400">开户行：{req.bank_name}</div>}
                    {req.bank_account && <div className="text-xs text-gray-400">账号：{req.bank_account}</div>}
                    {req.remark && <div className="text-xs text-gray-400">备注：{req.remark}</div>}
                    <div className="text-xs text-gray-500 mt-1">申请人：{req.requesterName || req.requesterUsername || '未知'}</div>
                    {req.review_comment && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">审核意见：{req.review_comment}</div>
                    )}
                    {/* 审核操作（仅pending状态） */}
                    {req.status === 'pending' && (
                      <div className="mt-3 space-y-2">
                        {reviewingId === req.id ? (
                          <>
                            <Input
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              placeholder="审核意见（选填）"
                              className="h-9 text-sm border-gray-200 rounded-xl"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 rounded-xl border-gray-200 text-xs h-9"
                                onClick={() => { setReviewingId(null); setReviewComment(''); }}
                              >
                                取消
                              </Button>
                              <Button
                                className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs h-9"
                                onClick={() => reviewMutation.mutate({ ledgerId, requestId: req.id, action: 'reject', reviewComment: reviewComment || undefined })}
                                disabled={reviewMutation.isPending}
                              >
                                <X className="w-3 h-3 mr-1" />拒绝
                              </Button>
                              <Button
                                className="flex-1 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs h-9"
                                onClick={() => reviewMutation.mutate({ ledgerId, requestId: req.id, action: 'approve', reviewComment: reviewComment || undefined })}
                                disabled={reviewMutation.isPending}
                              >
                                <Check className="w-3 h-3 mr-1" />通过
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full rounded-xl border-amber-200 text-amber-600 hover:bg-amber-50 text-xs h-9"
                            onClick={() => { setReviewingId(req.id); setReviewComment(''); }}
                          >
                            审核此申请
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 企业列表 Tab ===== */}
        {activeTab === 'companies' && (
          <>
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
          </>
        )}
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
