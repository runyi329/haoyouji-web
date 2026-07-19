// @ts-nocheck
import { useState } from "react";
import { mtrpc } from "./mibanTrpc";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Check, ChevronRight } from "lucide-react";
import { provinces, getCities, getDistricts } from "./regionData";

const QUICK_LABELS = ["家", "公司", "父母家"];
const LABEL_ICON: Record<string, string | null> = { "家": null, "公司": null, "父母家": null };

interface AddressFormProps {
  initial?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  saving?: boolean;
}

function AddressForm({ initial, onSave, onCancel, saving }: AddressFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [province, setProvince] = useState(initial?.province ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [label, setLabel] = useState(initial?.label ?? "家");
  const [customLabel, setCustomLabel] = useState(
    initial?.label && !QUICK_LABELS.includes(initial.label) ? initial.label : ""
  );
  const [showCustomInput, setShowCustomInput] = useState(
    !!(initial?.label && !QUICK_LABELS.includes(initial.label))
  );
  const [isDefault, setIsDefault] = useState(initial?.is_default === 1 || initial?.isDefault === true);
  const finalLabel = customLabel.trim() || label;

  // 直辖市：北京、天津、上海、重庆—市级和省级同名，自动跳过
  const isMunicipality = ["北京市", "天津市", "上海市", "重庆市"].includes(province);
  // 直辖市选省后自动设置 city = province
  const effectiveCity = isMunicipality ? province : city;
  const canSubmit = name.trim() && phone.trim() && province && (isMunicipality || city) && detail.trim();

  return (
    <div className="space-y-3">
      {/* 标签选择 */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto">
          {QUICK_LABELS.map(l => (
            <button
              key={l}
              onClick={() => { setLabel(l); setCustomLabel(""); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: label === l && !customLabel.trim() ? "#FF6900" : "#F5F5F5",
                color: label === l && !customLabel.trim() ? "#fff" : "#666",
              }}
            >
              {l}
            </button>
          ))}
          <button
              onClick={() => { setShowCustomInput(v => !v); if (showCustomInput) setCustomLabel(""); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: showCustomInput ? "#FF6900" : "#F5F5F5",
                color: showCustomInput ? "#fff" : "#666",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              自定义
            </button>
        </div>
        {showCustomInput && (
          <input
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder="输入标签名（如：张三的家）"
            maxLength={20}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none"
            style={{ borderColor: "#FF6900" }}
          />
        )}
      </div>

      {/* 姓名 + 手机 */}
      <div className="flex gap-2">
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="收货人姓名"
          className="w-0 flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none"
        />
        <input
          value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="手机号码" type="tel"
          className="w-0 flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none"
        />
      </div>

      {/* 省市区三级联动 */}
      <select
        value={province}
        onChange={e => { setProvince(e.target.value); setCity(""); setDistrict(""); }}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white"
      >
        <option value="">选择省/直辖市/自治区</option>
        {provinces.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      {/* 直辖市跳过市级，直接选区县 */}
      {!isMunicipality ? (
        <div className="flex gap-2">
          <select
            value={city}
            onChange={e => { setCity(e.target.value); setDistrict(""); }}
            disabled={!province}
            className="w-0 flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white disabled:opacity-40"
          >
            <option value="">选择市/地区</option>
            {getCities(province).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={district}
            onChange={e => setDistrict(e.target.value)}
            disabled={!city}
            className="w-0 flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white disabled:opacity-40"
          >
            <option value="">选择区/县</option>
            {getDistricts(province, city).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      ) : (
        <select
          value={district}
          onChange={e => setDistrict(e.target.value)}
          disabled={!province}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white disabled:opacity-40"
        >
          <option value="">选择区/县</option>
          {getDistricts(province, province).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )}

      {/* 详细地址 */}
      <input
        value={detail} onChange={e => setDetail(e.target.value)}
        placeholder="详细地址（街道、楼栋、门牌号）"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none"
      />

      {/* 设为默认 */}
      <button
        onClick={() => setIsDefault(v => !v)}
        className="flex items-center gap-2 text-[13px] text-gray-600"
      >
        <div
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
          style={{ borderColor: isDefault ? "#FF6900" : "#DDD", background: isDefault ? "#FF6900" : "transparent" }}
        >
          {isDefault && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
        设为默认地址
      </button>

      {/* 按钮 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-gray-600 active:scale-95 transition-transform"
        >
          取消
        </button>
        <button
          onClick={() => onSave({ name, phone, province, city: effectiveCity, district, detail, label: finalLabel, isDefault })}
          disabled={!canSubmit || saving}
          className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white active:scale-95 transition-transform disabled:opacity-40"
          style={{ background: "#FF6900" }}
        >
          {saving ? "保存中…" : "保存地址"}
        </button>
      </div>
    </div>
  );
}

// ─── 地址卡片 ─────────────────────────────────────────────────────────────────
function AddressCard({ addr, onEdit, onDelete, onSetDefault, selectable, onSelect }: {
  addr: any;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
  selectable?: boolean;
  onSelect?: (addr: any) => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${selectable ? "cursor-pointer active:scale-[0.99]" : ""} ${addr.is_default ? "border-orange-200" : "border-gray-100"}`}
      onClick={selectable ? () => onSelect?.(addr) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px] font-bold text-black">{addr.name}</span>
            <span className="text-[12px] text-gray-500">{addr.phone}</span>
            <span
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{ background: "#FFF3EC", color: "#FF6900" }}
            >
              {LABEL_ICON[addr.label] ?? null}
              {addr.label}
            </span>
            {addr.is_default === 1 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-500">默认</span>
            )}
          </div>
          <p className="text-[13px] text-gray-500 leading-relaxed">
            {addr.province}{addr.city !== addr.province ? addr.city : ""}{addr.district} {addr.detail}
          </p>
        </div>
        {selectable && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />}
      </div>

      {!selectable && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
          {addr.is_default !== 1 && (
            <button
              onClick={e => { e.stopPropagation(); onSetDefault?.(); }}
              className="text-[12px] text-gray-400 hover:text-orange-500 transition-colors"
            >
              设为默认
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={e => { e.stopPropagation(); onEdit?.(); }}
            className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-black transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> 编辑
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete?.(); }}
            className="flex items-center gap-1 text-[12px] text-red-400 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> 删除
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 地址簿主组件 ─────────────────────────────────────────────────────────────
// mode: "manage" = 我的页面管理模式; "select" = 下单时选择模式
export default function AddressBook({
  mode = "manage",
  onSelect,
}: {
  mode?: "manage" | "select";
  onSelect?: (addr: any) => void;
}) {
  const utils = mtrpc.useUtils();
  const { data: addresses, isLoading } = mtrpc.address.list.useQuery();
  const addMut = mtrpc.address.add.useMutation({
    onSuccess: () => { utils.address.list.invalidate(); toast.success("地址已保存"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = mtrpc.address.update.useMutation({
    onSuccess: () => { utils.address.list.invalidate(); toast.success("地址已更新"); setEditAddr(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = mtrpc.address.delete.useMutation({
    onSuccess: () => { utils.address.list.invalidate(); toast.success("地址已删除"); },
    onError: (e) => toast.error(e.message),
  });
  const setDefaultMut = mtrpc.address.setDefault.useMutation({
    onSuccess: () => { utils.address.list.invalidate(); toast.success("已设为默认地址"); },
    onError: (e) => toast.error(e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [editAddr, setEditAddr] = useState<any>(null);

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
    </div>
  );

  const list = addresses ?? [];

  return (
    <div className="space-y-3">
      {/* 选择模式标题 */}
      {mode === "select" && (
        <p className="text-[13px] font-semibold text-black mb-1">选择收货地址</p>
      )}

      {/* 地址列表 */}
      {list.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-10 text-center">
          <MapPin className="w-10 h-10 mb-3 text-gray-200" />
          <p className="text-[13px] text-gray-400 mb-4">还没有保存的地址</p>
        </div>
      )}

      {list.map((addr: any) => (
        <div key={addr.id}>
          {editAddr?.id === addr.id ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-200">
              <p className="text-[13px] font-semibold text-black mb-3">编辑地址</p>
              <AddressForm
                initial={editAddr}
                onSave={(data) => updateMut.mutate({ id: addr.id, ...data })}
                onCancel={() => setEditAddr(null)}
                saving={updateMut.isPending}
              />
            </div>
          ) : (
            <AddressCard
              addr={addr}
              selectable={mode === "select"}
              onSelect={onSelect}
              onEdit={() => setEditAddr(addr)}
              onDelete={() => {
                if (confirm("确认删除这个地址？")) deleteMut.mutate({ id: addr.id });
              }}
              onSetDefault={() => setDefaultMut.mutate({ id: addr.id })}
            />
          )}
        </div>
      ))}

      {/* 新增表单 */}
      {showForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-200">
          <p className="text-[13px] font-semibold text-black mb-3">新增地址</p>
          <AddressForm
            onSave={(data) => addMut.mutate(data)}
            onCancel={() => setShowForm(false)}
            saving={addMut.isPending}
          />
        </div>
      )}

      {/* 新增按钮 */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-[15px] rounded-xl text-[15px] font-bold text-white tracking-wide active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          style={{ background: "#FF6900" }}
        >
          <Plus className="w-5 h-5" />
          {list.length === 0 ? "添加收货地址" : "新增地址"}
        </button>
      )}
    </div>
  );
}
