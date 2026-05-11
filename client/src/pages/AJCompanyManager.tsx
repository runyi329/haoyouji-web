import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Building2, Pencil, Trash2, Users, ChevronRight, Check, X } from "lucide-react";
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
            <div className="text-xs text-gray-400 mt-0.5">业务员访问权限</div>
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
              暂无业务员成员
              <div className="text-xs mt-1">请先在账本中邀请业务员加入</div>
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
                      <div className="text-xs text-gray-400">@{m.username}</div>
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
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      m.isEnabled ? "bg-[#C0392B]" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        m.isEnabled ? "translate-x-6" : "translate-x-0.5"
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
    </div>
  );
}
