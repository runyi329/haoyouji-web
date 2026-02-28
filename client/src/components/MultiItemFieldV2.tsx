import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

// 扩展信息字段值
interface ExtendedFieldValue {
  id?: number;
  categoryId: number;
  categoryName: string;
  value: string;
  _deleted?: boolean; // 标记为待删除
}

// ==================== 本地规则解析函数 ====================

/**
 * 解析快递地址文本（纯正则，无需AI）
 * 支持多种格式：
 *   "张三 13800138000 广东省深圳市南山区xx路xx号"  （姓名在前）
 *   "广东省深圳市南山区xx路xx号 张三 13800138000"  （姓名在中间）
 *   "上海市静安区长兴路168弄4号2101室胡永煜\n13127919173"  （姓名在地址末尾）
 *   "收件人：张三  手机：13800138000  地址：广东省..."  （带标签）
 */
function parseAddressText(text: string): { name: string; phone: string; address: string } {
  const raw = text.trim();

  // 1. 提取手机号（11位，1[3-9]开头）
  const phoneMatch = raw.match(/(?<![0-9])1[3-9]\d{9}(?![0-9])/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // 去除手机号后的剩余文本，统一分隔符（换行也转为空格）
  let rest = raw.replace(phone, '').replace(/[，,、；;|｜\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 2. 去除常见标签词
  rest = rest.replace(/收件人[：:]\s*/g, '').replace(/姓名[：:]\s*/g, '')
             .replace(/手机[：:]\s*/g, '').replace(/电话[：:]\s*/g, '')
             .replace(/地址[：:]\s*/g, '').replace(/详细地址[：:]\s*/g, '').trim();

  let name = '';
  let address = '';

  // 3. 策略a：地址终止词（室/号/层/楼/单元/栋/幢）后紧跟2-6个汉字 → 姓名在地址末尾
  const endPattern = /[室号层楼单元栋幢]([\u4e00-\u9fa5]{2,6})\s*$/;
  const endMatch = rest.match(endPattern);

  if (endMatch) {
    name = endMatch[1];
    address = rest.slice(0, rest.lastIndexOf(endMatch[1])).trim();
  } else {
    // 策略b：按空格分割，地址关键词前的短文本是姓名
    const parts = rest.split(/\s+/).filter(Boolean);
    const addrKeyword = /[省市区县路街巷弄号楼室栋幢]/;
    let addrStartIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      if (addrKeyword.test(parts[i]) && parts[i].length > 1) { addrStartIdx = i; break; }
    }

    if (addrStartIdx > 0) {
      const beforeAddr = parts.slice(0, addrStartIdx).join('');
      if (beforeAddr.length >= 2 && beforeAddr.length <= 8 && /[\u4e00-\u9fa5]/.test(beforeAddr)) {
        name = beforeAddr;
        address = parts.slice(addrStartIdx).join('');
      } else {
        address = rest;
      }
    } else if (addrStartIdx === 0) {
      address = parts.join('');
      // 再次尝试地址末尾姓名（有空格分隔的情况）
      const trailMatch = address.match(/[室号层楼单元栋幢]([\u4e00-\u9fa5]{2,6})$/);
      if (trailMatch) {
        name = trailMatch[1];
        address = address.slice(0, address.lastIndexOf(trailMatch[1])).trim();
      }
    } else {
      // 没有地址关键词，按长度区分：短的是姓名，长的是地址
      if (parts.length >= 2) {
        const sorted = [...parts].sort((a, b) => a.length - b.length);
        const nc = sorted.filter(p => p.length >= 2 && p.length <= 8 && /[\u4e00-\u9fa5]/.test(p));
        if (nc.length > 0) { name = nc[0]; address = parts.filter(p => p !== nc[0]).join(''); }
        else { address = rest; }
      } else {
        address = rest;
      }
    }
  }

  // 4. 清理姓名中的多余字符
  name = name.replace(/[^\u4e00-\u9fa5a-zA-Z·•]/g, '').trim();

  return { name, phone, address: address.trim() };
}

/** 从文本中提取人名（2-8个汉字/字母） */
function extractName(text: string): string {
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z·•]/g, '').trim();
  // 人名通常2-6个字
  if (cleaned.length >= 2 && cleaned.length <= 8) return cleaned;
  // 尝试提取汉字序列
  const match = cleaned.match(/[\u4e00-\u9fa5·]{2,6}/);
  return match ? match[0] : cleaned.slice(0, 6);
}

