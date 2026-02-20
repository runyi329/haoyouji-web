import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface ReimbursementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 自动填充的数据
  transactionDate?: string;
  transactionCategory?: string;
  transactionSubcategory?: string;
  transactionAmount?: number;
  transactionDescription?: string;
  transactionType?: string;
  // 提交回调
  onSubmit: (data: {
    content: string;
    amount: number;
    receiptCount: number;
    notes: string;
    voucherImage?: string;
  }) => void;
  isPending?: boolean;
}

export default function ReimbursementForm({
  open,
  onOpenChange,
  transactionDate,
  transactionCategory,
  transactionSubcategory,
  transactionAmount,
  transactionDescription,
  transactionType,
  onSubmit,
  isPending,
}: ReimbursementFormProps) {
  // 表单状态
  const [content, setContent] = useState(
    `${transactionCategory || ''}${transactionSubcategory ? '–' + transactionSubcategory : ''}${transactionDescription ? '（' + transactionDescription + '）' : ''}`
  );
  const [amount, setAmount] = useState(transactionAmount?.toString() || '');
  const [receiptCount, setReceiptCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [voucherImage, setVoucherImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 重置表单
  const resetForm = () => {
    setContent(
      `${transactionCategory || ''}${transactionSubcategory ? '–' + transactionSubcategory : ''}${transactionDescription ? '（' + transactionDescription + '）' : ''}`
    );
    setAmount(transactionAmount?.toString() || '');
    setReceiptCount('1');
    setNotes('');
    setVoucherImage(null);
  };

  // 处理图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { autoCompressImage } = await import('@/utils/imageUtils');
      const { base64 } = await autoCompressImage(file, 'normal');
      setVoucherImage(base64);
    } catch (error) {
      console.error('图片上传失败', error);
    }
  };

  // 金额转大写
  const amountToChinese = (num: number): string => {
    if (isNaN(num) || num === 0) return '零元整';
    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];
    const decUnits = ['角', '分'];
    
    const intPart = Math.floor(num);
    const decPart = Math.round((num - intPart) * 100);
    
    let result = '';
    
    if (intPart > 0) {
      const intStr = intPart.toString();
      let zeroFlag = false;
      for (let i = 0; i < intStr.length; i++) {
        const d = parseInt(intStr[i]);
        const unitIdx = intStr.length - 1 - i;
        if (d === 0) {
          zeroFlag = true;
        } else {
          if (zeroFlag) {
            result += '零';
            zeroFlag = false;
          }
          result += digits[d] + units[unitIdx];
        }
      }
      result += '元';
    }
    
    if (decPart > 0) {
      const jiao = Math.floor(decPart / 10);
      const fen = decPart % 10;
      if (jiao > 0) result += digits[jiao] + '角';
      if (fen > 0) result += digits[fen] + '分';
    } else {
      result += '整';
    }
    
    return result;
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) {
      const now = new Date();
      return {
        year: now.getFullYear().toString(),
        month: (now.getMonth() + 1).toString().padStart(2, '0'),
        day: now.getDate().toString().padStart(2, '0'),
      };
    }
    const parts = dateStr.split('-');
    return {
      year: parts[0] || new Date().getFullYear().toString(),
      month: parts[1] || (new Date().getMonth() + 1).toString().padStart(2, '0'),
      day: parts[2] || new Date().getDate().toString().padStart(2, '0'),
    };
  };

  const date = formatDate(transactionDate);
  const amountNum = parseFloat(amount) || 0;

  // 提交
  const handleSubmit = () => {
    if (!content.trim()) {
      return;
    }
    if (amountNum <= 0) {
      return;
    }
    onSubmit({
      content: content.trim(),
      amount: amountNum,
      receiptCount: parseInt(receiptCount) || 1,
      notes: notes.trim(),
      voucherImage: voucherImage || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="bg-white rounded-lg overflow-hidden">
          {/* 报销单标题 */}
          <div className="bg-gradient-to-r from-[#A80000] to-[#d44] px-4 py-3 text-center">
            <h2 className="text-white text-lg font-bold tracking-[0.3em]">报 销 单</h2>
            <p className="text-white/70 text-xs mt-0.5">电子报销申请表</p>
          </div>

          {/* 日期行 */}
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-200">
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <span>发生日期：</span>
              <span className="font-medium text-gray-900">{date.year}</span>
              <span>年</span>
              <span className="font-medium text-gray-900">{date.month}</span>
              <span>月</span>
              <span className="font-medium text-gray-900">{date.day}</span>
              <span>日</span>
            </div>
            <div className="text-xs text-gray-400">
              {transactionType === 'expense' ? '支出' : '收入'}
            </div>
          </div>

          {/* 报销内容 */}
          <div className="px-4 py-3 border-b border-gray-200">
            <label className="text-xs text-gray-500 mb-1.5 block">报销内容</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请填写报销内容..."
              className="min-h-[60px] text-sm border-gray-300 bg-gray-50 focus:bg-white"
            />
          </div>

          {/* 金额区域 - 模拟纸质报销单 */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1.5 block">金额（元）</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-bold text-[#A80000] border-gray-300 bg-gray-50 focus:bg-white"
                  step="0.01"
                />
              </div>
              <div className="w-20">
                <label className="text-xs text-gray-500 mb-1.5 block">单据张数</label>
                <Input
                  type="number"
                  value={receiptCount}
                  onChange={(e) => setReceiptCount(e.target.value)}
                  placeholder="1"
                  className="text-center border-gray-300 bg-gray-50 focus:bg-white"
                  min="0"
                />
              </div>
            </div>
            {/* 大写金额 */}
            <div className="bg-[#FFF8F0] rounded-md px-3 py-2 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 flex-shrink-0">合计人民币（大写）：</span>
                <span className="text-sm font-medium text-[#A80000]">{amountToChinese(amountNum)}</span>
              </div>
            </div>
          </div>

          {/* 备注 */}
          <div className="px-4 py-3 border-b border-gray-200">
            <label className="text-xs text-gray-500 mb-1.5 block">备注</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="补充说明（选填）..."
              className="min-h-[40px] text-sm border-gray-300 bg-gray-50 focus:bg-white"
            />
          </div>

          {/* 附件凭证 */}
          <div className="px-4 py-3 border-b border-gray-200">
            <label className="text-xs text-gray-500 mb-1.5 block">记账凭证附件</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            {voucherImage ? (
              <div className="flex items-center gap-3">
                <img
                  src={voucherImage}
                  alt="凭证"
                  className="w-16 h-16 object-cover rounded border border-gray-300"
                />
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-[#1976D2] underline"
                  >
                    重新上传
                  </button>
                  <button
                    onClick={() => setVoucherImage(null)}
                    className="text-xs text-[#D32F2F] underline"
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
              >
                + 点击上传凭证图片（选填）
              </button>
            )}
          </div>

          {/* 签署区域 */}
          <div className="px-4 py-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <span>报销人：</span>
                <span className="text-gray-900 font-medium">（提交后自动签署）</span>
              </div>
              <div className="flex items-center gap-1">
                <span>主管审批：</span>
                <span className="text-gray-400">待审批</span>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="px-4 py-3 flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !content.trim() || amountNum <= 0}
              className="flex-1 text-white"
              style={{ backgroundColor: '#A80000' }}
            >
              {isPending ? '提交中...' : '提交报销申请'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
