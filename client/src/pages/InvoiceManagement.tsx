import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Search, Trash2, Edit2, Check, X, Star, StarOff,
  Settings, Building2, FileText, ChevronRight, Loader2, Save, RefreshCw,
  ToggleLeft, ToggleRight, Eye, EyeOff
} from 'lucide-react';

// ─── 类型 ────────────────────────────────────────────────────────────────────
interface InvoiceHeader {
  id: number;
  company_name: string;
  tax_no: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  remark: string;
  is_default: number;
  source_project: string;
}

interface InvoiceConfig {
  api_provider: string;
  api_key_masked: string;
  has_api_key: boolean;
  enabled_projects: string[];
  query_count: number;
}

interface SearchResult {
  company_name: string;
  tax_no: string;
  address: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  saved: boolean;
  id?: number;
}

// ─── 子项目列表 ──────────────────────────────────────────────────────────────
const ALL_PROJECTS = [
  { key: 'yaban', label: '牙伴齿科' },
  { key: 'global', label: '全局（所有项目）' },
];

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function InvoiceManagement() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'headers' | 'search' | 'settings'>('headers');

  // 抬头列表
  const [headers, setHeaders] = useState<InvoiceHeader[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  // 搜索
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 新增/编辑弹窗
  const [showForm, setShowForm] = useState(false);
  const [editingHeader, setEditingHeader] = useState<InvoiceHeader | null>(null);
  const [formData, setFormData] = useState({
    company_name: '', tax_no: '', address: '', phone: '',
    bank_name: '', bank_account: '', remark: '', is_default: false,
  });
  const [saving, setSaving] = useState(false);

  // 配置
  const [config, setConfig] = useState<InvoiceConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    api_provider: 'tencent',
    api_key: '',
    enabled_projects: [] as string[],
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // ─── 加载抬头列表 ──────────────────────────────────────────────────────────
  const loadHeaders = async () => {
    setLoadingHeaders(true);
    try {
      const res = await fetch('/api/invoice/headers');
      const data = await res.json();
      if (data.ok) setHeaders(data.headers || []);
    } catch {
      toast.error('加载发票抬头失败');
    } finally {
      setLoadingHeaders(false);
    }
  };

  // ─── 加载配置 ──────────────────────────────────────────────────────────────
  const loadConfig = async () => {
    try {
      const res = await fetch('/api/invoice/config');
      const data = await res.json();
      if (data.ok) {
        setConfig(data.config);
        setConfigForm({
          api_provider: data.config.api_provider || 'tencent',
          api_key: '',
          enabled_projects: data.config.enabled_projects || [],
        });
      }
    } catch {
      toast.error('加载配置失败');
    }
  };

  useEffect(() => {
    loadHeaders();
    loadConfig();
  }, []);

  // ─── 搜索（防抖） ──────────────────────────────────────────────────────────
  const handleSearchInput = (val: string) => {
    setSearchKeyword(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/invoice/search?name=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        if (data.ok) {
          setSearchResults(data.results || []);
          if (data.hint) toast.info(data.hint);
        }
      } catch {
        toast.error('查询失败');
      } finally {
        setSearching(false);
      }
    }, 600);
  };

  // ─── 从搜索结果填入表单 ────────────────────────────────────────────────────
  const fillFromResult = (r: SearchResult) => {
    setFormData({
      company_name: r.company_name,
      tax_no: r.tax_no,
      address: r.address || '',
      phone: r.phone || '',
      bank_name: r.bank_name || '',
      bank_account: r.bank_account || '',
      remark: '',
      is_default: false,
    });
    setEditingHeader(null);
    setShowForm(true);
    setActiveTab('headers');
    toast.success('已填入开票信息，请确认后保存');
  };

  // ─── 打开新增/编辑表单 ────────────────────────────────────────────────────
  const openAddForm = () => {
    setEditingHeader(null);
    setFormData({ company_name: '', tax_no: '', address: '', phone: '', bank_name: '', bank_account: '', remark: '', is_default: false });
    setShowForm(true);
  };

  const openEditForm = (h: InvoiceHeader) => {
    setEditingHeader(h);
    setFormData({
      company_name: h.company_name,
      tax_no: h.tax_no,
      address: h.address || '',
      phone: h.phone || '',
      bank_name: h.bank_name || '',
      bank_account: h.bank_account || '',
      remark: h.remark || '',
      is_default: h.is_default === 1,
    });
    setShowForm(true);
  };

  // ─── 保存抬头 ──────────────────────────────────────────────────────────────
  const saveHeader = async () => {
    if (!formData.company_name.trim() || !formData.tax_no.trim()) {
      toast.error('公司名称和税号为必填项');
      return;
    }
    setSaving(true);
    try {
      const url = editingHeader
        ? `/api/invoice/headers/${editingHeader.id}`
        : '/api/invoice/headers';
      const method = editingHeader ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, is_default: formData.is_default ? 1 : 0 }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(editingHeader ? '更新成功' : '保存成功');
        setShowForm(false);
        loadHeaders();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // ─── 删除抬头 ──────────────────────────────────────────────────────────────
  const deleteHeader = async (id: number) => {
    if (!confirm('确认删除该发票抬头？')) return;
    try {
      const res = await fetch(`/api/invoice/headers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        toast.success('已删除');
        loadHeaders();
      }
    } catch {
      toast.error('删除失败');
    }
  };

  // ─── 设为默认 ──────────────────────────────────────────────────────────────
  const setDefault = async (h: InvoiceHeader) => {
    try {
      const res = await fetch(`/api/invoice/headers/${h.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...h, is_default: 1 }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('已设为默认抬头');
        loadHeaders();
      }
    } catch {
      toast.error('操作失败');
    }
  };

  // ─── 保存配置 ──────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const body: any = {
        api_provider: configForm.api_provider,
        enabled_projects: configForm.enabled_projects,
      };
      if (configForm.api_key.trim()) {
        body.api_key = configForm.api_key.trim();
      }
      const res = await fetch('/api/invoice/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success('配置已保存');
        loadConfig();
        setConfigForm(prev => ({ ...prev, api_key: '' }));
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingConfig(false);
    }
  };

  // ─── 切换子项目开关 ────────────────────────────────────────────────────────
  const toggleProject = (key: string) => {
    setConfigForm(prev => {
      const list = prev.enabled_projects.includes(key)
        ? prev.enabled_projects.filter(p => p !== key)
        : [...prev.enabled_projects, key];
      return { ...prev, enabled_projects: list };
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-[480px] mx-auto">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          <span className="font-semibold text-gray-800 text-base">发票管理</span>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white border-b border-gray-100 flex">
        {[
          { key: 'headers', label: '抬头列表' },
          { key: 'search', label: '查询税号' },
          { key: 'settings', label: '设置' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-8">

        {/* ── Tab: 抬头列表 ── */}
        {activeTab === 'headers' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">共 {headers.length} 条抬头</span>
              <Button size="sm" onClick={openAddForm} className="h-8 gap-1 text-xs">
                <Plus size={14} /> 新增抬头
              </Button>
            </div>

            {loadingHeaders ? (
              <div className="flex justify-center py-10">
                <Loader2 size={24} className="animate-spin text-blue-500" />
              </div>
            ) : headers.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <FileText size={40} className="mx-auto mb-3 opacity-30" />
                <p>暂无发票抬头</p>
                <p className="text-xs mt-1">可在「查询税号」Tab 搜索公司后一键保存</p>
              </div>
            ) : (
              headers.map(h => (
                <div key={h.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800 text-sm leading-tight">{h.company_name}</span>
                        {h.is_default === 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 font-medium">默认</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 font-mono">{h.tax_no}</p>
                      {h.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{h.address}</p>}
                      {h.bank_name && <p className="text-xs text-gray-400 truncate">{h.bank_name} {h.bank_account}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {h.is_default !== 1 && (
                        <button onClick={() => setDefault(h)} title="设为默认" className="p-1.5 text-gray-400 hover:text-yellow-500">
                          <StarOff size={15} />
                        </button>
                      )}
                      {h.is_default === 1 && (
                        <span className="p-1.5 text-yellow-500">
                          <Star size={15} />
                        </span>
                      )}
                      <button onClick={() => openEditForm(h)} className="p-1.5 text-gray-400 hover:text-blue-500">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => deleteHeader(h.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: 查询税号 ── */}
        {activeTab === 'search' && (
          <div className="p-4 space-y-4">
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
              输入公司名称（至少2个字），自动从本地抬头库或第三方数据库查询税号等开票信息。
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="输入公司名称..."
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-blue-400"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
              )}
            </div>

            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm">{r.company_name}</p>
                        <p className="text-xs text-gray-500 mt-1 font-mono">{r.tax_no}</p>
                        {r.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.address}</p>}
                        {r.bank_name && <p className="text-xs text-gray-400 truncate">{r.bank_name}</p>}
                        {r.saved && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600">已保存</span>
                        )}
                      </div>
                      {!r.saved && (
                        <Button size="sm" variant="outline" onClick={() => fillFromResult(r)} className="h-8 text-xs shrink-0">
                          <Plus size={13} className="mr-1" /> 保存
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchKeyword.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Building2 size={36} className="mx-auto mb-2 opacity-30" />
                <p>未找到相关公司</p>
                <p className="text-xs mt-1">可手动新增抬头</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: 设置 ── */}
        {activeTab === 'settings' && (
          <div className="p-4 space-y-4">
            {/* API配置 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-blue-600" />
                <span className="font-medium text-gray-800 text-sm">税号查询API配置</span>
              </div>

              {config && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                  <p>当前供应商：<span className="text-gray-700 font-medium">{config.api_provider === 'tencent' ? '腾讯云' : '天远数据'}</span></p>
                  <p>API Key：<span className="font-mono">{config.has_api_key ? config.api_key_masked : '未配置'}</span></p>
                  <p>累计查询：<span className="text-blue-600 font-medium">{config.query_count} 次</span></p>
                </div>
              )}

              {/* 供应商选择 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">API 供应商</label>
                <div className="flex gap-2">
                  {[
                    { key: 'tencent', label: '腾讯云' },
                    { key: 'tianyuan', label: '天远数据' },
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => setConfigForm(prev => ({ ...prev, api_provider: p.key }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        configForm.api_provider === p.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {configForm.api_provider === 'tencent' && (
                  <p className="text-[11px] text-gray-400 mt-1">腾讯云格式：SecretId|SecretKey（用竖线分隔）</p>
                )}
              </div>

              {/* API Key 输入 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  {config?.has_api_key ? '更新 API Key（留空则不修改）' : '填写 API Key'}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={configForm.api_key}
                    onChange={e => setConfigForm(prev => ({ ...prev, api_key: e.target.value }))}
                    placeholder={config?.has_api_key ? '留空则保持原Key不变' : '请输入API Key...'}
                    className="w-full pr-10 pl-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 font-mono"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {/* 子项目开放控制 */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <ChevronRight size={16} className="text-blue-600" />
                <span className="font-medium text-gray-800 text-sm">子项目开放控制</span>
              </div>
              <p className="text-xs text-gray-400">控制哪些子项目可以调用发票查询功能</p>
              {ALL_PROJECTS.map(p => {
                const enabled = configForm.enabled_projects.includes(p.key);
                return (
                  <div key={p.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{p.label}</span>
                    <button onClick={() => toggleProject(p.key)} className={enabled ? 'text-blue-600' : 'text-gray-300'}>
                      {enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                    </button>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={saveConfig}
              disabled={savingConfig}
              className="w-full h-11 text-sm font-medium"
            >
              {savingConfig ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
              保存配置
            </Button>
          </div>
        )}
      </div>

      {/* ── 新增/编辑弹窗 ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl w-full max-w-[480px] max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm">
                {editingHeader ? '编辑发票抬头' : '新增发票抬头'}
              </span>
              <button onClick={() => setShowForm(false)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { key: 'company_name', label: '公司名称 *', placeholder: '请输入完整公司名称' },
                { key: 'tax_no', label: '纳税人识别号 *', placeholder: '18位统一社会信用代码' },
                { key: 'address', label: '注册地址', placeholder: '选填' },
                { key: 'phone', label: '注册电话', placeholder: '选填' },
                { key: 'bank_name', label: '开户银行', placeholder: '选填' },
                { key: 'bank_account', label: '银行账号', placeholder: '选填' },
                { key: 'remark', label: '备注', placeholder: '选填' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{field.label}</label>
                  <input
                    type="text"
                    value={(formData as any)[field.key]}
                    onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              ))}

              {/* 设为默认 */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-700">设为默认抬头</span>
                <button
                  onClick={() => setFormData(prev => ({ ...prev, is_default: !prev.is_default }))}
                  className={formData.is_default ? 'text-blue-600' : 'text-gray-300'}
                >
                  {formData.is_default ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                </button>
              </div>

              <div className="flex gap-3 pt-2 pb-4">
                <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-11">
                  取消
                </Button>
                <Button onClick={saveHeader} disabled={saving} className="flex-1 h-11">
                  {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Check size={16} className="mr-1" />}
                  {editingHeader ? '更新' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
