import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Pencil } from "lucide-react";

// 扩展信息字段值
interface ExtendedFieldValue {
  id?: number;
  categoryId: number;
  categoryName: string;
  value: string;
}

// 多条目字段组件V2（每个条目单独存储为一条记录）
export function MultiItemFieldV2({
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
  const [editingId, setEditingId] = useState<number | string | null>(null);
  
  // 获取当前类别的所有条目（每个条目是一条独立记录）
  const items = extendedFields.filter(f => f.categoryName === categoryName);
  
  // 添加新条目
  const handleAdd = () => {
    if (!newValue.trim()) return;
    const trimmedValue = newValue.trim();
    
    if (editingId !== null) {
      // 编辑模式：更新指定条目
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName) {
          // 通过id或临时标识匹配
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) {
            return { ...f, value: trimmedValue };
          }
        }
        return f;
      }));
      setEditingId(null);
    } else {
      // 添加模式：添加新条目（作为新的独立记录）
      setExtendedFields(prev => [...prev, {
        categoryId: getCategoryId(categoryName),
        categoryName,
        value: trimmedValue
      }]);
    }
    
    setNewValue('');
  };
  
  // 编辑条目
  const handleEdit = (index: number) => {
    const item = items[index];
    setNewValue(item.value);
    // 使用id或临时标识
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewValue('');
    setEditingId(null);
  };
  
  // 删除条目
  const handleDelete = (index: number) => {
    const item = items[index];
    setExtendedFields(prev => prev.filter(f => f !== item));
    
    // 如果删除的是正在编辑的条目，取消编辑状态
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) {
      handleCancelEdit();
    }
  };
  
  // 检查当前是否正在编辑某个条目
  const isEditing = (index: number) => {
    const item = items[index];
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    return editingId === itemId;
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的条目列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id || `temp_${index}`} className={`flex items-center gap-2 p-2 rounded-md border ${isEditing(index) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent'}`}>
              <span className="flex-1 text-sm">{item.value}</span>
              <button
                type="button"
                onClick={() => handleEdit(index)}
                className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                title="编辑"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
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
            placeholder={editingId !== null ? '编辑中...' : placeholder}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
        ) : (
          <Input
            className="flex-1"
            placeholder={editingId !== null ? '编辑中...' : placeholder}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          />
        )}
        {editingId !== null ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-blue-600">
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

// 多地址字段组件V2（每个地址单独存储为一条记录）
export function MultiAddressFieldV2({
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
  const [editingId, setEditingId] = useState<number | string | null>(null);
  
  // 获取当前类别的所有地址（每个地址是一条独立记录）
  const items = extendedFields.filter(f => f.categoryName === categoryName);
  
  // 解析地址值
  const parseAddress = (value: string): {name: string, phone: string, address: string} => {
    try {
      return JSON.parse(value);
    } catch {
      return { name: '', phone: '', address: value };
    }
  };
  
  // 添加新地址或保存编辑
  const handleAdd = () => {
    if (!newName.trim() && !newPhone.trim() && !newAddress.trim()) return;
    const newItem = { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() };
    const valueStr = JSON.stringify(newItem);
    
    if (editingId !== null) {
      // 编辑模式：更新指定条目
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) {
            return { ...f, value: valueStr };
          }
        }
        return f;
      }));
      setEditingId(null);
    } else {
      // 添加模式：添加新条目（作为新的独立记录）
      setExtendedFields(prev => [...prev, {
        categoryId: getCategoryId(categoryName),
        categoryName,
        value: valueStr
      }]);
    }
    
    setNewName('');
    setNewPhone('');
    setNewAddress('');
  };
  
  // 编辑地址
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseAddress(item.value);
    setNewName(parsed.name);
    setNewPhone(parsed.phone);
    setNewAddress(parsed.address);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewName('');
    setNewPhone('');
    setNewAddress('');
    setEditingId(null);
  };
  
  // 删除地址
  const handleDelete = (index: number) => {
    const item = items[index];
    setExtendedFields(prev => prev.filter(f => f !== item));
    
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) {
      handleCancelEdit();
    }
  };
  
  // 检查当前是否正在编辑某个条目
  const isEditing = (index: number) => {
    const item = items[index];
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    return editingId === itemId;
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的地址列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseAddress(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">收件人：</span>{parsed.name}</div>
                    <div><span className="text-gray-500">电话：</span>{parsed.phone}</div>
                    <div><span className="text-gray-500">地址：</span>{parsed.address}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                      title="编辑"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-blue-600">
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

// 多银行账号字段组件V2（每个账号单独存储为一条记录）
export function MultiBankFieldV2({
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
  const [editingId, setEditingId] = useState<number | string | null>(null);
  
  // 获取当前类别的所有银行账号
  const items = extendedFields.filter(f => f.categoryName === categoryName);
  
  // 解析银行账号值
  const parseBank = (value: string): {accountName: string, bankName: string, accountNumber: string} => {
    try {
      return JSON.parse(value);
    } catch {
      return { accountName: '', bankName: '', accountNumber: value };
    }
  };
  
  // 添加新银行账号或保存编辑
  const handleAdd = () => {
    if (!newAccountName.trim() && !newBankName.trim() && !newAccountNumber.trim()) return;
    const newItem = { accountName: newAccountName.trim(), bankName: newBankName.trim(), accountNumber: newAccountNumber.trim() };
    const valueStr = JSON.stringify(newItem);
    
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) {
            return { ...f, value: valueStr };
          }
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, {
        categoryId: getCategoryId(categoryName),
        categoryName,
        value: valueStr
      }]);
    }
    
    setNewAccountName('');
    setNewBankName('');
    setNewAccountNumber('');
  };
  
  // 编辑银行账号
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseBank(item.value);
    setNewAccountName(parsed.accountName);
    setNewBankName(parsed.bankName);
    setNewAccountNumber(parsed.accountNumber);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewAccountName('');
    setNewBankName('');
    setNewAccountNumber('');
    setEditingId(null);
  };
  
  // 删除银行账号
  const handleDelete = (index: number) => {
    const item = items[index];
    setExtendedFields(prev => prev.filter(f => f !== item));
    
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) {
      handleCancelEdit();
    }
  };
  
  // 检查当前是否正在编辑某个条目
  const isEditing = (index: number) => {
    const item = items[index];
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    return editingId === itemId;
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的银行账号列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseBank(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">账户名：</span>{parsed.accountName}</div>
                    <div><span className="text-gray-500">开户行：</span>{parsed.bankName}</div>
                    <div><span className="text-gray-500">账号：</span>{parsed.accountNumber}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                      title="编辑"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-blue-600">
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

// 多开票信息字段组件V2（每个开票信息单独存储为一条记录）
export function MultiInvoiceFieldV2({
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
  const [editingId, setEditingId] = useState<number | string | null>(null);
  
  // 获取当前类别的所有开票信息
  const items = extendedFields.filter(f => f.categoryName === categoryName);
  
  // 解析开票信息值
  const parseInvoice = (value: string): {companyName: string, taxNumber: string} => {
    try {
      return JSON.parse(value);
    } catch {
      return { companyName: value, taxNumber: '' };
    }
  };
  
  // 添加新开票信息或保存编辑
  const handleAdd = () => {
    if (!newCompanyName.trim() && !newTaxNumber.trim()) return;
    const newItem = { companyName: newCompanyName.trim(), taxNumber: newTaxNumber.trim() };
    const valueStr = JSON.stringify(newItem);
    
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) {
            return { ...f, value: valueStr };
          }
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, {
        categoryId: getCategoryId(categoryName),
        categoryName,
        value: valueStr
      }]);
    }
    
    setNewCompanyName('');
    setNewTaxNumber('');
  };
  
  // 编辑开票信息
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseInvoice(item.value);
    setNewCompanyName(parsed.companyName);
    setNewTaxNumber(parsed.taxNumber);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  // 取消编辑
  const handleCancelEdit = () => {
    setNewCompanyName('');
    setNewTaxNumber('');
    setEditingId(null);
  };
  
  // 删除开票信息
  const handleDelete = (index: number) => {
    const item = items[index];
    setExtendedFields(prev => prev.filter(f => f !== item));
    
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) {
      handleCancelEdit();
    }
  };
  
  // 检查当前是否正在编辑某个条目
  const isEditing = (index: number) => {
    const item = items[index];
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    return editingId === itemId;
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {/* 已保存的开票信息列表 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseInvoice(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">公司名称：</span>{parsed.companyName}</div>
                    <div><span className="text-gray-500">税号：</span>{parsed.taxNumber}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                      title="编辑"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* 添加/编辑输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="公司名称" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} />
          <Input className="flex-1" placeholder="税号" value={newTaxNumber} onChange={(e) => setNewTaxNumber(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-blue-600">
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
