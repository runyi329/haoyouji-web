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
import { ArrowLeft, Trash2, User, Tag, Plus, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// 扩展信息字段值
interface ExtendedFieldValue {
  id?: number; // 已保存的字段值ID（编辑模式）
  categoryId: number;
  categoryName: string;
  categoryKey: string;
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
  
  // 基本信息（4个基础字段：姓名、称呼、所在地、性别）
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [gender, setGender] = useState("");
  const [region, setRegion] = useState("");
  
  // 扩展信息字段值列表
  const [extendedFields, setExtendedFields] = useState<ExtendedFieldValue[]>([]);
  
  // 添加扩展信息对话框
  const [showAddFieldDialog, setShowAddFieldDialog] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [newFieldValue, setNewFieldValue] = useState("");
  
  // 用于跟踪是否已初始化字段值
  const [isFieldsInitialized, setIsFieldsInitialized] = useState(false);
  
  // 获取所有可用的字段类目（50个固定类目）
  const { data: fieldCategories } = trpc.contacts.fieldValues.categories.useQuery();
  
  // 编辑模式：加载现有数据
  const { data: existingContact } = trpc.contacts.get.useQuery(
    { id: contactId! },
    { enabled: isEditMode && contactId !== null }
  );
  
  // 获取联系人的扩展信息字段值（编辑模式）
  const { data: existingFieldValues } = trpc.contacts.fieldValues.list.useQuery(
    { contactId: contactId! },
    { enabled: isEditMode && contactId !== null }
  );
  
  // 初始化字段值（编辑模式）
  useEffect(() => {
    if (isEditMode && existingContact && !isFieldsInitialized) {
      // 填充基本信息
      setName(existingContact.name);
      setTitle(existingContact.title || "");
      setGender(existingContact.gender || "");
      setRegion(existingContact.region || "");
      
      setIsFieldsInitialized(true);
    }
  }, [existingContact, isEditMode, isFieldsInitialized]);
  
  // 初始化扩展信息字段值（编辑模式）
  useEffect(() => {
    if (isEditMode && existingFieldValues && existingFieldValues.length > 0) {
      const fields: ExtendedFieldValue[] = existingFieldValues.map((fv: any) => ({
        id: fv.id,
        categoryId: fv.categoryId,
        categoryName: fv.categoryName || "",
        categoryKey: fv.categoryKey || "",
        value: fv.value || "",
      }));
      setExtendedFields(fields);
    }
  }, [existingFieldValues, isEditMode]);
  
  // 创建人脉API
  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: (data) => {
      toast.success("人脉添加成功");
      setLocation(`/parent/contacts/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "添加失败");
    },
  });
  
  // 更新人脉API
  const updateContactMutation = trpc.contacts.update.useMutation({
    onSuccess: (data) => {
      toast.success("人脉更新成功");
      setLocation(`/parent/contacts/${contactId}`);
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });
  
  // 添加扩展信息字段值API
  const addFieldValueMutation = trpc.contacts.fieldValues.add.useMutation({
    onSuccess: (newFieldValue) => {
      toast.success("扩展信息已添加");
      // 添加到本地状态
      const category = fieldCategories?.find(c => c.id === newFieldValue.categoryId);
      if (category) {
        setExtendedFields(prev => [...prev, {
          id: newFieldValue.id,
          categoryId: newFieldValue.categoryId,
          categoryName: category.categoryName,
          categoryKey: category.categoryKey,
          value: newFieldValue.value || "",
        }]);
      }
      // 重置对话框
      setShowAddFieldDialog(false);
      setSelectedCategoryId(null);
      setNewFieldValue("");
    },
    onError: (error) => {
      toast.error(error.message || "添加扩展信息失败");
    },
  });
  
  // 删除扩展信息字段值API
  const deleteFieldValueMutation = trpc.contacts.fieldValues.delete.useMutation({
    onSuccess: () => {
      toast.success("扩展信息已删除");
    },
    onError: (error) => {
      toast.error(error.message || "删除扩展信息失败");
    },
  });
  
  // 添加扩展信息字段
  const handleAddExtendedField = () => {
    if (!selectedCategoryId) {
      toast.error("请选择字段类目");
      return;
    }
    if (!newFieldValue.trim()) {
      toast.error("请输入字段值");
      return;
    }
    
    if (isEditMode && contactId) {
      // 编辑模式：直接保存到数据库
      addFieldValueMutation.mutate({
        contactId,
        categoryId: selectedCategoryId,
        value: newFieldValue.trim(),
      });
    } else {
      // 新增模式：添加到本地状态，保存时一起提交
      const category = fieldCategories?.find(c => c.id === selectedCategoryId);
      if (category) {
        setExtendedFields(prev => [...prev, {
          categoryId: selectedCategoryId,
          categoryName: category.categoryName,
          categoryKey: category.categoryKey,
          value: newFieldValue.trim(),
        }]);
        toast.success("扩展信息已添加");
      }
      // 重置对话框
      setShowAddFieldDialog(false);
      setSelectedCategoryId(null);
      setNewFieldValue("");
    }
  };
  
  // 删除扩展信息字段
  const handleDeleteExtendedField = (index: number) => {
    const field = extendedFields[index];
    
    if (isEditMode && field.id) {
      // 编辑模式：从数据库删除
      deleteFieldValueMutation.mutate({ id: field.id });
    }
    
    // 从本地状态删除
    setExtendedFields(prev => prev.filter((_, i) => i !== index));
  };
  
  // 更新扩展信息字段值
  const handleUpdateExtendedField = (index: number, value: string) => {
    setExtendedFields(prev => prev.map((field, i) => 
      i === index ? { ...field, value } : field
    ));
  };
  
  // 提交表单
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("请输入姓名");
      return;
    }
    
    if (isEditMode && contactId) {
      // 编辑模式：更新人脉基本信息
      updateContactMutation.mutate({
        id: contactId,
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,
      });
    } else {
      // 新增模式：创建人脉，然后保存扩展信息
      const newContact = await createContactMutation.mutateAsync({
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,
      });
      
      // 保存扩展信息字段值
      if (extendedFields.length > 0 && newContact.id) {
        for (const field of extendedFields) {
          await addFieldValueMutation.mutateAsync({
            contactId: newContact.id,
            categoryId: field.categoryId,
            value: field.value,
          });
        }
      }
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
            disabled={createContactMutation.isPending || updateContactMutation.isPending}
          >
            {createContactMutation.isPending || updateContactMutation.isPending ? "保存中..." : "保存"}
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
                onClick={() => setShowAddFieldDialog(true)}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                添加字段
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {extendedFields.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  暂无扩展信息，点击右上角"添加字段"按钮添加
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
                  <MessageCircle className="h-3 w-3" />
                  <span>需要新类目？联系管理员（微信：tina_u）</span>
                </div>
              </div>
            ) : (
              <>
                {extendedFields.map((field, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`field-${index}`} className="text-sm font-medium">
                        {field.categoryName}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteExtendedField(index)}
                        disabled={deleteFieldValueMutation.isPending}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      id={`field-${index}`}
                      value={field.value}
                      onChange={(e) => handleUpdateExtendedField(index, e.target.value)}
                      placeholder={`请输入${field.categoryName}`}
                      className="h-9"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 text-xs text-blue-600 pt-2">
                  <MessageCircle className="h-3 w-3" />
                  <span>需要新类目？联系管理员（微信：tina_u）</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* 添加扩展信息对话框 */}
      <Dialog open={showAddFieldDialog} onOpenChange={setShowAddFieldDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加扩展信息</DialogTitle>
            <DialogDescription>
              从固定类目中选择并添加扩展信息字段
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 选择类目 */}
            <div className="space-y-2">
              <Label htmlFor="category" className="text-sm font-medium">
                字段类目 <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={selectedCategoryId?.toString() || ""} 
                onValueChange={(value) => setSelectedCategoryId(parseInt(value))}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="请选择类目" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {fieldCategories && fieldCategories.length > 0 ? (
                    fieldCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.categoryName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="0" disabled>暂无类目</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {/* 输入字段值 */}
            <div className="space-y-2">
              <Label htmlFor="fieldValue" className="text-sm font-medium">
                字段值 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fieldValue"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                placeholder="请输入字段值"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddExtendedField();
                  }
                }}
              />
            </div>
            
            {/* 提示信息 */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <MessageCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">温馨提示</p>
                <p>• 同一类目可以多次添加（如多个公司、多个电话）</p>
                <p>• 需要新类目？请联系管理员（微信：tina_u）</p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddFieldDialog(false);
                setSelectedCategoryId(null);
                setNewFieldValue("");
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleAddExtendedField}
              disabled={addFieldValueMutation.isPending}
            >
              {addFieldValueMutation.isPending ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