/**
 * 解析银行账号文本（纯正则，无需AI）
 * 支持格式：
 *   "户名：张三  开户行：中国工商银行深圳南山支行  账号：6222021234567890"
 *   "张三 工商银行 6222021234567890"
 *   "6222021234567890 张三 工商银行深圳支行"
 */
function parseBankText(text: string): { accountName: string; bankName: string; accountNumber: string } {
  const raw = text.trim();

  // 1. 提取银行账号（15-19位数字，可能有空格分隔）
  const accountWithSpaces = raw.match(/\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4,7})\b/);
  let accountNumber = '';
  if (accountWithSpaces) {
    accountNumber = accountWithSpaces[1].replace(/[\s\-]/g, '');
  } else {
    const directMatch = raw.match(/(?<![0-9])\d{15,19}(?![0-9])/);
    accountNumber = directMatch ? directMatch[0] : '';
  }

  // 去除账号后的剩余文本
  let rest = raw.replace(accountWithSpaces ? accountWithSpaces[0] : accountNumber, '')
               .replace(/[，,、；;|｜\t\n]+/g, ' ')
               .replace(/\s+/g, ' ').trim();

  // 2. 去除常见标签词
  rest = rest.replace(/账户名[：:]\s*/g, '').replace(/户名[：:]\s*/g, '')
             .replace(/账户[：:]\s*/g, '').replace(/姓名[：:]\s*/g, '')
             .replace(/收款人[：:]\s*/g, '').replace(/开户行[：:]\s*/g, '')
             .replace(/开户银行[：:]\s*/g, '').replace(/行名[：:]\s*/g, '')
             .replace(/银行[：:]\s*/g, '').replace(/账号[：:]\s*/g, '')
             .replace(/卡号[：:]\s*/g, '').trim();

  // 3. 核心策略：先处理"银行词+账户名"无空格的情况
  //    如"工商银行胡永煜" → 工商银行 + 胡永煜
  const bankKeywords = /银行|信用社|农商行|农信社|邮储|建行|工行|农行|中行|交行|招行|浦发|民生|光大|华夏|广发|兴业|平安|中信|浙商|渤海|恒丰|徽商/;

  let bankName = '';
  let accountName = '';

  // 策略a：检查是否是"银行词+账户名"无空格的格式
  // 匹配：银行关键词 + 2-4个汉字（末尾）
  const bankWithNameMatch = rest.match(/^(.*?)(银行|信用社|农商行|农信社|邮储|建行|工行|农行|中行|交行|招行|浦发|民生|光大|华夏|广发|兴业|平安|中信|浙商|渤海|恒丰|徽商)([\u4e00-\u9fa5]{2,4})(.*)$/);

  if (bankWithNameMatch) {
    // 无空格场景：银行词 + 账户名
    const prefix = bankWithNameMatch[1];
    const bankKeyword = bankWithNameMatch[2];
    const nameAfterBank = bankWithNameMatch[3];
    const suffix = bankWithNameMatch[4];

    // 组合银行名
    bankName = (prefix + bankKeyword).trim();
    accountName = nameAfterBank;

    // 如果suffix还有内容，可能是额外的银行名信息
    if (suffix.trim()) {
      bankName = bankName + suffix;
    }
  } else {
    // 策略b：有空格分隔的情况
    const parts = rest.split(/\s+/).filter(Boolean);

    const bankParts = parts.filter(p => bankKeywords.test(p));
    const nonBankParts = parts.filter(p => !bankKeywords.test(p));

    if (bankParts.length > 0) {
      bankName = bankParts.join('');
      const shortNameParts = nonBankParts.filter(p => p.length >= 2 && p.length <= 4 && /[\u4e00-\u9fa5]/.test(p));
      if (shortNameParts.length > 0) {
        accountName = shortNameParts[0];
      } else {
        accountName = nonBankParts[0] || '';
      }
    } else {
      if (parts.length >= 2) {
        const sorted = [...parts].sort((a, b) => a.length - b.length);
        const nameCandidates = sorted.filter(p => p.length >= 2 && p.length <= 4 && /[\u4e00-\u9fa5]/.test(p));
        if (nameCandidates.length > 0) {
          accountName = nameCandidates[0];
          bankName = parts.filter(p => p !== accountName).join('');
        } else {
          accountName = parts[0];
          bankName = parts.slice(1).join('');
        }
      } else {
        accountName = parts[0] || '';
      }
    }
  }

  // 4. 清理账户名和银行名
  accountName = accountName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9·•]/g, '').trim();
  bankName = bankName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9·•]/g, '').trim();

  return {
    accountName,
    bankName,
    accountNumber,
  };
}

