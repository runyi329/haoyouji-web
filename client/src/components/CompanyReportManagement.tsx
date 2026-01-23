import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Loader2, Eye } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { CompanyReportDialog } from '@/components/CompanyReportDialog';
import { CompanyReportIcon } from '@/components/CompanyReportIcon';

interface Company {
  companyName: string;
  contactId: number;
  contactName: string;
  userName: string;
  reportId: number | null;
  reportUpdatedAt: string | null;
  duplicateCount: number;
}

// 上传状态类型
type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

export default function CompanyReportManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCompany, setUploadingCompany] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // 上传相关状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [currentCompany, setCurrentCompany] = useState<string | null>(null);

  // 前端预览相关状态
  const [showFrontendPreview, setShowFrontendPreview] = useState(false);
  const [previewCompanyName, setPreviewCompanyName] = useState<string | null>(null);

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
      setUploadStatus('uploading');
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('companyName', companyName);

      // 模拟上传进度（快速到达 20%）
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 20) {
            clearInterval(progressInterval);
            return 20;
          }
          return prev + 10;
        });
      }, 200);

      // 开始上传，同时切换到分析状态
      setTimeout(() => {
        clearInterval(progressInterval);
        setUploadProgress(30);
        setUploadStatus('analyzing');
        
        // 分析阶段的进度模拟（慢速增长）
        const analyzeInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 85) {
              clearInterval(analyzeInterval);
              return 85;
            }
            return prev + 5;
          });
        }, 1500);
      }, 600);

      // 等待 API 响应（实际 AI 分析在后端进行）
      const response = await fetch('/api/company-reports/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      // API 返回后，进度跳到 100%
      setUploadProgress(100);

      if (result.success) {
        setUploadStatus('success');
        toast.success('报告上传并分析完成！');
        setSelectedFile(null);
        setCurrentCompany(null);
        
        // 立即刷新列表，然后延迟重置状态
        await loadCompanies();
        
        // 保持成功状态 3 秒，让用户看清
        setTimeout(() => {
          setUploadStatus('idle');
          setUploadProgress(0);
        }, 3000);
      } else {
        setUploadStatus('error');
        toast.error(result.error || '上传失败');
        setTimeout(() => {
          setUploadStatus('idle');
          setUploadProgress(0);
        }, 2000);
      }
    } catch (error) {
      console.error('上传错误:', error);
      setUploadStatus('error');
      toast.error('网络错误，请稍后重试');
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 2000);
    } finally {
      setUploadingCompany(null);
    }
  };



  const getUploadStatusText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'PDF 上传中...';
      case 'analyzing':
        return 'DeepSeek AI 分析中...（预计 15-30 秒）';
      case 'success':
        return '✓ 分析完成！';
      case 'error':
        return '✗ 上传失败';
      default:
        return '';
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
                          disabled={uploadingCompany === company.companyName}
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
                            处理中
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-1" />
                            上传
                          </>
                        )}
                      </Button>
                    </div>

                    {/* 上传进度显示 */}
                    {uploadingCompany === company.companyName && (
                      <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-blue-900">{getUploadStatusText()}</span>
                          <span className="text-blue-700">{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                        {uploadStatus === 'analyzing' && (
                          <p className="text-xs text-blue-600">
                            正在提取 PDF 文本并调用 DeepSeek AI 进行分析...
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 查看报告按钮 */}
                  {company.reportId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full bg-blue-50 hover:bg-blue-100 border-blue-200"
                      onClick={() => {
                        setPreviewCompanyName(company.companyName);
                        setShowFrontendPreview(true);
                      }}
                    >
                      <CompanyReportIcon hasReport={true} onClick={() => {}} />
                      <span className="ml-2">查看报告</span>
                    </Button>
                  )}

                  {/* 提示文字 */}
                  {!company.reportId && uploadingCompany !== company.companyName && (
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

      {/* 前端预览弹窗 */}
      {previewCompanyName && (
        <CompanyReportDialog
          open={showFrontendPreview}
          onOpenChange={setShowFrontendPreview}
          companyName={previewCompanyName}
        />
      )}
    </div>
  );
}
