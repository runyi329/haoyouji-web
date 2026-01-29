import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, MessageCircle } from 'lucide-react';

interface FieldCategory {
  id: number;
  name: string;
  icon?: string;
  fieldType: string;
  parentCategoryId?: number;
  children?: FieldCategory[];
}

interface FieldCategorySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FieldCategory[];
  onSelect: (category: FieldCategory, value: string) => void;
  contactName?: string; // 当前人脉的姓名，用于银行卡持卡人
}

export function FieldCategorySelector({
  open,
  onOpenChange,
  categories,
  onSelect,
  contactName = '',
}: FieldCategorySelectorProps) {
  const [selectedMainCategory, setSelectedMainCategory] = useState<FieldCategory | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<FieldCategory | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState(''); // 银行卡号
  const [bankName, setBankName] = useState(''); // 开户行
  
  // 判断是否是银行卡号字段
  const isBankCard = selectedSubCategory?.name.includes('银行卡') || selectedSubCategory?.name.includes('卡号');
  
  // 调试：打印 contactName
  useEffect(() => {
    console.log('FieldCategorySelector contactName:', contactName);
  }, [contactName, open]);

  const handleMainCategoryClick = (category: FieldCategory) => {
    setSelectedMainCategory(category);
    setSelectedSubCategory(null);
    setFieldValue('');
  };

  const handleSubCategoryClick = (category: FieldCategory) => {
    setSelectedSubCategory(category);
    setFieldValue('');
    setBankAccountNumber('');
    setBankName('');
  };

  const handleBack = () => {
    if (selectedSubCategory) {
      setSelectedSubCategory(null);
      setFieldValue('');
      setBankAccountNumber('');
      setBankName('');
    } else if (selectedMainCategory) {
      setSelectedMainCategory(null);
    }
  };

  const handleAdd = (continueAdding: boolean = false) => {
    if (selectedSubCategory) {
      let value = '';
      
      // 如果是银行卡，组合三个字段
      if (isBankCard) {
        if (!bankAccountNumber.trim() || !bankName.trim()) {
          return; // 银行卡号和开户行必填
        }
        // 格式：银行卡号 | 持卡人 | 开户行
        value = `${bankAccountNumber.trim()} | ${contactName} | ${bankName.trim()}`;
      } else {
        if (!fieldValue.trim()) {
          return;
        }
        value = fieldValue.trim();
      }
      
      onSelect(selectedSubCategory, value);
      
      // 如果是连续添加模式，只清空输入框，不关闭对话框
      if (continueAdding) {
        // 只清空输入字段，保持当前选中的分类
        setFieldValue('');
        setBankAccountNumber('');
        setBankName('');
      } else {
        // 完全重置并关闭
        setSelectedMainCategory(null);
        setSelectedSubCategory(null);
        setFieldValue('');
        setBankAccountNumber('');
        setBankName('');
        onOpenChange(false);
      }
    }
  };

  const handleCancel = () => {
    setSelectedMainCategory(null);
    setSelectedSubCategory(null);
    setFieldValue('');
    setBankAccountNumber('');
    setBankName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedSubCategory
              ? `添加${selectedSubCategory.name}`
              : selectedMainCategory
              ? selectedMainCategory.name
              : '添加扩展信息'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 主分类列表 */}
          {!selectedMainCategory && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                从固定类目中选择并添加扩展信息字段
              </p>
              <div className="grid gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleMainCategoryClick(category)}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                  >
                    <span className="flex items-center gap-2 text-base">
                      <span className="text-2xl">{category.icon}</span>
                      <span>{category.name.replace(/^[📍📞💼🎂🌐💳]\s*/, '')}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </div>

              {/* 联系管理员提示 */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-start gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium mb-1">需要新类目？</p>
                  <p>请联系管理员（微信：tina_u）</p>
                </div>
              </div>
            </div>
          )}

          {/* 子分类列表 */}
          {selectedMainCategory && !selectedSubCategory && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                选择具体字段类型
              </p>
              <div className="grid gap-2">
                {selectedMainCategory.children?.map((subCategory) => (
                  <button
                    key={subCategory.id}
                    onClick={() => handleSubCategoryClick(subCategory)}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                  >
                    <span className="text-base">{subCategory.name}</span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 输入字段值 */}
          {selectedSubCategory && (
            <div className="space-y-4">
              {isBankCard ? (
                // 银行卡特殊处理：三个字段
                <>
                  <div className="space-y-2">
                    <Label htmlFor="bankAccountNumber">
                      银行卡号 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bankAccountNumber"
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="请输入银行卡号"
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="cardholderName">
                      持卡人姓名
                    </Label>
                    <Input
                      id="cardholderName"
                      type="text"
                      value={contactName}
                      placeholder={contactName || "请先输入姓名"}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                      持卡人默认为当前人脉本人，不可修改
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="bankName">
                      开户行 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bankName"
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="请输入开户行（如：中国工商银行北京分行）"
                    />
                  </div>
                </>
              ) : (
                // 普通字段
                <div className="space-y-2">
                  <Label htmlFor="fieldValue">
                    {selectedSubCategory.name} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="fieldValue"
                    type={selectedSubCategory.fieldType === 'date' ? 'date' : 'text'}
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    placeholder={`请输入${selectedSubCategory.name}`}
                    autoFocus
                  />
                </div>
              )}

              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  💡 温馨提示
                </p>
                <ul className="text-sm text-blue-800 dark:text-blue-200 mt-1 space-y-1">
                  <li>• 同一类目可以多次添加（如多个公司、多个电话）</li>
                  <li>• 需要新类目？请联系管理员（微信：tina_u）</li>
                </ul>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            {(selectedMainCategory || selectedSubCategory) && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                返回
              </Button>
            )}
            {selectedSubCategory ? (
              isBankCard ? (
                // 银行卡：显示两个按钮
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleAdd(true)}
                    disabled={!bankAccountNumber.trim() || !bankName.trim()}
                    className="flex-1"
                  >
                    添加并继续
                  </Button>
                  <Button
                    onClick={() => handleAdd(false)}
                    disabled={!bankAccountNumber.trim() || !bankName.trim()}
                    className="flex-1"
                  >
                    完成
                  </Button>
                </>
              ) : (
                // 普通字段：只显示一个按钮
                <Button
                  onClick={() => handleAdd(false)}
                  disabled={!fieldValue.trim()}
                  className="flex-1"
                >
                  添加
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                onClick={handleCancel}
                className="flex-1"
              >
                取消
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
