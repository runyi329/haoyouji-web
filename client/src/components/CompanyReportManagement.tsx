import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Upload, Link as LinkIcon, Eye, Loader2, FileText, CheckCircle } from 'lucide-react';

interface Company {
  companyName: string;
  contactId: number;
  contactName: string;
  userName: string;
  reportId: number | null;
  reportUpdatedAt: string | null;
  duplicateCount: number;
}

export default function CompanyReportManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCompany, setUploadingCompany] = useState<string | null>(null);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  
  // 上传相关状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [currentCompany, setCurrentCompany] = useState<string | null>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/company-reports/companies');
      const result = await response.json();
      
      if (result.success) {
        setCompanies(result.data);
      } else {
        toast.error(result.error || '加载公司列表失败');
      }
    } catch (error) {
      console.error('加载公司列表错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrompt = async () => {
    try {
      setIsLoadingPrompt(true);
      const response = await fetch('/api/company-reports/prompt');
      const result = await response.json();
      
      if (result.success) {
        setPrompt(result.data.prompt);
      } else {
        toast.error(result.error || '加载提示词失败');
      }
    } catch (error) {
      console.error('加载提示词错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const savePrompt = async () => {
    try {
      setIsSavingPrompt(true);
      const response = await fetch('/api/company-reports/prompt', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      const result = await response.json();
      
      if (result.success) {
        toast.success('提示词已更新');
        setShowPromptDialog(false);
      } else {
        toast.error(result.error || '更新提示词失败');
      }
    } catch (error) {
      console.error('更新提示词错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleFileUpload = async (companyName: string) => {
    if (!selectedFile) {
      toast.error('请选择 PDF 文件');
      return;
    }

    try {
      setUploadingCompany(companyName);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('companyName', companyName);

      const response = await fetch('/api/company-reports/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      
      if (result.success) {
        toast.success('报告上传成功！');
        setSelectedFile(null);
        setCurrentCompany(null);
        loadCompanies();
      } else {
        toast.error(result.error || '上传失败');
      }
    } catch (error) {
      console.error('上传错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setUploadingCompany(null);
    }
  };

  const handleViewReport = async (companyName: string) => {
    try {
      setViewingReport(companyName);
      const response = await fetch(`/api/company-reports/${encodeURIComponent(companyName)}`);
      const result = await response.json();
      
      if (result.success) {
        setReportData(result.data);
        setShowReportDialog(true);
      } else {
        toast.error(result.error || '查看报告失败');
      }
    } catch (error) {
      console.error('查看报告错误:', error);
      toast.error('网络错误，请稍后重试');
    } finally {
      setViewingReport(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">公司列表</h3>
          <p className="text-sm text-muted-foreground">
            共 {companies.length} 家公司
          </p>
        </div>
        <Dialog open={showPromptDialog} onOpenChange={(open) => {
          setShowPromptDialog(open);
          if (open) loadPrompt();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye className="w-4 h-4 mr-2" />
              查看提示词
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>DeepSeek 提示词</DialogTitle>
            </DialogHeader>
            {isLoadingPrompt ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>提示词内容</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={20}
                    className="font-mono text-sm mt-2"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={savePrompt}
                    disabled={isSavingPrompt}
                    className="flex-1"
                  >
                    {isSavingPrompt ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      '保存'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowPromptDialog(false)}
                    className="flex-1"
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* 公司列表 */}
      {companies.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无公司数据</p>
            <p className="text-sm mt-2">请先在联系人中添加公司名称</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company, index) => (
            <Card key={`${company.contactId}-${index}`} className={company.duplicateCount > 1 ? 'border-amber-200 bg-amber-50/30' : ''}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* 公司信息 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{company.companyName}</h4>
                        {company.duplicateCount > 1 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            ⚠️ 重复 (共 {company.duplicateCount} 条)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        联系人：{company.contactName} · 填写人：{company.userName}
                      </p>
                      {company.reportId && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ 已上传报告（所有同名公司共享）
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 上传区域 */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedFile(file);
                              setCurrentCompany(company.companyName);
                            }
                          }}
                          className="text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleFileUpload(company.companyName)}
                        disabled={uploadingCompany === company.companyName || !selectedFile || currentCompany !== company.companyName}
                      >
                        {uploadingCompany === company.companyName ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            上传中
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-1" />
                            上传
                          </>
                        )}
                      </Button>
                    </div>

                    {/* URL 输入（暂时隐藏，后续实现） */}
                    {/* <div className="flex gap-2">
                      <Input
                        placeholder="或输入企查查报告 URL"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="flex-1 text-sm"
                      />
                      <Button size="sm" variant="outline">
                        <LinkIcon className="w-4 h-4 mr-1" />
                        导入
                      </Button>
                    </div> */}
                  </div>

                  {/* 查看报告按钮 */}
                  {company.reportId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full bg-green-50 hover:bg-green-100 border-green-200"
                      onClick={() => handleViewReport(company.companyName)}
                      disabled={viewingReport === company.companyName}
                    >
                      {viewingReport === company.companyName ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          加载中...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                          查看 AI 分析结果
                        </>
                      )}
                    </Button>
                  )}

                  {/* 提示文字 */}
                  {!company.reportId && (
                    <p className="text-xs text-muted-foreground text-center">
                      上传 PDF 后将自动调用 DeepSeek AI 分析
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 报告查看弹窗 */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 分析结果</DialogTitle>
          </DialogHeader>
          {reportData && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">公司名称</h4>
                <p>{reportData.companyName}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">AI 格式化结果</h4>
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {reportData.formattedContent}
                </pre>
              </div>
              <div className="text-xs text-muted-foreground">
                最后更新：{new Date(reportData.updatedAt).toLocaleString('zh-CN')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
