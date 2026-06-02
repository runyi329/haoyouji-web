import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import taxCategoriesRaw from "@/data/tax_categories.json";
import taxAccountingMap from "@/data/tax_accounting_map.json";
import {
  Building2, Pencil, Trash2, Clock, CheckCircle, XCircle,
  ChevronRight, List, X, Receipt, ChevronDown, Search, Archive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCenterToast } from "@/components/ui/center-toast";
import { EXPENSE_CATEGORIES, getDefaultExpenseConfig } from "@/pages/AJCompanyManager";

// AJ 账本主色调（与账本首页一致）
const AJ_COLOR = '#1A2B4A';

// 税务分类数据
const TAX_CATEGORIES = taxCategoriesRaw as Array<{
  code: string; name: string; short: string; level: number;
  pian: string; lei: string; zhang: string; jie: string;
}>;

// 预计算每个节点的子节点数量
const childCountMap = (() => {
  const map: Record<string, number> = {};
  for (const item of TAX_CATEGORIES) {
    if (item.level === 1) continue;
    // 找父节点：level-1 的节点，且 pian/lei/zhang/jie 前缀匹配
    for (const parent of TAX_CATEGORIES) {
      if (parent.level !== item.level - 1) continue;
      // 通过 code 前缀判断父子关系（父 code 是子 code 的前缀，去掉尾部0）
      const pCode = parent.code.replace(/0+$/, '');
      const cCode = item.code.replace(/0+$/, '');
      if (cCode.startsWith(pCode) && cCode.length > pCode.length) {
        map[parent.code] = (map[parent.code] || 0) + 1;
        break;
      }
    }
  }
  return map;
})();

// 根据父节点 code 获取直接子节点
function getChildren(parentCode: string, parentLevel: number) {
  const pCode = parentCode.replace(/0+$/, '');
  return TAX_CATEGORIES.filter(item => {
    if (item.level !== parentLevel + 1) return false;
    const cCode = item.code.replace(/0+$/, '');
    return cCode.startsWith(pCode) && cCode.length > pCode.length;
  });
}

// 颜色主题（与账本一致）
const LEVEL_COLORS = [
  ['#1A2B4A', '#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626'],
  ['#1A2B4A', '#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#BE185D'],
];

