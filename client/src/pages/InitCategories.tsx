import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export default function InitCategories() {
  const [log, setLog] = useState<string[]>([]);
  const utils = trpc.useUtils();
  
  const createCategoryMutation = trpc.contacts.fieldValues.createCategory.useMutation();
  
  const categories = [
    '星座', '生日', '血型', '属相', '年龄', '身高', '鞋码', '民族',
    '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
    '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务',
    '税务', '人事', '公户', '私户',
    '电话', '微信', '邮箱', '地址'
  ];
  
  const handleInit = async () => {
    setLog(['开始初始化字段分类...']);
    
    // 获取现有分类
    const existing = await utils.contacts.fieldValues.categories.fetch();
    const existingNames = new Set();
    
    const collectNames = (cats: any[]) => {
      cats.forEach(cat => {
        existingNames.add(cat.name);
        if (cat.children) {
          collectNames(cat.children);
        }
      });
    };
    collectNames(existing || []);
    
    setLog(prev => [...prev, `现有分类: ${existingNames.size}个`]);
    
    // 创建缺失的分类
    let created = 0;
    for (const name of categories) {
      if (!existingNames.has(name)) {
        try {
          await createCategoryMutation.mutateAsync({
            name,
            icon: '',
            parentCategoryId: null,
          });
          setLog(prev => [...prev, `✓ 创建: ${name}`]);
          created++;
        } catch (error: any) {
          setLog(prev => [...prev, `✗ 失败: ${name} - ${error.message}`]);
        }
      }
    }
    
    setLog(prev => [...prev, `\n完成！新创建 ${created} 个分类`]);
    
    // 刷新分类列表
    await utils.contacts.fieldValues.categories.invalidate();
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">初始化字段分类</h1>
      <Button onClick={handleInit} disabled={createCategoryMutation.isPending}>
        开始初始化
      </Button>
      <div className="mt-4 p-4 bg-gray-100 rounded">
        {log.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
      </div>
    </div>
  );
}