// ==================== 组件 ====================

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
  
  // 获取当前类别的所有条目（排除已标记删除的）
  const items = extendedFields.filter(f => f.categoryName === categoryName && !f._deleted);
  
  // 添加新条目
  const handleAdd = () => {
    if (!newValue.trim()) return;
    const trimmedValue = newValue.trim();
    
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName && !f._deleted) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) {
            return { ...f, value: trimmedValue };
          }
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, {
        categoryId: getCategoryId(categoryName),
        categoryName,
        value: trimmedValue
      }]);
    }
    
    setNewValue('');
  };
  
  const handleEdit = (index: number) => {
    const item = items[index];
    setNewValue(item.value);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  const handleCancelEdit = () => {
    setNewValue('');
    setEditingId(null);
  };
  
  const handleDelete = (index: number) => {
    const item = items[index];
    if (item.id) {
      setExtendedFields(prev => prev.map(f => f === item ? { ...f, _deleted: true } : f));
    } else {
      setExtendedFields(prev => prev.filter(f => f !== item));
    }
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) handleCancelEdit();
  };
  
  const isEditing = (index: number) => {
    const item = items[index];
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    return editingId === itemId;
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id || `temp_${index}`} className={`flex items-center gap-2 p-2 rounded-md border ${isEditing(index) ? 'bg-[#F5F5F5] border-blue-300' : 'bg-gray-50 border-transparent'}`}>
              <span className="flex-1 text-sm">{item.value}</span>
              <button type="button" onClick={() => handleEdit(index)} className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded" title="编辑">
                <Pencil className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => handleDelete(index)} className="p-1 text-[#D32F2F] hover:bg-[#FFEBEE] rounded" title="删除">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
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
            <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">保存</Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>取消</Button>
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
  const [recognizeText, setRecognizeText] = useState('');

  const items = extendedFields.filter(f => f.categoryName === categoryName && !f._deleted);
  
  const parseAddress = (value: string): {name: string, phone: string, address: string} => {
    try { return JSON.parse(value); } catch { return { name: '', phone: '', address: value }; }
  };

  // 本地规则解析（无需AI，即时响应）
  const handleRecognize = () => {
    if (!recognizeText.trim()) {
      toast.error('请先粘贴收件人信息');
      return;
    }
    const result = parseAddressText(recognizeText.trim());
    setNewName(result.name);
    setNewPhone(result.phone);
    setNewAddress(result.address);
    setRecognizeText('');
    if (!result.name && !result.phone && !result.address) {
      toast.error('未能识别出有效信息，请手动填写');
    } else {
      toast.success('识别完成，请确认后点击 + 保存');
    }
  };
  
  const handleAdd = () => {
    if (!newName.trim() && !newPhone.trim() && !newAddress.trim()) return;
    const newItem = { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() };
    const valueStr = JSON.stringify(newItem);
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName && !f._deleted) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) return { ...f, value: valueStr };
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, { categoryId: getCategoryId(categoryName), categoryName, value: valueStr }]);
    }
    setNewName(''); setNewPhone(''); setNewAddress('');
  };
  
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseAddress(item.value);
    setNewName(parsed.name); setNewPhone(parsed.phone); setNewAddress(parsed.address);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  const handleCancelEdit = () => { setNewName(''); setNewPhone(''); setNewAddress(''); setEditingId(null); };
  
  const handleDelete = (index: number) => {
    const item = items[index];
    if (item.id) {
      setExtendedFields(prev => prev.map(f => f === item ? { ...f, _deleted: true } : f));
    } else {
      setExtendedFields(prev => prev.filter(f => f !== item));
    }
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) handleCancelEdit();
  };
  
  const isEditing = (index: number) => {
    const item = items[index];
    return editingId === (item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseAddress(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-[#F5F5F5] border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">收件人：</span>{parsed.name}</div>
                    <div><span className="text-gray-500">电话：</span>{parsed.phone}</div>
                    <div><span className="text-gray-500">地址：</span>{parsed.address}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleEdit(index)} className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded" title="编辑"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleDelete(index)} className="p-1 text-[#D32F2F] hover:bg-[#FFEBEE] rounded" title="删除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* 粘贴并识别区域 */}
      <div className="relative">
        <textarea
          className="w-full min-h-[60px] px-3 py-2 pr-20 border border-dashed border-gray-300 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white resize-none placeholder:text-gray-400"
          placeholder="粘贴收件人信息，自动识别姓名、电话、地址…"
          value={recognizeText}
          onChange={(e) => setRecognizeText(e.target.value)}
        />
        <button
          type="button"
          onClick={handleRecognize}
          disabled={!recognizeText.trim()}
          className="absolute bottom-3 right-1.5 px-1.5 py-0.5 bg-[#E53935] text-white text-xs font-medium rounded-full shadow-sm hover:bg-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          粘贴识别
        </button>
      </div>
      {/* 输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="收件人" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input className="flex-1" placeholder="收件电话" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="详细地址" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">保存</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>取消</Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}><Plus className="w-4 h-4" /></Button>
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
  const [recognizeText, setRecognizeText] = useState('');

  const items = extendedFields.filter(f => f.categoryName === categoryName && !f._deleted);
  
  const parseBank = (value: string): {accountName: string, bankName: string, accountNumber: string} => {
    try { return JSON.parse(value); } catch { return { accountName: '', bankName: '', accountNumber: value }; }
  };

  // 本地规则解析（无需AI，即时响应）
  const handleRecognize = () => {
    if (!recognizeText.trim()) {
      toast.error('请先粘贴银行账号信息');
      return;
    }
    const result = parseBankText(recognizeText.trim());
    setNewAccountName(result.accountName);
    setNewBankName(result.bankName);
    setNewAccountNumber(result.accountNumber);
    setRecognizeText('');
    if (!result.accountName && !result.bankName && !result.accountNumber) {
      toast.error('未能识别出有效信息，请手动填写');
    } else {
      toast.success('识别完成，请确认后点击 + 保存');
    }
  };
  
  const handleAdd = () => {
    if (!newAccountName.trim() && !newBankName.trim() && !newAccountNumber.trim()) return;
    const newItem = { accountName: newAccountName.trim(), bankName: newBankName.trim(), accountNumber: newAccountNumber.trim() };
    const valueStr = JSON.stringify(newItem);
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName && !f._deleted) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) return { ...f, value: valueStr };
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, { categoryId: getCategoryId(categoryName), categoryName, value: valueStr }]);
    }
    setNewAccountName(''); setNewBankName(''); setNewAccountNumber('');
  };
  
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseBank(item.value);
    setNewAccountName(parsed.accountName); setNewBankName(parsed.bankName); setNewAccountNumber(parsed.accountNumber);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  const handleCancelEdit = () => { setNewAccountName(''); setNewBankName(''); setNewAccountNumber(''); setEditingId(null); };
  
  const handleDelete = (index: number) => {
    const item = items[index];
    if (item.id) {
      setExtendedFields(prev => prev.map(f => f === item ? { ...f, _deleted: true } : f));
    } else {
      setExtendedFields(prev => prev.filter(f => f !== item));
    }
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) handleCancelEdit();
  };
  
  const isEditing = (index: number) => {
    const item = items[index];
    return editingId === (item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseBank(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-[#F5F5F5] border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">账户名：</span>{parsed.accountName}</div>
                    <div><span className="text-gray-500">开户行：</span>{parsed.bankName}</div>
                    <div><span className="text-gray-500">账号：</span>{parsed.accountNumber}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleEdit(index)} className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded" title="编辑"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleDelete(index)} className="p-1 text-[#D32F2F] hover:bg-[#FFEBEE] rounded" title="删除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* 粘贴并识别区域 */}
      <div className="relative">
        <textarea
          className="w-full min-h-[60px] px-3 py-2 pr-20 border border-dashed border-gray-300 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white resize-none placeholder:text-gray-400"
          placeholder="粘贴银行账号信息，自动识别账户名、开户行、账号…"
          value={recognizeText}
          onChange={(e) => setRecognizeText(e.target.value)}
        />
        <button
          type="button"
          onClick={handleRecognize}
          disabled={!recognizeText.trim()}
          className="absolute bottom-3 right-1.5 px-1.5 py-0.5 bg-[#E53935] text-white text-xs font-medium rounded-full shadow-sm hover:bg-[#C62828] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          粘贴识别
        </button>
      </div>
      {/* 输入区 */}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="账户名" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
          <Input className="flex-1" placeholder="开户行" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="银行账号" value={newAccountNumber} onChange={(e) => setNewAccountNumber(e.target.value)} />
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">保存</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>取消</Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}><Plus className="w-4 h-4" /></Button>
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
  
  const items = extendedFields.filter(f => f.categoryName === categoryName && !f._deleted);
  
  const parseInvoice = (value: string): {companyName: string, taxNumber: string} => {
    try { return JSON.parse(value); } catch { return { companyName: value, taxNumber: '' }; }
  };
  
  const handleAdd = () => {
    if (!newCompanyName.trim() && !newTaxNumber.trim()) return;
    const newItem = { companyName: newCompanyName.trim(), taxNumber: newTaxNumber.trim() };
    const valueStr = JSON.stringify(newItem);
    if (editingId !== null) {
      setExtendedFields(prev => prev.map(f => {
        if (f.categoryName === categoryName && !f._deleted) {
          const itemId = f.id || `temp_${prev.indexOf(f)}`;
          if (itemId === editingId || `temp_${prev.indexOf(f)}` === editingId) return { ...f, value: valueStr };
        }
        return f;
      }));
      setEditingId(null);
    } else {
      setExtendedFields(prev => [...prev, { categoryId: getCategoryId(categoryName), categoryName, value: valueStr }]);
    }
    setNewCompanyName(''); setNewTaxNumber('');
  };
  
  const handleEdit = (index: number) => {
    const item = items[index];
    const parsed = parseInvoice(item.value);
    setNewCompanyName(parsed.companyName); setNewTaxNumber(parsed.taxNumber);
    setEditingId(item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  const handleCancelEdit = () => { setNewCompanyName(''); setNewTaxNumber(''); setEditingId(null); };
  
  const handleDelete = (index: number) => {
    const item = items[index];
    if (item.id) {
      setExtendedFields(prev => prev.map(f => f === item ? { ...f, _deleted: true } : f));
    } else {
      setExtendedFields(prev => prev.filter(f => f !== item));
    }
    const itemId = item.id || `temp_${extendedFields.indexOf(item)}`;
    if (editingId === itemId) handleCancelEdit();
  };
  
  const isEditing = (index: number) => {
    const item = items[index];
    return editingId === (item.id || `temp_${extendedFields.indexOf(item)}`);
  };
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => {
            const parsed = parseInvoice(item.value);
            return (
              <div key={item.id || `temp_${index}`} className={`p-3 rounded-md border ${isEditing(index) ? 'bg-[#F5F5F5] border-blue-300' : 'bg-gray-50 border-transparent'}`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-sm flex-1">
                    <div><span className="text-gray-500">公司名称：</span>{parsed.companyName}</div>
                    <div><span className="text-gray-500">税号：</span>{parsed.taxNumber}</div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleEdit(index)} className="p-1 text-[#1976D2] hover:bg-[#F5F5F5] rounded" title="编辑"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleDelete(index)} className="p-1 text-[#D32F2F] hover:bg-[#FFEBEE] rounded" title="删除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="p-3 border rounded-md space-y-2 bg-white">
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="公司名称" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} />
          <Input className="flex-1" placeholder="税号" value={newTaxNumber} onChange={(e) => setNewTaxNumber(e.target.value)} />
        </div>
        <div className="justify-end gap-2 flex">
          {editingId !== null ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="text-[#1976D2]">保存</Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>取消</Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={handleAdd}><Plus className="w-4 h-4" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
