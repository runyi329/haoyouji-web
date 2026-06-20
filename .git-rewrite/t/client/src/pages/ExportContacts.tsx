import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type ExportFormat = 'json' | 'excel';

export default function ExportContacts() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'excel'>('json');
  const [exportScope, setExportScope] = useState<'current_user' | 'all_users'>('all_users'); // 默认导出所有用户
  
  // 使用trpc.useContext来手动调用API
  const trpcContext = trpc.useContext();

  const exportToExcel = (data: any) => {
    const wb = XLSX.utils.book_new();
    
    // 工作表1：基础信息
    const basicInfo = data.contacts.map((c: any) => ({
      '姓名': c.name,
      '昵称': c.title || '',
      '性别': c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '',
      '所在地区': c.region || '',
      '创建时间': new Date(c.createdAt).toLocaleString('zh-CN'),
    }));
    const ws1 = XLSX.utils.json_to_sheet(basicInfo);
    XLSX.utils.book_append_sheet(wb, ws1, '基础信息');
    
    // 工作表2：扩展信息
    const extendedInfo: any[] = [];
    data.contacts.forEach((c: any) => {
      c.fieldValues?.forEach((fv: any) => {
        extendedInfo.push({
          '姓名': c.name,
          '字段名': fv.fieldName,
          '字段值': fv.value,
        });
      });
    });
    if (extendedInfo.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(extendedInfo);
      XLSX.utils.book_append_sheet(wb, ws2, '扩展信息');
    }
    
    // 工作表3：标签
    const tagInfo: any[] = [];
    data.contacts.forEach((c: any) => {
      c.tags?.forEach((tag: any) => {
        tagInfo.push({
          '姓名': c.name,
          '标签': tag.name,
          '颜色': tag.color,
        });
      });
    });
    if (tagInfo.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(tagInfo);
      XLSX.utils.book_append_sheet(wb, ws3, '标签');
    }
    
    // 工作表4：联络记录
    const interactions: any[] = [];
    data.contacts.forEach((c: any) => {
      c.interactions?.forEach((i: any) => {
        interactions.push({
          '姓名': c.name,
          '联络日期': new Date(i.interactionDate).toLocaleDateString('zh-CN'),
          '备注': i.notes || '',
        });
      });
    });
    if (interactions.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(interactions);
      XLSX.utils.book_append_sheet(wb, ws4, '联络记录');
    }
    
    // 工作表5：提醒事项
    const reminders: any[] = [];
    data.contacts.forEach((c: any) => {
      c.reminders?.forEach((r: any) => {
        reminders.push({
          '姓名': c.name,
          '提醒内容': r.content,
          '提醒时间': new Date(r.reminderDate).toLocaleString('zh-CN'),
          '是否完成': r.isCompleted ? '是' : '否',
        });
      });
    });
    if (reminders.length > 0) {
      const ws5 = XLSX.utils.json_to_sheet(reminders);
      XLSX.utils.book_append_sheet(wb, ws5, '提醒事项');
    }
    
    // 生成Excel文件
    // 使用writeFile方法直接下载,避免打包后的兼容性问题
    const filename = `contacts_backup_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 手动调用API
      const result = await trpcContext.contacts.exportAll.fetch({ scope: exportScope });
      
      if (result) {
        if (exportFormat === 'json') {
          // 生成JSON文件
          const json = JSON.stringify(result, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          // 创建下载链接
          const a = document.createElement('a');
          a.href = url;
          a.download = `contacts_backup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          // 生成Excel文件
          exportToExcel(result);
        }
        
        toast.success(`导出成功！已导出 ${result.summary.totalContacts} 个人脉的完整数据`);
      }
    } catch (error) {
      toast.error('导出失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>导出人脉数据</CardTitle>
          <CardDescription>
            导出您的所有人脉数据，包括基础信息、扩展信息、标签、联络记录和提醒事项
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium mb-3 block">导出格式</Label>
              <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="json" />
                  <Label htmlFor="json" className="cursor-pointer">
                    JSON（适合备份和程序读取）
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="excel" id="excel" />
                  <Label htmlFor="excel" className="cursor-pointer">
                    Excel（适合查看和分析）
                  </Label>
                </div>              </RadioGroup>
            </div>
            
            <div>
              <Label className="text-base font-medium mb-3 block">导出范围</Label>
              <RadioGroup value={exportScope} onValueChange={(v) => setExportScope(v as 'current_user' | 'all_users')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="current_user" id="current_user" />
                  <Label htmlFor="current_user" className="cursor-pointer">
                    当前用户（只导出我的人脉）
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all_users" id="all_users" />
                  <Label htmlFor="all_users" className="cursor-pointer">
                    所有用户（导出所有注册用户的人脉）
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">导出内容包括：</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>所有人脉的基础信息（姓名、昵称、性别、地区等）</li>
                <li>所有人脉的扩展信息（公司、职位等自定义字段）</li>
                <li>所有标签和标签关系</li>
                <li>所有联络记录</li>
                <li>所有提醒事项</li>
              </ul>
            </div>
          </div>

          <Button 
            onClick={handleExport} 
            disabled={isExporting}
            className="w-full"
            size="lg"
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在导出...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                导出数据
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            {exportFormat === 'json' 
              ? 'JSON格式适合备份和程序读取，可用于迁移到其他系统'
              : 'Excel格式包含多个工作表，方便在Excel中查看和分析'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
