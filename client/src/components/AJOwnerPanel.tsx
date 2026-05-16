import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import taxCategoriesRaw from "@/data/tax_categories.json";
import taxAccountingMap from "@/data/tax_accounting_map.json";
import {
  Building2, Pencil, Trash2, Clock, CheckCircle, XCircle,
  ChevronRight, List, X, Receipt, ChevronDown, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <img
        src={images[current]}
        alt="凭证"
        style={{ maxWidth: '96vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
        onClick={e => e.stopPropagation()}
      />
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }} onClick={e => e.stopPropagation()}>
          {images.map((img, i) => (
            <div
              key={i}
              onClick={() => setCurrent(i)}
              style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', border: i === current ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
            >
              <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '20px', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>点击任意处关闭</div>
    </div>
  );
}

// ========== 企业发票列表（内嵌展开，带时间筛选下拉框） ==========
function InvoiceListInline({
  ledgerId,
  companyId,
  period: externalPeriod,
  searchText = '',
}: {
  ledgerId: number;
  companyId: number;
  period?: 'all' | 'day' | 'week' | 'month' | 'year';
  searchText?: string;
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
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const approveMutation = (trpc as any).ledger.approveTransaction.useMutation({
    onSuccess: () => {
      toast.show('审批通过', 'success');
      setApprovingId(null);
      utils.ledger.ajOwnerGetCompanyInvoices.invalidate({ ledgerId, companyId });
    },
    onError: () => { toast.show('审批失败，请重试', 'error'); setApprovingId(null); },
  });

  // 搜索过滤
  const filteredInvoices = useMemo(() => {
    const list: any[] = Array.isArray(invoices) ? invoices : [];
    if (!searchText.trim()) return list;
    const kw = searchText.trim().toLowerCase();
    return list.filter((inv: any) => {
      const amount = String(Number(inv.amount || 0).toFixed(2));
      const desc = safeStr(inv.description).toLowerCase();
      const category = safeStr(inv.category).toLowerCase();
      const creator = safeStr(inv.creatorNickname || inv.creatorName).toLowerCase();
      const date = safeStr(inv.recordDate || inv.date).toLowerCase();
      return amount.includes(kw) || desc.includes(kw) || category.includes(kw) || creator.includes(kw) || date.includes(kw);
    });
  }, [invoices, searchText]);

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
                background: '#1A2B4A',
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
                {/* 底部：状态 + 审批通过按钮 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                      backgroundColor: inv.ajStatus === 'approved' ? '#4CAF50' : inv.ajStatus === 'rejected' ? '#BDBDBD' : '#F59E0B'
                    }} />
                    <span style={{
                      fontSize: '12px', fontWeight: 500,
                      color: inv.ajStatus === 'approved' ? '#2E7D32' : inv.ajStatus === 'rejected' ? '#757575' : '#B45309'
                    }}>
                      {inv.ajStatus === 'approved' ? '已审核' : inv.ajStatus === 'rejected' ? '已拒绝' : '待审核'}
                    </span>
                  </div>
                  {(!inv.ajStatus || inv.ajStatus === 'pending') && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setApprovingId(inv.id);
                        approveMutation.mutate({ transactionId: inv.id, action: 'approved' });
                      }}
                      disabled={approvingId === inv.id}
                      style={{
                        background: '#1A2B4A', color: '#fff', border: 'none', borderRadius: '4px',
                        padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: approvingId === inv.id ? 'not-allowed' : 'pointer',
                        opacity: approvingId === inv.id ? 0.6 : 1, letterSpacing: '0.5px'
                      }}
                    >
                      {approvingId === inv.id ? '处理中...' : '审批通过'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'quarter' | 'year'>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  // 获取资方可见的企业列表
  const { data: myCompanies, isLoading: companiesLoading } = (trpc as any).ledger.ajOwnerGetMyCompanies.useQuery({ ledgerId });
  const companies: any[] = Array.isArray(myCompanies) ? myCompanies : [];

  // 企业加载完成后自动选中第一个
  useEffect(() => {
    if (!companiesLoading && companies.length > 0 && selectedCompanyId === null) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companiesLoading, companies.length]);

  // 切换企业时清空搜索
  useEffect(() => {
    setSearchText('');
  }, [selectedCompanyId]);

  // 统计数据
  const { data: stats, isLoading: statsLoading } = (trpc as any).ledger.ajOwnerGetCompanyStats.useQuery(
    { ledgerId, companyId: selectedCompanyId!, period },
    { enabled: selectedCompanyId != null }
  );

  const periodLabels: Record<string, string> = { all: '全部', day: '今日', week: '本周', month: '本月', quarter: '本季', year: '本年' };

  return (
    <div className="flex flex-col flex-1 bg-white">
      {/* 顶部深蓝色区域 */}
      <div style={{ backgroundColor: AJ_COLOR }} className="px-4 pt-3 pb-4">
        {/* 第一行：企业选择 + 时间筛选 */}
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
                value={selectedCompanyId ?? ''}
                onChange={e => setSelectedCompanyId(Number(e.target.value))}
                className="appearance-none w-full text-xs text-white/90 pl-2 pr-6 py-1 rounded-full border border-white/30 cursor-pointer outline-none focus:outline-none focus:ring-0 truncate"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
              >
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
        </div>
        {/* 统计数据行 */}
        {selectedCompanyId != null && (
          <div className="flex items-center justify-around w-full">
            <div className="text-center">
              <div className="text-white/60 text-[10px] mb-0.5">{periodLabels[period]}累计金额</div>
              <div className="text-white text-xl font-bold leading-none">
                {statsLoading ? '--' : `¥${Number(stats?.totalAmount || 0).toFixed(2)}`}
              </div>
            </div>
            <div className="w-px h-8 bg-white/20 flex-shrink-0" />
            <div className="text-center">
              <div className="text-white/60 text-[10px] mb-0.5">{periodLabels[period]}开票条数</div>
              <div className="text-white text-xl font-bold leading-none">
                {statsLoading ? '--' : `${Number(stats?.invoiceCount || 0)}`}
                <span className="text-white/60 text-xs font-normal ml-1">笔</span>
              </div>
            </div>
            {Number(stats?.salesmanCount || 0) > 0 && (
              <>
                <div className="w-px h-8 bg-white/20 flex-shrink-0" />
                <div className="text-center">
                  <div className="text-white/60 text-[10px] mb-0.5">业务员</div>
                  <div className="text-white text-xl font-bold leading-none">
                    {Number(stats.salesmanCount)}
                    <span className="text-white/60 text-xs font-normal ml-1">人</span>
                  </div>
                </div>
              </>
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
          <InvoiceListInline ledgerId={ledgerId} companyId={selectedCompanyId} period={period} searchText={searchText} />
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
