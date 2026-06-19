import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Layers, Plus, Edit, Trash2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface VersionForm {
  id?: number;
  versionKey: string;
  name: string;
  loginUi: string;
  landingPath: string;
  enabled: boolean;
  sortOrder: number;
}

const emptyForm: VersionForm = {
  versionKey: "",
  name: "",
  loginUi: "maidong",
  landingPath: "/",
  enabled: true,
  sortOrder: 0,
};

export function VersionManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<VersionForm>(emptyForm);

  const { data: versions, refetch, isLoading } = trpc.version.listVersions.useQuery({ includeDisabled: true });

  const saveMutation = trpc.version.saveVersion.useMutation({
    onSuccess: () => {
      toast.success("版本已保存");
      setDialogOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.version.deleteVersion.useMutation({
    onSuccess: () => {
      toast.success("版本已删除");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (v: any) => {
    setForm({
      id: v.id,
      versionKey: v.versionKey,
      name: v.name,
      loginUi: v.loginUi,
      landingPath: v.landingPath,
      enabled: v.enabled,
      sortOrder: v.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.versionKey.trim() || !form.name.trim() || !form.landingPath.trim()) {
      toast.error("请填写版本标识、名称与落地地址");
      return;
    }
    saveMutation.mutate({
      id: form.id,
      versionKey: form.versionKey.trim(),
      name: form.name.trim(),
      loginUi: form.loginUi.trim() || "maidong",
      landingPath: form.landingPath.trim(),
      enabled: form.enabled,
      sortOrder: form.sortOrder,
    });
  };

  const handleDelete = (v: any) => {
    if (v.isDefault) {
      toast.error("系统默认版本不可删除");
      return;
    }
    if (!confirm(`确定删除版本「${v.name}」吗？已设为该版本的用户将回退到继承规则。`)) return;
    deleteMutation.mutate({ id: v.id });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">版本管理</h3>
          <p className="text-sm text-muted-foreground">
            维护可供选择的版本（皮肤）。每个版本含：登录页 UI 与登录后落地地址。在「邀请」中可为用户指定版本。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            新增版本
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {(versions || []).map((v) => (
          <Card key={v.id}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Layers className="w-4 h-4 text-[#1976D2]" />
                  <span className="font-medium">{v.name}</span>
                  {v.isDefault && <Badge variant="secondary" className="text-xs">系统默认</Badge>}
                  {v.enabled ? (
                    <Badge className="text-xs bg-[#4CAF50]">启用</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">停用</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span className="font-mono">标识: {v.versionKey}</span>
                  <span>登录UI: {v.loginUi}</span>
                  <span>落地: {v.landingPath}</span>
                  <span>排序: {v.sortOrder}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(v)} title="编辑">
                  <Edit className="w-4 h-4" />
                </Button>
                {!v.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(v)} title="删除">
                    <Trash2 className="w-4 h-4 text-[#D32F2F]" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && (versions || []).length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无版本，点击右上角「新增版本」创建</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑版本" : "新增版本"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>版本名称</Label>
              <Input
                placeholder="如：脉动版 / 牙伴版"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>版本标识（versionKey）</Label>
              <Input
                placeholder="小写字母/数字/下划线，如 maidong / yaban"
                value={form.versionKey}
                onChange={(e) => setForm({ ...form, versionKey: e.target.value })}
                disabled={!!form.id}
              />
              {form.id && <p className="text-xs text-muted-foreground">已创建的版本标识不可修改</p>}
            </div>

            <div className="space-y-2">
              <Label>登录页 UI</Label>
              <Input
                placeholder="登录页皮肤标识，如 maidong / yaban"
                value={form.loginUi}
                onChange={(e) => setForm({ ...form, loginUi: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                目前内置 maidong（红色）、yaban（蓝白竖屏）。新增其他皮肤需前端实现对应外观。
              </p>
            </div>

            <div className="space-y-2">
              <Label>登录后落地地址</Label>
              <Input
                placeholder="如 / 或 /yaban/intro"
                value={form.landingPath}
                onChange={(e) => setForm({ ...form, landingPath: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>是否启用</Label>
                <div className="flex items-center h-10 gap-2">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
                  />
                  <span className="text-sm text-muted-foreground">{form.enabled ? "启用" : "停用"}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