// ========== 税务分类选择器（账本胶囊风格）==========
function TaxCategoryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  // selectedPath: 每一层选中的节点 code，如 ['1000000000000000000', '1010000000000000000', ...]
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [pending, setPending] = useState<{ code: string; name: string } | null>(null);

  // 顶层6大类
  const topLevel = useMemo(() => TAX_CATEGORIES.filter(r => r.level === 1), []);

  // 根据 selectedPath 构建各层级的候选列表
  const levels = useMemo(() => {
    const result: Array<{ items: typeof TAX_CATEGORIES; selectedCode: string | null }> = [];
    // 第0层：顶层6大类
    result.push({ items: topLevel, selectedCode: selectedPath[0] || null });
    // 后续层：根据上一层选中的节点展开子节点
    for (let i = 0; i < selectedPath.length; i++) {
      const parentCode = selectedPath[i];
      const parentItem = TAX_CATEGORIES.find(r => r.code === parentCode);
      if (!parentItem) break;
      const children = getChildren(parentCode, parentItem.level);
      if (children.length === 0) break;
      result.push({ items: children, selectedCode: selectedPath[i + 1] || null });
    }
    return result;
  }, [selectedPath, topLevel]);

  // 搜索结果
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return TAX_CATEGORIES.filter(r => r.name.includes(q) || r.short.includes(q)).slice(0, 80);
  }, [query]);

  const handleSelect = (item: typeof TAX_CATEGORIES[0], level: number) => {
    // 如果已选中同一个，取消选中
    if (selectedPath[level] === item.code) {
      setSelectedPath(selectedPath.slice(0, level));
      setPending(null);
      return;
    }
    const newPath = [...selectedPath.slice(0, level), item.code];
    setSelectedPath(newPath);
    // 检查是否有子节点
    const children = getChildren(item.code, item.level);
    if (children.length === 0) {
      // 叶子节点，设为待选
      setPending({ code: item.code, name: item.name });
    } else {
      setPending(null);
    }
  };

  const levelNames = ['篇','类','章','节','条','款','项','目','子目','细目'];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#f5f6f8', display: 'flex', flexDirection: 'column', color: '#333' }}>
      {/* 顶部导航栏 */}
      <div style={{ background: '#1A2B4A', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight style={{ width: 20, height: 20, color: '#fff', transform: 'rotate(180deg)' }} />
        </button>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff', flex: 1 }}>选择报销类目</span>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0, position: 'relative' }}>
        <Search style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#bbb' }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedPath([]); setPending(null); }}
          placeholder="搜索类目名称，如：广告、差旅、办公..."
          style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#333', background: '#f9f9f9' }}
        />
      </div>

      {/* 内容区域 */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 8px' }}>
        {query.trim() ? (
          /* 搜索模式：列表展示 */
          <div>
            {searchResults.length === 0 && (
              <div style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', padding: '48px 0' }}>未找到匹配类目</div>
            )}
            {searchResults.map(cat => {
              const isSelected = pending?.code === cat.code;
              const childCount = childCountMap[cat.code] || 0;
              return (
                <div
                  key={cat.code}
                  onClick={() => {
                    if (childCount === 0) {
                      setPending({ code: cat.code, name: cat.name });
                    } else {
                      // 有子节点，直接选中也可以
                      setPending({ code: cat.code, name: cat.name });
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '11px 16px',
                    borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                    background: isSelected ? '#EEF2FF' : '#fff',
                  }}
                >
                  <span style={{ fontSize: '10px', color: '#aaa', marginRight: '6px', flexShrink: 0, minWidth: '16px' }}>
                    {levelNames[cat.level - 1]}
                  </span>
                  <span style={{ fontSize: '14px', color: isSelected ? '#1A2B4A' : '#333', fontWeight: isSelected ? 600 : 400, flex: 1 }}>{cat.name}</span>
                  {childCount > 0 && <span style={{ fontSize: '11px', color: '#bbb', marginLeft: '4px' }}>{childCount}个子类</span>}
                  {isSelected && <CheckCircle style={{ width: 16, height: 16, color: '#1A2B4A', flexShrink: 0, marginLeft: '6px' }} />}
                </div>
              );
            })}
          </div>
        ) : (
          /* 浏览模式：账本风格胶囊逐级展开 */
          <div style={{ padding: '16px' }}>
            {levels.map((level, levelIdx) => {
              const levelName = levelNames[levelIdx];
              return (
                <div key={levelIdx} style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: 500, letterSpacing: '0.05em' }}>
                    {levelName}级分类
                    {levelIdx === 0 && <span style={{ color: '#bbb', fontWeight: 400 }}>（点击展开子类）</span>}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {level.items.map((item, itemIdx) => {
                      const isSelected = level.selectedCode === item.code;
                      const childCount = childCountMap[item.code] || 0;
                      const isLeaf = childCount === 0;
                      const isPending = pending?.code === item.code;
                      // 胶囊颜色：选中用主色，未选用浅灰
                      const colors = [
                        '#1A2B4A','#2563EB','#7C3AED','#059669','#D97706','#DC2626',
                        '#0891B2','#BE185D','#65A30D','#EA580C',
                      ];
                      const color = colors[itemIdx % colors.length];
                      return (
                        <button
                          key={item.code}
                          onClick={() => handleSelect(item, levelIdx)}
                          style={{
                            padding: '7px 14px',
                            borderRadius: '4px',
                            border: '1.5px solid',
                            borderColor: isSelected ? color : '#e0e0e0',
                            background: isSelected ? color : '#fff',
                            color: isSelected ? '#fff' : '#444',
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{item.name}</span>
                          {childCount > 0 && (
                            <span style={{
                              fontSize: '10px',
                              color: isSelected ? 'rgba(255,255,255,0.75)' : '#bbb',
                              background: isSelected ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
                              borderRadius: '3px',
                              padding: '1px 5px',
                              lineHeight: 1.4,
                            }}>{childCount}</span>
                          )}
                          {isPending && isLeaf && (
                            <CheckCircle style={{ width: 13, height: 13, color: isSelected ? '#fff' : '#1A2B4A' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 已选提示 + 确定按鈕 */}
      <div style={{ padding: '10px 16px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
        {pending && (
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>已选：</span>
            <span style={{ fontSize: '13px', color: '#1A2B4A', fontWeight: 600, flex: 1 }}>{pending.name}</span>
            <button onClick={() => setPending(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
              <X style={{ width: 13, height: 13, color: '#bbb' }} />
            </button>
          </div>
        )}
        <button
          onClick={() => { if (pending) { onSelect(pending.name); } }}
          disabled={!pending}
          style={{
            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
            background: pending ? '#1A2B4A' : '#e0e0e0',
            color: pending ? '#fff' : '#aaa',
            fontSize: '15px', fontWeight: 700,
            cursor: pending ? 'pointer' : 'not-allowed',
          }}
        >
          {pending ? `确定「${pending.name}」` : '请先选择一个类目'}
        </button>
      </div>
    </div>
  );
}

// ========== 标准会计科目数据（两层：一级科目 → 常用明细）==========
const ACCOUNTING_SUBJECTS = [
  { code: '1001', name: '库存现金', children: [] },
  { code: '1002', name: '银行存款', children: [] },
  { code: '1122', name: '应收账款', children: [] },
  { code: '1221', name: '其他应收款', children: [] },
  { code: '1401', name: '原材料', children: [] },
  { code: '1403', name: '库存商品', children: [] },
  { code: '1601', name: '固定资产', children: ['办公设备','电子设备','交通运输工具','机械设备'] },
  { code: '1701', name: '无形资产', children: ['软件使用权','商标权','专利权'] },
  { code: '1801', name: '长期待摊费用', children: ['装修费','开办费'] },
  { code: '2202', name: '应付账款', children: [] },
  { code: '2241', name: '其他应付款', children: [] },
  { code: '5001', name: '生产成本', children: ['直接材料','直接人工','制造费用'] },
  { code: '6001', name: '主营业务收入', children: [] },
  { code: '6051', name: '其他业务收入', children: [] },
  { code: '6401', name: '主营业务成本', children: [] },
  { code: '6601', name: '销售费用', children: ['广告费','宣传费','业务招待费','运输费','销售人员工资','展览费'] },
  { code: '6602', name: '管理费用', children: ['办公费','差旅费','咨询费','租赁费','水电费','物业费','劳保费','职工教育经费','福利费','车辆费','会议费','软件服务费','折旧费','维修费','业务招待费'] },
  { code: '6603', name: '财务费用', children: ['利息支出','手续费','汇兑损益'] },
  { code: '6711', name: '营业外支出', children: ['罚款支出','捐赠支出'] },
];

// ========== 会计科目选择器 ==========
function AccountingCodePicker({
  onSelect,
  onClose,
}: {
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  // expandedCode: 当前展开的一级科目 code（树形手风琴）
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const handleSubjectClick = (subject: typeof ACCOUNTING_SUBJECTS[0]) => {
    if (subject.children.length === 0) {
      // 无明细，直接选中
      setPending(subject.name);
      setExpandedCode(null);
    } else {
      // toggle 展开/收起
      setExpandedCode(prev => prev === subject.code ? null : subject.code);
      setPending(null);
    }
  };

  const handleDetailClick = (subject: typeof ACCOUNTING_SUBJECTS[0], detail: string) => {
    setPending(`${subject.name}-${detail}`);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#f5f6f8', display: 'flex', flexDirection: 'column', color: '#333' }}>
      {/* 顶部导航栏 */}
      <div style={{ background: '#1A2B4A', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight style={{ width: 20, height: 20, color: '#fff', transform: 'rotate(180deg)' }} />
        </button>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff', flex: 1 }}>选择会计科目</span>
      </div>

      {/* 内容区域：树形列表 */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 8px' }}>
        <div style={{ fontSize: '11px', color: '#999', padding: '8px 16px 4px', fontWeight: 500 }}>一级科目（点击有角标的科目可展开明细）</div>
        {ACCOUNTING_SUBJECTS.map((subject, idx) => {
          const isExpanded = expandedCode === subject.code;
          const isSubjectPending = pending === subject.name;
          const hasChildren = subject.children.length > 0;
          const colors = ['#1A2B4A','#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#BE185D','#65A30D','#EA580C'];
          const color = colors[idx % colors.length];
          return (
            <div key={subject.code}>
              {/* 一级科目行 */}
              <div
                onClick={() => handleSubjectClick(subject)}
                style={{
                  display: 'flex', alignItems: 'center', padding: '11px 16px',
                  borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
                  background: isExpanded ? '#EEF2FF' : (isSubjectPending ? '#EEF2FF' : '#fff'),
                }}
              >
                <span style={{ fontSize: '11px', color: '#aaa', marginRight: '6px', flexShrink: 0, minWidth: '36px' }}>{subject.code}</span>
                <span style={{ fontSize: '14px', color: isExpanded || isSubjectPending ? color : '#333', fontWeight: isExpanded || isSubjectPending ? 600 : 400, flex: 1 }}>{subject.name}</span>
                {hasChildren ? (
                  <>
                    <span style={{
                      fontSize: '10px',
                      color: isExpanded ? '#fff' : '#bbb',
                      background: isExpanded ? color : '#f0f0f0',
                      borderRadius: '3px',
                      padding: '1px 5px',
                      marginRight: '6px',
                    }}>{subject.children.length}</span>
                    <ChevronRight style={{ width: 14, height: 14, color: '#bbb', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                  </>
                ) : (
                  isSubjectPending && <CheckCircle style={{ width: 15, height: 15, color, flexShrink: 0 }} />
                )}
              </div>
              {/* 展开的明细科目（内联，手风琴）*/}
              {isExpanded && hasChildren && (
                <div style={{ background: '#f7f8fc', borderBottom: '1px solid #e8eaf0', padding: '10px 16px 10px 52px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {subject.children.map((detail, dIdx) => {
                      const fullName = `${subject.name}-${detail}`;
                      const isDetailPending = pending === fullName;
                      const dColor = colors[dIdx % colors.length];
                      return (
                        <button
                          key={detail}
                          onClick={() => handleDetailClick(subject, detail)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '4px',
                            border: '1.5px solid',
                            borderColor: isDetailPending ? dColor : '#d8dce8',
                            background: isDetailPending ? dColor : '#fff',
                            color: isDetailPending ? '#fff' : '#555',
                            fontSize: '12px',
                            fontWeight: isDetailPending ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', gap: '3px',
                          }}
                        >
                          {detail}
                          {isDetailPending && <CheckCircle style={{ width: 11, height: 11, color: '#fff' }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 已选提示 + 确定按钮 */}
      <div style={{ padding: '10px 16px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
        {pending && (
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>已选：</span>
            <span style={{ fontSize: '13px', color: '#1A2B4A', fontWeight: 600, flex: 1 }}>{pending}</span>
            <button onClick={() => setPending(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
              <X style={{ width: 13, height: 13, color: '#bbb' }} />
            </button>
          </div>
        )}
        <button
          onClick={() => { if (pending) { onSelect(pending); } }}
          disabled={!pending}
          style={{
            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
            background: pending ? '#1A2B4A' : '#e0e0e0',
            color: pending ? '#fff' : '#aaa',
            fontSize: '15px', fontWeight: 700,
            cursor: pending ? 'pointer' : 'not-allowed',
          }}
        >
          {pending ? `确定「${pending}」` : '请先选择一个科目'}
        </button>
      </div>
    </div>
  );
}

// ========== 预设报销事由数据 ==========
const PRESET_EXPENSE_REASONS = [
  { group: '差旅类', items: ['出差-客户拜访', '出差-项目驻场', '出差-参加会议', '出差-培训学习', '出差-展会参展'] },
  { group: '日常运营类', items: ['办公用品采购', '设备购置', '软件订阅', '快递邮寄', '水电物业'] },
  { group: '业务拓展类', items: ['客户招待', '业务推广', '合同履约', '市场调研'] },
  { group: '行政后勤类', items: ['员工福利', '车辆费用', '房租支付', '维修费用'] },
];

// ========== 报销事由选择器 ==========
function ExpenseReasonPicker({
  onSelect,
  onClose,
}: {
  onSelect: (reason: string) => void;
  onClose: () => void;
}) {
  const [customInput, setCustomInput] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const handleConfirm = () => {
    const val = customInput.trim() || pending;
    if (val) onSelect(val);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#f5f6f8', display: 'flex', flexDirection: 'column', color: '#333' }}>
      {/* 顶部导航栏 */}
      <div style={{ background: '#1A2B4A', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight style={{ width: 20, height: 20, color: '#fff', transform: 'rotate(180deg)' }} />
        </button>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff', flex: 1 }}>选择报销事由</span>
      </div>

      {/* 自定义输入框 */}
      <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>手动输入自定义事由</div>
        <input
          value={customInput}
          onChange={e => { setCustomInput(e.target.value); setPending(null); }}
          placeholder="输入报销事由，如：出差北京拜访客户..."
          style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#333', background: '#f9f9f9' }}
        />
      </div>

      {/* 预设列表 */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
        {PRESET_EXPENSE_REASONS.map(group => (
          <div key={group.group}>
            <div style={{ fontSize: '11px', color: '#999', padding: '8px 16px 4px', fontWeight: 500 }}>{group.group}</div>
            <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {group.items.map(item => {
                const isSelected = pending === item && !customInput.trim();
                return (
                  <button
                    key={item}
                    onClick={() => { setPending(item); setCustomInput(''); }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '4px',
                      border: '1.5px solid',
                      borderColor: isSelected ? '#D97706' : '#e0e0e0',
                      background: isSelected ? '#D97706' : '#fff',
                      color: isSelected ? '#fff' : '#444',
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {item}
                    {isSelected && <CheckCircle style={{ width: 12, height: 12, color: '#fff' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 已选提示 + 确定按钮 */}
      <div style={{ padding: '10px 16px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
        {(pending || customInput.trim()) && (
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>已选：</span>
            <span style={{ fontSize: '13px', color: '#D97706', fontWeight: 600, flex: 1 }}>{customInput.trim() || pending}</span>
            <button onClick={() => { setPending(null); setCustomInput(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
              <X style={{ width: 13, height: 13, color: '#bbb' }} />
            </button>
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={!pending && !customInput.trim()}
          style={{
            width: '100%', padding: '13px', borderRadius: '10px', border: 'none',
            background: (pending || customInput.trim()) ? '#D97706' : '#e0e0e0',
            color: (pending || customInput.trim()) ? '#fff' : '#aaa',
            fontSize: '15px', fontWeight: 700,
            cursor: (pending || customInput.trim()) ? 'pointer' : 'not-allowed',
          }}
        >
          {(pending || customInput.trim()) ? `确定「${customInput.trim() || pending}」` : '请选择或输入事由'}
        </button>
      </div>
    </div>
  );
}

type RequestType = 'add' | 'update' | 'delete';
type CompanyFormData = {
  name: string;
  tax_no: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  remark: string;
};

/** 安全地把任意值转成可渲染的字符串，防止 Date 对象直接进入 JSX */
function safeStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('zh-CN');
  return String(v);
}

// ========== 开票分类配置面板 ==========
function ExpenseTypePanel({
  ledgerId,
  company,
  onClose,
}: {
  ledgerId: number;
  company: { id: number; name: string };
  onClose: () => void;
}) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const { data: savedConfig, isLoading } = (trpc as any).ledger.ajGetCompanyExpenseTypes.useQuery({
    ledgerId,
    companyId: company.id,
  });
  const [config, setConfig] = useState<Record<string, { enabled: boolean; items: Record<string, boolean> }> | null>(null);
  const effectiveConfig = config ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
  const saveMutation = (trpc as any).ledger.ajSetCompanyExpenseTypes.useMutation({
    onSuccess: () => {
      utils.ledger.ajGetCompanyExpenseTypes.invalidate({ ledgerId, companyId: company.id });
      toast.success("开票分类配置已保存");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleCategory = (catKey: string) => {
    setConfig((prev) => {
      const base = prev ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
      return { ...base, [catKey]: { ...base[catKey], enabled: !base[catKey]?.enabled } };
    });
  };
  const toggleItem = (catKey: string, itemKey: string) => {
    setConfig((prev) => {
      const base = prev ?? (savedConfig ? savedConfig as any : getDefaultExpenseConfig());
      return {
        ...base,
        [catKey]: {
          ...base[catKey],
          items: { ...base[catKey]?.items, [itemKey]: !(base[catKey]?.items?.[itemKey] !== false) },
        },
      };
    });
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">{safeStr(company.name)}</div>
            <div className="text-xs text-gray-400 mt-0.5">开票分类配置</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
          ) : (
            EXPENSE_CATEGORIES.map((cat) => {
              const catState = effectiveConfig[cat.key] ?? { enabled: true, items: {} };
              return (
                <div key={cat.key} className="bg-gray-50 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCategory(cat.key)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <span className="font-medium text-sm text-gray-700">{cat.label}</span>
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${catState.enabled ? 'bg-[#1A2B4A]' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${catState.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                  {catState.enabled && (
                    <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                      {cat.items.map((item) => {
                        const itemEnabled = catState.items[item.key] !== false;
                        return (
                          <button
                            key={item.key}
                            onClick={() => toggleItem(cat.key, item.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${itemEnabled ? 'bg-blue-50 text-[#1A2B4A]' : 'bg-white text-gray-400 border border-gray-200'}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${itemEnabled ? 'bg-[#1A2B4A] border-[#1A2B4A]' : 'border-gray-300'}`}>
                              {itemEnabled && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            {cat.label === cat.label && item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <Button
            className="w-full rounded-xl text-white"
            style={{ backgroundColor: AJ_COLOR }}
            onClick={() => saveMutation.mutate({ ledgerId, companyId: company.id, config: effectiveConfig })}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ========== 图片全屏预览弹窗 ==========
function ImageFullscreenViewer({ images, initialIndex, onClose }: { images: string[]; initialIndex: number; onClose: () => void }) {
  const [current, setCurrent] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // 所有实时状态存入 ref，避免原生事件闭包问题
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pinchRef = useRef<{ dist: number } | null>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRef = useRef(initialIndex);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  // 切换图片时重置缩放
  const switchImage = (idx: number) => {
    currentRef.current = idx;
    setCurrent(idx);
    scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
    setScale(1); setTranslateX(0); setTranslateY(0);
  };

  // 用原生事件绑定，完全避开 React 合成事件的 passive 限制和闭包问题
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy) };
        lastTouchRef.current = null;
        swipeStartRef.current = null;
      } else if (e.touches.length === 1) {
        const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (scaleRef.current > 1) {
          lastTouchRef.current = pt;
          swipeStartRef.current = null;
        } else {
          swipeStartRef.current = pt;
          lastTouchRef.current = null;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // 需要 non-passive 才能调用
      if (e.touches.length === 2 && pinchRef.current) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const newDist = Math.hypot(dx, dy);
        const ratio = newDist / pinchRef.current.dist;
        const newScale = Math.min(5, Math.max(1, scaleRef.current * ratio));
        scaleRef.current = newScale;
        setScale(newScale);
        pinchRef.current.dist = newDist;
      } else if (e.touches.length === 1 && lastTouchRef.current && scaleRef.current > 1) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        txRef.current += dx;
        tyRef.current += dy;
        setTranslateX(txRef.current);
        setTranslateY(tyRef.current);
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      pinchRef.current = null;
      lastTouchRef.current = null;
      if (scaleRef.current < 1) {
        scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
        setScale(1); setTranslateX(0); setTranslateY(0);
      }
      // 单指左右滑动切换图片（仅在未放大时）
      if (scaleRef.current <= 1 && swipeStartRef.current && e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
        const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          const imgs = imagesRef.current;
          const cur = currentRef.current;
          if (dx < 0 && cur < imgs.length - 1) {
            currentRef.current = cur + 1;
            setCurrent(cur + 1); scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
            setScale(1); setTranslateX(0); setTranslateY(0);
          } else if (dx > 0 && cur > 0) {
            currentRef.current = cur - 1;
            setCurrent(cur - 1); scaleRef.current = 1; txRef.current = 0; tyRef.current = 0;
            setScale(1); setTranslateX(0); setTranslateY(0);
          }
        }
        swipeStartRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}
    >
      {/* 顶部左右布局：图片计数 + 关闭按钮（任何状态下均可点击） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
          {images.length > 1 ? `${current + 1} / ${images.length}` : '凭证查看'}
        </span>
        <button
          onClick={onClose}
          style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 图片区域 */}
      <div
        ref={containerRef}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}
      >
        {/* 左箭头 */}
        {scale <= 1 && images.length > 1 && current > 0 && (
          <button onClick={() => switchImage(current - 1)}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
        {/* 右箭头 */}
        {scale <= 1 && images.length > 1 && current < images.length - 1 && (
          <button onClick={() => switchImage(current + 1)}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )}
        <img
          src={images[current]}
          alt="凭证"
          style={{
            maxWidth: '92vw', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain', borderRadius: '8px',
            transform: `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`,
            transformOrigin: 'center center',
            transition: pinchRef.current ? 'none' : 'transform 0.15s ease',
            userSelect: 'none', WebkitUserSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
          onContextMenu={e => e.preventDefault()}
        />
      </div>

      {/* 底部：缩略图 + 提示 */}
      <div style={{ flexShrink: 0, paddingBottom: '16px' }}>
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '8px' }}>
            {images.map((img, i) => (
              <div key={i} onClick={() => switchImage(i)}
                style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', border: i === current ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }}>
                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
          {scale > 1 ? '双指缩小还原 · 单指拖动' : '双指放大 · 左右滑动切换'}
        </div>
      </div>
    </div>
  );
}

// ========== 企业发票列表（内嵌展开，带时间筛选下拉框） ==========
// 公司色板：10种预设颜色，按 ajCompanyId 取模
const COMPANY_COLORS = [
  '#1A2B4A', // 默认深蓝
  '#7C3AED', // 紫色
  '#B45309', // 棕色
  '#065F46', // 深绿
  '#9D174D', // 深红
  '#1E40AF', // 蓝色
  '#92400E', // 深橙
  '#1F2937', // 深灰
  '#6B21A8', // 深紫
  '#134E4A', // 深青绿
];

function InvoiceListInline({
  ledgerId,
  companyId,
  period: externalPeriod,
  searchText = '',
  externalEmployee = '',
  onEmployeeNamesChange,
}: {
  ledgerId: number;
  companyId?: number;
  period?: 'all' | 'day' | 'week' | 'month' | 'year';
  searchText?: string;
  externalEmployee?: string;
  onEmployeeNamesChange?: (names: string[], invoices: any[]) => void;
}) {
  const [internalPeriod, setInternalPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year'>('month');
  const period = externalPeriod ?? internalPeriod;
  const { data: invoices, isLoading } = (trpc as any).ledger.ajOwnerGetCompanyInvoices.useQuery({ ledgerId, companyId, period });
  const periodLabels: Record<string, string> = { all: '全部', day: '今日', week: '本周', month: '本月', year: '本年' };
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [pickerInvoiceId, setPickerInvoiceId] = useState<number | null>(null);
  const [localCategories, setLocalCategories] = useState<Record<number, string>>({});
  const [accountingPickerInvoiceId, setAccountingPickerInvoiceId] = useState<number | null>(null);
  const [localAccountingCodes, setLocalAccountingCodes] = useState<Record<number, string>>({});
  const [reasonPickerInvoiceId, setReasonPickerInvoiceId] = useState<number | null>(null);
  const [localExpenseReasons, setLocalExpenseReasons] = useState<Record<number, string>>({});
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const updateCategoryMutation = (trpc as any).ledger.ajOwnerUpdateInvoiceCategory.useMutation({
    onSuccess: () => {
      toast.show('类目已更新', 'success');
      utils.ledger.getTransactions.invalidate();
      utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId });
    },
    onError: () => toast.show('更新失败，请重试', 'error'),
  });
  const updateAccountingCodeMutation = (trpc as any).ledger.ajOwnerUpdateAccountingCode.useMutation({
    onSuccess: () => {
      toast.show('会计科目已更新', 'success');
      utils.ledger.getTransactions.invalidate();
      utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId });
    },
    onError: () => toast.show('更新失败，请重试', 'error'),
  });
  const updateExpenseReasonMutation = (trpc as any).ledger.ajOwnerUpdateExpenseReason.useMutation({
    onSuccess: () => {
      toast.show('报销事由已更新', 'success');
      utils.ledger.getTransactions.invalidate();
      utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId });
    },
    onError: () => toast.show('更新失败，请重试', 'error'),
  });
  const handleCategorySelect = useCallback((categoryName: string) => {
    if (pickerInvoiceId == null) return;
    const invoiceId = pickerInvoiceId;
    setPickerInvoiceId(null);
    setLocalCategories(prev => ({ ...prev, [invoiceId]: categoryName }));
    updateCategoryMutation.mutate({ ledgerId, recordId: invoiceId, categoryName });
    // 从预设对照表中查找对应会计科目（4199条全覆盖）
    const map = taxAccountingMap as Record<string, string>;
    const autoCode = map[categoryName] || '';
    if (autoCode) {
      setLocalAccountingCodes(prev => ({ ...prev, [invoiceId]: autoCode }));
      updateAccountingCodeMutation.mutate({ ledgerId, recordId: invoiceId, accountingCode: autoCode });
    }
  }, [pickerInvoiceId, ledgerId]);
  const handleAccountingCodeSelect = useCallback((code: string) => {
    if (accountingPickerInvoiceId == null) return;
    const invoiceId = accountingPickerInvoiceId;
    setAccountingPickerInvoiceId(null);
    setLocalAccountingCodes(prev => ({ ...prev, [invoiceId]: code }));
    updateAccountingCodeMutation.mutate({ ledgerId, recordId: invoiceId, accountingCode: code });
  }, [accountingPickerInvoiceId, ledgerId]);
  const handleExpenseReasonSelect = useCallback((reason: string) => {
    if (reasonPickerInvoiceId == null) return;
    const invoiceId = reasonPickerInvoiceId;
    setReasonPickerInvoiceId(null);
    setLocalExpenseReasons(prev => ({ ...prev, [invoiceId]: reason }));
    updateExpenseReasonMutation.mutate({ ledgerId, recordId: invoiceId, expenseReason: reason });
  }, [reasonPickerInvoiceId, ledgerId]);
  // ===== 审批状态切换（全新实现）=====
  // 当前弹窗对应的发票对象
  const [statusPopupInv, setStatusPopupInv] = useState<any | null>(null);
  // 本地乐观更新：key=transactionId, value=新状态
  const [localStatusMap, setLocalStatusMap] = useState<Record<number, string>>({});
  // 按钮按下状态（触摸反馈）
  const [pressedStatus, setPressedStatus] = useState<string | null>(null);
  const ajSetStatusMutation = (trpc as any).ledger.ajSetStatus.useMutation({
    onSuccess: (_data: any, variables: any) => {
      // 静默成功，刷新列表数据
      utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId });
      utils.ledger.getTransactions.invalidate();
    },
    onError: (err: any, variables: any) => {
      // 失败时回滚乐观更新并提示
      toast.show(err?.message || '操作失败，请重试', 'error');
      setLocalStatusMap(prev => { const n = { ...prev }; delete n[variables.transactionId]; return n; });
    },
  });

  // 通知父组件员工名列表变化
  useEffect(() => {
    if (!isLoading && Array.isArray(invoices)) {
      const list: any[] = invoices as any[];
      const names = Array.from(new Set(
        list.map((inv: any) => safeStr(inv.creatorNickname || inv.creatorName || inv.creatorUsername)).filter(Boolean)
      )) as string[];
      onEmployeeNamesChange?.(names, list);
    }
  }, [invoices, isLoading]);
  // 搜索过滤 + 员工过滤（使用外部传入的员工筛选）
  const filteredInvoices = useMemo(() => {
    const list: any[] = Array.isArray(invoices) ? invoices : [];
    let result = list;
    // 员工筛选（由父组件控制）
    if (externalEmployee) {
      result = result.filter((inv: any) => {
        const creator = safeStr(inv.creatorNickname || inv.creatorName || inv.creatorUsername);
        return creator === externalEmployee;
      });
    }
    // 文本搜索
    if (!searchText.trim()) return result;
    const kw = searchText.trim().toLowerCase();
    return result.filter((inv: any) => {
      const amount = String(Number(inv.amount || 0).toFixed(2));
      const desc = safeStr(inv.description).toLowerCase();
      const category = safeStr(inv.category).toLowerCase();
      const creator = safeStr(inv.creatorNickname || inv.creatorName).toLowerCase();
      const date = safeStr(inv.recordDate || inv.date).toLowerCase();
      // 订单编号：支持搜索数字（如"43"、"0043"）或带#前缀（如"#43"）
      const idStr = inv.id ? String(inv.id).padStart(4, '0') : '';
      const idRaw = inv.id ? String(inv.id) : '';
      const kwClean = kw.startsWith('#') ? kw.slice(1) : kw;
      const idMatch = idStr.includes(kwClean) || idRaw.includes(kwClean);
      return amount.includes(kw) || desc.includes(kw) || category.includes(kw) || creator.includes(kw) || date.includes(kw) || idMatch;
    });
  }, [invoices, searchText, externalEmployee]);

  return (
    <div>
      {!externalPeriod && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
          <div className="relative">
            <select
              value={internalPeriod}
              onChange={e => setInternalPeriod(e.target.value as any)}
              className="appearance-none text-xs font-medium pl-3 pr-7 py-1.5 rounded-full border border-gray-200 bg-white cursor-pointer outline-none focus:outline-none focus:ring-0"
              style={{ color: AJ_COLOR }}
            >
              <option value="day">今日</option>
              <option value="week">本周</option>
              <option value="month">本月</option>
              <option value="year">本年</option>
              <option value="all">全部</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: AJ_COLOR }} />
          </div>
        </div>
      )}
      {pickerInvoiceId != null && (
        <TaxCategoryPicker
          onSelect={handleCategorySelect}
          onClose={() => setPickerInvoiceId(null)}
        />
      )}
      {accountingPickerInvoiceId != null && (
        <AccountingCodePicker
          onSelect={handleAccountingCodeSelect}
          onClose={() => setAccountingPickerInvoiceId(null)}
        />
      )}
      {reasonPickerInvoiceId != null && (
        <ExpenseReasonPicker
          onSelect={handleExpenseReasonSelect}
          onClose={() => setReasonPickerInvoiceId(null)}
        />
      )}
      {previewImages && (
        <ImageFullscreenViewer
          images={previewImages}
          initialIndex={previewIndex}
          onClose={() => setPreviewImages(null)}
        />
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">加载中...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-8">
          <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <div className="text-gray-400 text-xs">
            {searchText.trim() ? `未找到匹配“${searchText}”的记录` : `${periodLabels[period]}暂无开票记录`}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {filteredInvoices.map((inv: any, idx: number) => (
            <div key={inv.id ?? idx} style={{ background: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,43,74,0.08)', border: '1px solid rgba(26,43,74,0.07)' }}>
              {/* 顶部标题栏（带棱角裁切） */}
              <div style={{
                background: companyId == null
                  ? COMPANY_COLORS[((inv.ajCompanyId ?? inv.aj_company_id ?? 0) % COMPANY_COLORS.length + COMPANY_COLORS.length) % COMPANY_COLORS.length]
                  : '#1A2B4A',
                padding: '7px 12px 14px 12px',
                position: 'relative',
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 7px), 97% 100%, 94% calc(100% - 5px), 91% 100%, 88% calc(100% - 5px), 85% 100%, 82% calc(100% - 5px), 79% 100%, 76% calc(100% - 5px), 73% 100%, 70% calc(100% - 5px), 67% 100%, 64% calc(100% - 5px), 61% 100%, 58% calc(100% - 5px), 55% 100%, 52% calc(100% - 5px), 49% 100%, 46% calc(100% - 5px), 43% 100%, 40% calc(100% - 5px), 37% 100%, 34% calc(100% - 5px), 31% 100%, 28% calc(100% - 5px), 25% 100%, 22% calc(100% - 5px), 19% 100%, 16% calc(100% - 5px), 13% 100%, 10% calc(100% - 5px), 7% 100%, 4% calc(100% - 5px), 1% 100%, 0 calc(100% - 7px))'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 700, letterSpacing: '3px' }}>报 销 申 请 单</span>
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '10px', fontFamily: 'monospace' }}>
                    No.{inv.id ? String(inv.id).padStart(4, '0') : String(idx + 1).padStart(4, '0')}
                  </span>
                </div>
              </div>
              {/* 主体内容 */}
              <div style={{ padding: '10px 12px 12px 12px' }}>
                {/* 企业名称 + 金额 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>开票单位</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {safeStr(inv.companyName || inv.ajCompanyName || '—')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>报销金额</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#1A2B4A', lineHeight: 1 }}>
                      ¥{Number(inv.amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                {/* 虚线分隔 */}
                <div style={{ borderTop: '1px dashed rgba(26,43,74,0.15)', margin: '8px 0' }} />
                {/* 六格信息：第一行（申请日期、报销凭证、员工编号），第二行（报销事由✏️、报销类目✏️、会计科目✏️） */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 8px', marginBottom: '8px' }}>
                  {/* 第一行：申请日期 */}
                  <div>
                    <div style={{ fontSize: '10px', color: '#aaa' }}>申请日期</div>
                    <div style={{ fontSize: '11px', color: '#444', fontWeight: 500 }}>
                      {(() => { const d = new Date(inv.createdAt || inv.recordDate || Date.now()); return `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`; })()}
                    </div>
                  </div>
                  {/* 第一行：报销凭证 */}
                  <div>
                    <div style={{ fontSize: '10px', color: '#aaa' }}>报销凭证</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      {(() => {
                        let imgs: string[] = [];
                        try { imgs = JSON.parse(inv.images || '[]'); } catch {}
                        if (!Array.isArray(imgs) || imgs.length === 0) {
                          return <span style={{ fontSize: '11px', color: '#bbb' }}>无</span>;
                        }
                        const show = imgs.slice(0, 3);
                        const extra = imgs.length - 3;
                        return (
                          <>
                            {show.map((url: string, i: number) => (
                              <div
                                key={i}
                                onClick={e => { e.stopPropagation(); setPreviewImages(imgs); setPreviewIndex(i); }}
                                style={{ width: '22px', height: '22px', borderRadius: '3px', overflow: 'hidden', border: '1px solid rgba(26,43,74,0.15)', cursor: 'pointer', flexShrink: 0 }}
                              >
                                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ))}
                            {extra > 0 && (
                              <div
                                onClick={e => { e.stopPropagation(); setPreviewImages(imgs); setPreviewIndex(3); }}
                                style={{ width: '22px', height: '22px', borderRadius: '3px', background: 'rgba(26,43,74,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#1A2B4A', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                              >
                                +{extra}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {/* 第一行：员工编号 */}
                  <div>
                    <div style={{ fontSize: '10px', color: '#aaa' }}>员工编号</div>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: '#444', fontFamily: 'monospace' }}>
                      {safeStr(inv.ajEmployeeNo || '—')}
                    </div>
                  </div>
                  {/* 第二行：报销事由（可编辑） */}
                  <div
                    onClick={e => { e.stopPropagation(); setReasonPickerInvoiceId(inv.id); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '10px', color: '#aaa' }}>报销事由</div>
                    <div style={{ fontSize: '11px', color: '#1A2B4A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px dashed #1A2B4A', display: 'inline-block', maxWidth: '100%' }}>
                      {safeStr(localExpenseReasons[inv.id] || inv.ajExpenseReason || '点击选择')}
                    </div>
                  </div>
                  {/* 第二行：报销类目（可编辑） */}
                  <div
                    onClick={e => { e.stopPropagation(); setPickerInvoiceId(inv.id); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '10px', color: '#aaa' }}>报销类目</div>
                    <div style={{ fontSize: '11px', color: '#1A2B4A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px dashed #1A2B4A', display: 'inline-block', maxWidth: '100%' }}>
                      {safeStr(localCategories[inv.id] || inv.ajTaxCategory || '点击选择')}
                    </div>
                  </div>
                  {/* 第二行：会计科目（可编辑） */}
                  <div
                    onClick={e => { e.stopPropagation(); setAccountingPickerInvoiceId(inv.id); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: '10px', color: '#aaa' }}>会计科目</div>
                    <div style={{ fontSize: '11px', color: '#1A2B4A', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px dashed #1A2B4A', display: 'inline-block', maxWidth: '100%' }}>
                      {safeStr(localAccountingCodes[inv.id] || inv.ajAccountingCode || '自动匹配')}
                    </div>
                  </div>
                </div>
                {/* 虚线分隔 */}
                <div style={{ borderTop: '1px dashed rgba(26,43,74,0.15)', margin: '8px 0' }} />
                {/* 底部：审批状态区域（可点击切换） */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {(() => {
                    const curStatus = localStatusMap[inv.id] ?? (inv.ajStatus || 'pending');
                    const dotColor = curStatus === 'approved' ? '#4CAF50' : curStatus === 'support_needed' ? '#FF9800' : '#F59E0B';
                    const label = curStatus === 'approved' ? '审批通过' : curStatus === 'support_needed' ? '补充材料' : '待审核';
                    return (
                      <button
                        onClick={e => { e.stopPropagation(); setStatusPopupInv({ ...inv, _curStatus: curStatus }); }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: 'transparent',
                          border: '1px solid rgba(26,43,74,0.2)',
                          borderRadius: '6px', padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, display: 'inline-block', backgroundColor: dotColor }} />
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(26,43,74,0.75)' }}>{label}</span>
                        <span style={{ fontSize: '10px', color: 'rgba(26,43,74,0.35)', marginLeft: '1px' }}>▾</span>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 审批状态切换确认弹窗 */}
      {/* 审批状态切换弹窗（全新实现） */}
      {statusPopupInv && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setStatusPopupInv(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '480px', padding: '20px 16px 32px', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#e0e0e0', margin: '0 auto 14px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A2B4A', textAlign: 'center', marginBottom: '4px' }}>审批状态</div>
            <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginBottom: '16px' }}>选择后立即生效</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {([
                { status: 'approved', label: '审批通过', dot: '#4CAF50', activeBg: '#E8F5E9', activeBorder: '#4CAF50', desc: '确认通过该报销申请' },
                { status: 'support_needed', label: '补充材料', dot: '#FF9800', activeBg: '#FFF3E0', activeBorder: '#FF9800', desc: '需要补充相关证明材料' },
                { status: 'pending', label: '待审核', dot: '#F59E0B', activeBg: '#FFF8E1', activeBorder: '#F59E0B', desc: '撤回审批，返回待审核状态' },
              ] as const).map(opt => {
                const isCurrent = statusPopupInv._curStatus === opt.status;
                const isPressed = pressedStatus === opt.status;
                return (
                  <button
                    key={opt.status}
                    disabled={isCurrent}
                    onTouchStart={() => { if (!isCurrent) setPressedStatus(opt.status); }}
                    onTouchEnd={() => setPressedStatus(null)}
                    onTouchCancel={() => setPressedStatus(null)}
                    onMouseDown={() => { if (!isCurrent) setPressedStatus(opt.status); }}
                    onMouseUp={() => setPressedStatus(null)}
                    onMouseLeave={() => setPressedStatus(null)}
                    onClick={() => {
                      if (isCurrent) return;
                      // 立即乐观更新并关闭弹窗
                      const invId = statusPopupInv.id;
                      setLocalStatusMap(prev => ({ ...prev, [invId]: opt.status }));
                      setStatusPopupInv(null);
                      // 后台静默同步
                      ajSetStatusMutation.mutate({ transactionId: invId, status: opt.status });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: isCurrent ? opt.activeBg : isPressed ? opt.activeBg : '#f7f7f7',
                      border: `2px solid ${isCurrent ? opt.activeBorder : isPressed ? opt.activeBorder : '#e8e8e8'}`,
                      borderRadius: '10px', padding: '12px 14px',
                      cursor: isCurrent ? 'default' : 'pointer',
                      opacity: 1,
                      textAlign: 'left', width: '100%',
                      transition: 'all 0.15s ease',
                      transform: isPressed ? 'scale(0.97)' : 'scale(1)',
                    }}
                  >
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: opt.dot, flexShrink: 0, boxShadow: isPressed ? `0 0 6px ${opt.dot}88` : 'none', transition: 'box-shadow 0.15s ease' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: isCurrent ? opt.activeBorder : '#1A2B4A' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(26,43,74,0.45)', marginTop: '1px' }}>{opt.desc}</div>
                    </div>
                    {isCurrent && <span style={{ fontSize: '12px', color: opt.activeBorder, fontWeight: 600 }}>当前</span>}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setStatusPopupInv(null)}
              style={{ width: '100%', marginTop: '14px', padding: '12px', background: 'transparent', border: '1px solid #e8e8e8', borderRadius: '10px', fontSize: '14px', color: '#999', cursor: 'pointer' }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 企业申请表单 ==========
function CompanyForm({
  initial,
  onSubmit,
  onCancel,
  loading,
  submitLabel,
  showTip,
}: {
  initial?: Partial<CompanyFormData>;
  onSubmit: (data: CompanyFormData) => void;
  onCancel: () => void;
  loading: boolean;
  submitLabel: string;
  showTip?: boolean;
}) {
  const [form, setForm] = useState<CompanyFormData>({
    name: initial?.name || '',
    tax_no: initial?.tax_no || '',
    address: initial?.address || '',
    phone: initial?.phone || '',
    bank_name: initial?.bank_name || '',
    bank_account: initial?.bank_account || '',
    remark: initial?.remark || '',
  });
  const set = (k: keyof CompanyFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      {showTip && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-600">
          申请通过后，所有报销分类默认全部开启。您可在企业卡片下方「开票分类」中自行勾选或取消。
        </div>
      )}
      <Input value={form.name} onChange={set('name')} placeholder="企业名称（必填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.tax_no} onChange={set('tax_no')} placeholder="税号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.address} onChange={set('address')} placeholder="地址（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.phone} onChange={set('phone')} placeholder="电话（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.bank_name} onChange={set('bank_name')} placeholder="开户行（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.bank_account} onChange={set('bank_account')} placeholder="银行账号（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <Input value={form.remark} onChange={set('remark')} placeholder="备注（选填）" className="h-9 text-sm border-gray-200 rounded-xl" />
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={onCancel}>取消</Button>
        <Button
          className="flex-1 rounded-xl text-white text-sm h-10"
          style={{ backgroundColor: AJ_COLOR }}
          onClick={() => { if (!form.name.trim()) return; onSubmit(form); }}
          disabled={loading || !form.name.trim()}
        >
          {loading ? '提交中...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ========== 资方视角面板（重写） ==========
export function FunderViewPanel({ ledgerId }: { ledgerId: number }) {
  const utils = trpc.useUtils();
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'quarter' | 'year'>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(() => {
    const saved = localStorage.getItem(`fvp_company_${ledgerId}`);
    if (saved !== null) return Number(saved);
    return null;
  });
  const [searchText, setSearchText] = useState('');
  // 员工筛选
  const [selectedEmployee, setSelectedEmployee] = useState<string>(() => {
    return localStorage.getItem(`fvp_employee_${ledgerId}`) || '';
  });
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);

  // 批量审核弹窗状态
  const [showBatchConfirm, setShowBatchConfirm] = useState(false); // 第一次确认（明细列表）
  const [showBatchConfirm2, setShowBatchConfirm2] = useState(false); // 第二次确认
  const [batchApproving, setBatchApproving] = useState(false);

  // 备份弹窗状态
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [backupTab, setBackupTab] = useState<'manual' | 'auto'>('manual');
  const [backupFrequency, setBackupFrequency] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [backupEnabled, setBackupEnabled] = useState(false);
  // 手动备份时间周期
  const [backupPeriod, setBackupPeriod] = useState<'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [backupCustomStart, setBackupCustomStart] = useState('');
  const [backupCustomEnd, setBackupCustomEnd] = useState('');

  // 获取当前用户邮箱
  const { data: user } = trpc.auth.me.useQuery();

  // 备份设置查询
  const { data: backupSettings, refetch: refetchBackupSettings } = (trpc as any).ledger.getBackupSettings.useQuery(
    { ledgerId },
    { enabled: showBackupDialog }
  );

  // 同步备份设置到本地状态
  useEffect(() => {
    if (backupSettings) {
      setBackupFrequency(backupSettings.frequency);
      setBackupEnabled(backupSettings.enabled === 1);
    }
  }, [backupSettings]);

  // 保存自动备份设置
  const saveBackupMutation = (trpc as any).ledger.saveBackupSettings.useMutation({
    onSuccess: () => {
      toast.success('备份设置已保存');
      refetchBackupSettings();
    },
    onError: (e: any) => toast.error('保存失败: ' + e.message),
  });

  // 手动备份（AJ专用：导出报销申请单）
  const ajSendBackupMutation = (trpc as any).ledger.ajSendBackup.useMutation({
    onSuccess: (data: any) => {
      toast.success(`备份已发送至所有邮箱（共${data.recordCount}笔记录）`);
      refetchBackupSettings();
    },
    onError: (e: any) => toast.error('备份失败: ' + e.message),
  });

  // 额外收件邮箱
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const { data: extraEmailsData, refetch: refetchExtraEmails } = (trpc as any).ledger.ajGetBackupEmails.useQuery(
    { ledgerId },
    { enabled: showBackupDialog }
  );
  const extraEmails: { id: number; email: string; label: string | null }[] = Array.isArray(extraEmailsData) ? extraEmailsData : [];

  const addEmailMutation = (trpc as any).ledger.ajAddBackupEmail.useMutation({
    onSuccess: () => {
      toast.success('邮箱已添加');
      setNewEmailInput('');
      setShowAddEmail(false);
      refetchExtraEmails();
    },
    onError: (e: any) => toast.error('添加失败: ' + e.message),
  });

  const deleteEmailMutation = (trpc as any).ledger.ajDeleteBackupEmail.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      refetchExtraEmails();
    },
    onError: (e: any) => toast.error('删除失败: ' + e.message),
  });

  const frequencyLabel = (f: string) => {
    if (f === 'weekly') return '每周';
    if (f === 'monthly') return '每月';
    if (f === 'quarterly') return '每季度';
    return f;
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 获取资方可见的企业列表
  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const companies: any[] = Array.isArray(myCompanies) ? myCompanies : [];

  // 企业加载完成后自动选中：如果 localStorage 有缓存则验证其有效性，否则自动选第一个
  useEffect(() => {
    if (!companiesLoading && companies.length > 0 && selectedCompanyId === null) {
      const saved = localStorage.getItem(`fvp_company_${ledgerId}`);
      if (saved !== null) {
        const savedId = Number(saved);
        // 验证缓存的公司ID是否依然有效（savedId=0表示全部，始终有效）
        if (savedId === 0 || companies.some((c: any) => c.id === savedId)) {
          setSelectedCompanyId(savedId);
          return;
        }
      }
      // 没有缓存或缓存失效：单公司直接选中，多公司默认全部
      if (companies.length === 1) {
        setSelectedCompanyId(companies[0].id);
      } else {
        setSelectedCompanyId(0); // 0 = 全部
      }
    }
  }, [companiesLoading, companies.length]);

  // 切换企业时清空搜索和发票列表，并持久化公司选择到localStorage
  // 注意：不清除员工筛选，刷新后保持原业务员选择
  useEffect(() => {
    setSearchText('');
    setEmployeeNames([]);
    setAllInvoices([]);
    if (selectedCompanyId !== null) {
      localStorage.setItem(`fvp_company_${ledgerId}`, String(selectedCompanyId));
    }
  }, [selectedCompanyId]);

  // 员工筛选时计算对应金额和条数
  const filteredStats = useMemo(() => {
    if (!selectedEmployee) return null;
    const filtered = allInvoices.filter((inv: any) => {
      const creator = safeStr(inv.creatorNickname || inv.creatorName || inv.creatorUsername);
      return creator === selectedEmployee;
    });
    const totalAmount = filtered.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0);
    return { totalAmount, invoiceCount: filtered.length };
  }, [allInvoices, selectedEmployee]);

  // 业务员详细统计（状态分布、金额分布、已发/待发津贴）
  const { data: employeeStats } = (trpc as any).ledger.ajOwnerGetEmployeeStats.useQuery(
    { ledgerId, companyId: selectedCompanyId!, employeeName: selectedEmployee, period },
    { enabled: selectedCompanyId != null }
  );

  // 待审单明细（批量审核确认弹窗用）
  const { data: pendingList, refetch: refetchPendingList } = (trpc as any).ledger.ajOwnerGetPendingList.useQuery(
    { ledgerId, companyId: (selectedCompanyId === 0 ? undefined : selectedCompanyId) ?? undefined, employeeName: selectedEmployee || undefined, period },
    { enabled: selectedCompanyId != null, staleTime: 0, refetchOnWindowFocus: false, refetchOnMount: false }
  );

  // 批量审核 mutation
  const batchApproveMutation = (trpc as any).ledger.ajOwnerBatchApprove.useMutation({
    onSuccess: (result: any) => {
      setBatchApproving(false);
      setShowBatchConfirm2(false);
      toast.success(`批量审核完成：${result.approved} 笔已通过，共 ${result.totalAmount.toFixed(2)} 元，共发放津贴 ${result.totalBonus.toFixed(4)} USDT`);
      // 刷新所有相关数据，保持当前公司+业务员筛选状态不变
      if (selectedCompanyId != null) {
        const cid = selectedCompanyId === 0 ? undefined : selectedCompanyId;
        utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId: cid, period });
        if (cid != null) {
          utils.ledger.ajOwnerGetEmployeeStats.invalidate({ ledgerId, companyId: cid, employeeName: selectedEmployee, period });
          utils.ledger.ajOwnerGetCompanyStats.invalidate({ ledgerId, companyId: cid, period });
        }
      }
      refetchPendingList();
    },
    onError: (err: any) => {
      setBatchApproving(false);
      toast.error('批量审核失败: ' + (err?.message || '未知错误'));
    },
  });

  // 统计数据（单公司模式才请求后端，全部公司模式用 allInvoices 就地计算）
  const { data: stats, isLoading: statsLoading } = (trpc as any).ledger.ajOwnerGetCompanyStats.useQuery(
    { ledgerId, companyId: selectedCompanyId === 0 ? undefined : selectedCompanyId!, period },
    { enabled: selectedCompanyId != null && selectedCompanyId !== 0 }
  );

  // 全部公司模式下，用 allInvoices 就地计算总金额和总笔数
  const allCompaniesStats = useMemo(() => {
    if (selectedCompanyId !== 0) return null;
    const source = selectedEmployee
      ? allInvoices.filter((inv: any) => safeStr(inv.creatorNickname || inv.creatorName || inv.creatorUsername) === selectedEmployee)
      : allInvoices;
    const totalAmount = source.reduce((sum: number, inv: any) => sum + Number(inv.amount || 0), 0);
    return { totalAmount, invoiceCount: source.length };
  }, [selectedCompanyId, allInvoices, selectedEmployee]);

  const periodLabels: Record<string, string> = { all: '全部', day: '今日', week: '本周', month: '本月', quarter: '本季', year: '本年' };

  return (
    <div className="flex flex-col flex-1 bg-white">
      {/* 顶部深蓝色区域 */}
      <div style={{ backgroundColor: AJ_COLOR }} className="px-4 pt-3 pb-4">
        {/* 第一行：企业选择 + 时间筛选 + 备份按钮 */}
        <div className="flex items-center gap-2 mb-3">
          {companiesLoading ? (
            <div className="text-white/60 text-xs flex-1">加载中...</div>
          ) : companies.length === 0 ? (
            <div className="text-white/60 text-xs flex-1">暂无授权企业</div>
          ) : companies.length === 1 ? (
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm font-semibold truncate">{safeStr(companies[0].name)}</span>
            </div>
          ) : (
            <div className="relative flex-1 min-w-0">
              <select
                value={selectedCompanyId ?? 0}
                onChange={e => setSelectedCompanyId(Number(e.target.value))}
                className="appearance-none w-full text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0 truncate"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
              >
                <option value={0} style={{ color: '#222', background: '#fff' }}>全部公司</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id} style={{ color: '#222', background: '#fff' }}>{safeStr(c.name)}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12"><path d="M6 8L2 4h8z"/></svg>
            </div>
          )}
          {/* 时间筛选 */}
          <div className="relative flex-shrink-0">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="appearance-none text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
            >
              <option value="all" style={{ color: '#222' }}>全部</option>
              <option value="day" style={{ color: '#222' }}>今日</option>
              <option value="week" style={{ color: '#222' }}>本周</option>
              <option value="month" style={{ color: '#222' }}>本月</option>
              <option value="quarter" style={{ color: '#222' }}>本季</option>
              <option value="year" style={{ color: '#222' }}>本年</option>
            </select>
            <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 fill-white/70" viewBox="0 0 12 12"><path d="M6 8L2 4h8z"/></svg>
          </div>
          {/* 备份按钮 */}
          <button
            onClick={() => setShowBackupDialog(true)}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-white/90 pl-2 pr-3 py-1 rounded-full border border-white/30 cursor-pointer"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
          >
            <Archive className="w-3 h-3" />
            <span>备份</span>
          </button>
        </div>
        {/* 统计数据行（永远显示，包括全部公司模式） */}
        {selectedCompanyId != null && (
          <div className="w-full">
            {/* 第一行：累计金额 | 开票条数 | 业务员选择器 */}
            <div className="flex items-center justify-around w-full">
              <div className="text-center">
                <div className="text-white/60 text-[10px] mb-0.5">
                  {selectedEmployee ? `${selectedEmployee}累计金额` : `${periodLabels[period]}累计金额`}
                </div>
                <div className="text-white text-xl font-bold leading-none">
                  {filteredStats
                    ? `¥${filteredStats.totalAmount.toFixed(2)}`
                    : allCompaniesStats != null
                      ? `¥${allCompaniesStats.totalAmount.toFixed(2)}`
                      : statsLoading ? '--' : `¥${Number(stats?.totalAmount || 0).toFixed(2)}`}
                </div>
              </div>
              <div className="w-px h-8 bg-white/20 flex-shrink-0" />
              <div className="text-center">
                <div className="text-white/60 text-[10px] mb-0.5">
                  {selectedEmployee ? `${selectedEmployee}开票条数` : `${periodLabels[period]}开票条数`}
                </div>
                <div className="text-white text-xl font-bold leading-none">
                  {filteredStats
                    ? filteredStats.invoiceCount
                    : allCompaniesStats != null
                      ? allCompaniesStats.invoiceCount
                      : statsLoading ? '--' : Number(stats?.invoiceCount || 0)}
                  <span className="text-white/60 text-xs font-normal ml-1">笔</span>
                </div>
              </div>
              {employeeNames.length > 0 && (
                <>
                  <div className="w-px h-8 bg-white/20 flex-shrink-0" />
                  <div className="text-center relative">
                    <button
                      onClick={() => setShowEmployeeDropdown(v => !v)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <div className="text-white/60 text-[10px] mb-0.5 flex items-center gap-0.5 justify-center">
                        业务员
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" style={{ fill: 'rgba(255,255,255,0.6)' }}><path d="M6 8L2 4h8z"/></svg>
                      </div>
                      <div className="text-white text-xl font-bold leading-none">
                        {selectedEmployee
                          ? <span className="text-sm font-semibold">{selectedEmployee}</span>
                          : <>{employeeNames.length}<span className="text-white/60 text-xs font-normal ml-1">人</span></>
                        }
                      </div>
                    </button>
                    {showEmployeeDropdown && (
                      <div
                        style={{
                          position: 'absolute', top: '110%', right: 0,
                          background: '#fff', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                          zIndex: 200, width: 'max-content', minWidth: '80px', maxWidth: '200px', overflow: 'hidden',
                        }}
                      >
                        <button
                          onClick={() => { setSelectedEmployee(''); localStorage.removeItem(`fvp_employee_${ledgerId}`); setShowEmployeeDropdown(false); }}
                          style={{
                            display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                            fontSize: '13px', fontWeight: selectedEmployee === '' ? 700 : 400,
                            color: selectedEmployee === '' ? AJ_COLOR : '#333',
                            background: selectedEmployee === '' ? 'rgba(26,43,74,0.08)' : '#fff',
                            border: 'none', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                          }}
                        >全部员工</button>
                        {employeeNames.map(name => (
                          <button
                            key={name}
                            onClick={() => { setSelectedEmployee(name); localStorage.setItem(`fvp_employee_${ledgerId}`, name); setShowEmployeeDropdown(false); }}
                            style={{
                              display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                              fontSize: '13px', fontWeight: selectedEmployee === name ? 700 : 400,
                              color: selectedEmployee === name ? AJ_COLOR : '#333',
                              background: selectedEmployee === name ? 'rgba(26,43,74,0.08)' : '#fff',
                              border: 'none', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                            }}
                          >{name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 第二行：选中公司时展开详细统计（全部或单个业务员） */}
            {selectedCompanyId != null && (
              <div
                style={{
                  marginTop: '10px',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                  paddingTop: '10px',
                }}
              >
                {/* 三组统计：笔数 / 金额 / 津贴，每组都是 待审 | 已审 | 总计 三列 */}
                {/* 表头行 */}
                <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 1fr', gap: '0', marginBottom: '4px' }}>
                  <div />
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>待审</div>
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>已审</div>
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>总计</div>
                </div>

                {/* 笔数行 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '56px 1fr 1fr 1fr', gap: '0',
                  background: 'rgba(255,255,255,0.07)', borderRadius: '8px',
                  padding: '7px 6px', marginBottom: '5px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', display: 'flex', alignItems: 'center' }}>开票笔数</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#FCD34D', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? (employeeStats.pending.count + (employeeStats.supportNeeded?.count ?? 0)) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>笔</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#81C784', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? employeeStats.approved.count : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>笔</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? (employeeStats.approved.count + employeeStats.pending.count + (employeeStats.supportNeeded?.count ?? 0)) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>笔</span>
                  </div>
                </div>

                {/* 金额行 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '56px 1fr 1fr 1fr', gap: '0',
                  background: 'rgba(255,255,255,0.07)', borderRadius: '8px',
                  padding: '7px 6px', marginBottom: '5px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', display: 'flex', alignItems: 'center' }}>报销金额</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#FCD34D', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? employeeStats.pending.amount.toFixed(0) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#81C784', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? employeeStats.approved.amount.toFixed(0) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? (employeeStats.approved.amount + employeeStats.pending.amount).toFixed(0) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                </div>

                {/* 津贴行 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '56px 1fr 1fr 1fr', gap: '0',
                  background: 'rgba(255,255,255,0.07)', borderRadius: '8px',
                  padding: '7px 6px',
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', display: 'flex', alignItems: 'center' }}>成本津贴</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#FCD34D', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? employeeStats.estimatedBonus.toFixed(2) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#81C784', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? employeeStats.totalBonus.toFixed(2) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                      {employeeStats ? (employeeStats.totalBonus + employeeStats.estimatedBonus).toFixed(2) : '--'}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1 }}>元</span>
                  </div>
                </div>

                {/* 批量审核按鈕 */}
                {employeeStats && employeeStats.pending.count > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      onClick={() => { setShowBatchConfirm(true); refetchPendingList(); }}
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        borderRadius: '8px',
                        background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '13px',
                        border: 'none',
                        cursor: 'pointer',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {selectedEmployee
                        ? `一键审核 ${selectedEmployee} 全部待审单（${employeeStats.pending.count} 笔）`
                        : selectedCompanyId
                          ? `一键审核本公司全部待审单（${employeeStats.pending.count} 笔）`
                          : `一键审核全部待审单（${employeeStats.pending.count} 笔）`
                      }
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* 白色发票列表区域 */}
      {selectedCompanyId != null && (
        <div className="bg-white">
          {/* 搜索框 */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="搜索金额、分类、业务员..."
                className="w-full pl-9 pr-4 py-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 focus:bg-white transition-colors"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <InvoiceListInline
            ledgerId={ledgerId}
            companyId={selectedCompanyId === 0 ? undefined : selectedCompanyId}
            period={period}
            searchText={searchText}
            externalEmployee={selectedEmployee}
            onEmployeeNamesChange={(names, invs) => { setEmployeeNames(names); setAllInvoices(invs); }}
          />
        </div>
      )}

      {/* 备份弹窗 */}
      <Dialog open={showBackupDialog} onOpenChange={setShowBackupDialog}>
        <DialogContent className="p-0 overflow-hidden rounded-2xl border-0 max-w-sm mx-auto" style={{ backgroundColor: AJ_COLOR }}>
          <DialogTitle className="sr-only">账本备份</DialogTitle>
          {/* 弹窗标题区 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-white/80" />
              <span className="text-white font-bold text-base">账本备份</span>
            </div>
            <button onClick={() => setShowBackupDialog(false)} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab 切换 */}
          <div className="flex mx-5 mb-4 rounded-xl overflow-hidden border border-white/20">
            <button
              onClick={() => setBackupTab('manual')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                backupTab === 'manual'
                  ? 'bg-white text-[#1A2B4A]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              手动备份
            </button>
            <button
              onClick={() => setBackupTab('auto')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                backupTab === 'auto'
                  ? 'bg-white text-[#1A2B4A]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              自动备份
            </button>
          </div>

          {/* 手动备份 Tab */}
          {backupTab === 'manual' && (
            <div className="px-5 pb-6">
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <div className="text-white/60 text-xs mb-1">备份企业</div>
                <div className="text-white text-sm font-medium">
                  {selectedCompanyId
                    ? companies.find((c: any) => c.id === selectedCompanyId)?.name || '当前企业'
                    : '请先选择企业'}
                </div>
              </div>
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white/60 text-xs">备份接收邮箱</div>
                  <button
                    onClick={() => setShowAddEmail(v => !v)}
                    className="text-white/70 hover:text-white text-xs flex items-center gap-1 border border-white/30 rounded-lg px-2 py-0.5"
                  >
                    <span>+</span><span>添加</span>
                  </button>
                </div>
                {/* 主邮箱（个人中心） */}
                <div className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
                  <span className="text-white text-sm flex-1">{(user as any)?.email || '未设置邮箱'}</span>
                  <span className="text-white/40 text-xs">主邮箱</span>
                </div>
                {/* 额外邮箱列表 */}
                {extraEmails.map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-1 border-t border-white/10 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-300/70 flex-shrink-0" />
                    <span className="text-white/90 text-sm flex-1 truncate">{item.email}</span>
                    <button
                      onClick={() => deleteEmailMutation.mutate({ id: item.id })}
                      className="text-white/40 hover:text-red-300 text-xs flex-shrink-0 ml-1"
                    >✕</button>
                  </div>
                ))}
                {/* 添加邮箱输入框 */}
                {showAddEmail && (
                  <div className="flex gap-2 mt-2 border-t border-white/10 pt-2">
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={e => setNewEmailInput(e.target.value)}
                      placeholder="输入邮箱地址"
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50 placeholder:text-white/30"
                    />
                    <button
                      onClick={() => {
                        if (!newEmailInput.trim()) return;
                        addEmailMutation.mutate({ ledgerId, email: newEmailInput.trim() });
                      }}
                      disabled={addEmailMutation.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white hover:bg-white/30 disabled:opacity-50"
                    >确定</button>
                  </div>
                )}
              </div>
              {/* 时间周期选择 */}
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <div className="text-white/60 text-xs mb-2">备份时间周期</div>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {([
                    { key: 'week', label: '本周' },
                    { key: 'month', label: '本月' },
                    { key: 'quarter', label: '本季' },
                    { key: 'year', label: '本年' },
                    { key: 'custom', label: '自定义' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setBackupPeriod(opt.key)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        backupPeriod === opt.key
                          ? 'bg-white text-[#1A2B4A]'
                          : 'border border-white/30 text-white/70 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {backupPeriod === 'custom' && (
                  <div className="flex gap-2 items-center mt-2">
                    <input
                      type="date"
                      value={backupCustomStart}
                      onChange={e => setBackupCustomStart(e.target.value)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
                    />
                    <span className="text-white/50 text-xs">至</span>
                    <input
                      type="date"
                      value={backupCustomEnd}
                      onChange={e => setBackupCustomEnd(e.target.value)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-white/50"
                    />
                  </div>
                )}
              </div>
              {backupSettings?.lastManualBackupAt && (
                <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="text-white/60 text-xs mb-1">上次备份时间</div>
                  <div className="text-white text-sm">{formatDateTime(backupSettings.lastManualBackupAt)}</div>
                </div>
              )}
              <div className="rounded-xl p-3 mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-white/50 text-xs leading-relaxed">系统将所选时间段内的报销申请单打包为 Excel 文件，同时发送至以上所有收件邮箱。</p>
              </div>
              <button
                onClick={() => {
                  if (backupPeriod === 'custom' && (!backupCustomStart || !backupCustomEnd)) {
                    toast.error('请选择自定义时间段的开始和结束日期');
                    return;
                  }
                  ajSendBackupMutation.mutate({
                    ledgerId,
                    companyId: selectedCompanyId ?? undefined,
                    period: backupPeriod,
                    ...(backupPeriod === 'custom' ? { startDate: backupCustomStart, endDate: backupCustomEnd } : {}),
                  });
                }}
                disabled={ajSendBackupMutation.isPending}
                className="w-full py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-60"
                style={{ backgroundColor: '#fff', color: AJ_COLOR }}
              >
                {ajSendBackupMutation.isPending ? '备份中...' : '立即备份'}
              </button>
            </div>
          )}

          {/* 自动备份 Tab */}
          {backupTab === 'auto' && (
            <div className="px-5 pb-6">
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">自动备份</div>
                    <div className="text-white/50 text-xs mt-0.5">开启后按频率自动发送备份邮件</div>
                  </div>
                  <Switch
                    checked={backupEnabled}
                    onCheckedChange={setBackupEnabled}
                    className="data-[state=checked]:bg-green-400"
                  />
                </div>
              </div>

              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <div className="text-white/60 text-xs mb-2">备份频率</div>
                <div className="flex gap-2">
                  {(['weekly', 'monthly', 'quarterly'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setBackupFrequency(f)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        backupFrequency === f
                          ? 'bg-white text-[#1A2B4A]'
                          : 'border border-white/30 text-white/70'
                      }`}
                    >
                      {frequencyLabel(f)}
                    </button>
                  ))}
                </div>
              </div>

              {backupSettings?.lastAutoBackupAt && (
                <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="text-white/60 text-xs mb-1">上次自动备份</div>
                  <div className="text-white text-sm">{formatDateTime(backupSettings.lastAutoBackupAt)}</div>
                </div>
              )}

              <button
                onClick={() => saveBackupMutation.mutate({ ledgerId, frequency: backupFrequency, enabled: backupEnabled })}
                disabled={saveBackupMutation.isPending}
                className="w-full py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-60"
                style={{ backgroundColor: '#fff', color: AJ_COLOR }}
              >
                {saveBackupMutation.isPending ? '保存中...' : '保存设置'}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 批量审核第一次确认弹窗：明细列表 */}
      {showBatchConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={() => setShowBatchConfirm(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px 16px 0 0',
              width: '100%', maxWidth: 480, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
              padding: '0 0 env(safe-area-inset-bottom)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#1A2B4A' }}>
                    批量审核确认
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    {selectedEmployee ? `业务员：${selectedEmployee}` : selectedCompanyId ? '本公司全部业务员' : '全部企业全部业务员'}
                    {' · '}{pendingList ? `${pendingList.length} 笔待审` : '加载中...'}
                  </div>
                </div>
                <button onClick={() => setShowBatchConfirm(false)} style={{ color: '#999', fontSize: '20px', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              </div>
              {/* 汇总信息 */}
              {pendingList && pendingList.length > 0 && (
                <div style={{
                  marginTop: '10px', padding: '10px 12px',
                  background: '#f0fdf4', borderRadius: '10px',
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>{pendingList.length}</div>
                    <div style={{ fontSize: '10px', color: '#888' }}>待审笔数</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>
                      {pendingList.reduce((s: number, r: any) => s + r.amount, 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888' }}>总金额（元）</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>
                      {(pendingList.reduce((s: number, r: any) => s + r.amount, 0) * 0.01 / 7.2).toFixed(4)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888' }}>预计津贴（U）</div>
                  </div>
                </div>
              )}
            </div>
            {/* 明细列表 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 0' }}>
              {!pendingList ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: '24px 0', fontSize: '13px' }}>加载中...</div>
              ) : pendingList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: '24px 0', fontSize: '13px' }}>暂无待审单</div>
              ) : (() => {
                // 按公司分组
                const groups: Record<string, any[]> = {};
                pendingList.forEach((item: any) => {
                  const key = item.companyName || '未知公司';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(item);
                });
                // 检测金额相近（差值 < 5%），记录每个id对应的相近单号列表
                const similarMap = new Map<number, number[]>();
                pendingList.forEach((a: any) => {
                  pendingList.forEach((b: any) => {
                    if (a.id !== b.id && Math.abs(a.amount - b.amount) / Math.max(a.amount, b.amount) < 0.05) {
                      if (!similarMap.has(a.id)) similarMap.set(a.id, []);
                      if (!similarMap.get(a.id)!.includes(b.id)) similarMap.get(a.id)!.push(b.id);
                    }
                  });
                });
                const fmtDate = (d: any) => {
                  const dt = new Date(d);
                  if (!isNaN(dt.getTime())) return `${dt.getMonth() + 1}月${dt.getDate()}日`;
                  const s = String(d).slice(0, 10);
                  const parts = s.split('-');
                  if (parts.length === 3) return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
                  return s;
                };
                let globalIdx = 0;
                return Object.entries(groups).map(([company, items]) => (
                  <div key={company}>
                    {/* 公司分组标题 */}
                    <div style={{
                      padding: '6px 16px 4px',
                      fontSize: '11px', fontWeight: 700, color: '#16a34a',
                      background: '#f0fdf4', borderTop: '1px solid #e8f5e9',
                      letterSpacing: '0.5px',
                    }}>{company}（{items.length} 笔）</div>
                    {/* 表头 */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '20px 1fr 60px 52px',
                      gap: '4px', padding: '3px 16px',
                      fontSize: '10px', color: '#bbb', borderBottom: '1px solid #f5f5f5',
                    }}>
                      <span>#</span><span>业务员 · 日期 · 单号</span><span style={{textAlign:'right'}}>金额</span><span style={{textAlign:'right'}}>津贴</span>
                    </div>
                    {items.map((item: any) => {
                      globalIdx++;
                      const similarIds = similarMap.get(item.id);
                      const isSimilar = !!similarIds && similarIds.length > 0;
                      return (
                        <div key={item.id} style={{
                          display: 'grid', gridTemplateColumns: '20px 1fr 60px 52px',
                          gap: '4px', padding: '5px 16px',
                          borderBottom: '1px solid #f9f9f9',
                          alignItems: 'center',
                          background: isSimilar ? '#fffbeb' : 'transparent',
                        }}>
                          <span style={{ fontSize: '10px', color: '#ccc' }}>{globalIdx}</span>
                          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'nowrap', overflow: 'hidden' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A2B4A', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.employeeName || '未知'}</span>
                            <span style={{ fontSize: '10px', color: '#ccc', whiteSpace: 'nowrap', flexShrink: 0 }}>·</span>
                            <span style={{ fontSize: '10px', color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtDate(item.recordDate)}</span>
                            <span style={{ fontSize: '10px', color: '#ccc', whiteSpace: 'nowrap', flexShrink: 0 }}>·</span>
                            <span style={{ fontSize: '10px', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>#{item.id}{item.expenseReason ? ` · ${item.expenseReason}` : ''}</span>
                            {isSimilar && (
                              <span style={{ fontSize: '9px', color: '#d97706', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, background: '#fef3c7', padding: '1px 4px', borderRadius: '4px' }}>
                                ≈#{similarIds!.join(' #')}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>
                            {item.amount.toFixed(0)}<span style={{ fontSize: '9px', color: '#aaa' }}>元</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#86efac', textAlign: 'right' }}>
                            +{(item.amount * 0.01 / 7.2).toFixed(2)}<span style={{ fontSize: '9px' }}>U</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
            {/* 底部按鈕 */}
            {pendingList && pendingList.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
                <button
                  onClick={() => { setShowBatchConfirm(false); setShowBatchConfirm2(true); }}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: '10px',
                    background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                    color: '#fff', fontWeight: 700, fontSize: '14px',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  确认，进入第二步确认
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 批量审核第二次确认弹窗：最终确认 */}
      {showBatchConfirm2 && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => !batchApproving && setShowBatchConfirm2(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: '16px',
              width: 'calc(100% - 48px)', maxWidth: 360,
              padding: '24px 20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>&#9888;&#65039;</div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: '#1A2B4A' }}>最终确认批量审核</div>
              <div style={{ fontSize: '13px', color: '#888', marginTop: '6px', lineHeight: 1.6 }}>
                即将对 <span style={{ color: '#16a34a', fontWeight: 700 }}>{pendingList?.length || 0} 笔</span> 待审单执行审核通过，
                共计金额 <span style={{ color: '#16a34a', fontWeight: 700 }}>¥{pendingList ? pendingList.reduce((s: number, r: any) => s + r.amount, 0).toFixed(2) : '0.00'}</span>，
                预计发放津贴 <span style={{ color: '#16a34a', fontWeight: 700 }}>{pendingList ? (pendingList.reduce((s: number, r: any) => s + r.amount, 0) * 0.01 / 7.2).toFixed(4) : '0.0000'} U</span>。
                <br /><span style={{ color: '#e53e3e', fontSize: '12px' }}>此操作不可撤销，请确认。</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowBatchConfirm2(false)}
                disabled={batchApproving}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: '10px',
                  background: '#f5f5f5', color: '#666',
                  fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer',
                }}
              >返回</button>
              <button
                onClick={() => {
                  setBatchApproving(true);
                  batchApproveMutation.mutate({
                    ledgerId,
                    companyId: selectedCompanyId ?? undefined,
                    employeeName: selectedEmployee || undefined,
                    period,
                  });
                }}
                disabled={batchApproving}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: '10px',
                  background: batchApproving ? '#86efac' : 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                  color: '#fff', fontWeight: 700, fontSize: '14px',
                  border: 'none', cursor: batchApproving ? 'not-allowed' : 'pointer',
                }}
              >
                {batchApproving ? '审核中...' : '确认批量审核通过'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== 主面板 ==========
export function AJOwnerPanel({ ledgerId, isFunder = false }: { ledgerId: number; isFunder?: boolean }) {
  const toast = useCenterToast();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<'companies' | 'requests'>('companies');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  useEffect(() => {
    if (isFunder) return;
    const handler = () => {
      setShowAddForm(true);
      setEditingCompany(null);
      setActiveTab('companies');
    };
    window.addEventListener('aj-owner-add-company', handler);
    return () => window.removeEventListener('aj-owner-add-company', handler);
  }, [isFunder]);

  const [editingCompany, setEditingCompany] = useState<any | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<any | null>(null);
  const [deleteRemark, setDeleteRemark] = useState('');
  const [expenseTypeCompany, setExpenseTypeCompany] = useState<{ id: number; name: string } | null>(null);

  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const { data: myRequests, isLoading: requestsLoading } = (trpc as any).ledger.ajOwnerGetMyRequests.useQuery({ ledgerId });

  const pendingCount = (myRequests as any[] | undefined)?.filter((r: any) => r.status === 'pending').length || 0;
  const companies = (myCompanies as any[] | undefined) ?? [];

  const submitMutation = (trpc as any).ledger.ajOwnerSubmitRequest.useMutation({
    onSuccess: () => {
      utils.invalidate();
      setShowAddForm(false);
      setEditingCompany(null);
      setDeletingCompany(null);
      setDeleteRemark('');
      toast.success('申请已提交，等待管理员审核');
    },
    onError: (e: any) => toast.error(e.message),
  });
  const handleAddSubmit = (data: CompanyFormData) => {
    submitMutation.mutate({
      ledgerId, requestType: 'add' as RequestType,
      name: data.name, taxNo: data.tax_no || undefined, address: data.address || undefined,
      phone: data.phone || undefined, bankName: data.bank_name || undefined,
      bankAccount: data.bank_account || undefined, remark: data.remark || undefined,
    });
  };
  const handleEditSubmit = (data: CompanyFormData) => {
    if (!editingCompany) return;
    submitMutation.mutate({
      ledgerId, requestType: 'update' as RequestType, companyId: editingCompany.id,
      name: data.name, taxNo: data.tax_no || undefined, address: data.address || undefined,
      phone: data.phone || undefined, bankName: data.bank_name || undefined,
      bankAccount: data.bank_account || undefined, remark: data.remark || undefined,
    });
  };
  const handleDeleteSubmit = () => {
    if (!deletingCompany) return;
    submitMutation.mutate({
      ledgerId, requestType: 'delete' as RequestType,
      companyId: deletingCompany.id, name: deletingCompany.name, remark: deleteRemark || undefined,
    });
  };

  // 资方视角直接用独立组件
  if (isFunder) return <FunderViewPanel ledgerId={ledgerId} />;

  return (
    <div className="min-h-[300px]" style={{ background: '#F0F4FA' }}>
      {/* 顶部深蓝色区域：企业横向选择 */}
      <div className="px-4 pt-3 pb-4" style={{ backgroundColor: AJ_COLOR }}>
        {companiesLoading ? (
          <div className="text-white/60 text-xs py-2">加载中...</div>
        ) : companies.length === 0 ? (
          <div className="text-white/60 text-xs py-2">
            暂无企业，点击下方「+」添加
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {companies.map((company: any) => {
              const isSelected = selectedCompanyId === company.id;
              return (
                <button
                  key={company.id}
                  onClick={() => setSelectedCompanyId(isSelected ? null : company.id)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                  style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                    border: isSelected ? '1.5px solid rgba(255,255,255,0.7)' : '1.5px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)' }}
                  >
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white text-xs font-medium max-w-[100px] truncate">
                    {safeStr(company.name)}
                  </span>
                  {isSelected && <ChevronDown className="w-3 h-3 text-white/70 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 选中企业后：发票列表区域 */}
      {selectedCompanyId !== null && (
        <div className="mx-4 mt-3 bg-white rounded-2xl overflow-hidden shadow-sm">
          {(() => {
            const company = companies.find((c: any) => c.id === selectedCompanyId);
            return company ? (
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: AJ_COLOR }}>
                    <Building2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">{safeStr(company.name)}</div>
                    {company.taxNo && <div className="text-xs text-gray-400">税号：{safeStr(company.taxNo)}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingCompany(company); setSelectedCompanyId(null); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    onClick={() => { setDeletingCompany(company); setDeleteRemark(''); setSelectedCompanyId(null); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ) : null;
          })()}
          <button
            onClick={() => {
              const company = companies.find((c: any) => c.id === selectedCompanyId);
              if (company) setExpenseTypeCompany({ id: company.id, name: company.name });
            }}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <List className="w-4 h-4" style={{ color: AJ_COLOR }} />
              <span>开票分类</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </button>
          <InvoiceListInline ledgerId={ledgerId} companyId={selectedCompanyId} />
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex border-b border-gray-200 bg-white mx-4 mt-3 rounded-t-2xl shadow-sm overflow-hidden">
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'companies' ? 'border-b-2' : 'text-gray-400'}`}
          style={activeTab === 'companies' ? { color: AJ_COLOR, borderColor: AJ_COLOR } : {}}
          onClick={() => setActiveTab('companies')}
        >
          我的企业
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'requests' ? 'border-b-2' : 'text-gray-400'}`}
          style={activeTab === 'requests' ? { color: AJ_COLOR, borderColor: AJ_COLOR } : {}}
          onClick={() => setActiveTab('requests')}
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            申请记录
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-amber-400 text-white text-[10px] rounded-full leading-none flex-shrink-0">
                {pendingCount}
              </span>
            )}
          </span>
        </button>
      </div>

      <div className="mx-4 bg-white rounded-b-2xl shadow-sm p-4 pb-24 space-y-3">
        {activeTab === 'companies' && (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
              您名下的企业需经管理员审核后生效。添加、修改、删除均需提交申请。
            </div>
            {showAddForm && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="text-sm font-medium text-gray-700 mb-3">申请新增企业</div>
                <CompanyForm
                  showTip={true}
                  onSubmit={handleAddSubmit}
                  onCancel={() => setShowAddForm(false)}
                  loading={submitMutation.isPending}
                  submitLabel="提交新增申请"
                />
              </div>
            )}
            {companiesLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
            ) : companies.length === 0 ? (
              <div className="text-center py-16">
                <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <div className="text-gray-400 text-sm">暂无企业</div>
                <div className="text-gray-300 text-xs mt-1">点击下方「+」申请添加企业</div>
              </div>
            ) : (
              <div className="space-y-3">
                {companies.map((company: any) => (
                  <div key={company.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {editingCompany?.id === company.id ? (
                      <div className="p-4">
                        <div className="text-sm font-medium text-gray-600 mb-3">申请修改企业信息</div>
                        <CompanyForm
                          initial={{
                            name: company.name, tax_no: company.taxNo || '',
                            address: company.address || '', phone: company.phone || '',
                            bank_name: company.bankName || '', bank_account: company.bankAccount || '',
                            remark: company.remark || '',
                          }}
                          onSubmit={handleEditSubmit}
                          onCancel={() => setEditingCompany(null)}
                          loading={submitMutation.isPending}
                          submitLabel="提交修改申请"
                        />
                      </div>
                    ) : deletingCompany?.id === company.id ? (
                      <div className="p-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">申请删除「{safeStr(company.name)}」</div>
                        <div className="text-xs text-gray-400 mb-3">删除申请需经管理员确认后生效</div>
                        <Input
                          value={deleteRemark}
                          onChange={(e) => setDeleteRemark(e.target.value)}
                          placeholder="删除原因（选填）"
                          className="h-9 text-sm border-gray-200 rounded-xl mb-3"
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 rounded-xl border-gray-200 text-sm h-10" onClick={() => setDeletingCompany(null)}>取消</Button>
                          <Button
                            className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm h-10"
                            onClick={handleDeleteSubmit}
                            disabled={submitMutation.isPending}
                          >
                            {submitMutation.isPending ? '提交中...' : '提交删除申请'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: AJ_COLOR }}>
                            <Building2 className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{safeStr(company.name)}</div>
                            {company.taxNo && <div className="text-xs text-gray-400 truncate">税号：{safeStr(company.taxNo)}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setEditingCompany(company)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
                          >
                            <Pencil className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            onClick={() => { setDeletingCompany(company); setDeleteRemark(''); }}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {activeTab === 'requests' && (
          <>
            {requestsLoading ? (
              <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
            ) : !myRequests || (myRequests as any[]).length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">暂无申请记录</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(myRequests as any[]).map((req: any) => (
                  <div key={req.id} className="bg-gray-50 rounded-2xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {req.status === 'pending' ? (
                          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        ) : req.status === 'approved' ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className={`text-sm font-medium ${req.status === 'pending' ? 'text-amber-600' : req.status === 'approved' ? 'text-green-600' : 'text-gray-400'}`}>
                          {req.status === 'pending' ? '待审核' : req.status === 'approved' ? '已通过' : '已拒绝'}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                          {req.request_type === 'add' ? '新增企业' : req.request_type === 'update' ? '修改企业' : '删除企业'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {safeStr(req.created_at ? new Date(String(req.created_at)).toLocaleDateString('zh-CN') : '')}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 mb-1">{safeStr(req.name)}</div>
                    {req.tax_no && <div className="text-xs text-gray-400">税号：{safeStr(req.tax_no)}</div>}
                    {req.address && <div className="text-xs text-gray-400">地址：{safeStr(req.address)}</div>}
                    {req.phone && <div className="text-xs text-gray-400">电话：{safeStr(req.phone)}</div>}
                    {req.bank_name && <div className="text-xs text-gray-400">开户行：{safeStr(req.bank_name)}</div>}
                    {req.bank_account && <div className="text-xs text-gray-400">账号：{safeStr(req.bank_account)}</div>}
                    {req.remark && <div className="text-xs text-gray-400">备注：{safeStr(req.remark)}</div>}
                    {req.review_comment && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2">
                        审核意见：{safeStr(req.review_comment)}
                        {req.reviewerName && <span className="ml-1 text-gray-400">（{safeStr(req.reviewerName)}）</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {expenseTypeCompany && (
        <ExpenseTypePanel
          ledgerId={ledgerId}
          company={expenseTypeCompany}
          onClose={() => setExpenseTypeCompany(null)}
        />
      )}
    </div>
  );
}
