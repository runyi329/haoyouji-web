import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Edit,
  ImageIcon,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// ─── 状态配置 ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending: { label: "待审核", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  active: { label: "已开通", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  rejected: { label: "已拒绝", color: "text-red-600", bg: "bg-red-50", icon: XCircle },
};

// ─── 营业执照全屏预览弹窗 ──────────────────────────────────────────────────────
function LicensePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-sm flex items-center gap-1 hover:text-gray-300"
        >
          ✕ 关闭
        </button>
        <img
          src={url}
          alt="营业执照大图"
          className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 text-white text-sm hover:text-blue-300"
        >
          <ExternalLink className="w-4 h-4" />
          在新窗口中打开原图
        </a>
      </div>
    </div>
  );
}

// ─── 企业审核面板 ─────────────────────────────────────────────────────────────
function CompanyReviewPanel() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "active" | "rejected" | "all">("pending");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.qiban.adminListClientCompanies.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    keyword: keyword || undefined,
    page,
    pageSize: 15,
  });

  const reviewMutation = trpc.qiban.adminReviewCompany.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approve" ? "已通过审核" : "已拒绝申请");
      setRejectingId(null);
      setRejectReason("");
      refetch();
    },
    onError: (err) => toast.error("操作失败: " + err.message),
  });

  const handleApprove = (id: number) => {
    reviewMutation.mutate({ companyId: id, action: "approve" });
  };

  const handleReject = (id: number) => {
    if (!rejectReason.trim()) {
      toast.error("请填写拒绝原因");
      return;
    }
    reviewMutation.mutate({ companyId: id, action: "reject", rejectReason });
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1">
          {(["pending", "active", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "all" ? "全部" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <Input
          placeholder="搜索企业名称..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="w-48 h-8 text-sm"
        />
        <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-gray-100">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 企业列表 */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : !data?.rows.length ? (
        <div className="text-center py-8 text-gray-400 text-sm">暂无数据</div>
      ) : (
        <div className="space-y-3">
          {data.rows.map((company) => {
            const statusCfg = STATUS_CONFIG[company.status as keyof typeof STATUS_CONFIG];
            const StatusIcon = statusCfg?.icon ?? Clock;
            const licenseUrl = (company as any).licenseImageKey as string | undefined;
            return (
              <div key={company.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{company.name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{company.creditCode}</p>
                      {company.legalPerson && (
                        <p className="text-gray-400 text-xs">法人：{company.legalPerson}</p>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusCfg?.bg} ${statusCfg?.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg?.label}
                  </div>
                </div>

                {/* 待审核：营业执照置顶显示 */}
                {company.status === "pending" && licenseUrl && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-blue-100 bg-blue-50/30">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100">
                      <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                        <ImageIcon className="w-3.5 h-3.5" />
                        营业执照原件
                      </div>
                      <a
                        href={licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                      >
                        <ExternalLink className="w-3 h-3" />
                        新窗口查看
                      </a>
                    </div>
                    <img
                      src={licenseUrl}
                      alt="营业执照"
                      className="w-full max-h-56 object-contain cursor-zoom-in p-2"
                      onClick={() => setPreviewUrl(licenseUrl)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).closest("div")!.style.display = "none";
                      }}
                    />
                    <p className="text-center text-xs text-blue-400 pb-2">点击图片可放大查看</p>
                  </div>
                )}

                {/* 操作按钮 */}
                {company.status === "pending" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(company.id)}
                      disabled={reviewMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      通过审核
                    </Button>
                    {rejectingId === company.id ? (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="请填写拒绝原因..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="text-xs min-h-16"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReject(company.id)}
                            disabled={reviewMutation.isPending}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 flex-1"
                          >
                            确认拒绝
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectingId(null); setRejectReason(""); }}
                            className="text-xs h-8 flex-1"
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingId(company.id)}
                        className="text-red-600 border-red-200 text-xs h-8"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        拒绝申请
                      </Button>
                    )}
                  </div>
                )}

                {/* 拒绝原因展示 */}
                {company.status === "rejected" && company.rejectReason && (
                  <p className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
                    拒绝原因：{company.rejectReason}
                  </p>
                )}

                {/* 已开通/已拒绝时折叠显示营业执照 */}
                {company.status !== "pending" && licenseUrl && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-1 select-none">
                      <ImageIcon className="w-3 h-3" />
                      查看营业执照
                    </summary>
                    <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                      <img
                        src={licenseUrl}
                        alt="营业执照"
                        className="w-full max-h-48 object-contain cursor-zoom-in p-2"
                        onClick={() => setPreviewUrl(licenseUrl)}
                        onError={(e) => {
                          (e.target as HTMLImageElement).closest("div")!.style.display = "none";
                        }}
                      />
                    </div>
                  </details>
                )}

                {/* 健康评分 */}
                {company.healthScore != null && (
                  <p className="mt-2 text-xs text-gray-500">
                    健康评分：<span className="font-bold text-blue-600">{company.healthScore}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {data && data.total > 15 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>共 {data.total} 条</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              上一页
            </Button>
            <span className="px-2 py-1 text-xs">第 {page} 页</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 15 >= data.total}>
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 营业执照全屏预览弹窗 */}
      {previewUrl && <LicensePreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </div>
  );
}

// ─── 申报表管理面板 ────────────────────────────────────────────────────────────
function DeclarationPanel() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [uploadForm, setUploadForm] = useState({
    period: "",
    declarationType: "增值税申报表",
    textContent: "",
    fileData: "",
    fileName: "",
    fileMime: "",
  });

  const [editForm, setEditForm] = useState({
    revenue: "",
    cost: "",
    profit: "",
    taxAmount: "",
    taxPaid: "",
    notes: "",
    status: "submitted" as "draft" | "submitted" | "accepted" | "rejected",
  });

  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [suggestionForm, setSuggestionForm] = useState({
    period: "",
    category: "",
    suggestedAmount: "",
    reason: "",
  });

  const { data: companiesData } = trpc.qiban.adminListClientCompanies.useQuery({
    status: "active",
    pageSize: 50,
  });

  const { data: declarationsData, isLoading, refetch } = trpc.qiban.adminListDeclarations.useQuery(
    { companyId: selectedCompanyId ?? undefined },
    { enabled: true }
  );

  const uploadMutation = trpc.qiban.adminUploadDeclaration.useMutation({
    onSuccess: () => {
      toast.success("申报表上传成功，AI 解析完成");
      setShowUploadDialog(false);
      setUploadForm({ period: "", declarationType: "增值税申报表", textContent: "", fileData: "", fileName: "", fileMime: "" });
      refetch();
    },
    onError: (err) => toast.error("上传失败: " + err.message),
  });

  const updateMutation = trpc.qiban.adminUpdateDeclaration.useMutation({
    onSuccess: () => {
      toast.success("数据已更新");
      setEditingId(null);
      refetch();
    },
    onError: (err) => toast.error("更新失败: " + err.message),
  });

  const addSuggestionMutation = trpc.qiban.adminAddInvoiceSuggestion.useMutation({
    onSuccess: () => {
      toast.success("成本票建议已添加");
      setShowSuggestionDialog(false);
      setSuggestionForm({ period: "", category: "", suggestedAmount: "", reason: "" });
    },
    onError: (err) => toast.error("添加失败: " + err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1] || '';
      setUploadForm(prev => ({ ...prev, fileData: base64, fileName: file.name, fileMime: file.type }));
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = () => {
    if (!selectedCompanyId) { toast.error("请先选择企业"); return; }
    if (!uploadForm.period) { toast.error("请填写申报期间"); return; }
    if (!uploadForm.textContent && !uploadForm.fileData) { toast.error("请上传文件或填写申报内容"); return; }
    uploadMutation.mutate({
      companyId: selectedCompanyId,
      period: uploadForm.period,
      declarationType: uploadForm.declarationType,
      textContent: uploadForm.textContent || undefined,
      fileData: uploadForm.fileData || undefined,
      fileName: uploadForm.fileName || undefined,
      fileMime: uploadForm.fileMime || undefined,
    });
  };

  const handleEdit = (decl: any) => {
    setEditingId(decl.id);
    setEditForm({ revenue: decl.revenue ?? "", cost: decl.cost ?? "", profit: decl.profit ?? "", taxAmount: decl.taxAmount ?? "", taxPaid: decl.taxPaid ?? "", notes: decl.notes ?? "", status: decl.status });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={selectedCompanyId ? String(selectedCompanyId) : "all"} onValueChange={(v) => setSelectedCompanyId(v === "all" ? null : Number(v))}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="选择企业（全部）" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部企业</SelectItem>
            {companiesData?.rows.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"><Upload className="w-3.5 h-3.5 mr-1" />上传申报表</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-600" />上传申报表（AI 解析）</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">企业</Label>
                <Select value={selectedCompanyId ? String(selectedCompanyId) : ""} onValueChange={(v) => setSelectedCompanyId(Number(v))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="选择企业" /></SelectTrigger>
                  <SelectContent>{companiesData?.rows.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">申报期间</Label><Input placeholder="如 2026-06" value={uploadForm.period} onChange={(e) => setUploadForm(prev => ({ ...prev, period: e.target.value }))} className="h-8 text-sm mt-1" /></div>
                <div>
                  <Label className="text-xs">申报类型</Label>
                  <Select value={uploadForm.declarationType} onValueChange={(v) => setUploadForm(prev => ({ ...prev, declarationType: v }))}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="增值税申报表">增值税申报表</SelectItem>
                      <SelectItem value="企业所得税申报表">企业所得税申报表</SelectItem>
                      <SelectItem value="个人所得税申报表">个人所得税申报表</SelectItem>
                      <SelectItem value="财务报表">财务报表</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">上传文件（图片/PDF）</Label>
                <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="mt-1 block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100" />
                {uploadForm.fileName && <p className="text-xs text-green-600 mt-1">已选择：{uploadForm.fileName}</p>}
              </div>
              <div>
                <Label className="text-xs">或直接粘贴申报内容（文字）</Label>
                <Textarea placeholder="将申报表文字内容粘贴到此处，AI 将自动提取财税数据..." value={uploadForm.textContent} onChange={(e) => setUploadForm(prev => ({ ...prev, textContent: e.target.value }))} className="text-xs min-h-24 mt-1" />
              </div>
              <Button onClick={handleUpload} disabled={uploadMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">
                {uploadMutation.isPending ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />AI 解析中...</span> : <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />上传并 AI 解析</span>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {selectedCompanyId && (
          <Dialog open={showSuggestionDialog} onOpenChange={setShowSuggestionDialog}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="h-8 text-xs"><Plus className="w-3.5 h-3.5 mr-1" />添加成本票建议</Button></DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>添加成本票建议</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">申报期间</Label><Input placeholder="如 2026-06" value={suggestionForm.period} onChange={(e) => setSuggestionForm(prev => ({ ...prev, period: e.target.value }))} className="h-8 text-sm mt-1" /></div>
                <div><Label className="text-xs">类别</Label><Input placeholder="如：办公用品、差旅费..." value={suggestionForm.category} onChange={(e) => setSuggestionForm(prev => ({ ...prev, category: e.target.value }))} className="h-8 text-sm mt-1" /></div>
                <div><Label className="text-xs">建议金额（元）</Label><Input type="number" placeholder="0.00" value={suggestionForm.suggestedAmount} onChange={(e) => setSuggestionForm(prev => ({ ...prev, suggestedAmount: e.target.value }))} className="h-8 text-sm mt-1" /></div>
                <div><Label className="text-xs">建议原因</Label><Textarea placeholder="说明建议原因..." value={suggestionForm.reason} onChange={(e) => setSuggestionForm(prev => ({ ...prev, reason: e.target.value }))} className="text-xs min-h-16 mt-1" /></div>
                <Button onClick={() => { if (!suggestionForm.period) { toast.error("请填写申报期间"); return; } addSuggestionMutation.mutate({ companyId: selectedCompanyId!, ...suggestionForm }); }} disabled={addSuggestionMutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">确认添加</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-gray-100"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : !declarationsData?.rows.length ? (
        <div className="text-center py-8 text-gray-400 text-sm"><FileText className="w-10 h-10 mx-auto mb-2 text-gray-200" />暂无申报表记录</div>
      ) : (
        <div className="space-y-3">
          {declarationsData.rows.map((decl) => (
            <div key={decl.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{decl.period}</span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{decl.declarationType ?? "申报表"}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${decl.status === "accepted" ? "bg-green-50 text-green-600" : decl.status === "rejected" ? "bg-red-50 text-red-600" : decl.status === "submitted" ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500"}`}>
                      {decl.status === "accepted" ? "已确认" : decl.status === "rejected" ? "已拒绝" : decl.status === "submitted" ? "已提交" : "草稿"}
                    </span>
                  </div>
                  {decl.notes && <p className="text-xs text-gray-400 mt-1">{decl.notes}</p>}
                </div>
                <button onClick={() => editingId === decl.id ? setEditingId(null) : handleEdit(decl)} className="p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
                  {editingId === decl.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <Edit className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
              {editingId !== decl.id && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[{ label: "收入", value: decl.revenue }, { label: "成本", value: decl.cost }, { label: "利润", value: decl.profit }, { label: "应纳税额", value: decl.taxAmount }, { label: "已缴税额", value: decl.taxPaid }].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-sm font-semibold text-gray-700 mt-0.5">{value != null ? `¥${Number(value).toLocaleString()}` : <span className="text-gray-300">-</span>}</p>
                    </div>
                  ))}
                </div>
              )}
              {editingId === decl.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[{ key: "revenue", label: "收入（元）" }, { key: "cost", label: "成本（元）" }, { key: "profit", label: "利润（元）" }, { key: "taxAmount", label: "应纳税额（元）" }, { key: "taxPaid", label: "已缴税额（元）" }].map(({ key, label }) => (
                      <div key={key}><Label className="text-xs">{label}</Label><Input type="number" value={(editForm as any)[key]} onChange={(e) => setEditForm(prev => ({ ...prev, [key]: e.target.value }))} className="h-8 text-sm mt-0.5" /></div>
                    ))}
                    <div>
                      <Label className="text-xs">状态</Label>
                      <Select value={editForm.status} onValueChange={(v) => setEditForm(prev => ({ ...prev, status: v as any }))}>
                        <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">草稿</SelectItem>
                          <SelectItem value="submitted">已提交</SelectItem>
                          <SelectItem value="accepted">已确认</SelectItem>
                          <SelectItem value="rejected">已拒绝</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label className="text-xs">备注</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))} className="text-xs min-h-16 mt-0.5" /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { if (!editingId) return; updateMutation.mutate({ id: editingId, ...editForm }); }} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 flex-1">保存修改</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="text-xs h-8 flex-1">取消</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function QibanAdminManager() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="w-5 h-5 text-blue-600" />
        <h2 className="font-bold text-base">企伴代理记账管理</h2>
      </div>
      <Tabs defaultValue="review" className="w-full">
        <TabsList className="flex w-full gap-1 h-auto mb-4">
          <TabsTrigger value="review" className="text-xs flex-1"><Clock className="w-3.5 h-3.5 mr-1" />企业审核</TabsTrigger>
          <TabsTrigger value="declarations" className="text-xs flex-1"><FileText className="w-3.5 h-3.5 mr-1" />申报表管理</TabsTrigger>
        </TabsList>
        <TabsContent value="review"><CompanyReviewPanel /></TabsContent>
        <TabsContent value="declarations"><DeclarationPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
