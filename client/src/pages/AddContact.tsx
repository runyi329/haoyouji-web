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
import { ArrowLeft, Trash2, Plus, Pencil, ChevronDown, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FieldCategorySelector } from "@/components/FieldCategorySelector";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// import { InlineFieldSelector } from "@/components/InlineFieldSelector";

// 扩展信息字段值
interface ExtendedFieldValue {
  id?: number; // 已保存的字段值ID（编辑模式）
  categoryId: number;
  categoryName: string;
  value: string;
}

// 可拖拽的字段按钮组件
function SortableFieldButton({ 
  field, 
  hasValue, 
  onClick 
}: { 
  field: string; 
  hasValue: boolean; 
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // 只有在不是拖拽时才触发点击
        if (!isDragging) {
          onClick();
        }
      }}
      className={`px-2 py-1.5 border rounded-lg text-sm transition-colors w-full ${
        hasValue 
          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
          : 'border-gray-300 hover:bg-gray-50'
      }`}
    >
      {field}
    </button>
  );
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
  
  // 新创建的联系人ID（用于新增模式下的返回）
  const [createdContactId, setCreatedContactId] = useState<number | null>(null);
  
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
  
  const [showIndustryDialog, setShowIndustryDialog] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  const [showOccupationDialog, setShowOccupationDialog] = useState(false);
  const [selectedOccupation, setSelectedOccupation] = useState("");
  
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState("");
  
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
  const [privateAccountList, setPrivateAccountList] = useState<{bank: string, number: string, name: string}[]>([]);
  const [privateAccountBank, setPrivateAccountBank] = useState("");
  const [privateAccountNumber, setPrivateAccountNumber] = useState("");
  const [privateAccountName, setPrivateAccountName] = useState("");
  
  // 通用字段对话框（用于电话、微信、地址）
  const [showGenericFieldDialog, setShowGenericFieldDialog] = useState(false);
  const [genericFieldName, setGenericFieldName] = useState("");
  const [genericFieldValue, setGenericFieldValue] = useState("");
  
  // 邮箱对话框（支持多个邮箱和格式验证）
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  
  // 微信号对话框（支持多个微信号）
  const [showWechatDialog, setShowWechatDialog] = useState(false);
  const [wechatList, setWechatList] = useState<string[]>([]);
  const [currentWechat, setCurrentWechat] = useState("");
  
  // 用于跟踪是否已初始化字段值
  const [isFieldsInitialized, setIsFieldsInitialized] = useState(false);
  
  // 对话框提示信息（统一管理）
  const [dialogMessage, setDialogMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // 基本信息折叠状态
  const [isBasicInfoCollapsed, setIsBasicInfoCollapsed] = useState(false);
  
  // 扩展字段列表（用于拖拽排序）
  const defaultFieldList = [
    '星座', '生日', '年龄', '血型', '属相', '身高', '鞋码', '民族', 
    '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
    '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务', 
    '税务', '人事', '公户', '私户',
    '电话', '微信', '邮箱', '地址'
  ];
  
  // 从 localStorage加载或使用默认配置
  const [extendedFieldList, setExtendedFieldList] = useState<string[]>(() => {
    const saved = localStorage.getItem('extendedFieldList');
    return saved ? JSON.parse(saved) : defaultFieldList;
  });
  
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
          setDialogMessage({type: "error", text: "扩展信息保存失败"});
        }
      }
      // 记录新创建的联系人ID
      setCreatedContactId(data.id);
      setDialogMessage({type: "success", text: "人脉添加成功"});
      // 保存成功后不跳转，留在当前页面
      // setLocation(`/parent/contacts/${data.id}`);
    },
    onError: (error) => {
      setDialogMessage({type: "error", text: error.message || "添加失败"});
    },
  });
  
  // 更新人脉API
  const updateContactMutation = trpc.contacts.update.useMutation({
    onSuccess: async (data) => {
      setDialogMessage({type: "success", text: "人脉更新成功"});
      // 使缓存失效，强制重新获取数据
      await utils.contacts.get.invalidate({ id: contactId! });
      await utils.contacts.fieldValues.list.invalidate({ contactId: contactId! });
      // 保存成功后不跳转，留在当前页面
      // setLocation(`/parent/contacts/${contactId}`);
    },
    onError: (error) => {
      setDialogMessage({type: "error", text: error.message || "更新失败"});
    },
  });
  
  // 添加扩展信息字段值API
  const addFieldValueMutation = trpc.contacts.fieldValues.add.useMutation({
    onSuccess: async (newFieldValue) => {
      setDialogMessage({type: "success", text: "扩展信息已添加"});
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      setDialogMessage({type: "error", text: error.message || "添加扩展信息失败"});
    },
  });
  
  // 更新扩展信息字段值 API
  const updateFieldValueMutation = trpc.contacts.fieldValues.update.useMutation({
    onSuccess: async () => {
      setDialogMessage({type: "success", text: "扩展信息已更新"});
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      setDialogMessage({type: "error", text: error.message || "更新扩展信息失败"});
    },
  });
  
  // 删除扩展信息字段值 API
  const deleteFieldValueMutation = trpc.contacts.fieldValues.delete.useMutation({
    onSuccess: async () => {
      setDialogMessage({type: "success", text: "扩展信息已删除"});
      // 刷新字段值列表
      if (isEditMode && contactId) {
        // 使缓存失效，强制重新获取数据
        await utils.contacts.fieldValues.list.invalidate({ contactId: contactId });
      }
    },
    onError: (error) => {
      setDialogMessage({type: "error", text: error.message || "删除扩展信息失败"});
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
    
    setDialogMessage({type: "success", text: "扩展信息已添加，请点击保存按钮"});
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
      setDialogMessage({type: "error", text: "请输入内容"});
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
    setDialogMessage({type: "success", text: "修改成功"});
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setEditingFieldIndex(null);
    setEditingFieldValue("");
  };
  
  // 配置拖拽传感器（长按250ms激活）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,  // 长按250ms后才激活拖拽
        tolerance: 8,  // 允许8px的移动误差
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 拖拽开始时触发震动反馈
  const handleDragStart = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };
  
  // 处理字段拖拽结束
  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    setExtendedFieldList((fields) => {
      const oldIndex = fields.findIndex(f => f === active.id);
      const newIndex = fields.findIndex(f => f === over.id);
      
      const newFields = arrayMove(fields, oldIndex, newIndex);
      
      // 保存到localStorage
      localStorage.setItem('extendedFieldList', JSON.stringify(newFields));
      
      return newFields;
    });
    setDialogMessage({type: "success", text: "位置已调整"});
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
      setDialogMessage({type: "success", text: "扩展信息已删除"});
    }
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setDialogMessage({type: "error", text: "请输入姓名"});
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
            onClick={() => {
              // 获取要返回的联系人ID：编辑模式用contactId，新增模式用createdContactId
              const targetId = isEditMode ? contactId : createdContactId;
              
              if (targetId) {
                // 返回到该联系人的详情页
                setLocation(`/parent/contacts/${targetId}`);
              } else {
                // 如果没有ID（还未保存），返回列表页
                setLocation('/parent/contacts');
              }
            }}
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
            
            {/* 扩展字段 - 可拖拽排序 */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="h-5 w-5 text-gray-700" />
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleFieldDragEnd}
              >
                <SortableContext items={extendedFieldList} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-5 gap-1.5">
                    {extendedFieldList
                      .slice()
                      .sort((a, b) => {
                        const aHasValue = extendedFields.some(f => f.categoryName === a);
                        const bHasValue = extendedFields.some(f => f.categoryName === b);
                        // 已填写的排在前面
                        if (aHasValue && !bHasValue) return -1;
                        if (!aHasValue && bHasValue) return 1;
                        // 如果都填写或都未填写，保持原顺序
                        return extendedFieldList.indexOf(a) - extendedFieldList.indexOf(b);
                      })
                      .map(field => {
                        // 检查该字段是否已填写
                        const hasValue = extendedFields.some(f => f.categoryName === field);
                        
                        const handleFieldClick = () => {
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
                              } else if (field === '行业') {
                                const existingValue = extendedFields.find(f => f.categoryName === '行业');
                                if (existingValue) {
                                  setSelectedIndustry(existingValue.value);
                                }
                                setShowIndustryDialog(true);
                              } else if (field === '类型') {
                                const existingValue = extendedFields.find(f => f.categoryName === '类型');
                                if (existingValue) {
                                  setSelectedTypes(existingValue.value.split(','));
                                }
                                setShowTypeDialog(true);
                              } else if (field === '职业') {
                                const existingValue = extendedFields.find(f => f.categoryName === '职业');
                                if (existingValue) {
                                  setSelectedOccupation(existingValue.value);
                                }
                                setShowOccupationDialog(true);
                              } else if (field === '征信') {
                                const existingValue = extendedFields.find(f => f.categoryName === '征信');
                                if (existingValue) {
                                  setSelectedCredit(existingValue.value);
                                }
                                setShowCreditDialog(true);
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
                                if (existingValue?.value) {
                                  // 解析格式：多个银行卡信息，以分号分隔，每个银行卡格式：银行|卡号|名字
                                  const accounts = existingValue.value.split(';').map(account => {
                                    const parts = account.split('|').map(p => p.trim());
                                    return {
                                      bank: parts[0] || '',
                                      number: parts[1] || '',
                                      name: parts[2] || ''
                                    };
                                  }).filter(acc => acc.bank || acc.number || acc.name);
                                  setPrivateAccountList(accounts);
                                } else {
                                  setPrivateAccountList([]);
                                }
                                setPrivateAccountBank('');
                                setPrivateAccountNumber('');
                                setPrivateAccountName('');
                                setShowPrivateAccountDialog(true);
                              } else if (field === '邮箱') {
                                // 邮箱字段使用专门的对话框，支持多个邮箱和格式验证
                                const existingValue = extendedFields.find(f => f.categoryName === '邮箱');
                                if (existingValue?.value) {
                                  setEmailList(existingValue.value.split(',').map(e => e.trim()));
                                } else {
                                  setEmailList([]);
                                }
                                setCurrentEmail('');
                                setShowEmailDialog(true);
                              } else if (field === '微信') {
                                // 微信号使用多选对话框
                                const existingValue = extendedFields.find(f => f.categoryName === '微信');
                                if (existingValue?.value) {
                                  setWechatList(existingValue.value.split(',').map(w => w.trim()));
                                } else {
                                  setWechatList([]);
                                }
                                setCurrentWechat('');
                                setShowWechatDialog(true);
                              } else if (field === '电话' || field === '地址') {
                                // 对于电话、地址，使用通用的文本输入对话框
                                const existingValue = extendedFields.find(f => f.categoryName === field);
                                setGenericFieldName(field);
                                setGenericFieldValue(existingValue?.value || '');
                                setShowGenericFieldDialog(true);
                          }
                        };
                        
                        return (
                          <SortableFieldButton
                            key={field}
                            field={field}
                            hasValue={hasValue}
                            onClick={handleFieldClick}
                          />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
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
                    setDialogMessage({type: "success", text: `已选择星座：${selectedConstellation}`});
                    setShowConstellationDialog(false);
                    // 不清空选择状态，下次打开时显示当前值
                  } else {
                    setDialogMessage({type: "error", text: "请选择一个星座"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
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
                    // 保存生日
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '生日');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '生日',
                        value: selectedBirthday,
                      }];
                    });
                    
                    // 根据生日计算属相
                    const birthYear = new Date(selectedBirthday).getFullYear();
                    const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
                    const zodiacIndex = (birthYear - 1900) % 12;
                    const zodiacAnimal = zodiacAnimals[zodiacIndex];
                    
                    // 自动更新属相
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '属相');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '属相',
                        value: zodiacAnimal,
                      }];
                    });
                    
                    setDialogMessage({type: "success", text: `已选择生日：${selectedBirthday}，属相：${zodiacAnimal}`});
                    setShowBirthdayDialog(false);
                  } else {
                    setDialogMessage({type: "error", text: "请选择生日"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
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
                    setDialogMessage({type: "success", text: `已选择血型：${selectedBloodType}`});
                    setShowBloodTypeDialog(false);
                  } else {
                    setDialogMessage({type: "error", text: "请选择血型"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
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
                    // 检查是否有生日信息
                    const birthdayField = extendedFields.find(f => f.categoryName === '生日');
                    if (birthdayField?.value) {
                      // 根据生日计算应该的属相
                      const birthYear = new Date(birthdayField.value).getFullYear();
                      const zodiacAnimals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
                      const zodiacIndex = (birthYear - 1900) % 12;
                      const correctZodiac = zodiacAnimals[zodiacIndex];
                      
                      // 验证是否匹配
                      if (selectedZodiac !== correctZodiac) {
                        setDialogMessage({type: "error", text: `属相与生日不匹配！根据生日${birthdayField.value}，属相应为「${correctZodiac}」`});
                        return;
                      }
                    }
                    
                    // 验证通过，保存属相
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '属相');
                      return [...filtered, {
                        categoryId: 0,
                        categoryName: '属相',
                        value: selectedZodiac,
                      }];
                    });
                    setDialogMessage({type: "success", text: `已选择属相：${selectedZodiac}`});
                    setShowZodiacDialog(false);
                  } else {
                    setDialogMessage({type: "error", text: "请选择属相"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
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
                    
                    setDialogMessage({type: "success", text: `已设置年龄：${age}岁，属相：${zodiacAnimal}`});
                    setShowAgeDialog(false);
                  } else {
                    setDialogMessage({type: "error", text: "请输入有效的年份"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '身高');
                setSelectedHeight(existingValue?.value || "");
                setDialogMessage(null);
                setShowHeightDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHeight) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '身高');
                    return [...filtered, { categoryId: 0, categoryName: '身高', value: selectedHeight }];
                  });
                  setDialogMessage({type: "success", text: `已选择身高：${selectedHeight}`});
                  setShowHeightDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请选择身高"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '鞋码');
                setSelectedShoeSize(existingValue?.value || "");
                setDialogMessage(null);
                setShowShoeSizeDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedShoeSize) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '鞋码');
                    return [...filtered, { categoryId: 0, categoryName: '鞋码', value: selectedShoeSize }];
                  });
                  setDialogMessage({type: "success", text: `已选择鞋码：${selectedShoeSize}`});
                  setShowShoeSizeDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请选择鞋码"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '饮食');
                setSelectedDietaries(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowDietaryDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedDietaries.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '饮食');
                    return [...filtered, { categoryId: 0, categoryName: '饮食', value: selectedDietaries.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择饮食：${selectedDietaries.join('、')}`});
                  setShowDietaryDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '习惯');
                setSelectedHabits(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowHabitDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHabits.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '习惯');
                    return [...filtered, { categoryId: 0, categoryName: '习惯', value: selectedHabits.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择习惯：${selectedHabits.join('、')}`});
                  setShowHabitDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一个习惯"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '健康');
                setSelectedHealths(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowHealthDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHealths.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '健康');
                    return [...filtered, { categoryId: 0, categoryName: '健康', value: selectedHealths.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择健康状况：${selectedHealths.join('、')}`});
                  setShowHealthDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '性格');
                setSelectedPersonalities(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowPersonalityDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPersonalities.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '性格');
                    return [...filtered, { categoryId: 0, categoryName: '性格', value: selectedPersonalities.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择性格：${selectedPersonalities.join('、')}`});
                  setShowPersonalityDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一个性格"});
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
              {['汉族', '壮族', '满族', '回族', '苗族', '维吾尔族', '土家族', '彝族', '蒙古族', '藏族', '布依族', '侗族', '白族', '朝鲜族', '哈尼族', '哈萨克族', '黎族', '傣族', '瑶族', '畲族', '佤僳族', '佤伬族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族', '达斐尔族', '仫佬族', '仁族', '撒拉族', '布朗族', '毛南族', '塔吉克族', '普米族', '阿昌族', '怒族', '鄂温克族', '京族', '基诺族', '德昂族', '保安族', '俄罗斯族', '裕固族', '乌兹别克族', '门巴族', '鄂伦春族', '独龙族', '塔塔尔族', '赫哲族', '高山族', '珞巴族', '羌族', '仑佬族', '怀族'].map(ethnic => (
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '民族');
                setSelectedEthnic(existingValue?.value || "");
                setDialogMessage(null);
                setShowEthnicDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEthnic) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '民族');
                    return [...filtered, { categoryId: 0, categoryName: '民族', value: selectedEthnic }];
                  });
                  setDialogMessage({type: "success", text: `已选择民族：${selectedEthnic}`});
                  setShowEthnicDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请选择民族"});
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '品牌');
                setSelectedBrands(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowBrandDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedBrands.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '品牌');
                    return [...filtered, { categoryId: 0, categoryName: '品牌', value: selectedBrands.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择品牌：${selectedBrands.join('、')}`});
                  setShowBrandDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一个品牌"});
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
              {['电影', '音乐', '运动', '旅游', '游戏', '阅读', 'KTV', '剧本杀', '密室逃脱', '摄影', '书法', '绘画', '舞蹈', '瑜伽', '健身', '钓鱼', '登山', '游泳', '上网', '攀岩', '乐器', '睡觉'].map(entertainment => (
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
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '娱乐');
                setSelectedEntertainments(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowEntertainmentDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEntertainments.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '娱乐');
                    return [...filtered, { categoryId: 0, categoryName: '娱乐', value: selectedEntertainments.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择娱乐：${selectedEntertainments.join('、')}`});
                  setShowEntertainmentDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
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
                setDialogMessage(null);
                setShowCompanyDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedCompany.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '公司');
                    return [...filtered, { categoryId: 0, categoryName: '公司', value: selectedCompany }];
                  });
                  setDialogMessage({type: "success", text: `已设置公司：${selectedCompany}`});
                  setShowCompanyDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入公司名称"});
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
                setDialogMessage(null);
                setShowFinanceDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedFinance.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '财务');
                    return [...filtered, { categoryId: 0, categoryName: '财务', value: selectedFinance }];
                  });
                  setDialogMessage({type: "success", text: `已设置财务：${selectedFinance}`});
                  setShowFinanceDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入财务信息"});
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
                setDialogMessage(null);
                setShowLegalDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedLegal.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '法务');
                    return [...filtered, { categoryId: 0, categoryName: '法务', value: selectedLegal }];
                  });
                  setDialogMessage({type: "success", text: `已设置法务：${selectedLegal}`});
                  setShowLegalDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入法务信息"});
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
                setDialogMessage(null);
                setShowLaborDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedLabor.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '劳务');
                    return [...filtered, { categoryId: 0, categoryName: '劳务', value: selectedLabor }];
                  });
                  setDialogMessage({type: "success", text: `已设置劳务：${selectedLabor}`});
                  setShowLaborDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入劳务信息"});
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
                setDialogMessage(null);
                setShowTaxDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedTax.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '税务');
                    return [...filtered, { categoryId: 0, categoryName: '税务', value: selectedTax }];
                  });
                  setDialogMessage({type: "success", text: `已设置税务：${selectedTax}`});
                  setShowTaxDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入税务信息"});
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
                setDialogMessage(null);
                setShowHRDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHR.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '人事');
                    return [...filtered, { categoryId: 0, categoryName: '人事', value: selectedHR }];
                  });
                  setDialogMessage({type: "success", text: `已设置人事：${selectedHR}`});
                  setShowHRDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入人事信息"});
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
                setDialogMessage(null);
                setShowPublicAccountDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPublicAccount.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '公户');
                    return [...filtered, { categoryId: 0, categoryName: '公户', value: selectedPublicAccount }];
                  });
                  setDialogMessage({type: "success", text: `已设置公户：${selectedPublicAccount}`});
                  setShowPublicAccountDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入公户信息"});
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
            
            {/* 已添加的银行卡列表 */}
            {privateAccountList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">已添加的银行卡：</p>
                <div className="space-y-2">
                  {privateAccountList.map((account, index) => (
                    <div key={index} className="flex items-start gap-2 bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{account.bank}</div>
                        <div className="text-xs text-gray-600 mt-1">卡号：{account.number}</div>
                        <div className="text-xs text-gray-600">户名：{account.name}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // 将选中的银行卡信息填入输入框
                            setPrivateAccountBank(account.bank);
                            setPrivateAccountNumber(account.number);
                            setPrivateAccountName(account.name);
                            // 从列表中移除，等待用户修改后再添加
                            setPrivateAccountList(prev => prev.filter((_, i) => i !== index));
                            setDialogMessage({type: "success", text: "已加载到编辑框，修改后点击确定"});
                          }}
                          className="text-blue-500 hover:text-blue-700 mt-1"
                          title="编辑"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPrivateAccountList(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-500 hover:text-red-700 mt-1"
                          title="删除"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 添加新银行卡 */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">{privateAccountList.length > 0 ? '添加新银行卡：' : '银行卡信息：'}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">银行</label>
                  <Input 
                    value={privateAccountBank} 
                    onChange={(e) => setPrivateAccountBank(e.target.value)} 
                    placeholder="请输入银行名称" 
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">卡号</label>
                  <Input 
                    value={privateAccountNumber} 
                    onChange={(e) => setPrivateAccountNumber(e.target.value)} 
                    placeholder="请输入银行卡号" 
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">户名</label>
                  <Input 
                    value={privateAccountName} 
                    onChange={(e) => setPrivateAccountName(e.target.value)} 
                    placeholder="请输入户名" 
                  />
                </div>
              </div>
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowPrivateAccountDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                // 检查当前输入框是否有内容
                const hasCurrentInput = privateAccountBank.trim() || privateAccountNumber.trim() || privateAccountName.trim();
                
                if (hasCurrentInput) {
                  // 如果输入框有内容，必须填写完整
                  if (!privateAccountBank.trim() || !privateAccountNumber.trim() || !privateAccountName.trim()) {
                    setDialogMessage({type: "error", text: "请填写完整的银行卡信息"});
                    return;
                  }
                  // 将当前输入框的内容添加到列表
                  const newAccount = {
                    bank: privateAccountBank.trim(),
                    number: privateAccountNumber.trim(),
                    name: privateAccountName.trim()
                  };
                  const allAccounts = [...privateAccountList, newAccount];
                  
                  // 保存所有银行卡
                  const value = allAccounts.map(acc => 
                    `${acc.bank} | ${acc.number} | ${acc.name}`
                  ).join('; ');
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '私户');
                    return [...filtered, { categoryId: 0, categoryName: '私户', value }];
                  });
                  setDialogMessage({type: "success", text: `已添加${allAccounts.length}个银行卡`});
                  setTimeout(() => {
                    setDialogMessage(null);
                    setShowPrivateAccountDialog(false);
                  }, 1000);
                } else {
                  // 如果输入框没有内容，检查是否有已添加的银行卡
                  if (privateAccountList.length === 0) {
                    setDialogMessage({type: "error", text: "请至少添加一个银行卡"});
                    return;
                  }
                  // 保存已有的银行卡
                  const value = privateAccountList.map(acc => 
                    `${acc.bank} | ${acc.number} | ${acc.name}`
                  ).join('; ');
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '私户');
                    return [...filtered, { categoryId: 0, categoryName: '私户', value }];
                  });
                  setDialogMessage({type: "success", text: `已添加${privateAccountList.length}个银行卡`});
                  setTimeout(() => {
                    setDialogMessage(null);
                    setShowPrivateAccountDialog(false);
                  }, 1000);
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 通用字段对话框（电话、微信、邮箱、地址） */}
      {showGenericFieldDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGenericFieldDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{genericFieldName}</h3>
            <Input 
              value={genericFieldValue} 
              onChange={(e) => setGenericFieldValue(e.target.value)} 
              placeholder={`请输入${genericFieldName}`} 
              className="mb-4" 
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setGenericFieldValue("");
                setDialogMessage(null);
                setShowGenericFieldDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (genericFieldValue.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== genericFieldName);
                    return [...filtered, { categoryId: 0, categoryName: genericFieldName, value: genericFieldValue }];
                  });
                  setDialogMessage({type: "success", text: `已设置${genericFieldName}：${genericFieldValue}`});
                  setShowGenericFieldDialog(false);
                } else {
                  setDialogMessage({type: "error", text: `请输入${genericFieldName}`});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 邮箱对话框（支持多个邮箱和格式验证） */}
      {showEmailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEmailDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">邮箱</h3>
            
            {/* 已有邮箱列表 */}
            {emailList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">已添加的邮箱：</p>
                <div className="space-y-2">
                  {emailList.map((email, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                      <span className="flex-1 text-sm">{email}</span>
                      <button
                        onClick={() => setEmailList(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 添加新邮箱 */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">添加新邮箱：</p>
              <Input 
                type="email"
                value={currentEmail} 
                onChange={(e) => setCurrentEmail(e.target.value)} 
                placeholder="请输入邮箱地址（如：example@email.com）" 
                className="mb-2" 
              />
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!currentEmail.trim()) {
                    setDialogMessage({type: "error", text: '请输入邮箱地址'});
                    return;
                  }
                  if (!emailRegex.test(currentEmail.trim())) {
                    setDialogMessage({type: "error", text: '邮箱格式不正确，请输入有效的邮箱地址'});
                    return;
                  }
                  if (emailList.includes(currentEmail.trim())) {
                    setDialogMessage({type: "error", text: '该邮箱已存在'});
                    return;
                  }
                  setEmailList(prev => [...prev, currentEmail.trim()]);
                  setCurrentEmail('');
                  setDialogMessage({type: "success", text: '邮箱已添加'});
                }}
              >
                + 添加邮箱
              </Button>
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowEmailDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (emailList.length === 0) {
                  setDialogMessage({type: "error", text: '请至少添加一个邮箱'});
                  return;
                }
                setExtendedFields(prev => {
                  const filtered = prev.filter(f => f.categoryName !== '邮箱');
                  return [...filtered, { categoryId: 0, categoryName: '邮箱', value: emailList.join(', ') }];
                });
                setDialogMessage({type: "success", text: `已设置邮箱：${emailList.join(', ')}`});
                setTimeout(() => {
                  setDialogMessage(null);
                  setShowEmailDialog(false);
                }, 1000);
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 微信号对话框（支持多个微信号） */}
      {showWechatDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowWechatDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">微信号</h3>
            
            {/* 已有微信号列表 */}
            {wechatList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">已添加的微信号：</p>
                <div className="space-y-2">
                  {wechatList.map((wechat, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                      <span className="flex-1 text-sm">{wechat}</span>
                      <button
                        onClick={() => setWechatList(prev => prev.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 添加新微信号 */}
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">添加新微信号：</p>
              <Input 
                value={currentWechat} 
                onChange={(e) => setCurrentWechat(e.target.value)} 
                placeholder="请输入微信号" 
                className="mb-2" 
              />
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  if (!currentWechat.trim()) {
                    setDialogMessage({type: "error", text: '请输入微信号'});
                    return;
                  }
                  if (wechatList.includes(currentWechat.trim())) {
                    setDialogMessage({type: "error", text: '该微信号已存在'});
                    return;
                  }
                  setWechatList(prev => [...prev, currentWechat.trim()]);
                  setCurrentWechat('');
                  setDialogMessage({type: "success", text: '微信号已添加'});
                }}
              >
                + 添加微信号
              </Button>
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowWechatDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (wechatList.length === 0) {
                  setDialogMessage({type: "error", text: '请至少添加一个微信号'});
                  return;
                }
                setExtendedFields(prev => {
                  const filtered = prev.filter(f => f.categoryName !== '微信');
                  return [...filtered, { categoryId: 0, categoryName: '微信', value: wechatList.join(', ') }];
                });
                setDialogMessage({type: "success", text: `已设置微信号：${wechatList.join(', ')}`});
                setShowWechatDialog(false);
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 行业对话框 */}
      {showIndustryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowIndustryDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">行业</h3>
            <Input value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} placeholder="请输入行业" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '行业');
                setSelectedIndustry(existingValue?.value || "");
                setDialogMessage(null);
                setShowIndustryDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedIndustry.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '行业');
                    return [...filtered, { categoryId: 0, categoryName: '行业', value: selectedIndustry }];
                  });
                  setDialogMessage({type: "success", text: `已设置行业：${selectedIndustry}`});
                  setShowIndustryDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入行业"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 类型对话框（多选） */}
      {showTypeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTypeDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择类型（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['出口', '进口', '制造', '研发', '中介', '渠道', '销售', '代理'].map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedTypes(prev => 
                      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedTypes.includes(type)
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '类型');
                setSelectedTypes(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowTypeDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedTypes.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '类型');
                    return [...filtered, { categoryId: 0, categoryName: '类型', value: selectedTypes.join(',') }];
                  });
                  setDialogMessage({type: "success", text: `已选择类型：${selectedTypes.join('、')}`});
                  setShowTypeDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一种类型"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 职业对话框 */}
      {showOccupationDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOccupationDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">职业</h3>
            <Input value={selectedOccupation} onChange={(e) => setSelectedOccupation(e.target.value)} placeholder="请输入职业" className="mb-4" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '职业');
                setSelectedOccupation(existingValue?.value || "");
                setDialogMessage(null);
                setShowOccupationDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedOccupation.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '职业');
                    return [...filtered, { categoryId: 0, categoryName: '职业', value: selectedOccupation }];
                  });
                  setDialogMessage({type: "success", text: `已设置职业：${selectedOccupation}`});
                  setShowOccupationDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请输入职业"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 征信对话框 */}
      {showCreditDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreditDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">征信 - 芝麻信用</h3>
            
            {(() => {
              const existingValue = extendedFields.find(f => f.categoryName === '征信');
              const hasValue = existingValue?.value;
              let score = '';
              let timestamp = '';
              
              if (hasValue) {
                // 解析格式：分数 | 时间
                const parts = hasValue.split('|').map(p => p.trim());
                score = parts[0] || '';
                timestamp = parts[1] || '';
              }
              
              return (
                <>
                  {hasValue ? (
                    <div className="mb-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600 mb-2">{score}</div>
                        <div className="text-sm text-gray-500">输入时间：{timestamp}</div>
                        <div className="text-xs text-orange-600 mt-2">⚠️ 芝麻信用分只能输入一次，不可修改</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <label className="text-sm text-gray-600 mb-2 block">芝麻信用分</label>
                      <Input 
                        type="number"
                        value={selectedCredit} 
                        onChange={(e) => setSelectedCredit(e.target.value)} 
                        placeholder="请输入芝麻信用分（350-950）" 
                        min="350"
                        max="950"
                      />
                      <div className="text-xs text-gray-500 mt-1">⚠️ 注意：只能输入一次，输入后不可修改</div>
                    </div>
                  )}
                  
                  {/* 提示信息 */}
                  {dialogMessage && (
                    <div className={`mb-3 p-3 rounded-lg text-sm ${
                      dialogMessage.type === 'error' 
                        ? 'bg-red-50 text-red-700 border border-red-200' 
                        : 'bg-green-50 text-green-700 border border-green-200'
                    }`}>
                      {dialogMessage.text}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { 
                      setSelectedCredit('');
                      setDialogMessage(null);
                      setShowCreditDialog(false);
                    }}>取消</Button>
                    
                    {!hasValue && (
                      <Button className="flex-1" onClick={() => {
                        const creditScore = parseInt(selectedCredit.trim());
                        if (!selectedCredit.trim()) {
                          setDialogMessage({type: "error", text: "请输入芝麻信用分"});
                          return;
                        }
                        if (isNaN(creditScore) || creditScore < 350 || creditScore > 950) {
                          setDialogMessage({type: "error", text: "芝麻信用分范围为350-950"});
                          return;
                        }
                        
                        // 记录当前时间
                        const now = new Date();
                        const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                        const value = `${creditScore} | ${timeStr}`;
                        
                        setExtendedFields(prev => {
                          const filtered = prev.filter(f => f.categoryName !== '征信');
                          return [...filtered, { categoryId: 0, categoryName: '征信', value }];
                        });
                        setDialogMessage({type: "success", text: `已设置芝麻信用分：${creditScore}`});
                        setTimeout(() => {
                          setDialogMessage(null);
                          setShowCreditDialog(false);
                        }, 1000);
                      }}>确定</Button>
                    )}
                    
                    {hasValue && (
                      <Button className="flex-1" onClick={() => {
                        setDialogMessage(null);
                        setShowCreditDialog(false);
                      }}>关闭</Button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
