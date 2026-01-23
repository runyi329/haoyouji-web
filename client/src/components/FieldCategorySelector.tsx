import { useState } from 'react';
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
}

export function FieldCategorySelector({
  open,
  onOpenChange,
  categories,
  onSelect,
}: FieldCategorySelectorProps) {
  const [selectedMainCategory, setSelectedMainCategory] = useState<FieldCategory | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<FieldCategory | null>(null);
  const [fieldValue, setFieldValue] = useState('');

  const handleMainCategoryClick = (category: FieldCategory) => {
    setSelectedMainCategory(category);
    setSelectedSubCategory(null);
    setFieldValue('');
  };

  const handleSubCategoryClick = (category: FieldCategory) => {
    setSelectedSubCategory(category);
    setFieldValue('');
  };

  const handleBack = () => {
    if (selectedSubCategory) {
      setSelectedSubCategory(null);
      setFieldValue('');
    } else if (selectedMainCategory) {
      setSelectedMainCategory(null);
    }
  };

  const handleAdd = () => {
    if (selectedSubCategory && fieldValue.trim()) {
      onSelect(selectedSubCategory, fieldValue.trim());
      // 重置状态
      setSelectedMainCategory(null);
      setSelectedSubCategory(null);
      setFieldValue('');
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setSelectedMainCategory(null);
    setSelectedSubCategory(null);
    setFieldValue('');
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
              <Button
                onClick={handleAdd}
                disabled={!fieldValue.trim()}
                className="flex-1"
              >
                添加
              </Button>
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
