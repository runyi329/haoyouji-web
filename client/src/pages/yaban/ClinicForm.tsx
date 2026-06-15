/**
 * 牙伴齿科 - 医院详细信息表单（创始人后台 / 院长企业信息 共用）
 * 字段：名称/简称/类型/法人/联系人/电话/省市区/地址/许可证/营业执照/开业日期/规模/简介/备注
 * 规范：移动端优先、蓝白风格、严禁 Emoji
 */
import { useState, useEffect } from "react";

export type ClinicFormValue = {
  name: string;
  shortName: string;
  taxNo: string;
  clinicType: string;
  legalPerson: string;
  contactName: string;
  contactPhone: string;
  province: string;
  city: string;
  district: string;
  address: string;
  licenseNo: string;
  businessLicenseNo: string;
  establishedDate: string;
  scale: string;
  intro: string;
  remark: string;
};

export const EMPTY_CLINIC: ClinicFormValue = {
  name: "",
  shortName: "",
  taxNo: "",
  clinicType: "",
  legalPerson: "",
  contactName: "",
  contactPhone: "",
  province: "",
  city: "",
  district: "",
  address: "",
  licenseNo: "",
  businessLicenseNo: "",
  establishedDate: "",
  scale: "",
  intro: "",
  remark: "",
};

const CLINIC_TYPES = ["口腔诊所", "口腔门诊部", "口腔医院", "综合医院口腔科", "连锁机构", "其他"];
const SCALES = ["1-3张牙椅", "4-6张牙椅", "7-10张牙椅", "10张以上"];

export function fromClinic(c: any): ClinicFormValue {
  return {
    name: c?.name || "",
    shortName: c?.shortName || "",
    taxNo: c?.taxNo || "",
    clinicType: c?.clinicType || "",
    legalPerson: c?.legalPerson || "",
    contactName: c?.contactName || "",
    contactPhone: c?.contactPhone || "",
    province: c?.province || "",
    city: c?.city || "",
    district: c?.district || "",
    address: c?.address || "",
    licenseNo: c?.licenseNo || "",
    businessLicenseNo: c?.businessLicenseNo || "",
    establishedDate: c?.establishedDate ? String(c.establishedDate).slice(0, 10) : "",
    scale: c?.scale || "",
    intro: c?.intro || "",
    remark: c?.remark || "",
  };
}

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">
      {label}
      {required && <span className="text-[#DC2626] ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#2196C8] bg-white";

export default function ClinicForm({
  value,
  onChange,
  showRemark = false,
}: {
  value: ClinicFormValue;
  onChange: (v: ClinicFormValue) => void;
  showRemark?: boolean;
}) {
  const [v, setV] = useState<ClinicFormValue>(value);

  useEffect(() => {
    setV(value);
  }, [value]);

  const set = (k: keyof ClinicFormValue, val: string) => {
    const nv = { ...v, [k]: val };
    setV(nv);
    onChange(nv);
  };

  return (
    <div className="space-y-3">
      <Field label="医院/机构名称" required>
        <input className={inputCls} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="如：星光口腔门诊部" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="简称">
          <input className={inputCls} value={v.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="如：星光口腔" />
        </Field>
        <Field label="机构类型">
          <select className={inputCls} value={v.clinicType} onChange={(e) => set("clinicType", e.target.value)}>
            <option value="">请选择</option>
            {CLINIC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="法定代表人">
          <input className={inputCls} value={v.legalPerson} onChange={(e) => set("legalPerson", e.target.value)} placeholder="法人姓名" />
        </Field>
        <Field label="开业日期">
          <input type="date" className={inputCls} value={v.establishedDate} onChange={(e) => set("establishedDate", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="联系人">
          <input className={inputCls} value={v.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="联系人姓名" />
        </Field>
        <Field label="联系电话">
          <input className={inputCls} value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="手机/座机" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="省">
          <input className={inputCls} value={v.province} onChange={(e) => set("province", e.target.value)} placeholder="省" />
        </Field>
        <Field label="市">
          <input className={inputCls} value={v.city} onChange={(e) => set("city", e.target.value)} placeholder="市" />
        </Field>
        <Field label="区/县">
          <input className={inputCls} value={v.district} onChange={(e) => set("district", e.target.value)} placeholder="区/县" />
        </Field>
      </div>

      <Field label="详细地址">
        <input className={inputCls} value={v.address} onChange={(e) => set("address", e.target.value)} placeholder="街道门牌号" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="营业执照号">
          <input className={inputCls} value={v.businessLicenseNo} onChange={(e) => set("businessLicenseNo", e.target.value)} placeholder="统一社会信用代码" />
        </Field>
        <Field label="税号">
          <input className={inputCls} value={v.taxNo} onChange={(e) => set("taxNo", e.target.value)} placeholder="纳税人识别号" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="医疗机构许可证号">
          <input className={inputCls} value={v.licenseNo} onChange={(e) => set("licenseNo", e.target.value)} placeholder="执业许可证号" />
        </Field>
        <Field label="规模">
          <select className={inputCls} value={v.scale} onChange={(e) => set("scale", e.target.value)}>
            <option value="">请选择</option>
            {SCALES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="机构简介">
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          value={v.intro}
          onChange={(e) => set("intro", e.target.value)}
          placeholder="机构简介、特色项目等"
        />
      </Field>

      {showRemark && (
        <Field label="内部备注（仅创始人可见）">
          <textarea
            className={inputCls + " resize-none"}
            rows={2}
            value={v.remark}
            onChange={(e) => set("remark", e.target.value)}
            placeholder="内部备注信息"
          />
        </Field>
      )}
    </div>
  );
}
