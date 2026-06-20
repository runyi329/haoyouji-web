/**
 * 脉动平台总商品库管理
 * 功能：
 * 1. 管理平台总库商品（增删改查）
 * 2. 主动推送商品给商家
 * 3. 审核商家的导入申请
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Wine,
  Search,
  Store,
} from "lucide-react";

const MERCHANT_CODE_OPTIONS = ["cx8618"]; // 可扩展

export default function PlatformProductLibrary() {
  const [activeTab, setActiveTab] = useState("library");
  const [searchKw, setSearchKw] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushProduct, setPushProduct] = useState<any>(null);
  const [pushMerchantCode, setPushMerchantCode] = useState("cx8618");
  const [pushMessage, setPushMessage] = useState("");

  // 表单状态
  const [form, setForm] = useState({
    name: "",
    subtitle: "",
    category: "wine",
    basePrice: "",
    mainImageUrl: "",
    description: "",
    winery: "",
    vintage: "",
    region: "",
    grapeVariety: "",
    alcoholContent: "",
  });

  // 数据查询
  const { data: products = [], refetch: refetchProducts } = trpc.merchant.getPlatformProducts.useQuery({ keyword: searchKw || undefined });
  const { data: importRequests = [], refetch: refetchRequests } = trpc.merchant.getImportRequests.useQuery();

  // Mutations
  const createMutation = trpc.merchant.createPlatformProduct.useMutation({
    onSuccess: () => { toast.success("商品已添加到平台总库"); setShowForm(false); resetForm(); refetchProducts(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.merchant.updatePlatformProduct.useMutation({
    onSuccess: () => { toast.success("商品已更新"); setShowForm(false); setEditProduct(null); resetForm(); refetchProducts(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.merchant.deletePlatformProduct.useMutation({
    onSuccess: () => { toast.success("商品已下架"); refetchProducts(); },
    onError: (e) => toast.error(e.message),
  });
  const pushMutation = trpc.merchant.pushProductToMerchant.useMutation({
    onSuccess: () => { toast.success("已推送给商家，商品已进入其商品库（未上架状态）"); setShowPushDialog(false); setPushMessage(""); refetchRequests(); },
    onError: (e) => toast.error(e.message),
  });
  const reviewMutation = trpc.merchant.reviewImportRequest.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approve" ? "已通过申请，商品已加入商家库" : "已拒绝申请");
      refetchRequests();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", subtitle: "", category: "wine", basePrice: "", mainImageUrl: "", description: "", winery: "", vintage: "", region: "", grapeVariety: "", alcoholContent: "" });

  const handleSubmit = () => {
    if (!form.name || !form.basePrice) { toast.error("请填写商品名称和价格"); return; }
    const extendedFields = JSON.stringify({ winery: form.winery, vintage: form.vintage, region: form.region, grapeVariety: form.grapeVariety, alcoholContent: form.alcoholContent });
    if (editProduct) {
      updateMutation.mutate({ id: editProduct.id, name: form.name, subtitle: form.subtitle, basePrice: form.basePrice, mainImageUrl: form.mainImageUrl || undefined, description: form.description, extendedFields });
    } else {
      createMutation.mutate({ name: form.name, subtitle: form.subtitle, basePrice: form.basePrice, mainImageUrl: form.mainImageUrl || undefined, description: form.description, extendedFields });
    }
  };

  const handleEdit = (p: any) => {
    setEditProduct(p);
    const ext = p.extendedFields ? (() => { try { return JSON.parse(p.extendedFields); } catch { return {}; } })() : {};
    setForm({ name: p.name || "", subtitle: p.subtitle || "", category: p.category || "wine", basePrice: p.basePrice || "", mainImageUrl: p.mainImageUrl || "", description: p.description || "", winery: ext.winery || "", vintage: ext.vintage || "", region: ext.region || "", grapeVariety: ext.grapeVariety || "", alcoholContent: ext.alcoholContent || "" });
    setShowForm(true);
  };

  const pendingCount = (importRequests as any[]).filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="library" className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" />
            平台总库 ({(products as any[]).length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            导入申请
            {pendingCount > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ===== 平台总库 Tab ===== */}
        <TabsContent value="library" className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品名称、产地..."
                value={searchKw}
                onChange={e => setSearchKw(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditProduct(null); resetForm(); setShowForm(true); }} className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              添加商品
            </Button>
          </div>

          {(products as any[]).length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Wine className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">平台总库暂无商品</p>
              <p className="text-sm mt-1">点击"添加商品"开始录入平台商品</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {(products as any[]).map((p: any) => {
                const ext = p.extendedFields ? (() => { try { return JSON.parse(p.extendedFields); } catch { return {}; } })() : {};
                return (
                  <div key={p.id} className="border rounded-lg p-4 flex items-start gap-4">
                    {/* 图片 */}
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {p.mainImageUrl ? (
                        <img src={p.mainImageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Wine className="w-7 h-7 text-muted-foreground" />
                      )}
                    </div>
                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium text-sm">{p.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.subtitle || (ext.region ? `${ext.region}` : "—")}</p>
                          {(ext.winery || ext.vintage) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ext.winery && `${ext.winery}`}{ext.vintage && ` · ${ext.vintage}年`}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-bold text-primary flex-shrink-0">¥{p.basePrice}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">平台总库</Badge>
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => { setPushProduct(p); setShowPushDialog(true); }}
                        >
                          <Send className="w-3 h-3" />
                          推送给商家
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleEdit(p)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm(`确认下架"${p.name}"？`)) deleteMutation.mutate({ id: p.id }); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ===== 导入申请 Tab ===== */}
        <TabsContent value="requests" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">商家申请从平台总库导入商品，审核通过后商品自动进入商家私库（未上架状态）</p>
          </div>

          {(importRequests as any[]).length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">暂无导入申请</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {(importRequests as any[]).map((req: any) => (
                <div key={req.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {req.productImageUrl ? (
                        <img src={req.productImageUrl} alt={req.productName} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <Wine className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">{req.productName || "未知商品"}</p>
                        <p className="text-xs text-muted-foreground">{req.productSubtitle}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            <Store className="w-3 h-3 mr-1" />
                            {req.merchantName || req.merchantCode}
                          </Badge>
                          <Badge variant={req.requestType === "admin_push" ? "secondary" : "outline"} className="text-xs">
                            {req.requestType === "admin_push" ? "平台推送" : "商家申请"}
                          </Badge>
                          <Badge
                            variant={req.status === "pending" ? "default" : req.status === "approved" ? "secondary" : "destructive"}
                            className="text-xs"
                          >
                            {req.status === "pending" ? "待审核" : req.status === "approved" ? "已通过" : "已拒绝"}
                          </Badge>
                        </div>
                        {req.message && <p className="text-xs text-muted-foreground mt-1">留言：{req.message}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(req.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {req.status === "pending" && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
                          onClick={() => reviewMutation.mutate({ requestId: req.id, action: "approve" })}
                          disabled={reviewMutation.isPending}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 text-destructive border-destructive hover:bg-destructive/10"
                          onClick={() => reviewMutation.mutate({ requestId: req.id, action: "reject" })}
                          disabled={reviewMutation.isPending}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          拒绝
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== 添加/编辑商品弹窗 ===== */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setEditProduct(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? "编辑平台商品" : "添加到平台总库"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>商品名称 *</Label>
                <Input placeholder="如：拉菲古堡 2018" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>副标题</Label>
                <Input placeholder="如：法国·波尔多·梅多克" value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>建议零售价 *</Label>
                <Input type="number" placeholder="0.00" value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>商品图片URL</Label>
                <Input placeholder="https://..." value={form.mainImageUrl} onChange={e => setForm(f => ({ ...f, mainImageUrl: e.target.value }))} />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-3">红酒专属信息</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>酒庄</Label>
                  <Input placeholder="如：拉菲古堡" value={form.winery} onChange={e => setForm(f => ({ ...f, winery: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>年份</Label>
                  <Input placeholder="如：2018" value={form.vintage} onChange={e => setForm(f => ({ ...f, vintage: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>产区</Label>
                  <Input placeholder="如：法国·波尔多" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>葡萄品种</Label>
                  <Input placeholder="如：赤霞珠" value={form.grapeVariety} onChange={e => setForm(f => ({ ...f, grapeVariety: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>酒精度</Label>
                  <Input placeholder="如：13.5%" value={form.alcoholContent} onChange={e => setForm(f => ({ ...f, alcoholContent: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>商品描述</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-ring"
                placeholder="描述这款酒的特点、口感、适饮场合..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditProduct(null); resetForm(); }}>取消</Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editProduct ? "保存修改" : "添加到总库"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 推送给商家弹窗 ===== */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>推送商品给商家</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {pushProduct && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                {pushProduct.mainImageUrl ? (
                  <img src={pushProduct.mainImageUrl} alt={pushProduct.name} className="w-12 h-12 rounded object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded bg-background flex items-center justify-center">
                    <Wine className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-sm">{pushProduct.name}</p>
                  <p className="text-xs text-muted-foreground">¥{pushProduct.basePrice}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>目标商家代码</Label>
              <Input
                placeholder="如：cx8618"
                value={pushMerchantCode}
                onChange={e => setPushMerchantCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">商品将直接进入商家私库（未上架状态），商家可自行决定是否上架</p>
            </div>
            <div className="space-y-1.5">
              <Label>附言（可选）</Label>
              <Input
                placeholder="如：平台精选，推荐上架"
                value={pushMessage}
                onChange={e => setPushMessage(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowPushDialog(false)}>取消</Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={() => {
                  if (!pushMerchantCode) { toast.error("请输入商家代码"); return; }
                  pushMutation.mutate({ productId: pushProduct.id, merchantCode: pushMerchantCode, message: pushMessage || undefined });
                }}
                disabled={pushMutation.isPending}
              >
                <Send className="w-4 h-4" />
                确认推送
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
