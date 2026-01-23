import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import React from "react";

interface CompanyListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: any;
}

export function CompanyListDialog({ open, onOpenChange, contact }: CompanyListDialogProps) {
  // 获取字段分类
  const { data: fieldCategories } = trpc.contacts.fieldCategories.list.useQuery();
  
  // 获取公司字段的 categoryId
  const companyCategoryId = React.useMemo(() => {
    if (!fieldCategories) return null;
    const category = fieldCategories.find(c => c.name === '公司');
    return category?.id || null;
  }, [fieldCategories]);
  
  if (!contact) return null;

  // 获取该联系人的所有公司名称
  const companies = React.useMemo(() => {
    if (!companyCategoryId || !contact.fieldValues) return [];
    return contact.fieldValues.filter((fv: any) => 
      fv.categoryId === companyCategoryId && fv.value && fv.value.trim() !== ''
    );
  }, [companyCategoryId, contact.fieldValues]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span className="text-base font-semibold">{contact.name}</span>
            <span className="text-xs font-normal text-muted-foreground">关联的公司列表</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无公司信息</p>
          ) : (
            <ul className="space-y-2">
              {companies.map((company: any, index: number) => (
                <li
                  key={index}
                  className="text-sm p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {company.value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
