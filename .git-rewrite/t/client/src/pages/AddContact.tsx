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
import { ArrowLeft, Trash2, Plus, ChevronDown, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { FieldCategorySelector } from "@/components/FieldCategorySelector";
import { MultiItemFieldV2, MultiAddressFieldV2, MultiBankFieldV2, MultiInvoiceFieldV2 } from "@/components/MultiItemFieldV2";
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
  _deleted?: boolean; // 标记为待删除
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
          ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium' 
          : 'border-gray-300 hover:bg-[#FAF3ED]'
      }`}
    >
      {field}
    </button>
  );
}

// 多条目字段组件（用于手机、邮箱、公司名称、开票信息等简单字段）
function MultiItemField({
  label,
  placeholder,
  categoryName,
  extendedFields,
  setExtendedFields,
  getCategoryId,
  multiline = false
}: {
  label: string;
  placeholder: string;
  categoryName: string;
  extendedFields: ExtendedFieldValue[];
  setExtendedFields: React.Dispatch<React.SetStateAction<ExtendedFieldValue[]>>;
  getCategoryId: (name: string) => number;
  multiline?: boolean;
}) {
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // 获取当前类别的所有值（JSON数组格式存储）
  const getItems = (): string[] => {
    const field = extendedFields.find(f => f.categoryName === categoryName);
    if (!field) return [];
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : [field.value];
    } catch {
      return field.value ? [field.value] : [];
    }
  };
  
  const items = getItems();
  
  // 获取当前字段的完整信息（包括id）
  const getCurrentField = () => extendedFields.find(f => f.categoryName === categoryName);
  
  // 添加新条目或保存编辑
  const handleAdd = () => {
    if (!newValue.trim()) return;
    const trimmedValue = newValue.trim();
    
    setExtendedFields(prev => {
      // 在回调中获取当前字段，确保获取最新的状态
      const currentField = prev.find(f => f.categoryName === categoryName);
      
      // 获取当前类别的所有值
      let currentItems: string[] = [];
      if (currentField) {
        try {
          const parsed = JSON.parse(currentField.value);
          currentItems = Array.isArray(parsed) ? parsed : [currentField.value];
        } catch {
          currentItems = currentField.value ? [currentField.value] : [];
        }
      }
      
      let newItems: string[];
      if (editingIndex !== null) {
        // 编辑模式：更新指定索引的条目
        newItems = [...currentItems];
        newItems[editingIndex] = trimmedValue;
      } else {
        // 添加模式：添加新条目
        newItems = [...currentItems, trimmedValue];
      }
      
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      const newField = { 
        id: currentField?.id, 
        categoryId: currentField?.categoryId || getCategoryId(categoryName), 
        categoryName, 
        value: JSON.stringify(newItems) 
      };
      console.log('[MultiItemField] handleAdd - currentField:', currentField, 'newField:', newField);
      return [...filtered, newField];
    });
    
    if (editingIndex !== null) {
      setEditingIndex(null);
    }
    setNewValue('');
  };
  
  // 编辑条目
  const handleEdit = (index: number) => {
    setNewValue(items[index]);
    setEditingIndex(index);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewValue('');
    setEditingIndex(null);
  };
  
  // 删除条目
  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    const currentField = getCurrentField();
    setExtendedFields(prev => {
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      if (newItems.length > 0) {
        return [...filtered, { 
          id: currentField?.id, 
          categoryId: getCategoryId(categoryName), 
          categoryName, 
          value: JSON.stringify(newItems) 
        }];
      }
      return filtered;
    });
    // 如果删除的是正在编辑的条目，取消编辑状态
    if (editingIndex === index) {
      setNewValue('');
      setEditingIndex(null);
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的条目列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`flex items-center gap-2 p-2 rounded-md border ${editingIndex === index ? 'bg-[#F5F5F5] border-blue-300' : 'bg-[#FAF3ED] border-transparent'}`}>
              <span className="flex-1 text-sm">{item}</span>
              <button
                type="button"
                onClick={() => handleEdit(index)}
                className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded"
                title="编辑"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="p-1 text-[#D32F2F] hover:bg-[#D32F2F]-light rounded"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 添加/编辑输入区 */}
      <div className="flex gap-2">
        {multiline ? (
          <textarea
            className="flex-1 min-h-[60px] px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder={editingIndex !== null ? '编辑中...' : placeholder}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
        ) : (
          <Input
            className="flex-1"
            placeholder={editingIndex !== null ? '编辑中...' : placeholder}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          />
        )}
        {editingIndex !== null ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">
              保存
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
              取消
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// 多地址字段组件（用于快递地址，每个包含收件人、电话、地址）
function MultiAddressField({
  label,
  categoryName,
  extendedFields,
  setExtendedFields,
  getCategoryId
}: {
  label: string;
  categoryName: string;
  extendedFields: ExtendedFieldValue[];
  setExtendedFields: React.Dispatch<React.SetStateAction<ExtendedFieldValue[]>>;
  getCategoryId: (name: string) => number;
}) {
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // 获取当前类别的所有地址
  const getItems = (): {name: string, phone: string, address: string}[] => {
    const field = extendedFields.find(f => f.categoryName === categoryName);
    if (!field) return [];
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  };
  
  const items = getItems();
  
  // 获取当前字段的完整信息（包括id）
  const getCurrentField = () => extendedFields.find(f => f.categoryName === categoryName);
  
  // 添加新地址或保存编辑
  const handleAdd = () => {
    if (!newName.trim() && !newPhone.trim() && !newAddress.trim()) return;
    const newItem = { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() };
    
    setExtendedFields(prev => {
      // 在回调中获取当前字段，确保获取最新的状态
      const currentField = prev.find(f => f.categoryName === categoryName);
      
      // 获取当前类别的所有地址
      let currentItems: {name: string, phone: string, address: string}[] = [];
      if (currentField) {
        try {
          const parsed = JSON.parse(currentField.value);
          currentItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          currentItems = [];
        }
      }
      
      let newItems: {name: string, phone: string, address: string}[];
      if (editingIndex !== null) {
        // 编辑模式：更新指定索引的条目
        newItems = [...currentItems];
        newItems[editingIndex] = newItem;
      } else {
        // 添加模式：添加新条目
        newItems = [...currentItems, newItem];
      }
      
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      const newField = { 
        id: currentField?.id,
        categoryId: currentField?.categoryId || getCategoryId(categoryName), 
        categoryName, 
        value: JSON.stringify(newItems) 
      };
      console.log('[MultiAddressField] handleAdd - currentField:', currentField, 'newField:', newField);
      return [...filtered, newField];
    });
    
    if (editingIndex !== null) {
      setEditingIndex(null);
    }
    setNewName('');
    setNewPhone('');
    setNewAddress('');
  };
  
  // 编辑地址
  const handleEdit = (index: number) => {
    const item = items[index];
    setNewName(item.name);
    setNewPhone(item.phone);
    setNewAddress(item.address);
    setEditingIndex(index);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setEditingIndex(null);
  };
  
  // 删除地址
  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    const currentField = getCurrentField();
    setExtendedFields(prev => {
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      if (newItems.length > 0) {
        return [...filtered, { 
          id: currentField?.id,
          categoryId: getCategoryId(categoryName), 
          categoryName, 
          value: JSON.stringify(newItems) 
        }];
      }
      return filtered;
    });
    // 如果删除的是正在编辑的条目，取消编辑状态
    if (editingIndex === index) {
      handleCancelEdit();
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的地址列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`p-3 rounded-md border ${editingIndex === index ? 'bg-[#F5F5F5] border-blue-300' : 'bg-[#FAF3ED] border-transparent'}`}>
              <div className="flex justify-between items-start">
                <div className="space-y-1 text-sm flex-1">
                  <div><span className="text-gray-500">收件人：</span>{item.name}</div>
                  <div><span className="text-gray-500">电话：</span>{item.phone}</div>
                  <div><span className="text-gray-500">地址：</span>{item.address}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(index)}
                    className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded"
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    className="p-1 text-[#D32F2F] hover:bg-[#D32F2F]-light rounded"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 添加/编辑输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="收件人" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input className="flex-1" placeholder="收件电话" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="详细地址" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          {editingIndex !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">
                保存
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                取消
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 多银行账号字段组件（每个包含账户名、开户行、账号）
function MultiBankField({
  label,
  categoryName,
  extendedFields,
  setExtendedFields,
  getCategoryId
}: {
  label: string;
  categoryName: string;
  extendedFields: ExtendedFieldValue[];
  setExtendedFields: React.Dispatch<React.SetStateAction<ExtendedFieldValue[]>>;
  getCategoryId: (name: string) => number;
}) {
  const [newAccountName, setNewAccountName] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // 获取当前类别的所有银行账号
  const getItems = (): {accountName: string, bankName: string, accountNumber: string}[] => {
    const field = extendedFields.find(f => f.categoryName === categoryName);
    if (!field) return [];
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  };
  
  const items = getItems();
  
  // 获取当前字段的完整信息（包括id）
  const getCurrentField = () => extendedFields.find(f => f.categoryName === categoryName);
  
  // 添加新银行账号或保存编辑
  const handleAdd = () => {
    if (!newAccountName.trim() && !newBankName.trim() && !newAccountNumber.trim()) return;
    const newItem = { accountName: newAccountName.trim(), bankName: newBankName.trim(), accountNumber: newAccountNumber.trim() };
    
    setExtendedFields(prev => {
      // 在回调中获取当前字段，确保获取最新的状态
      const currentField = prev.find(f => f.categoryName === categoryName);
      
      // 获取当前类别的所有银行账号
      let currentItems: {accountName: string, bankName: string, accountNumber: string}[] = [];
      if (currentField) {
        try {
          const parsed = JSON.parse(currentField.value);
          currentItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          currentItems = [];
        }
      }
      
      let newItems: {accountName: string, bankName: string, accountNumber: string}[];
      if (editingIndex !== null) {
        // 编辑模式：更新指定索引的条目
        newItems = [...currentItems];
        newItems[editingIndex] = newItem;
      } else {
        // 添加模式：添加新条目
        newItems = [...currentItems, newItem];
      }
      
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      const newField = { 
        id: currentField?.id,
        categoryId: currentField?.categoryId || getCategoryId(categoryName), 
        categoryName, 
        value: JSON.stringify(newItems) 
      };
      console.log('[MultiBankField] handleAdd - currentField:', currentField, 'newField:', newField);
      return [...filtered, newField];
    });
    
    if (editingIndex !== null) {
      setEditingIndex(null);
    }
    setNewAccountName('');
    setNewBankName('');
    setNewAccountNumber('');
  };
  
  // 编辑银行账号
  const handleEdit = (index: number) => {
    const item = items[index];
    setNewAccountName(item.accountName);
    setNewBankName(item.bankName);
    setNewAccountNumber(item.accountNumber);
    setEditingIndex(index);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewAccountName('');
    setNewBankName('');
    setNewAccountNumber('');
    setEditingIndex(null);
  };
  
  // 删除银行账号
  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    const currentField = getCurrentField();
    setExtendedFields(prev => {
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      if (newItems.length > 0) {
        return [...filtered, { 
          id: currentField?.id,
          categoryId: getCategoryId(categoryName), 
          categoryName, 
          value: JSON.stringify(newItems) 
        }];
      }
      return filtered;
    });
    // 如果删除的是正在编辑的条目，取消编辑状态
    if (editingIndex === index) {
      handleCancelEdit();
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的银行账号列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`p-3 rounded-md border ${editingIndex === index ? 'bg-[#F5F5F5] border-blue-300' : 'bg-[#FAF3ED] border-transparent'}`}>
              <div className="flex justify-between items-start">
                <div className="space-y-1 text-sm flex-1">
                  <div><span className="text-gray-500">账户名：</span>{item.accountName}</div>
                  <div><span className="text-gray-500">开户行：</span>{item.bankName}</div>
                  <div><span className="text-gray-500">账号：</span>{item.accountNumber}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(index)}
                    className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded"
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    className="p-1 text-[#D32F2F] hover:bg-[#D32F2F]-light rounded"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 添加/编辑输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="账户名" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
          <Input className="flex-1" placeholder="开户行" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="银行账号" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} />
          {editingIndex !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">
                保存
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                取消
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 多开票信息字段组件（每个包含公司名称、税号）
function MultiInvoiceField({
  label,
  categoryName,
  extendedFields,
  setExtendedFields,
  getCategoryId
}: {
  label: string;
  categoryName: string;
  extendedFields: ExtendedFieldValue[];
  setExtendedFields: React.Dispatch<React.SetStateAction<ExtendedFieldValue[]>>;
  getCategoryId: (name: string) => number;
}) {
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newTaxNumber, setNewTaxNumber] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // 获取当前类别的所有开票信息
  const getItems = (): {companyName: string, taxNumber: string}[] => {
    const field = extendedFields.find(f => f.categoryName === categoryName);
    if (!field) return [];
    try {
      const parsed = JSON.parse(field.value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // 兼容旧格式：如果是字符串，尝试解析为公司名称
      return field.value ? [{ companyName: field.value, taxNumber: '' }] : [];
    }
  };
  
  const items = getItems();
  
  // 获取当前字段的完整信息（包括id）
  const getCurrentField = () => extendedFields.find(f => f.categoryName === categoryName);
  
  // 添加新开票信息或保存编辑
  const handleAdd = () => {
    if (!newCompanyName.trim() && !newTaxNumber.trim()) return;
    const newItem = { companyName: newCompanyName.trim(), taxNumber: newTaxNumber.trim() };
    
    setExtendedFields(prev => {
      // 在回调中获取当前字段，确保获取最新的状态
      const currentField = prev.find(f => f.categoryName === categoryName);
      
      // 获取当前类别的所有开票信息
      let currentItems: {companyName: string, taxNumber: string}[] = [];
      if (currentField) {
        try {
          const parsed = JSON.parse(currentField.value);
          currentItems = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // 兼容旧格式
          currentItems = currentField.value ? [{ companyName: currentField.value, taxNumber: '' }] : [];
        }
      }
      
      let newItems: {companyName: string, taxNumber: string}[];
      if (editingIndex !== null) {
        // 编辑模式：更新指定索引的条目
        newItems = [...currentItems];
        newItems[editingIndex] = newItem;
      } else {
        // 添加模式：添加新条目
        newItems = [...currentItems, newItem];
      }
      
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      const newField = { 
        id: currentField?.id,
        categoryId: currentField?.categoryId || getCategoryId(categoryName), 
        categoryName, 
        value: JSON.stringify(newItems) 
      };
      console.log('[MultiInvoiceField] handleAdd - currentField:', currentField, 'newField:', newField);
      return [...filtered, newField];
    });
    
    if (editingIndex !== null) {
      setEditingIndex(null);
    }
    setNewCompanyName('');
    setNewTaxNumber('');
  };
  
  // 编辑开票信息
  const handleEdit = (index: number) => {
    const item = items[index];
    setNewCompanyName(item.companyName);
    setNewTaxNumber(item.taxNumber);
    setEditingIndex(index);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewCompanyName('');
    setNewTaxNumber('');
    setEditingIndex(null);
  };
  
  // 删除开票信息
  const handleDelete = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    const currentField = getCurrentField();
    setExtendedFields(prev => {
      const filtered = prev.filter(f => f.categoryName !== categoryName);
      if (newItems.length > 0) {
        return [...filtered, { 
          id: currentField?.id,
          categoryId: getCategoryId(categoryName), 
          categoryName, 
          value: JSON.stringify(newItems) 
        }];
      }
      return filtered;
    });
    // 如果删除的是正在编辑的条目，取消编辑状态
    if (editingIndex === index) {
      handleCancelEdit();
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的开票信息列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`p-3 rounded-md border ${editingIndex === index ? 'bg-[#F5F5F5] border-blue-300' : 'bg-[#FAF3ED] border-transparent'}`}>
              <div className="flex justify-between items-start">
                <div className="space-y-1 text-sm flex-1">
                  <div><span className="text-gray-500">公司名称：</span>{item.companyName}</div>
                  <div><span className="text-gray-500">税号：</span>{item.taxNumber}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(index)}
                    className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded"
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    className="p-1 text-[#D32F2F] hover:bg-[#D32F2F]-light rounded"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 添加/编辑输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <Input className="w-full" placeholder="公司名称" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} />
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="税号" value={newTaxNumber} onChange={(e) => setNewTaxNumber(e.target.value)} />
          {editingIndex !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">
                保存
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                取消
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AddContact() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  // 使用useMemo缓存URL参数，避免每次渲染都重新创建
  const { contactId, isEditMode, fromExtended } = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;
    const mode = urlParams.get('mode') === 'edit' && id !== null;
    const from = urlParams.get('fromExtended') === 'true';
    return { contactId: id, isEditMode: mode, fromExtended: from };
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
  
  const [showFamilyDialog, setShowFamilyDialog] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<string[]>([]);
  
  const [showIdentityDialog, setShowIdentityDialog] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<string[]>([]);
  
  // 品牌选择对话框（多选）
  const [showBrandDialog, setShowBrandDialog] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  
  // 娱乐选择对话框（多选）
  const [showEntertainmentDialog, setShowEntertainmentDialog] = useState(false);
  const [selectedEntertainments, setSelectedEntertainments] = useState<string[]>([]);
  
  // 职业字段对话框
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [companyList, setCompanyList] = useState<string[]>([]);
  
  const [showIndustryDialog, setShowIndustryDialog] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  const [showOccupationDialog, setShowOccupationDialog] = useState(false);
  const [selectedOccupation, setSelectedOccupation] = useState("");
  
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState("");
  
  
  const [showPublicAccountDialog, setShowPublicAccountDialog] = useState(false);
  const [selectedPublicAccount, setSelectedPublicAccount] = useState("");
  
  const [showPrivateAccountDialog, setShowPrivateAccountDialog] = useState(false);
  const [privateAccountList, setPrivateAccountList] = useState<{bank: string, number: string, name: string}[]>([]);
  const [privateAccountBank, setPrivateAccountBank] = useState("");
  const [privateAccountNumber, setPrivateAccountNumber] = useState("");
  const [privateAccountName, setPrivateAccountName] = useState("");
  
  // 电话对话框（支持多个电话号码）
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [phoneList, setPhoneList] = useState<string[]>([]);
  const [currentPhone, setCurrentPhone] = useState("");
  const [editingPhoneIndex, setEditingPhoneIndex] = useState<number | null>(null);
  
  // 通用字段对话框（用于其他字段）
  const [showGenericFieldDialog, setShowGenericFieldDialog] = useState(false);
  const [genericFieldName, setGenericFieldName] = useState("");
  const [genericFieldValue, setGenericFieldValue] = useState("");
  
  // 地址对话框（支持多个地址和类型选择）
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [addressList, setAddressList] = useState<{type: string, address: string, name?: string, phone?: string}[]>([]);
  const [currentAddressType, setCurrentAddressType] = useState<string>(""); // '快递', '办公', '普通'
  const [currentAddress, setCurrentAddress] = useState("");
  const [currentAddressName, setCurrentAddressName] = useState("");
  const [currentAddressPhone, setCurrentAddressPhone] = useState("");
  const [showAddressTypeSelection, setShowAddressTypeSelection] = useState(true);
  
  // 邮箱对话框（支持多个邮箱和格式验证）
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState("");
  
  // 微信号对话框（支持多个微信号）
  const [showWechatDialog, setShowWechatDialog] = useState(false);
  const [wechatList, setWechatList] = useState<string[]>([]);
  const [currentWechat, setCurrentWechat] = useState("");
  
  // 联络对话框（综合管理手机、微信、邮箱）
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [contactPhoneList, setContactPhoneList] = useState<string[]>([]);
  const [contactWechatList, setContactWechatList] = useState<string[]>([]);
  const [contactEmailList, setContactEmailList] = useState<string[]>([]);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactWechat, setNewContactWechat] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [editingContactType, setEditingContactType] = useState<'phone' | 'wechat' | 'email' | null>(null);
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const [showAddContactInput, setShowAddContactInput] = useState<'phone' | 'wechat' | 'email' | null>(null);
  
  // 用于跟踪是否已初始化字段值
  const [isFieldsInitialized, setIsFieldsInitialized] = useState(false);
  
  // 对话框提示信息（统一管理）
  const [dialogMessage, setDialogMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // 保存提示信息（显示在保存按钮左边）
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Toast弹窗状态
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  
  // 基本信息折叠状态
  const [isBasicInfoCollapsed, setIsBasicInfoCollapsed] = useState(false);
  
  // 扩展字段列表（用于拖拽排序）
  const defaultFieldList = [
    '星座', '生日', '年龄', '属相', '民族', '身份',
    '饮食', '娱乐',
    '商业', '行业', '类型', '职业', '征信', '公户', '私户',
    '联络', '地址'
  ];
  
  // 从 localStorage加载或使用默认配置
  const [extendedFieldList, setExtendedFieldList] = useState<string[]>(() => {
    const removedFields = ['财务', '法务', '劳务', '税务', '人事'];
    const saved = localStorage.getItem('extendedFieldList');
    if (saved) {
      const savedList = JSON.parse(saved);
      // 过滤掉已移除的字段
      const filteredList = savedList.filter((field: string) => !removedFields.includes(field));
      // 检测是否有新字段需要添加
      const newFields = defaultFieldList.filter(field => !filteredList.includes(field));
      if (newFields.length > 0) {
        // 将新字段添加到已保存列表的末尾
        const mergedList = [...filteredList, ...newFields];
        localStorage.setItem('extendedFieldList', JSON.stringify(mergedList));
        return mergedList;
      }
      // 如果过滤后的列表与原列表不同，更新localStorage
      if (filteredList.length !== savedList.length) {
        localStorage.setItem('extendedFieldList', JSON.stringify(filteredList));
      }
      return filteredList;
    }
    return defaultFieldList;
  });
  
  // 模糊查询相关状态
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // 获取所有可用的字段类目（树状结构）
  const { data: fieldCategories } = trpc.contacts.fieldValues.categories.useQuery();
  
  // 辅助函数：根据分类名称获叽categoryId
  const getCategoryId = (categoryName: string): number => {
    if (!fieldCategories) return 0;
    
    // 递归查找函数
    const findCategory = (categories: any[]): number => {
      for (const cat of categories) {
        if (cat.name === categoryName) {
          return cat.id;
        }
        if (cat.children && cat.children.length > 0) {
          const childId = findCategory(cat.children);
          if (childId !== 0) return childId;
        }
      }
      return 0;
    };
    
    return findCategory(fieldCategories);
  };
  
  // 模糊搜索已有人脉
  const { data: suggestions } = trpc.contacts.list.useQuery(
    { searchQuery: searchQuery || undefined },
    { enabled: searchQuery.length > 0 && !isEditMode } // 只在添加模式下启用
  );
  
  // 重名检测：防抖状态
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [debouncedPhone, setDebouncedPhone] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  
  // 姓名防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(name), 500);
    return () => clearTimeout(timer);
  }, [name]);
  
  // 昵称防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTitle(title), 500);
    return () => clearTimeout(timer);
  }, [title]);
  
  // 手机号防抖：监听extendedFields中的手机字段
  useEffect(() => {
    const phoneField = extendedFields.find(f => f.categoryName === '手机');
    const phoneValue = phoneField?.value || '';
    const timer = setTimeout(() => setDebouncedPhone(phoneValue), 500);
    return () => clearTimeout(timer);
  }, [extendedFields]);
  
  // 邮箱防抖：监听extendedFields中的邮箱字段
  useEffect(() => {
    const emailField = extendedFields.find(f => f.categoryName === '邮箱');
    const emailValue = emailField?.value || '';
    const timer = setTimeout(() => setDebouncedEmail(emailValue), 500);
    return () => clearTimeout(timer);
  }, [extendedFields]);
  
  // 重名检测查询
  const { data: duplicateResult } = trpc.contacts.checkDuplicateName.useQuery(
    {
      name: debouncedName || undefined,
      title: debouncedTitle || undefined,
      phone: debouncedPhone || undefined,
      email: debouncedEmail || undefined,
      excludeId: isEditMode ? contactId ?? undefined : undefined,
    },
    { enabled: (debouncedName.length > 0 || debouncedTitle.length > 0 || debouncedPhone.length > 0 || debouncedEmail.length > 0) }
  );
  
  // 解析重名提示信息
  const duplicateWarnings = useMemo(() => {
    if (!duplicateResult?.duplicates || duplicateResult.duplicates.length === 0) return [];
    return duplicateResult.duplicates.map((d: any) => {
      const displayName = d.matchedTitle ? `${d.matchedName}（昵称：${d.matchedTitle}）` : d.matchedName;
      switch (d.type) {
        case 'name_name':
          return { text: `姓名与已有人脉「${displayName}」的姓名重复`, contactId: d.contactId, field: 'name' };
        case 'title_title':
          return { text: `昵称与已有人脉「${displayName}」的昵称重复`, contactId: d.contactId, field: 'title' };
        case 'name_title':
          return { text: `姓名与已有人脉「${displayName}」的昵称重复`, contactId: d.contactId, field: 'name' };
        case 'title_name':
          return { text: `昵称与已有人脉「${displayName}」的姓名重复`, contactId: d.contactId, field: 'title' };
        case 'phone_phone':
          return { text: `手机号「${d.matchedValue || ''}」与已有人脉「${displayName}」重复`, contactId: d.contactId, field: 'phone' };
        case 'email_email':
          return { text: `邮箱「${d.matchedValue || ''}」与已有人脉「${displayName}」重复`, contactId: d.contactId, field: 'email' };
        default:
          return { text: `与已有人脉「${displayName}」存在重复`, contactId: d.contactId, field: 'name' };
      }
    });
  }, [duplicateResult]);
  
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
  // 添加一个标志位防止重复初始化
  const [isExtendedFieldsInitialized, setIsExtendedFieldsInitialized] = useState(false);
  
  useEffect(() => {
    // 只在第一次加载时初始化，防止保存后的invalidate覆盖本地状态
    if (isEditMode && existingFieldValues && existingFieldValues.length > 0 && !isExtendedFieldsInitialized) {
      const fields: ExtendedFieldValue[] = existingFieldValues.map((fv: any) => ({
        id: fv.id,
        categoryId: fv.categoryId,
        categoryName: fv.categoryName || fv.name || "",
        value: fv.value || "",
      }));
      setExtendedFields(fields);
      setIsExtendedFieldsInitialized(true);
    }
  }, [existingFieldValues, isEditMode, isExtendedFieldsInitialized]);
  
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
              categoryName: field.categoryName,
              value: field.value,
            });
          }
        } catch (error) {
          console.error('保存扩展信息失败:', error);
          setToastMessage('扩展信息保存失败');
          setToastType('error');
          setShowToast(true);
          return;
        }
      }
      // 记录新创建的联系人 ID
      setCreatedContactId(data.id);
      setToastMessage('联系人保存成功');
      setToastType('success');
      setShowToast(true);
    },
    onError: (error) => {
      setToastMessage(error.message || '保存失败');
      setToastType('error');
      setShowToast(true);
    },
  });
  
  // 更新人脉API
  const updateContactMutation = trpc.contacts.update.useMutation({
    onSuccess: async (data) => {
      // 使缓存失效，强制重新获取数据
      await utils.contacts.get.invalidate({ id: contactId! });
      await utils.contacts.fieldValues.list.invalidate({ contactId: contactId! });
      setToastMessage('联系人保存成功');
      setToastType('success');
      setShowToast(true);
    },
    onError: (error) => {
      setToastMessage(error.message || '保存失败');
      setToastType('error');
      setShowToast(true);
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
    
    // 清除旧的保存提示
    setSaveMessage(null);
    
    if (!name.trim()) {
      setSaveMessage({type: "error", text: "请输入姓名"});
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
      
      // 分类处理扩展信息：新增、更新、删除
      const newFields = extendedFields.filter(f => !f.id && !f._deleted);
      const existingFields = extendedFields.filter(f => f.id && !f._deleted);
      const deletedFields = extendedFields.filter(f => f.id && f._deleted);
      console.log('[AddContact] 新增的扩展信息:', newFields);
      console.log('[AddContact] 更新的扩展信息:', existingFields);
      console.log('[AddContact] 删除的扩展信息:', deletedFields);
      
      // 删除标记为删除的字段
      for (const field of deletedFields) {
        deleteFieldValueMutation.mutate({ id: field.id! });
      }
      
      // 新增字段
      for (const field of newFields) {
        addFieldValueMutation.mutate({
          contactId: contactId,
          categoryId: field.categoryId,
          categoryName: field.categoryName,
          value: field.value,
        });
      }
      
      // 更新已有字段
      for (const field of existingFields) {
        updateFieldValueMutation.mutate({
          id: field.id!,
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
                setLocation('/');
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
          <div className="flex items-center gap-2">
            {/* 保存提示信息显示在保存按钮左边 */}
            {saveMessage && (
              <div className={`px-3 py-1 rounded text-sm ${
                saveMessage.type === "error" 
                  ? "bg-[#D32F2F]-light text-[#D32F2F] border border-red-200" 
                  : "bg-[#E8F5E9] text-green-700 border border-green-200"
              }`}>
                {saveMessage.text}
              </div>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={createContactMutation.isPending || updateContactMutation.isPending}
            >
              保存
            </Button>
          </div>
        </div>
      </div>

      {/* 表单内容 */}
      <div className="container py-6 space-y-6 flex flex-col">
        {/* 扩展信息 */}
        <Card style={{ order: fromExtended ? 1 : 2, marginBottom: '1.5rem' }}>
          <CardHeader>
            <CardTitle>扩展信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 手机 - 支持多个（每个单独存储） */}
            <MultiItemFieldV2
              label="手机"
              placeholder="请输入手机号"
              categoryName="手机"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
            
            {/* 邮箱 - 支持多个（每个单独存储） */}
            <MultiItemFieldV2
              label="邮箱"
              placeholder="请输入邮箱"
              categoryName="邮箱"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
            
            {/* 快递地址 - 支持多个（每个单独存储） */}
            <MultiAddressFieldV2
              label="快递地址"
              categoryName="快递地址"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
            
            {/* 银行账号 - 支持多个（每个单独存储） */}
            <MultiBankFieldV2
              label="银行账号"
              categoryName="银行账号"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
            
            {/* 公司名称 - 支持多个（每个单独存储） */}
            <MultiItemFieldV2
              label="公司名称"
              placeholder="请输入公司名称"
              categoryName="公司名称"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
            
            {/* 开票信息 - 支持多个（每个单独存储） */}
            <MultiInvoiceFieldV2
              label="开票信息"
              categoryName="开票信息"
              extendedFields={extendedFields}
              setExtendedFields={setExtendedFields}
              getCategoryId={getCategoryId}
            />
          </CardContent>
        </Card>

        {/* 基本信息 */}
        <Card style={{ order: fromExtended ? 2 : 1, marginBottom: '1.5rem' }}>
          <CardHeader className="flex flex-row items-center justify-between cursor-pointer" onClick={() => setIsBasicInfoCollapsed(!isBasicInfoCollapsed)}>
            <div className="flex items-center gap-2">
              <CardTitle>基本信息</CardTitle>
              {isBasicInfoCollapsed && name && (
                <span className="text-base font-normal text-[#757575]">{name}</span>
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
                  姓名 <span className="text-[#D32F2F]">*</span>
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
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-divider dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b">
                      找到 {suggestions.length} 个相似的人脉，点击查看详情
                    </div>
                    {suggestions.map((contact: any) => (
                      <div
                        key={contact.id}
                        onClick={() => handleSuggestionClick(contact.id)}
                        className="p-3 hover:bg-[#FAF3ED] dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
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

            {/* 重名警告提示 */}
            {duplicateWarnings.length > 0 && (
              <div className="space-y-1.5">
                {duplicateWarnings.map((warning: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2.5 bg-[#FFF5F5] border border-[#FFCDD2] rounded-lg cursor-pointer hover:bg-[#FFEBEE] transition-colors"
                    onClick={() => setLocation(`/parent/contacts/${warning.contactId}`)}
                  >
                    <AlertTriangle className="w-4 h-4 text-[#D32F2F] flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#D32F2F]">{warning.text}</p>
                      <p className="text-xs text-[#E57373] mt-0.5">点击查看该人脉</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
                {extendedFields.some(f => f.categoryName === '星座') ? '返回' : '取消'}
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
                        categoryId: getCategoryId('星座'),
                        categoryName: '星座',
                        value: selectedConstellation,
                      }];
                    });
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
                {extendedFields.some(f => f.categoryName === '生日') ? '返回' : '取消'}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedBirthday) {
                    // 保存生日
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '生日');
                      return [...filtered, {
                        categoryId: getCategoryId('生日'),
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
                        categoryId: getCategoryId('属相'),
                        categoryName: '属相',
                        value: zodiacAnimal,
                      }];
                    });
                    
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
                {extendedFields.some(f => f.categoryName === '血型') ? '返回' : '取消'}
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (selectedBloodType) {
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '血型');
                      return [...filtered, {
                        categoryId: getCategoryId('血型'),
                        categoryName: '血型',
                        value: selectedBloodType,
                      }];
                    });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
                {extendedFields.some(f => f.categoryName === '属相') ? '返回' : '取消'}
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
                        categoryId: getCategoryId('属相'),
                        categoryName: '属相',
                        value: selectedZodiac,
                      }];
                    });
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
                        ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                        : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
                {extendedFields.some(f => f.categoryName === '年龄') ? '返回' : '取消'}
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
                        categoryId: getCategoryId('年龄'),
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
                        categoryId: getCategoryId('属相'),
                        categoryName: '属相',
                        value: zodiacAnimal,
                      }];
                    });
                    
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
            <div className="grid grid-cols-4 gap-2 mb-4 max-h-96 overflow-y-auto">
              {Array.from({ length: 71 }, (_, i) => `${140 + i}cm`).map(height => (
                <button
                  key={height}
                  onClick={() => setSelectedHeight(height)}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedHeight === height
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '身高') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHeight) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '身高');
                    return [...filtered, { categoryId: getCategoryId('身高'),
                        categoryName: '身高', value: selectedHeight }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '鞋码') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedShoeSize) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '鞋码');
                    return [...filtered, { categoryId: getCategoryId('鞋码'),
                        categoryName: '鞋码', value: selectedShoeSize }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '饮食') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedDietaries.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '饮食');
                    return [...filtered, { categoryId: getCategoryId('饮食'),
                        categoryName: '饮食', value: selectedDietaries.join(',') }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '习惯') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHabits.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '习惯');
                    return [...filtered, { categoryId: getCategoryId('习惯'),
                        categoryName: '习惯', value: selectedHabits.join(',') }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '健康') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedHealths.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '健康');
                    return [...filtered, { categoryId: getCategoryId('健康'),
                        categoryName: '健康', value: selectedHealths.join(',') }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '性格') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPersonalities.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '性格');
                    return [...filtered, { categoryId: getCategoryId('性格'),
                        categoryName: '性格', value: selectedPersonalities.join(',') }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '民族') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEthnic) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '民族');
                    return [...filtered, { categoryId: getCategoryId('民族'),
                        categoryName: '民族', value: selectedEthnic }];
                  });
                  setShowEthnicDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请选择民族"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 家庭选择对话框（多选） */}
      {showFamilyDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowFamilyDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择家庭（可多选）</h3>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-96 overflow-y-auto">
              {['未婚', '已婚', '离异', '丧偶', '再婚', '独生子女', '儿子', '女儿', '子女', '父母健在', '单亲家庭', '三代同堂', '独居'].map(family => (
                <button
                  key={family}
                  onClick={() => {
                    setSelectedFamily(prev => 
                      prev.includes(family) ? prev.filter(f => f !== family) : [...prev, family]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedFamily.includes(family)
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
                  }`}
                >
                  {family}
                </button>
              ))}
            </div>
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '家庭');
                setSelectedFamily(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowFamilyDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '家庭') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedFamily.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '家庭');
                    return [...filtered, { categoryId: getCategoryId('家庭'),
                        categoryName: '家庭', value: selectedFamily.join(',') }];
                  });
                  setShowFamilyDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 身份选择对话框（多选） */}
      {showIdentityDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowIdentityDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">选择身份（可多选）</h3>
            <div className="grid grid-cols-5 gap-2 mb-4 max-h-96 overflow-y-auto">
              {[
                // 家庭角色
                '子女', '父母', '配偶', '兄弟', '姐妹', '叔姨',
                // 职业身份
                '学生', '雇主', '雇员',
                // 社会身份
                '党员', '志愿者', '义工', '红十字会员', '慈善家', '捐赠人',
                '业主', '租客', '房东', '二房东', '邻居',
                '股东', '投资人', '合伙人', '债权人', '债务人',
                '客户', '供应商', '经销商', '代理商', '中介',
                // 特殊身份
                '退休人员', '自由职业者', '创业者', '兼职者',
                '残疾人', '人大代表', '政协委员', '劳模',
                '烈士家属', '军属', '侨胞', '归侨', '港澳台同胞',
                // 其他身份
                '会长', '理事', '秘书长', '顾问', '名誉会长',
                '董事长', '监事', '独立董事', '总裁', '副总裁'
              ].map(identity => (
                <button
                  key={identity}
                  onClick={() => {
                    setSelectedIdentity(prev => 
                      prev.includes(identity) ? prev.filter(i => i !== identity) : [...prev, identity]
                    );
                  }}
                  className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                    selectedIdentity.includes(identity)
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
                  }`}
                >
                  {identity}
                </button>
              ))}
            </div>
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                const existingValue = extendedFields.find(f => f.categoryName === '身份');
                setSelectedIdentity(existingValue ? existingValue.value.split(',') : []);
                setDialogMessage(null);
                setShowIdentityDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '身份') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedIdentity.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '身份');
                    return [...filtered, { categoryId: getCategoryId('身份'),
                        categoryName: '身份', value: selectedIdentity.join(',') }];
                  });
                  setShowIdentityDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '品牌') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedBrands.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '品牌');
                    return [...filtered, { categoryId: getCategoryId('品牌'),
                        categoryName: '品牌', value: selectedBrands.join(',') }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '娱乐') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedEntertainments.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '娱乐');
                    return [...filtered, { categoryId: getCategoryId('娱乐'),
                        categoryName: '娱乐', value: selectedEntertainments.join(',') }];
                  });
                  setShowEntertainmentDialog(false);
                } else {
                  setDialogMessage({type: "error", text: "请至少选择一项"});
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 商业对话框 */}
      {showCompanyDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCompanyDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">商业信息</h3>
            
            {/* 历史记录列表 */}
            {companyList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#757575] mb-2">历史记录：</p>
                <div className="space-y-2">
                  {companyList.map((company, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-3 rounded border border-divider">
                      <div className="flex-1 text-sm font-medium text-[#222222]">{company}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedCompany(company);
                            setDialogMessage({type: "success", text: "已加载到输入框"});
                          }}
                          className="text-[#1976D2] hover:text-blue-700"
                          title="选择"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setCompanyList(prev => prev.filter((_, i) => i !== index));
                            setDialogMessage({type: "success", text: "已删除"});
                          }}
                          className="text-[#D32F2F] hover:text-[#D32F2F]"
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
            
            {/* 输入框 */}
            <div className="mb-4">
              <p className="text-sm text-[#757575] mb-2">{companyList.length > 0 ? '添加新商业：' : '商业名称：'}</p>
              <Input 
                value={selectedCompany} 
                onChange={(e) => setSelectedCompany(e.target.value)} 
                placeholder="请输入商业名称" 
              />
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowCompanyDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '商业') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                // 检查当前输入框是否有内容
                const hasCurrentInput = selectedCompany.trim();
                
                if (hasCurrentInput) {
                  // 将当前输入框的内容添加到列表
                  const allCompanies = [...companyList, selectedCompany.trim()];
                  
                  // 保存所有商业
                  const value = allCompanies.join('; ');
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '商业');
                    return [...filtered, { categoryId: getCategoryId('商业'),
                        categoryName: '商业', value }];
                  });
                  setShowCompanyDialog(false);
                } else {
                  // 如果输入框没有内容，检查是否有历史记录
                  if (companyList.length === 0) {
                    setDialogMessage({type: "error", text: "请至少添加一个商业"});
                    return;
                  }
                  // 保存已有的商业
                  const value = companyList.join('; ');
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '商业');
                    return [...filtered, { categoryId: getCategoryId('商业'),
                        categoryName: '商业', value }];
                  });
                  setShowCompanyDialog(false);
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
              }}>{extendedFields.some(f => f.categoryName === '公户') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedPublicAccount.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '公户');
                    return [...filtered, { categoryId: getCategoryId('公户'),
                        categoryName: '公户', value: selectedPublicAccount }];
                  });
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
                <p className="text-sm text-[#757575] mb-2">已添加的银行卡：</p>
                <div className="space-y-2">
                  {privateAccountList.map((account, index) => (
                    <div key={index} className="flex items-start gap-2 bg-[#FAF3ED] p-3 rounded border border-divider">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[#222222]">{account.bank}</div>
                        <div className="text-xs text-[#757575] mt-1">卡号：{account.number}</div>
                        <div className="text-xs text-[#757575]">户名：{account.name}</div>
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
                          className="text-[#1976D2] hover:text-blue-700 mt-1"
                          title="编辑"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPrivateAccountList(prev => prev.filter((_, i) => i !== index))}
                          className="text-[#D32F2F] hover:text-[#D32F2F] mt-1"
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
              <p className="text-sm text-[#757575] mb-2">{privateAccountList.length > 0 ? '添加新银行卡：' : '银行卡信息：'}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-[#757575] mb-1 block">银行</label>
                  <Input 
                    value={privateAccountBank} 
                    onChange={(e) => setPrivateAccountBank(e.target.value)} 
                    placeholder="请输入银行名称" 
                  />
                </div>
                <div>
                  <label className="text-sm text-[#757575] mb-1 block">卡号</label>
                  <Input 
                    value={privateAccountNumber} 
                    onChange={(e) => setPrivateAccountNumber(e.target.value)} 
                    placeholder="请输入银行卡号" 
                  />
                </div>
                <div>
                  <label className="text-sm text-[#757575] mb-1 block">户名</label>
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowPrivateAccountDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '私户') ? '返回' : '取消'}</Button>
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
                    return [...filtered, { categoryId: getCategoryId('私户'),
                        categoryName: '私户', value }];
                  });
                  setShowPrivateAccountDialog(false);
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
                    return [...filtered, { categoryId: getCategoryId('私户'),
                        categoryName: '私户', value }];
                  });
                  setShowPrivateAccountDialog(false);
                }
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 地址对话框 */}
      {showAddressDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddressDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">地址</h3>
            
            {/* 已有地址列表 */}
            {addressList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#757575] mb-2">已有地址：</p>
                {addressList.map((addr, index) => (
                  <div key={index} className="mb-3 p-3 bg-[#FAF3ED] rounded">
                    <div className="text-sm mb-1">{addr.address}</div>
                    <div className="text-xs text-[#757575] mb-2">
                      {addr.name && <span>{addr.name}</span>}
                      {addr.name && addr.phone && <span className="mx-1">·</span>}
                      {addr.phone && <span>{addr.phone}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setCurrentAddress(addr.address);
                          setCurrentAddressName(addr.name);
                          setCurrentAddressPhone(addr.phone);
                          setAddressList(addressList.filter((_, i) => i !== index));
                        }}
                      >编辑</Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setAddressList(addressList.filter((_, i) => i !== index));
                        }}
                      >删除</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* 地址输入 */}
            <div className="mb-4">
              <p className="text-sm text-[#757575] mb-2">添加地址：</p>
              <Input 
                value={currentAddress} 
                onChange={(e) => setCurrentAddress(e.target.value)} 
                placeholder="请输入地址" 
                className="mb-2"
              />
              <Input 
                value={currentAddressName} 
                onChange={(e) => setCurrentAddressName(e.target.value)} 
                placeholder="姓名" 
                className="mb-2"
              />
              <Input 
                value={currentAddressPhone} 
                onChange={(e) => setCurrentAddressPhone(e.target.value)} 
                placeholder="手机" 
                className="mb-2"
              />
              <Button 
                size="sm"
                onClick={() => {
                  if (currentAddress.trim()) {
                    setAddressList([...addressList, { 
                      type: '', 
                      address: currentAddress.trim(),
                      name: currentAddressName.trim(),
                      phone: currentAddressPhone.trim()
                    }]);
                    setCurrentAddress('');
                    setCurrentAddressName('');
                    setCurrentAddressPhone('');
                    setDialogMessage({type: "success", text: "已添加地址"});
                  } else {
                    setDialogMessage({type: "error", text: "请输入地址"});
                  }
                }}
              >添加</Button>
            </div>
            
            {dialogMessage && (
              <div className={`text-sm mb-4 ${dialogMessage.type === 'error' ? 'text-[#D32F2F]' : 'text-[#4CAF50]'}`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowAddressDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '地址') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (addressList.length === 0) {
                  setDialogMessage({type: "error", text: "请至少添加一个地址"});
                  return;
                }
                // 保存地址列表，格式：地址|姓名|手机
                const value = addressList.map(addr => 
                  `${addr.address}|${addr.name || ''}|${addr.phone || ''}`
                ).join('; ');
                setExtendedFields(prev => {
                  const filtered = prev.filter(f => f.categoryName !== '地址');
                  return [...filtered, { categoryId: getCategoryId('地址'),
                      categoryName: '地址', value }];
                });
                setDialogMessage({type: "success", text: `已添加${addressList.length}个地址`});
                setTimeout(() => {
                  setDialogMessage(null);
                  setShowAddressDialog(false);
                }, 1000);
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 电话对话框（支持多个电话号码） */}
      {showPhoneDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPhoneDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">电话</h3>
            
            {/* 已保存的电话列表 */}
            {phoneList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#757575] mb-2">已保存的电话：</p>
                <div className="space-y-2">
                  {phoneList.map((phone, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-3 rounded-lg border">
                      <span className="flex-1 text-sm">{phone}</span>
                      <button
                        onClick={() => {
                          setCurrentPhone(phone);
                          setEditingPhoneIndex(index);
                          setDialogMessage({type: "success", text: '已加载到输入框，修改后点击保存'});
                        }}
                        className="text-[#1976D2] hover:text-blue-700 flex-shrink-0"
                        title="编辑"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setPhoneList(prev => prev.filter((_, i) => i !== index));
                          if (editingPhoneIndex === index) {
                            setEditingPhoneIndex(null);
                            setCurrentPhone('');
                          }
                          setDialogMessage({type: "success", text: '已删除'});
                        }}
                        className="text-[#D32F2F] hover:text-[#D32F2F] flex-shrink-0"
                        title="删除"
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
            
            {/* 输入电话 */}
            <div className="mb-4">
              <label className="text-sm text-[#757575] mb-2 block">
                {editingPhoneIndex !== null ? '编辑电话' : '添加新电话'}
              </label>
              <Input 
                type="tel"
                value={currentPhone} 
                onChange={(e) => setCurrentPhone(e.target.value)} 
                placeholder="请输入电话号码" 
              />
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              {/* 取消按钮 */}
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => {
                  setDialogMessage(null);
                  setShowPhoneDialog(false);
                }}
              >
                取消
              </Button>
              
              {/* 确定按钮 */}
              <Button 
                className="flex-1" 
                onClick={() => {
                  // 如果输入框有内容，先添加到列表
                  let finalList = [...phoneList];
                  if (currentPhone.trim()) {
                    if (editingPhoneIndex !== null) {
                      finalList[editingPhoneIndex] = currentPhone.trim();
                    } else {
                      finalList.push(currentPhone.trim());
                    }
                  }
                  
                  if (finalList.length === 0) {
                    // 如果没有电话，删除该字段
                    setExtendedFields(prev => prev.filter(f => f.categoryName !== '电话'));
                    setDialogMessage({type: "success", text: '已清空电话'});
                  } else {
                    // 保存所有电话
                    const value = finalList.join(',');
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '电话');
                      return [...filtered, { categoryId: getCategoryId('电话'), categoryName: '电话', value }];
                    });
                    setDialogMessage({type: "success", text: `已保存${finalList.length}个电话`});
                  }
                  
                  setTimeout(() => {
                    setDialogMessage(null);
                    setShowPhoneDialog(false);
                  }, 800);
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
            {/* 通用字段对话框（用于其他字段） */}
      {showGenericFieldDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGenericFieldDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{genericFieldName}</h3>
            
            {/* 地址历史记录列表 */}
            {genericFieldName === '地址' && addressList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#757575] mb-2">已保存的地址：</p>
                <div className="space-y-2">
                  {addressList.map((addr, index) => (
                    <div key={index} className="flex items-start gap-2 bg-[#FAF3ED] p-3 rounded border border-divider">
                      <div className="flex-1 text-sm">
                        <div className="font-medium text-[#222222] mb-1">{addr.address}</div>
                        {(addr.name || addr.phone) && (
                          <div className="text-[#757575] text-xs">{addr.name}{addr.name && addr.phone ? ' · ' : ''}{addr.phone}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setGenericFieldValue(addr.address);
                            setCurrentAddressName(addr.name || '');
                            setCurrentAddressPhone(addr.phone || '');
                            setAddressList(addressList.filter((_, i) => i !== index));
                            setDialogMessage({type: "success", text: "已加载到输入框"});
                          }}
                          className="text-[#1976D2] hover:text-blue-700"
                          title="编辑"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setAddressList(addressList.filter((_, i) => i !== index));
                            setDialogMessage({type: "success", text: "已删除"});
                          }}
                          className="text-[#D32F2F] hover:text-[#D32F2F]"
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
            
            {/* 输入框 */}
            <div className="mb-4">
              {genericFieldName === '地址' && addressList.length > 0 && (
                <p className="text-sm text-[#757575] mb-2">添加新地址：</p>
              )}
              <Input 
                value={genericFieldValue} 
                onChange={(e) => setGenericFieldValue(e.target.value)} 
                placeholder={`请输入${genericFieldName}`} 
                className="mb-2" 
              />
              {genericFieldName === '地址' && (
                <div className="flex gap-2">
                  <Input 
                    value={currentAddressName} 
                    onChange={(e) => setCurrentAddressName(e.target.value)} 
                    placeholder="姓名" 
                    className="w-[40%]" 
                  />
                  <Input 
                    value={currentAddressPhone} 
                    onChange={(e) => setCurrentAddressPhone(e.target.value)} 
                    placeholder="联系电话" 
                    className="w-[60%]" 
                  />
                </div>
              )}
            </div>
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowGenericFieldDialog(false);
              }}>{extendedFields.some(f => f.categoryName === genericFieldName) ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (genericFieldName === '地址') {
                  // 地址字段的特殊处理
                  const hasCurrentInput = genericFieldValue.trim();
                  
                  if (hasCurrentInput) {
                    // 将当前输入框的内容添加到列表
                    const newAddress = {
                      type: '',
                      address: genericFieldValue.trim(),
                      name: currentAddressName.trim(),
                      phone: currentAddressPhone.trim()
                    };
                    const allAddresses = [...addressList, newAddress];
                    
                    // 保存所有地址
                    const value = allAddresses.map(addr => 
                      `${addr.address}|${addr.name || ''}|${addr.phone || ''}`
                    ).join('; ');
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '地址');
                      return [...filtered, { categoryId: getCategoryId('地址'), categoryName: '地址', value }];
                    });
                    setShowGenericFieldDialog(false);
                  } else {
                    // 如果输入框没有内容，检查是否有历史记录
                    if (addressList.length === 0) {
                      setDialogMessage({type: "error", text: "请至少添加一个地址"});
                      return;
                    }
                    // 保存已有的地址
                    const value = addressList.map(addr => 
                      `${addr.address}|${addr.name || ''}|${addr.phone || ''}`
                    ).join('; ');
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== '地址');
                      return [...filtered, { categoryId: getCategoryId('地址'), categoryName: '地址', value }];
                    });
                    setShowGenericFieldDialog(false);
                  }
                } else {
                  // 其他字段的处理
                  if (genericFieldValue.trim()) {
                    setExtendedFields(prev => {
                      const filtered = prev.filter(f => f.categoryName !== genericFieldName);
                      return [...filtered, { categoryId: getCategoryId(genericFieldName), categoryName: genericFieldName, value: genericFieldValue }];
                    });
                    setDialogMessage({type: "success", text: `已设置${genericFieldName}：${genericFieldValue}`});
                    setShowGenericFieldDialog(false);
                  } else {
                    setDialogMessage({type: "error", text: `请输入${genericFieldName}`});
                  }
                }
              }}>确定</Button>            </div>
          </div>
        </div>
      )}
      
      {/* 邮箱对话框（历史记录模式） */}
      {showEmailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEmailDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">邮箱</h3>
            
            {/* 历史记录列表 */}
            {emailList.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#757575] mb-2">历史记录：</p>
                <div className="space-y-2">
                  {emailList.map((email, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-3 rounded-lg border">
                      <span className="flex-1 text-sm break-all">{email}</span>
                      <button
                        onClick={() => {
                          setCurrentEmail(email);
                          setDialogMessage({type: "success", text: '已加载到输入框'});
                        }}
                        className="text-[#1976D2] hover:text-blue-700 flex-shrink-0"
                        title="选择此邮箱"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setEmailList(prev => prev.filter((_, i) => i !== index));
                          setDialogMessage({type: "success", text: '已删除'});
                        }}
                        className="text-[#D32F2F] hover:text-[#D32F2F] flex-shrink-0"
                        title="删除此邮箱"
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
            
            {/* 输入邮箱 */}
            <div className="mb-4">
              <label className="text-sm text-[#757575] mb-2 block">邮箱地址</label>
              <Input 
                type="email"
                value={currentEmail} 
                onChange={(e) => setCurrentEmail(e.target.value)} 
                placeholder="请输入邮箱地址（如：example@email.com）" 
              />
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowEmailDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '邮箱') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!currentEmail.trim()) {
                  setDialogMessage({type: "error", text: '请输入邮箱地址'});
                  return;
                }
                if (!emailRegex.test(currentEmail.trim())) {
                  setDialogMessage({type: "error", text: '邮箱格式不正确，请输入有效的邮箱地址'});
                  return;
                }
                
                // 添加到列表（如果不存在）
                if (!emailList.includes(currentEmail.trim())) {
                  setEmailList(prev => [...prev, currentEmail.trim()]);
                }
                
                // 保存到扩展字段
                setExtendedFields(prev => {
                  const filtered = prev.filter(f => f.categoryName !== '邮箱');
                  const allEmails = emailList.includes(currentEmail.trim()) ? emailList : [...emailList, currentEmail.trim()];
                  return [...filtered, { 
                    categoryId: getCategoryId('邮箱'),
                    categoryName: '邮箱', 
                    value: allEmails.join('; ') 
                  }];
                });
                
                setShowEmailDialog(false);
                setCurrentEmail('');
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
                <p className="text-sm text-[#757575] mb-2">已添加的微信号：</p>
                <div className="space-y-2">
                  {wechatList.map((wechat, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-2 rounded">
                      <span className="flex-1 text-sm">{wechat}</span>
                      <button
                        onClick={() => setWechatList(prev => prev.filter((_, i) => i !== index))}
                        className="text-[#D32F2F] hover:text-[#D32F2F]"
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
              <p className="text-sm text-[#757575] mb-2">添加新微信号：</p>
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowWechatDialog(false);
              }}>{extendedFields.some(f => f.categoryName === '微信') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (wechatList.length === 0) {
                  setDialogMessage({type: "error", text: '请至少添加一个微信号'});
                  return;
                }
                setExtendedFields(prev => {
                  const filtered = prev.filter(f => f.categoryName !== '微信');
                  return [...filtered, { categoryId: getCategoryId('微信'),
                        categoryName: '微信', value: wechatList.join(', ') }];
                });
                setShowWechatDialog(false);
              }}>确定</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* 联络对话框（综合管理手机、微信、邮箱） */}
      {showContactDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowContactDialog(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">联络方式</h3>
            
            {/* 手机号部分 */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">手机号</p>
              {contactPhoneList.length > 0 && (
                <div className="space-y-2 mb-2">
                  {contactPhoneList.map((phone, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-2 rounded border">
                      {editingContactType === 'phone' && editingContactIndex === index ? (
                        <Input 
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          className="flex-1 h-8"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-sm">{phone}</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // 添加新手机号
                          setShowAddContactInput('phone');
                          setNewContactPhone('');
                        }}
                        className="text-[#4CAF50] hover:text-green-700 flex-shrink-0 p-1"
                        title="添加"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // 删除当前手机号
                          const newList = contactPhoneList.filter((_, i) => i !== index);
                          setContactPhoneList(newList);
                        }}
                        className="text-[#D32F2F] hover:text-[#D32F2F] flex-shrink-0 p-1"
                        title="删除"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (editingContactType === 'phone' && editingContactIndex === index) {
                            // 保存编辑
                            if (newContactPhone.trim()) {
                              const newList = [...contactPhoneList];
                              newList[index] = newContactPhone.trim();
                              setContactPhoneList(newList);
                            }
                            setEditingContactType(null);
                            setEditingContactIndex(null);
                            setNewContactPhone('');
                          } else {
                            // 进入编辑模式
                            setEditingContactType('phone');
                            setEditingContactIndex(index);
                            setNewContactPhone(phone);
                          }
                        }}
                        className="text-[#1976D2] hover:text-blue-700 flex-shrink-0 p-1"
                        title={editingContactType === 'phone' && editingContactIndex === index ? '保存' : '编辑'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* 添加新手机号输入框 */}
              {(contactPhoneList.length === 0 || showAddContactInput === 'phone') && (
                <div className="flex gap-2">
                  <Input 
                    type="tel"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="请输入手机号"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (newContactPhone.trim()) {
                        setContactPhoneList(prev => [...prev, newContactPhone.trim()]);
                        setNewContactPhone('');
                        setShowAddContactInput(null);
                      }
                    }}
                  >
                    添加
                  </Button>
                  {showAddContactInput === 'phone' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowAddContactInput(null);
                        setNewContactPhone('');
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* 微信号部分 */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">微信号</p>
              {contactWechatList.length > 0 && (
                <div className="space-y-2 mb-2">
                  {contactWechatList.map((wechat, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-2 rounded border">
                      {editingContactType === 'wechat' && editingContactIndex === index ? (
                        <Input 
                          value={newContactWechat}
                          onChange={(e) => setNewContactWechat(e.target.value)}
                          className="flex-1 h-8"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-sm">{wechat}</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowAddContactInput('wechat');
                          setNewContactWechat('');
                        }}
                        className="text-[#4CAF50] hover:text-green-700 flex-shrink-0 p-1"
                        title="添加"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newList = contactWechatList.filter((_, i) => i !== index);
                          setContactWechatList(newList);
                        }}
                        className="text-[#D32F2F] hover:text-[#D32F2F] flex-shrink-0 p-1"
                        title="删除"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (editingContactType === 'wechat' && editingContactIndex === index) {
                            if (newContactWechat.trim()) {
                              const newList = [...contactWechatList];
                              newList[index] = newContactWechat.trim();
                              setContactWechatList(newList);
                            }
                            setEditingContactType(null);
                            setEditingContactIndex(null);
                            setNewContactWechat('');
                          } else {
                            setEditingContactType('wechat');
                            setEditingContactIndex(index);
                            setNewContactWechat(wechat);
                          }
                        }}
                        className="text-[#1976D2] hover:text-blue-700 flex-shrink-0 p-1"
                        title={editingContactType === 'wechat' && editingContactIndex === index ? '保存' : '编辑'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(contactWechatList.length === 0 || showAddContactInput === 'wechat') && (
                <div className="flex gap-2">
                  <Input 
                    value={newContactWechat}
                    onChange={(e) => setNewContactWechat(e.target.value)}
                    placeholder="请输入微信号"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (newContactWechat.trim()) {
                        setContactWechatList(prev => [...prev, newContactWechat.trim()]);
                        setNewContactWechat('');
                        setShowAddContactInput(null);
                      }
                    }}
                  >
                    添加
                  </Button>
                  {showAddContactInput === 'wechat' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowAddContactInput(null);
                        setNewContactWechat('');
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* 邮箱部分 */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">邮箱</p>
              {contactEmailList.length > 0 && (
                <div className="space-y-2 mb-2">
                  {contactEmailList.map((email, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#FAF3ED] p-2 rounded border">
                      {editingContactType === 'email' && editingContactIndex === index ? (
                        <Input 
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          className="flex-1 h-8"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 text-sm">{email}</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowAddContactInput('email');
                          setNewContactEmail('');
                        }}
                        className="text-[#4CAF50] hover:text-green-700 flex-shrink-0 p-1"
                        title="添加"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newList = contactEmailList.filter((_, i) => i !== index);
                          setContactEmailList(newList);
                        }}
                        className="text-[#D32F2F] hover:text-[#D32F2F] flex-shrink-0 p-1"
                        title="删除"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (editingContactType === 'email' && editingContactIndex === index) {
                            if (newContactEmail.trim()) {
                              const newList = [...contactEmailList];
                              newList[index] = newContactEmail.trim();
                              setContactEmailList(newList);
                            }
                            setEditingContactType(null);
                            setEditingContactIndex(null);
                            setNewContactEmail('');
                          } else {
                            setEditingContactType('email');
                            setEditingContactIndex(index);
                            setNewContactEmail(email);
                          }
                        }}
                        className="text-[#1976D2] hover:text-blue-700 flex-shrink-0 p-1"
                        title={editingContactType === 'email' && editingContactIndex === index ? '保存' : '编辑'}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(contactEmailList.length === 0 || showAddContactInput === 'email') && (
                <div className="flex gap-2">
                  <Input 
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="请输入邮箱"
                    className="flex-1"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      if (newContactEmail.trim()) {
                        // 简单的邮箱格式验证
                        if (!newContactEmail.includes('@')) {
                          setDialogMessage({type: 'error', text: '请输入有效的邮箱地址'});
                          return;
                        }
                        setContactEmailList(prev => [...prev, newContactEmail.trim()]);
                        setNewContactEmail('');
                        setShowAddContactInput(null);
                      }
                    }}
                  >
                    添加
                  </Button>
                  {showAddContactInput === 'email' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowAddContactInput(null);
                        setNewContactEmail('');
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* 提示信息 */}
            {dialogMessage && (
              <div className={`mb-3 p-3 rounded-lg text-sm ${
                dialogMessage.type === 'error' 
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
              }`}>
                {dialogMessage.text}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { 
                setDialogMessage(null);
                setShowContactDialog(false);
              }}>取消</Button>
              <Button className="flex-1" onClick={() => {
                // 保存所有联络方式到extendedFields
                setExtendedFields(prev => {
                  let filtered = prev.filter(f => !['电话', '微信', '邮箱'].includes(f.categoryName));
                  
                  if (contactPhoneList.length > 0) {
                    filtered = [...filtered, { 
                      categoryId: getCategoryId('电话'),
                      categoryName: '电话', 
                      value: contactPhoneList.join(',') 
                    }];
                  }
                  if (contactWechatList.length > 0) {
                    filtered = [...filtered, { 
                      categoryId: getCategoryId('微信'),
                      categoryName: '微信', 
                      value: contactWechatList.join(',') 
                    }];
                  }
                  if (contactEmailList.length > 0) {
                    filtered = [...filtered, { 
                      categoryId: getCategoryId('邮箱'),
                      categoryName: '邮箱', 
                      value: contactEmailList.join(',') 
                    }];
                  }
                  
                  return filtered;
                });
                setDialogMessage({type: 'success', text: '联络方式已保存'});
                setTimeout(() => {
                  setDialogMessage(null);
                  setShowContactDialog(false);
                }, 500);
              }}>保存</Button>
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
              }}>{extendedFields.some(f => f.categoryName === '行业') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedIndustry.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '行业');
                    return [...filtered, { categoryId: getCategoryId('行业'),
                        categoryName: '行业', value: selectedIndustry }];
                  });
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
                      ? 'border-[#1976D2] bg-[#F5F5F5] text-blue-700 font-medium'
                      : 'border-gray-300 hover:bg-[#FAF3ED]'
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
                  ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                  : 'bg-[#E8F5E9] text-green-700 border border-green-200'
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
              }}>{extendedFields.some(f => f.categoryName === '类型') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedTypes.length > 0) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '类型');
                    return [...filtered, { categoryId: getCategoryId('类型'),
                        categoryName: '类型', value: selectedTypes.join(',') }];
                  });
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
              }}>{extendedFields.some(f => f.categoryName === '职业') ? '返回' : '取消'}</Button>
              <Button className="flex-1" onClick={() => {
                if (selectedOccupation.trim()) {
                  setExtendedFields(prev => {
                    const filtered = prev.filter(f => f.categoryName !== '职业');
                    return [...filtered, { categoryId: getCategoryId('职业'),
                        categoryName: '职业', value: selectedOccupation }];
                  });
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
                  {hasValue && (
                    <div className="mb-4">
                      <div className="bg-[#F5F5F5] p-4 rounded-lg border border-blue-200">
                        <div className="text-xs text-gray-500 mb-1">上一次记录</div>
                        <div className="text-2xl font-bold text-[#1976D2] mb-1">{score}</div>
                        <div className="text-sm text-gray-500">保存时间：{timestamp}</div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label className="text-sm text-[#757575] mb-2 block">
                      {hasValue ? '更新芝麻信用分' : '芝麻信用分'}
                    </label>
                    <Input 
                      type="number"
                      value={selectedCredit} 
                      onChange={(e) => setSelectedCredit(e.target.value)} 
                      placeholder="请输入芝麻信用分（350-950）" 
                      min="350"
                      max="950"
                    />
                    {hasValue && (
                      <div className="text-xs text-gray-500 mt-1">💡 输入新的分数将替换上一次的记录</div>
                    )}
                  </div>
                  
                  {/* 提示信息 */}
                  {dialogMessage && (
                    <div className={`mb-3 p-3 rounded-lg text-sm ${
                      dialogMessage.type === 'error' 
                        ? 'bg-[#D32F2F]-light text-[#D32F2F] border border-red-200' 
                        : 'bg-[#E8F5E9] text-green-700 border border-green-200'
                    }`}>
                      {dialogMessage.text}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => {
                      setSelectedCredit('');
                      setDialogMessage(null);
                      setShowCreditDialog(false);
                    }}>{extendedFields.some(f => f.categoryName === '征信') ? '返回' : '取消'}</Button>
                    
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
                          return [...filtered, { categoryId: getCategoryId('征信'),
                        categoryName: '征信', value }];
                        });
                        setShowCreditDialog(false);
                        setSelectedCredit('');
                      }}>确定</Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Toast弹窗 */}
      {showToast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowToast(false);
          }
        }}>
          <div className="bg-white rounded-2xl p-6 max-w-[85%] w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-[#222222]">{toastMessage}</h3>
            </div>
            
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setShowToast(false);
                // 返回详情页
                const targetId = createdContactId || contactId;
                if (targetId) {
                  setLocation(`/parent/contacts/${targetId}`);
                }
              }}
              className="flex-1 py-3 rounded-full text-white"
            >
              返回详情页
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowToast(false);
              }}
              className="flex-1 py-3 rounded-full text-white"
            >
              继续编辑
            </Button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
