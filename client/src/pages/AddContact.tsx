import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Trash2, User, Calendar, Tag, Settings } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// 字段分类值（用于全局字段）
interface FieldCategoryValue {
  categoryId: number;
  categoryName: string;
  value: string;
}

export default function AddContact() {
  const [, setLocation] = useLocation();
  
  // 使用useMemo缓存URL参数，避免每次渲染都重新创建
  const { contactId, isEditMode } = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
    const mode = urlParams.get('mode') === 'edit' && id !== null;
    return { contactId: id, isEditMode: mode };
  }, []);
  
  // 基本信息
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [gender, setGender] = useState("");
  const [region, setRegion] = useState("");
  
  // 全局字段分类值 - 必须在useEffect之前声明
  const [fieldCategoryValues, setFieldCategoryValues] = useState<FieldCategoryValue[]>([]);
  
  // 管理分类对话框
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  
  // 用于跟踪是否已初始化字段值
  const [isFieldsInitialized, setIsFieldsInitialized] = useState(false);
  
  // 获取字段分类列表
  const { data: fieldCategories, refetch: refetchCategories } = trpc.contacts.fieldCategories.list.useQuery();
  
  // 编辑模式：加载现有数据
  const { data: existingContact } = trpc.contacts.get.useQuery(
    { id: contactId! },
    { enabled: isEditMode && contactId !== null }
  );
  
  // 初始化字段值（编辑模式）
  useEffect(() => {
    if (isEditMode && existingContact && fieldCategories && !isFieldsInitialized) {
      // 填充基本信息
      setName(existingContact.name);
      setTitle(existingContact.title || "");
      setGender(existingContact.gender || "");
      setRegion(existingContact.region || "");

      // 填充全局字段值：显示所有可用字段，已填写的保留值，未填写的显示为空
      const existingFieldValuesMap = new Map(
        (existingContact.fieldValues || []).map((fv: any) => [fv.categoryId, fv.value])
      );
      
      const allFieldValues = fieldCategories.map((cat) => ({
        categoryId: cat.id,
        categoryName: cat.name,
        value: existingFieldValuesMap.get(cat.id) || "",
      }));
      
      setFieldCategoryValues(allFieldValues);
      setIsFieldsInitialized(true);
    }
  }, [existingContact, isEditMode, fieldCategories, isFieldsInitialized]);
  
  // 初始化字段值（新增模式）
  useEffect(() => {
    if (!isEditMode && fieldCategories && fieldCategories.length > 0 && !isFieldsInitialized) {
      setFieldCategoryValues(
        fieldCategories.map((cat) => ({
          categoryId: cat.id,
          categoryName: cat.name,
          value: "",
        }))
      );
      setIsFieldsInitialized(true);
    }
  }, [isEditMode, fieldCategories, isFieldsInitialized]);
  
  // 创建人脉API
  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: (data) => {
      // 如果有全局字段值，保存它们
      const validFieldValues = fieldCategoryValues.filter((fv) => fv.value.trim());
      if (validFieldValues.length > 0 && data.id) {
        setFieldValuesMutation.mutate({
          contactId: data.id,
          values: validFieldValues.map((fv) => ({
            categoryId: fv.categoryId,
            value: fv.value.trim(),
          })),
        });
      } else {
        toast.success("人脉添加成功");
        setLocation("/parent/contacts");
      }
    },
    onError: (error) => {
      toast.error(error.message || "添加失败");
    },
  });
  
  // 设置字段值API
  const setFieldValuesMutation = trpc.contacts.fieldValues.set.useMutation({
    onSuccess: () => {
      if (isEditMode && contactId) {
        toast.success("人脉更新成功");
        setLocation(`/parent/contacts/${contactId}`);
      } else {
        toast.success("人脉添加成功");
        setLocation("/parent/contacts");
      }
    },
    onError: (error) => {
      toast.error(error.message || "保存字段值失败");
    },
  });
  
  // 创建字段分类API
  const createCategoryMutation = trpc.contacts.fieldCategories.create.useMutation({
    onSuccess: (newCategory) => {
      toast.success("分类创建成功");
      setNewCategoryName("");
      refetchCategories();
      // 添加新分类到字段值列表
      setFieldCategoryValues((prev) => [
        ...prev,
        {
          categoryId: newCategory.id,
          categoryName: newCategory.name,
          value: "",
        },
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "创建分类失败");
    },
  });
  
  // 删除字段分类API
  const deleteCategoryMutation = trpc.contacts.fieldCategories.delete.useMutation({
    onSuccess: () => {
      toast.success("分类已删除");
      refetchCategories();
    },
    onError: (error) => {
      toast.error(error.message || "删除分类失败");
    },
  });
  

  
  // 更新全局字段值
  const handleUpdateFieldCategoryValue = (categoryId: number, value: string) => {
    setFieldCategoryValues((prev) =>
      prev.map((fv) =>
        fv.categoryId === categoryId ? { ...fv, value } : fv
      )
    );
  };
  
  // 创建新分类
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      toast.error("请输入分类名称");
      return;
    }
    createCategoryMutation.mutate({
      name: newCategoryName.trim(),
      fieldType: "text",
      isRequired: false,
    });
  };
  
  // 删除分类
  const handleDeleteCategory = (id: number) => {
    if (confirm("确定要删除这个分类吗？删除后所有人脉的该字段数据也会被删除。")) {
      deleteCategoryMutation.mutate({ id });
      // 从本地状态中移除
      setFieldCategoryValues((prev) => prev.filter((fv) => fv.categoryId !== id));
    }
  };
  
  // 提交表单
  // 更新人脉API
  const updateContactMutation = trpc.contacts.update.useMutation({
    onSuccess: (data) => {
      // 如果有全局字段值，保存它们
      const validFieldValues = fieldCategoryValues.filter((fv) => fv.value.trim());
      if (validFieldValues.length > 0 && contactId) {
        setFieldValuesMutation.mutate({
          contactId: contactId,
          values: validFieldValues.map((fv) => ({
            categoryId: fv.categoryId,
            value: fv.value.trim(),
          })),
        });
      } else {
        toast.success("人脉更新成功");
        setLocation(`/parent/contacts/${contactId}`);
      }
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });
  
  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("请输入姓名");
      return;
    }
    
    if (isEditMode && contactId) {
      // 编辑模式：更新人脉
      updateContactMutation.mutate({
        id: contactId,
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,

      });
    } else {
      // 新增模式：创建人脉
      createContactMutation.mutate({
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,

      });
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/parent/contacts")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <h1 className="text-lg font-semibold">{isEditMode ? "编辑人脉" : "添加人脉"}</h1>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createContactMutation.isPending || updateContactMutation.isPending || setFieldValuesMutation.isPending}
          >
            {createContactMutation.isPending || setFieldValuesMutation.isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
      
      <div className="container max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* 基本信息卡片 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 第一行：姓名 + 称谓 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  姓名 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className="h-9"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">
                  称谓
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如：同学、朋友"
                  className="h-9"
                />
              </div>
            </div>
            
            {/* 第二行：性别 + 地区 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gender" className="text-sm font-medium">
                  性别
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender" className="h-9">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="男">男</SelectItem>
                    <SelectItem value="女">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="region" className="text-sm font-medium">
                  所在地区
                </Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="region" className="h-9">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="北京市">北京市</SelectItem>
                    <SelectItem value="天津市">天津市</SelectItem>
                    <SelectItem value="上海市">上海市</SelectItem>
                    <SelectItem value="重庆市">重庆市</SelectItem>
                    <SelectItem value="河北省">河北省</SelectItem>
                    <SelectItem value="山西省">山西省</SelectItem>
                    <SelectItem value="辽宁省">辽宁省</SelectItem>
                    <SelectItem value="吉林省">吉林省</SelectItem>
                    <SelectItem value="黑龙江省">黑龙江省</SelectItem>
                    <SelectItem value="江苏省">江苏省</SelectItem>
                    <SelectItem value="浙江省">浙江省</SelectItem>
                    <SelectItem value="安徽省">安徽省</SelectItem>
                    <SelectItem value="福建省">福建省</SelectItem>
                    <SelectItem value="江西省">江西省</SelectItem>
                    <SelectItem value="山东省">山东省</SelectItem>
                    <SelectItem value="河南省">河南省</SelectItem>
                    <SelectItem value="湖北省">湖北省</SelectItem>
                    <SelectItem value="湖南省">湖南省</SelectItem>
                    <SelectItem value="广东省">广东省</SelectItem>
                    <SelectItem value="海南省">海南省</SelectItem>
                    <SelectItem value="四川省">四川省</SelectItem>
                    <SelectItem value="贵州省">贵州省</SelectItem>
                    <SelectItem value="云南省">云南省</SelectItem>
                    <SelectItem value="陕西省">陕西省</SelectItem>
                    <SelectItem value="甘肃省">甘肃省</SelectItem>
                    <SelectItem value="青海省">青海省</SelectItem>
                    <SelectItem value="台湾省">台湾省</SelectItem>
                    <SelectItem value="内蒙古自治区">内蒙古自治区</SelectItem>
                    <SelectItem value="广西壮族自治区">广西壮族自治区</SelectItem>
                    <SelectItem value="西藏自治区">西藏自治区</SelectItem>
                    <SelectItem value="宁夏回族自治区">宁夏回族自治区</SelectItem>
                    <SelectItem value="新疆维吾尔自治区">新疆维吾尔自治区</SelectItem>
                    <SelectItem value="香港特别行政区">香港特别行政区</SelectItem>
                    <SelectItem value="澳门特别行政区">澳门特别行政区</SelectItem>
                    <SelectItem value="海外">海外</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 扩展信息卡片 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4 text-purple-500" />
                扩展信息
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCategoryDialog(true)}
                className="h-7 text-xs gap-1"
              >
                <Settings className="h-3 w-3" />
                管理分类
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fieldCategoryValues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无扩展字段，点击右上角"管理分类"添加
              </p>
            ) : (
              fieldCategoryValues.map((fv) => (
                <div key={fv.categoryId} className="space-y-2">
                  <Label htmlFor={`field-${fv.categoryId}`} className="text-sm font-medium">
                    {fv.categoryName}
                  </Label>
                  <Input
                    id={`field-${fv.categoryId}`}
                    value={fv.value}
                    onChange={(e) => handleUpdateFieldCategoryValue(fv.categoryId, e.target.value)}
                    placeholder={`请输入${fv.categoryName}`}
                    className="h-9"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* 管理分类对话框 */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>管理字段分类</DialogTitle>
            <DialogDescription>
              添加或删除扩展信息的字段分类
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 添加新分类 */}
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="输入新分类名称"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateCategory();
                  }
                }}
              />
              <Button
                onClick={handleCreateCategory}
                disabled={createCategoryMutation.isPending}
              >
                添加
              </Button>
            </div>
            
            {/* 现有分类列表 */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {fieldCategories && fieldCategories.length > 0 ? (
                fieldCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-card"
                  >
                    <span className="text-sm font-medium">{cat.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(cat.id)}
                      disabled={deleteCategoryMutation.isPending}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无分类
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCategoryDialog(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
