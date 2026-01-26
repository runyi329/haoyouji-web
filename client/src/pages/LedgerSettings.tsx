import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export default function LedgerSettings() {
  const [, setLocation] = useLocation();
  const [shareExpense, setShareExpense] = useState(true);
  const [shareAccount, setShareAccount] = useState(true);
  const [ledgerNotification, setLedgerNotification] = useState(false);
  const [requireImage, setRequireImage] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b">
        <div className="container py-3 px-4 flex items-center">
          <button
            onClick={() => setLocation("/ledger")}
            className="p-1 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="flex-1 text-lg font-semibold text-center mr-8">1</h1>
        </div>
      </div>

      {/* 设置项列表 */}
      <div className="space-y-2">
        {/* 第一组 */}
        <div className="bg-white">
          <SettingItem
            label="删除账单找回"
            badge="VIP"
            onClick={() => {}}
          />
          <SettingItem
            label="账本日志"
            onClick={() => {}}
          />
          <SettingItem
            label="账本图片查看"
            onClick={() => {}}
          />
          <SettingItem
            label="账本管理员管理"
            badge="VIP"
            onClick={() => {}}
          />
          <SettingItem
            label="账本创建人转移"
            onClick={() => {}}
            showBorder={false}
          />
        </div>

        {/* 第二组 */}
        <div className="bg-white">
          <SettingItem
            label="开通VIP账本"
            rightText="终生VIP限时折扣"
            rightTextColor="text-red-500"
            onClick={() => {}}
          />
          <SettingItem
            label="表格导入账单"
            onClick={() => {}}
          />
          <SettingItem
            label="手动导出表格"
            badge="VIP"
            onClick={() => {}}
          />
          <SettingItem
            label="定期自动备份账目"
            badge="VIP"
            onClick={() => {}}
            showBorder={false}
          />
        </div>

        {/* 第三组 - 邀请按钮 */}
        <div className="px-4 py-3">
          <Button
            variant="outline"
            className="w-full bg-white h-11 text-base"
            onClick={() => {}}
          >
            邀请伙伴加入此账本
          </Button>
        </div>

        {/* 第四组 - 退出按钮 */}
        <div className="px-4 py-3">
          <Button
            variant="destructive"
            className="w-full h-11 text-base"
            onClick={() => {}}
          >
            退出账本
          </Button>
        </div>

        {/* 第五组 - 成员管理 */}
        <div className="bg-white p-4">
          <div className="text-xs text-gray-500 mb-3">1个共享成员</div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-white font-semibold">
              R1
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">胡</span>
                <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">创建人</span>
              </div>
            </div>
            <button className="text-blue-500 text-sm">+</button>
            <span className="text-sm text-gray-500">邀请伙伴</span>
          </div>

          <div className="space-y-0 border-t pt-3">
            <SettingItem
              label="账本名称"
              rightText="1"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="我在账本的昵称"
              rightText="胡"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本二维码（邀请伙伴）"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="定时提醒记账"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本变动通知"
              helpIcon
              rightElement={
                <Switch
                  checked={ledgerNotification}
                  onCheckedChange={setLedgerNotification}
                />
              }
              compact
            />
            <SettingItem
              label="虚拟成员"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="成员权限设置"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="记账默认类型"
              helpIcon
              rightText="默认:支出,显示转账"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="首页统计方式"
              rightText="自然月统计"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账目锁定"
              rightText="不限制"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="记账必须上传图片"
              helpIcon
              rightElement={
                <Switch
                  checked={requireImage}
                  onCheckedChange={setRequireImage}
                />
              }
              compact
            />
            <SettingItem
              label="成员记账审批"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本预算&目标"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="自动重复记账"
              badge="VIP"
              helpIcon
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本结算币种"
              helpIcon
              rightText="人民币 🇨🇳"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="共享账本收支条目"
              helpIcon
              rightElement={
                <Switch
                  checked={shareExpense}
                  onCheckedChange={setShareExpense}
                />
              }
              compact
            />
            <SettingItem
              label="账本收入条目"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本支出条目"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="共享账本资金账户"
              helpIcon
              rightElement={
                <Switch
                  checked={shareAccount}
                  onCheckedChange={setShareAccount}
                />
              }
              compact
            />
            <SettingItem
              label="账本资金账户"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本状态(封账)"
              rightText="使用中"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账本统计"
              rightText="0条账目"
              onClick={() => {}}
              compact
            />
            <SettingItem
              label="账单搜索"
              onClick={() => {}}
              compact
              showBorder={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// 设置项组件
interface SettingItemProps {
  label: string;
  badge?: string;
  helpIcon?: boolean;
  rightText?: string;
  rightTextColor?: string;
  rightElement?: React.ReactNode;
  onClick?: () => void;
  compact?: boolean;
  showBorder?: boolean;
}

function SettingItem({
  label,
  badge,
  helpIcon,
  rightText,
  rightTextColor = "text-gray-500",
  rightElement,
  onClick,
  compact = false,
  showBorder = true,
}: SettingItemProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-4 ${
        compact ? "py-2.5" : "py-3"
      } ${showBorder ? "border-b border-gray-100" : ""} ${
        onClick ? "cursor-pointer hover:bg-gray-50" : ""
      } transition-colors`}
    >
      <div className="flex items-center gap-2">
        <span className={`${compact ? "text-sm" : "text-base"} text-gray-800`}>
          {label}
        </span>
        {badge && (
          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
            {badge}
          </span>
        )}
        {helpIcon && <HelpCircle className="w-4 h-4 text-gray-400" />}
      </div>
      <div className="flex items-center gap-2">
        {rightText && (
          <span className={`text-sm ${rightTextColor}`}>{rightText}</span>
        )}
        {rightElement}
        {onClick && <ChevronRight className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
}
