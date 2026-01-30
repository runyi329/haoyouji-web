import { useState, useMemo, useEffect } from "react";
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
import { ArrowLeft, Trash2, Plus, Pencil, ChevronDown, Stethoscope, UserStar } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FieldCategorySelector } from "@/components/FieldCategorySelector";
// import { InlineFieldSelector } from "@/components/InlineFieldSelector";

// 扩展信息字段值
interface ExtendedFieldValue {
  id?: number; // 已保存的字段值ID（编辑模式）
  categoryId: number;
  categoryName: string;
  value: string;
}

export default function AddContact() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  // 使用useMemo缓存URL参数，避免每次渲染都重新创建
  const { contactId, isEditMode } = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
    const mode = urlParams.get('mode') === 'edit' && id !== null;
    return { contactId: id, isEditMode: mode };
  }, []);
  
  // 基本信息（4个基础字段：姓名、昵称、性别、地区）
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [gender, setGender] = useState("");
  const [region, setRegion] = useState("");
  
  // 扩展信息字段值列表
  const [extendedFields, setExtendedFields] = useState<ExtendedFieldValue[]>([]);
  
  // 添加扩展信息对话框
  const [showFieldSelector, setShowFieldSelector] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState("");
  
  // 星座选择对话框
  const [showConstellationDialog, setShowConstellationDialog] = useState(false);
  const [selectedConstellation, setSelectedConstellation] = useState("");
  
  // 生日选择对话框
  const [showBirthdayDialog, setShowBirthdayDialog] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState("");
  
  // 血型选择对话框
  const [showBloodTypeDialog, setShowBloodTypeDialog] = useState(false);
  const [selectedBloodType, setSelectedBloodType] = useState("");
  
  // 属相选择对话框
  const [showZodiacDialog, setShowZodiacDialog] = useState(false);
  const [selectedZodiac, setSelectedZodiac] = useState("");
  
  // 年龄选择对话框
  const [showAgeDialog, setShowAgeDialog] = useState(false);
  const [selectedAge, setSelectedAge] = useState("");
  
  // 身高选择对话框
  const [showHeightDialog, setShowHeightDialog] = useState(false);
  const [selectedHeight, setSelectedHeight] = useState("");
  
  // 鞋码选择对话框
  const [showShoeSizeDialog, setShowShoeSizeDialog] = useState(false);
  const [selectedShoeSize, setSelectedShoeSize] = useState("");
  
  // 饮食选择对话框（多选）
  const [showDietaryDialog, setShowDietaryDialog] = useState(false);
  const [selectedDietaries, setSelectedDietaries] = useState<string[]>([]);
  
  // 习惯选择对话框（多选）
  const [showHabitDialog, setShowHabitDialog] = useState(false);
  const [selectedHabits, setSelectedHabits] = useState<string[]>([]);
  
  // 健康选择对话框（多选）
  const [showHealthDialog, setShowHealthDialog] = useState(false);
  const [selectedHealths, setSelectedHealths] = useState<string[]>([]);
  
  // 性格选择对话框（多选）
  const [showPersonalityDialog, setShowPersonalityDialog] = useState(false);
  const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>([]);
  
  // 民族选择对话框
  const [showEthnicDialog, setShowEthnicDialog] = useState(false);
  const [selectedEthnic, setSelectedEthnic] = useState("");
  
  // 品牌选择对话框（多选）
  const [showBrandDialog, setShowBrandDialog] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  
  // 娱乐选择对话框（多选）
  const [showEntertainmentDialog, setShowEntertainmentDialog] = useState(false);
  const [selectedEntertainments, setSelectedEntertainments] = useState<string[]>([]);
  
  // 职业字段对话框
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  
  const [showFinanceDialog, setShowFinanceDialog] = useState(false);
  const [selectedFinance, setSelectedFinance] = useState("");
  
  const [showLegalDialog, setShowLegalDialog] = useState(false);
  const [selectedLegal, setSelectedLegal] = useState("");
  
  const [showLaborDialog, setShowLaborDialog] = useState(false);
  const [selectedLabor, setSelectedLabor] = useState("");
  
  const [showTaxDialog, setShowTaxDialog] = useState(false);
  const [selectedTax, setSelectedTax] = useState("");
  
  const [showHRDialog, setShowHRDialog] = useState(false);
  const [selectedHR, setSelectedHR] = useState("");
  
  const [showPublicAccountDialog, setShowPublicAccountDialog] = useState(false);
  const [selectedPublicAccount, setSelectedPublicAccount] = useState("");
  
  const [showPrivateAccountDialog, setShowPrivateAccountDialog] = useState(false);
  const [selectedPrivateAccount, setSelectedPrivateAccount] = useState("");
  
  // 用于跟踪是否已初始化字段值
  const [isFieldsInitialized, setIsFieldsInitialized] = useState(false);
  
  // 基本信息折叠状态
  const [isBasicInfoCollapsed, setIsBasicInfoCollapsed] = useState(false);
  
  // 模糊查询相关状态
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // 获取所有可用的字段类目（树状结构）
  const { data: fieldCategories } = trpc.contacts.fieldValues.categories.useQuery();
  
  // 模糊搜索已有人脉
  const { data: suggestions } = trpc.contacts.list.useQuery(
    { searchQuery: searchQuery || undefined },
    { enabled: searchQuery.length > 0 && !isEditMode } // 只在添加模式下启用
  );
  
  // 处理姓名输入变化
  const handleNameChange = (value: string) => {
    setName(value);
    setSearchQuery(value);
    setShowSuggestions(value.length > 0);
  };
  
  // 点击建议项跳转到详情页
  const handleSuggestionClick = (contactId: number) => {
    setLocation(`/parent/contacts/${contactId}`);
  };
  
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
        categoryName: fv.categoryName || fv.name || "",
        value: fv.value || "",
      }));
      setExtendedFields(fields);
    }
  }, [existingFieldValues, isEditMode]);
  
  // 创建人脉API
  const createContactMutation = trpc.contacts.create.useMutation({
    onSuccess: async (data) => {
      // 如果有扩展信息，逐个保存
      if (extendedFields.length > 0) {
        try {
          for (const field of extendedFields) {
            await addFieldValueMutation.mutateAsync({
              contactId: data.id,
              categoryId: field.categoryId,
              value: field.value,
            });
          }
        } catch (error) {
          console.error('保存扩展信息失败:', error);
          toast.error("扩展信息保存失败");
        }
      }
      toast.success("人脉添加成功");
      setLocation(`/parent/contacts/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message || "添加失败");
    },
  });
  
  // 更新人脉API
  const updateContactMutation = trpc.contacts.update.useMutation({
    onSuccess: async (data) => {
      toast.success("人脉更新成功");
      // 使缓存失效，强制重新获取数据
      await utils.contacts.get.invalidate({ id: contactId! });
      await utils.contacts.fieldValues.list.invalidate({ contactId: contactId! });
      setLocation(`/parent/contacts/${contactId}`);
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });
  
  // 添加扩展信息字段值API
  const addFieldValueMutation = trpc.contacts.fieldValues.add.useMutation({
    onSuccess: async (newFieldValue) => {
      toast.success("扩展信息已添加");
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      toast.error(error.message || "添加扩展信息失败");
    },
  });
  
  // 更新扩展信息字段值 API
  const updateFieldValueMutation = trpc.contacts.fieldValues.update.useMutation({
    onSuccess: async () => {
      toast.success("扩展信息已更新");
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      toast.error(error.message || "更新扩展信息失败");
    },
  });
  
  // 删除扩展信息字段值 API
  const deleteFieldValueMutation = trpc.contacts.fieldValues.delete.useMutation({
    onSuccess: async () => {
      toast.success("扩展信息已删除");
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      toast.error(error.message || "删除扩展信息失败");
    },
  });  
  // 处理分类选择器的选择
  const handleCategorySelect = (category: any, value: string) => {
    console.log('handleCategorySelect called:', { category, value, isEditMode, extendedFieldsLength: extendedFields.length });
    
    // 更新本地状态，显示为“待确认”状态
    setExtendedFields(prev => {
      const newFields = [...prev, {
        categoryId: category.id,
        categoryName: category.name,
        value: value,
        // 没有id表示待确认，点击保存时才会真正保存到数据库
      }];
      console.log('Updated extendedFields:', newFields);
      return newFields;
    });
    
    toast.success("扩展信息已添加，请点击保存按钮");
  };
  
  // 编辑扩展信息字段
  const handleEditExtendedField = (index: number) => {
    setEditingFieldIndex(index);
    setEditingFieldValue(extendedFields[index].value);
  };
  
  // 保存编辑
  const handleSaveEdit = () => {
    if (editingFieldIndex === null) return;
    
    if (!editingFieldValue.trim()) {
      toast.error("请输入内容");
      return;
    }
    
    const field = extendedFields[editingFieldIndex];
    
    if (isEditMode && contactId && field.id) {
      // 编辑模式：更新数据库
      updateFieldValueMutation.mutate({
        id: field.id,
        value: editingFieldValue.trim(),
      });
    }
    
    // 更新本地状态
    setExtendedFields(prev => {
      const newFields = [...prev];
      newFields[editingFieldIndex] = {
        ...newFields[editingFieldIndex],
        value: editingFieldValue.trim(),
      };
      return newFields;
    });
    
    setEditingFieldIndex(null);
    setEditingFieldValue("");
    toast.success("修改成功");
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setEditingFieldIndex(null);
    setEditingFieldValue("");
  };
  
  // 删除扩展信息字段
  const handleDeleteExtendedField = (index: number) => {
    const field = extendedFields[index];
    
    if (isEditMode && field.id) {
      // 编辑模式：从数据库删除
      deleteFieldValueMutation.mutate({ id: field.id });
      // 从本地状态删除
      setExtendedFields(prev => prev.filter((_, i) => i !== index));
    } else {
      // 新增模式：从本地状态删除
      setExtendedFields(prev => prev.filter((_, i) => i !== index));
      toast.success("扩展信息已删除");
    }
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("请输入姓名");
      return;
    }
    
    if (isEditMode && contactId) {
      // 编辑模式：更新人脉
      const updateData = {
        id: contactId,
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,
      };
      console.log('[AddContact] 提交更新数据:', updateData);
      console.log('[AddContact] 当前状态:', { name, title, gender, region });
      
      // 保存基本信息
      updateContactMutation.mutate(updateData);
      
      // 保存所有待确认的扩展信息（没有id的字段）
      const pendingFields = extendedFields.filter(f => !f.id);
      console.log('[AddContact] 待确认的扩展信息:', pendingFields);
      
      for (const field of pendingFields) {
        addFieldValueMutation.mutate({
          contactId: contactId,
          categoryId: field.categoryId,
          value: field.value,
        });
      }
    } else {
      // 新增模式：创建人脉（不传扩展信息，在onSuccess中保存）
      createContactMutation.mutate({
        name: name.trim(),
        title: title.trim() || undefined,
        gender: gender || undefined,
        region: region || undefined,
      });
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container flex items-center justify-between h-14">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <h1 className="text-lg font-semibold">
            {isEditMode ? "编辑人脉" : "添加人脉"}
          </h1>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createContactMutation.isPending || updateContactMutation.isPending}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 表单内容 */}
      <div className="container py-6 space-y-6">
        {/* 基本信息 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer" onClick={() => setIsBasicInfoCollapsed(!isBasicInfoCollapsed)}>
            <div className="flex items-center gap-2">
              <CardTitle>基本信息</CardTitle>
              {isBasicInfoCollapsed && name && (
                <span className="text-base font-normal text-gray-600">{name}</span>
              )}
            </div>
            <div className="flex-shrink-0">
              <ChevronDown className={`h-6 w-6 text-gray-700 z-50 transition-transform ${isBasicInfoCollapsed ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
          {!isBasicInfoCollapsed && (
          <CardContent className="space-y-4">
            {/* 第一行：姓名 + 昵称 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 relative">
                <Label htmlFor="name">
                  姓名 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => setShowSuggestions(searchQuery.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="请输入姓名"
                />
                
                {/* 模糊查询下拉框 */}
                {showSuggestions && suggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b">
                      找到 {suggestions.length} 个相似的人脉，点击查看详情
                    </div>
                    {suggestions.map((contact: any) => (
                      <div
                        key={contact.id}
                        onClick={() => handleSuggestionClick(contact.id)}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      >
                        <div className="font-medium text-sm">{contact.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                          {contact.title && <div>昵称：{contact.title}</div>}
                          {contact.fieldValues && contact.fieldValues.length > 0 && (
                            <div>
                              {contact.fieldValues
                                .slice(0, 3)
                                .map((fv: any, idx: number) => (
                                  <span key={idx}>
                                    {fv.categoryName}：{fv.value}
                                    {idx < Math.min(contact.fieldValues.length, 3) - 1 && ' · '}
                                  </span>
                                ))}
                            </div>
                          )}
                          {contact.region && <div>所在地：{contact.region}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">昵称</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="请输入昵称"
                />
              </div>
            </div>

            {/* 第二行：性别 + 地区 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">性别</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="gender" className="w-full">
                    <SelectValue placeholder="请选择性别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="男">男</SelectItem>
                    <SelectItem value="女">女</SelectItem>
                    <SelectItem value="未知">未知</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="region">地区</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="region" className="w-full">
                    <SelectValue placeholder="请选择地区" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="北京">北京</SelectItem>
                  <SelectItem value="天津">天津</SelectItem>
                  <SelectItem value="河北">河北</SelectItem>
                  <SelectItem value="山西">山西</SelectItem>
                  <SelectItem value="内蒙古">内蒙古</SelectItem>
                  <SelectItem value="辽宁">辽宁</SelectItem>
                  <SelectItem value="吉林">吉林</SelectItem>
                  <SelectItem value="黑龙江">黑龙江</SelectItem>
                  <SelectItem value="上海">上海</SelectItem>
                  <SelectItem value="江苏">江苏</SelectItem>
                  <SelectItem value="浙江">浙江</SelectItem>
                  <SelectItem value="安徽">安徽</SelectItem>
                  <SelectItem value="福建">福建</SelectItem>
                  <SelectItem value="江西">江西</SelectItem>
                  <SelectItem value="山东">山东</SelectItem>
                  <SelectItem value="河南">河南</SelectItem>
                  <SelectItem value="湖北">湖北</SelectItem>
                  <SelectItem value="湖南">湖南</SelectItem>
                  <SelectItem value="广东">广东</SelectItem>
                  <SelectItem value="广西">广西</SelectItem>
                  <SelectItem value="海南">海南</SelectItem>
                  <SelectItem value="重庆">重庆</SelectItem>
                  <SelectItem value="四川">四川</SelectItem>
                  <SelectItem value="贵州">贵州</SelectItem>
                  <SelectItem value="云南">云南</SelectItem>
                  <SelectItem value="西藏">西藏</SelectItem>
                  <SelectItem value="陕西">陕西</SelectItem>
                  <SelectItem value="甘肃">甘肃</SelectItem>
                  <SelectItem value="青海">青海</SelectItem>
                  <SelectItem value="宁夏">宁夏</SelectItem>
                  <SelectItem value="新疆">新疆</SelectItem>
                  <SelectItem value="香港">香港</SelectItem>
                  <SelectItem value="澳门">澳门</SelectItem>
                  <SelectItem value="台湾">台湾</SelectItem>
                  <SelectItem value="海外">海外</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </CardContent>
          )}
        </Card>

        {/* 扩展信息 */}
        <Card>
          <CardHeader>
            <CardTitle>扩展信息</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 已添加的扩展信息 */}
            {extendedFields.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {extendedFields.map((field, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full border bg-white hover:bg-gray-50 transition-colors"
                  >
                    {editingFieldIndex === index ? (
                      // 编辑模式
                      <>
                        <span className="text-sm font-medium text-muted-foreground">
                          {field.categoryName}:
                        </span>
                        <Input
                          value={editingFieldValue}
                          onChange={(e) => setEditingFieldValue(e.target.value)}
                          placeholder="请输入内容"
                          className="h-6 w-32 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          className="h-6 px-2 text-xs"
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          className="h-6 px-2 text-xs"
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      // 显示模式
                      <>
                        <span className="text-sm text-muted-foreground">
                          {field.categoryName}
                        </span>
                        <span className="text-sm font-medium">
                          {field.value}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEditExtendedField(index)}
                          className="h-5 w-5 hover:text-primary"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteExtendedField(index)}
                          className="h-5 w-5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* 一级分类标题 */}
            <div className="space-y-4 mt-4">
              {[
                { 
                  id: 'preference', 
                  name: '偏好',
                  fields: ['星座', '生日', '年龄', '血型', '属相', '身高', '鞋码', '民族', '饮食', '习惯', '健康', '性格', '品牌', '娱乐']
                },
                { 
                  id: 'experience', 
                  name: '履历',
                  fields: []
                },
                { 
                  id: 'finance', 
                  name: '财务',
                  fields: []
                },
                { 
                  id: 'relationship', 
                  name: '关系',
                  fields: []
                },
                { 
                  id: 'career', 
                  name: '职业',
                  fields: ['公司', '财务', '法务', '劳务', '税务', '人事', '公户', '私户']
                },
                { 
                  id: 'information', 
                  name: '信息',
                  fields: ['电话', '微信', '地址']
                },
              ].map(category => (
                <div key={category.id} className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    {category.id === 'preference' && <Stethoscope className="h-5 w-5 text-gray-700" />}
                    {category.id === 'experience' && <UserStar className="h-5 w-5 text-gray-700" />}
                    {/* 其他分类图标将在后续添加 */}
                  </div>
                  {/* 二级字段方框 */}
                  {category.fields.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {category.fields.map(field => {
                        // 检查该字段是否已填写
                        const hasValue = extendedFields.some(f => f.categoryName === field);
                        
                        return (
                          <button
                            key={field}
                            onClick={() => {
                              // 点击扩展信息字段时，自动收起基本信息区域
                              setIsBasicInfoCollapsed(true);
                              
                              if (field === '星座') {
                                // 如果已经有值，预填充到选择器中
                                const existingValue = extendedFields.find(f => f.categoryName === '星座');
                                if (existingValue) {
                                  setSelectedConstellation(existingValue.value);
                                }
                                setShowConstellationDialog(true);
                              } else if (field === '生日') {
                                const existingValue = extendedFields.find(f => f.categoryName === '生日');
                                if (existingValue) {
                                  setSelectedBirthday(existingValue.value);
                                }
                                setShowBirthdayDialog(true);
                              } else if (field === '血型') {
                                const existingValue = extendedFields.find(f => f.categoryName === '血型');
                                if (existingValue) {
                                  setSelectedBloodType(existingValue.value);
                                }
                                setShowBloodTypeDialog(true);
                              } else if (field === '属相') {
                                const existingValue = extendedFields.find(f => f.categoryName === '属相');
                                if (existingValue) {
                                  setSelectedZodiac(existingValue.value);
                                }
                                setShowZodiacDialog(true);
                              } else if (field === '年龄') {
                                const existingValue = extendedFields.find(f => f.categoryName === '年龄');
                                if (existingValue) {
                                  setSelectedAge(existingValue.value);
                                }
                                setShowAgeDialog(true);
                              } else if (field === '身高') {
                                const existingValue = extendedFields.find(f => f.categoryName === '身高');
                                if (existingValue) {
                                  setSelectedHeight(existingValue.value);
                                }
                                setShowHeightDialog(true);
                              } else if (field === '鞋码') {
                                const existingValue = extendedFields.find(f => f.categoryName === '鞋码');
                                if (existingValue) {
                                  setSelectedShoeSize(existingValue.value);
                                }
                                setShowShoeSizeDialog(true);
                              } else if (field === '饮食') {
                                const existingValue = extendedFields.find(f => f.categoryName === '饮食');
                                if (existingValue) {
                                  setSelectedDietaries(existingValue.value.split(','));
                                }
                                setShowDietaryDialog(true);
                              } else if (field === '习惯') {
                                const existingValue = extendedFields.find(f => f.categoryName === '习惯');
                                if (existingValue) {
                                  setSelectedHabits(existingValue.value.split(','));
                                }
                                setShowHabitDialog(true);
                              } else if (field === '健康') {
                                const existingValue = extendedFields.find(f => f.categoryName === '健康');
                                if (existingValue) {
                                  setSelectedHealths(existingValue.value.split(','));
                                }
                                setShowHealthDialog(true);
                              } else if (field === '性格') {
                                const existingValue = extendedFields.find(f => f.categoryName === '性格');
                                if (existingValue) {
                                  setSelectedPersonalities(existingValue.value.split(','));
                                }
                                setShowPersonalityDialog(true);
                              } else if (field === '民族') {
                                const existingValue = extendedFields.find(f => f.categoryName === '民族');
                                if (existingValue) {
                                  setSelectedEthnic(existingValue.value);
                                }
                                setShowEthnicDialog(true);
                              } else if (field === '品牌') {
                                const existingValue = extendedFields.find(f => f.categoryName === '品牌');
                                if (existingValue) {
                                  setSelectedBrands(existingValue.value.split(','));
                                }
                                setShowBrandDialog(true);
                              } else if (field === '娱乐') {
                                const existingValue = extendedFields.find(f => f.categoryName === '娱乐');
                                if (existingValue) {
                                  setSelectedEntertainments(existingValue.value.split(','));
                                }
                                setShowEntertainmentDialog(true);
                              } else if (field === '公司') {
                                const existingValue = extendedFields.find(f => f.categoryName === '公司');
                                if (existingValue) {
                                  setSelectedCompany(existingValue.value);
                                }
                                setShowCompanyDialog(true);
                              } else if (field === '财务') {
                                const existingValue = extendedFields.find(f => f.categoryName === '财务');
                                if (existingValue) {
                                  setSelectedFinance(existingValue.value);
                                }
                                setShowFinanceDialog(true);
                              } else if (field === '法务') {
                                const existingValue = extendedFields.find(f => f.categoryName === '法务');
                                if (existingValue) {
                                  setSelectedLegal(existingValue.value);
                                }
                                setShowLegalDialog(true);
                              } else if (field === '劳务') {
                                const existingValue = extendedFields.find(f => f.categoryName === '劳务');
                                if (existingValue) {
                                  setSelectedLabor(existingValue.value);
                                }
                                setShowLaborDialog(true);
                              } else if (field === '税务') {
                                const existingValue = extendedFields.find(f => f.categoryName === '税务');
                                if (existingValue) {
                                  setSelectedTax(existingValue.value);
                                }
                                setShowTaxDialog(true);
                              } else if (field === '人事') {
                                const existingValue = extendedFields.find(f => f.categoryName === '人事');
                                if (existingValue) {
                                  setSelectedHR(existingValue.value);
                                }
                                setShowHRDialog(true);
                              } else if (field === '公户') {
                                const existingValue = extendedFields.find(f => f.categoryName === '公户');
                                if (existingValue) {
                                  setSelectedPublicAccount(existingValue.value);
                                }
                                setShowPublicAccountDialog(true);
                              } else if (field === '私户') {
                                const existingValue = extendedFields.find(f => f.categoryName === '私户');
                                if (existingValue) {
                                  setSelectedPrivateAccount(existingValue.value);
                                }
                                setShowPrivateAccountDialog(true);
                              }
                            }}
                            className={`px-4 py-2 border rounded-lg text-sm transition-colors ${
                              hasValue 
                                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {field}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">暂无字段</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 字段分类选择器 */}
      <FieldCategorySelector
        open={showFieldSelector}
        onOpenChange={setShowFieldSelector}
        categories={fieldCategories || []}
        onSelect={handleCategorySelect}
        contactName={name}
      />
      
      {/* 星座选择对话框 */}
      {showConstellationDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConstellationDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择星座</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', 
                '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'].map(constellation => (
                <button
                  key={constellation}
                  onClick={() => setSelectedConstellation(constellation)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedConstellation === constellation
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {constellation}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // 恢复到原始值
                  const existingValue = extendedFields.find(f => f.categoryName === '星座');
                  setSelectedConstellation(existingValue?.value || "");
                  setShowConstellationDialog(false);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedConstellation) {
                    // 添加到extendedFields
                    setExtendedFields(prev => {
                      // 删除旧的星座记录（如果有）
                      const filtered = prev.filter(f => f.categoryName !== '星座');
                      return [...filtered, {
                        categoryId: 0, // 临时ID，后续会从数据库获取
                        categoryName: '星座',
                        value: selectedConstellation,
                      }];
                    });
                    toast.success(`已选择星座：${selectedConstellation}`);
                    setShowConstellationDialog(false);
                    // 不清空选择状态，下次打开时显示当前值
                  } else {
                    toast.error("请选择一个星座");
                  }
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 生日选择对话框 */}
      {showBirthdayDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBirthdayDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择生日</h3>
            <div className="mb-4 flex justify-center">
              <Input
                type="date"
                value={selectedBirthday}
                onChange={(e) => setSelectedBirthday(e.target.value)}
                className="text-base"
                style={{ width: '50%' }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const existingValue = extendedFields.find(f => f.categoryName === '生日');
                  setSelectedBirthday(existingValue?.value || "");
                  setShowBirthdayDialog(false);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedBirthday) {
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '生日');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '生日',
                        value: selectedBirthday,
                      }];
                    });
                    toast.success(`已选择生日：${selectedBirthday}`);
                    setShowBirthdayDialog(false);
                  } else {
                    toast.error("请选择生日");
                  }
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 血型选择对话框 */}
      {showBloodTypeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBloodTypeDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择血型</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {['A型', 'B型', 'AB型', 'O型'].map(bloodType => (
                <button
                  key={bloodType}
                  onClick={() => setSelectedBloodType(bloodType)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedBloodType === bloodType
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {bloodType}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const existingValue = extendedFields.find(f => f.categoryName === '血型');
                  setSelectedBloodType(existingValue?.value || "");
                  setShowBloodTypeDialog(false);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedBloodType) {
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '血型');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '血型',
                        value: selectedBloodType,
                      }];
                    });
                    toast.success(`已选择血型：${selectedBloodType}`);
                    setShowBloodTypeDialog(false);
                  } else {
                    toast.error("请选择血型");
                  }
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 属相选择对话框 */}
      {showZodiacDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowZodiacDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择属相</h3>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'].map(zodiac => (
                <button
                  key={zodiac}
                  onClick={() => setSelectedZodiac(zodiac)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedZodiac === zodiac
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {zodiac}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const existingValue = extendedFields.find(f => f.categoryName === '属相');
                  setSelectedZodiac(existingValue?.value || "");
                  setShowZodiacDialog(false);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedZodiac) {
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '属相');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '属相',
                        value: selectedZodiac,
                      }];
                    });
                    toast.success(`已选择属相：${selectedZodiac}`);
                    setShowZodiacDialog(false);
                  } else {
                    toast.error("请选择属相");
                  }
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 年龄选择对话框 */}
      {showAgeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAgeDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择出生年份</h3>
            <div className="mb-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedAge(String(year))}
                    className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                      selectedAge === String(year)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const existingValue = extendedFields.find(f => f.categoryName === '年龄');
                  if (existingValue) {
                    // 恢复为出生年份
                    const currentYear = new Date().getFullYear();
                    const birthYear = currentYear - Number(existingValue.value);
                    setSelectedAge(String(birthYear));
                  } else {
                    setSelectedAge("");
                  }
                  setShowAgeDialog(false);
                }}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedAge && !isNaN(Number(selectedAge))) {
                    const birthYear = Number(selectedAge);
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - birthYear;
                    
                    // 保存年龄
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '年龄');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '年龄',
                        value: String(age),
                      }];
                    });
                    
                    // 根据出生年份计算属相
                    const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
                    const zodiacIndex = (birthYear - 1900) % 12;
                    const zodiacAnimal = zodiacAnimals[zodiacIndex];
                    
                    // 自动填充属相
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '属相');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '属相',
                        value: zodiacAnimal,
                      }];
                    });
                    
                    toast.success(`已设置年龄：${age}岁，属相：${zodiacAnimal}`);
                    setShowAgeDialog(false);
                  } else {
                    toast.error("请输入有效的年份");
                  }
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 身高选择对话框 */}
      {showHeightDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHeightDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择身高</h3>
            <div className="grid grid-cols-2 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['150cm以下', '150-155cm', '155-160cm', '160-165cm', '165-170cm', '170-175cm', '175-180cm', '180-185cm', '185-190cm', '190cm以上'].map(height => (
                <button
                  key={height}
                  onClick={() => setSelectedHeight(height)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedHeight === height
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {height}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '身高');
                setSelectedHeight(existingValue?.value || "");
                setShowHeightDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHeight) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '身高');
                    return [...filtered, { categoryId: 0, categoryName: '身高', value: selectedHeight }];
                  });
                  toast.success(`已选择身高：${selectedHeight}`);
                  setShowHeightDialog(false);
                } else {
                  toast.error("请选择身高");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 鞋码选择对话框 */}
      {showShoeSizeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShoeSizeDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择鞋码</h3>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map(size => (
                <button
                  key={size}
                  onClick={() => setSelectedShoeSize(size)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedShoeSize === size
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '鞋码');
                setSelectedShoeSize(existingValue?.value || "");
                setShowShoeSizeDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedShoeSize) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '鞋码');
                    return [...filtered, { categoryId: 0, categoryName: '鞋码', value: selectedShoeSize }];
                  });
                  toast.success(`已选择鞋码：${selectedShoeSize}`);
                  setShowShoeSizeDialog(false);
                } else {
                  toast.error("请选择鞋码");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}

      
      {/* 饮食选择对话框（多选） */}
      {showDietaryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDietaryDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择饮食（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['粤菜', '本帮菜', '川菜', '湘菜', '鲁菜', '徽菜', '闽菜', '浙菜', '苏菜', '东北菜', '日料', '韩餐', '西餐', '东南亚菜', '清真菜', '火锅', '烧烤', '海鲜', '免辣', '免香菜', '免葱', '免姜', '免蒜', '免海鲜', '素食', '清真'].map(dietary => (
                <button
                  key={dietary}
                  onClick={() => {
                    setSelectedDietaries(prev => 
                      prev.includes(dietary) ? prev.filter(d => d !== dietary) : [...prev, dietary]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedDietaries.includes(dietary)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {dietary}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '饮食');
                setSelectedDietaries(existingValue ? existingValue.value.split(',') : []);
                setShowDietaryDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedDietaries.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '饮食');
                    return [...filtered, { categoryId: 0, categoryName: '饮食', value: selectedDietaries.join(',') }];
                  });
                  toast.success(`已选择饮食：${selectedDietaries.join('、')}`);
                  setShowDietaryDialog(false);
                } else {
                  toast.error("请至少选择一项");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 习惯选择对话框（多选） */}
      {showHabitDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHabitDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择习惯（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['早起', '晚睡', '运动', '阅读', '喝咖啡', '喝茶', '抽烟', '喝酒', '素食', '健身'].map(habit => (
                <button
                  key={habit}
                  onClick={() => {
                    setSelectedHabits(prev => 
                      prev.includes(habit) ? prev.filter(h => h !== habit) : [...prev, habit]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedHabits.includes(habit)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {habit}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '习惯');
                setSelectedHabits(existingValue ? existingValue.value.split(',') : []);
                setShowHabitDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHabits.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '习惯');
                    return [...filtered, { categoryId: 0, categoryName: '习惯', value: selectedHabits.join(',') }];
                  });
                  toast.success(`已选择习惯：${selectedHabits.join('、')}`);
                  setShowHabitDialog(false);
                } else {
                  toast.error("请至少选择一个习惯");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 健康选择对话框（多选） */}
      {showHealthDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHealthDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择健康状况（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['健康', '过敏体质', '高血压', '糖尿病', '心脏病', '胃病', '失眠', '颈椎病', '腰椎病'].map(health => (
                <button
                  key={health}
                  onClick={() => {
                    setSelectedHealths(prev => 
                      prev.includes(health) ? prev.filter(h => h !== health) : [...prev, health]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedHealths.includes(health)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {health}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '健康');
                setSelectedHealths(existingValue ? existingValue.value.split(',') : []);
                setShowHealthDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHealths.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '健康');
                    return [...filtered, { categoryId: 0, categoryName: '健康', value: selectedHealths.join(',') }];
                  });
                  toast.success(`已选择健康状况：${selectedHealths.join('、')}`);
                  setShowHealthDialog(false);
                } else {
                  toast.error("请至少选择一项");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 性格选择对话框（多选） */}
      {showPersonalityDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPersonalityDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择性格（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['外向', '内向', '乐观', '悉观', '细心', '粗心', '幽默', '严肃', '温和', '急躁', '理性', '感性'].map(personality => (
                <button
                  key={personality}
                  onClick={() => {
                    setSelectedPersonalities(prev => 
                      prev.includes(personality) ? prev.filter(p => p !== personality) : [...prev, personality]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedPersonalities.includes(personality)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {personality}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '性格');
                setSelectedPersonalities(existingValue ? existingValue.value.split(',') : []);
                setShowPersonalityDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPersonalities.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '性格');
                    return [...filtered, { categoryId: 0, categoryName: '性格', value: selectedPersonalities.join(',') }];
                  });
                  toast.success(`已选择性格：${selectedPersonalities.join('、')}`);
                  setShowPersonalityDialog(false);
                } else {
                  toast.error("请至少选择一个性格");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 民族选择对话框 */}
      {showEthnicDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEthnicDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择民族</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['汉族', '回族', '维吴尔族', '藏族', '蒙古族', '苗族', '壮族', '朝鲜族', '满族', '侗族', '白族', '土家族', '哈萨克族', '大族', '黎族', '佤僳族', '佤伬族', '佤伬族', '瑶族', '东乡族', '高山族', '景颇族', '柯尔克孜族', '土族', '达斡尔族', '仲家族', '布朗族', '撒拉族', '毛南族', '信德族', '水族', '纳西族', '羌族', '普米族', '阿昌族', '怒族', '基诺族', '德昂族', '保安族', '俄罗斯族', '裕固族', '京族', '塔塔尔族', '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族', '鄂温克族', '塔吉克族', '乌兹别克族', '俄罗斯族', '鄂伦春族', '塔塔尔族'].slice(0, 30).map(ethnic => (
                <button
                  key={ethnic}
                  onClick={() => setSelectedEthnic(ethnic)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedEthnic === ethnic
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {ethnic}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '民族');
                setSelectedEthnic(existingValue?.value || "");
                setShowEthnicDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEthnic) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '民族');
                    return [...filtered, { categoryId: 0, categoryName: '民族', value: selectedEthnic }];
                  });
                  toast.success(`已选择民族：${selectedEthnic}`);
                  setShowEthnicDialog(false);
                } else {
                  toast.error("请选择民族");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 品牌选择对话框（多选） */}
      {showBrandDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBrandDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择品牌偏好（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['苹果', '华为', '小米', '耐克', '阿迪达斯', '安踏', '奔驰', '宝马', '奥迪', '保时捷', '雅诗兰黛', '香奈儿', 'LV', '爱马仕', '古驰', '星巴克', '喜茶', '肇德基', '麦当劳', '海底捞', '外婆家'].map(brand => (
                <button
                  key={brand}
                  onClick={() => {
                    setSelectedBrands(prev => 
                      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedBrands.includes(brand)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '品牌');
                setSelectedBrands(existingValue ? existingValue.value.split(',') : []);
                setShowBrandDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedBrands.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '品牌');
                    return [...filtered, { categoryId: 0, categoryName: '品牌', value: selectedBrands.join(',') }];
                  });
                  toast.success(`已选择品牌：${selectedBrands.join('、')}`);
                  setShowBrandDialog(false);
                } else {
                  toast.error("请至少选择一个品牌");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 娱乐选择对话框（多选） */}
      {showEntertainmentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEntertainmentDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择娱乐偏好（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['电影', '音乐', '运动', '旅游', '游戏', '阅读', 'KTV', '剔本杀', '密室逃脱', '摄影', '书法', '绘画', '舞蹈', '瑜伽', '健身', '钓鱼', '登山', '游泳'].map(entertainment => (
                <button
                  key={entertainment}
                  onClick={() => {
                    setSelectedEntertainments(prev => 
                      prev.includes(entertainment) ? prev.filter(e => e !== entertainment) : [...prev, entertainment]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedEntertainments.includes(entertainment)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {entertainment}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '娱乐');
                setSelectedEntertainments(existingValue ? existingValue.value.split(',') : []);
                setShowEntertainmentDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEntertainments.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '娱乐');
                    return [...filtered, { categoryId: 0, categoryName: '娱乐', value: selectedEntertainments.join(',') }];
                  });
                  toast.success(`已选择娱乐：${selectedEntertainments.join('、')}`);
                  setShowEntertainmentDialog(false);
                } else {
                  toast.error("请至少选择一项");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 公司对话框 */}
      {showCompanyDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCompanyDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">公司名称</h3>
            <Input value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} placeholder="请输入公司名称" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '公司');
                setSelectedCompany(existingValue?.value || "");
                setShowCompanyDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedCompany.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '公司');
                    return [...filtered, { categoryId: 0, categoryName: '公司', value: selectedCompany }];
                  });
                  toast.success(`已设置公司：${selectedCompany}`);
                  setShowCompanyDialog(false);
                } else {
                  toast.error("请输入公司名称");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 财务对话框 */}
      {showFinanceDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFinanceDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">财务信息</h3>
            <Input value={selectedFinance} onChange={(e) => setSelectedFinance(e.target.value)} placeholder="请输入财务信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '财务');
                setSelectedFinance(existingValue?.value || "");
                setShowFinanceDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedFinance.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '财务');
                    return [...filtered, { categoryId: 0, categoryName: '财务', value: selectedFinance }];
                  });
                  toast.success(`已设置财务：${selectedFinance}`);
                  setShowFinanceDialog(false);
                } else {
                  toast.error("请输入财务信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 法务对话框 */}
      {showLegalDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLegalDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">法务信息</h3>
            <Input value={selectedLegal} onChange={(e) => setSelectedLegal(e.target.value)} placeholder="请输入法务信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '法务');
                setSelectedLegal(existingValue?.value || "");
                setShowLegalDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedLegal.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '法务');
                    return [...filtered, { categoryId: 0, categoryName: '法务', value: selectedLegal }];
                  });
                  toast.success(`已设置法务：${selectedLegal}`);
                  setShowLegalDialog(false);
                } else {
                  toast.error("请输入法务信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 劳务对话框 */}
      {showLaborDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLaborDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">劳务信息</h3>
            <Input value={selectedLabor} onChange={(e) => setSelectedLabor(e.target.value)} placeholder="请输入劳务信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '劳务');
                setSelectedLabor(existingValue?.value || "");
                setShowLaborDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedLabor.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '劳务');
                    return [...filtered, { categoryId: 0, categoryName: '劳务', value: selectedLabor }];
                  });
                  toast.success(`已设置劳务：${selectedLabor}`);
                  setShowLaborDialog(false);
                } else {
                  toast.error("请输入劳务信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 税务对话框 */}
      {showTaxDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTaxDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">税务信息</h3>
            <Input value={selectedTax} onChange={(e) => setSelectedTax(e.target.value)} placeholder="请输入税务信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '税务');
                setSelectedTax(existingValue?.value || "");
                setShowTaxDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedTax.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '税务');
                    return [...filtered, { categoryId: 0, categoryName: '税务', value: selectedTax }];
                  });
                  toast.success(`已设置税务：${selectedTax}`);
                  setShowTaxDialog(false);
                } else {
                  toast.error("请输入税务信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 人事对话框 */}
      {showHRDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHRDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">人事信息</h3>
            <Input value={selectedHR} onChange={(e) => setSelectedHR(e.target.value)} placeholder="请输入人事信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '人事');
                setSelectedHR(existingValue?.value || "");
                setShowHRDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHR.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '人事');
                    return [...filtered, { categoryId: 0, categoryName: '人事', value: selectedHR }];
                  });
                  toast.success(`已设置人事：${selectedHR}`);
                  setShowHRDialog(false);
                } else {
                  toast.error("请输入人事信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 公户对话框 */}
      {showPublicAccountDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPublicAccountDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">公户信息</h3>
            <Input value={selectedPublicAccount} onChange={(e) => setSelectedPublicAccount(e.target.value)} placeholder="请输入公户信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '公户');
                setSelectedPublicAccount(existingValue?.value || "");
                setShowPublicAccountDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPublicAccount.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '公户');
                    return [...filtered, { categoryId: 0, categoryName: '公户', value: selectedPublicAccount }];
                  });
                  toast.success(`已设置公户：${selectedPublicAccount}`);
                  setShowPublicAccountDialog(false);
                } else {
                  toast.error("请输入公户信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 私户对话框 */}
      {showPrivateAccountDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPrivateAccountDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">私户信息</h3>
            <Input value={selectedPrivateAccount} onChange={(e) => setSelectedPrivateAccount(e.target.value)} placeholder="请输入私户信息" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '私户');
                setSelectedPrivateAccount(existingValue?.value || "");
                setShowPrivateAccountDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPrivateAccount.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '私户');
                    return [...filtered, { categoryId: 0, categoryName: '私户', value: selectedPrivateAccount }];
                  });
                  toast.success(`已设置私户：${selectedPrivateAccount}`);
                  setShowPrivateAccountDialog(false);
                } else {
                  toast.error("请输入私户信息");
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
