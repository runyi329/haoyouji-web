import React, { useState } from 'react';
import { Shield, FileText, HelpCircle, ChevronDown } from 'lucide-react';

interface ShareholderSectionProps {
  title: string;
  subtitle: string;
  icon: 'shield' | 'file' | 'help';
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const iconMap = {
  shield: Shield,
  file: FileText,
  help: HelpCircle,
};

/**
 * 股东保障中心 - 内嵌手风琴区块
 * 用于灰色底座内的折叠/展开模块
 */
export default function ShareholderSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: ShareholderSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = iconMap[icon];

  return (
    <div>
      {/* 标题行 - 点击展开/折叠 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#A80000] to-[#c44] flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{subtitle}</div>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* 展开内容 */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? 'max-h-[2000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
