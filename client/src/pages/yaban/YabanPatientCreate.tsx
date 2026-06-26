/**
 * 牙伴齿科管理 - 新建顾客
 * 路由：/yaban/patient/create
 * 蓝白风格，3 个 Tab：个人信息（含联系方式）/ 顾客信息（含AI健康标签）/ 首诊信息
 * 顶栏：取消 / 新建顾客 / 保存；含「仅显示必填字段」开关
 * 布局：字段按实际输入宽度自适应流式排布，窄字段同行并排，充分利用横向空间
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronDown, ChevronRight, XCircle, Check, UserRound, Camera, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import MedicalHistoryPicker, { serializeHistory, parseHistory } from "./MedicalHistoryPicker";
import AddressPicker from "./AddressPicker";
import AvatarPicker from "./AvatarPicker";
import { autoAvatarKey, avatarSrc, type AvatarKey } from "@/lib/yaban-avatar";
import { searchOccupations } from "./occupationData";
import LicensePlatePicker from "./LicensePlatePicker";

// 主题色
const ACCENT = "#1E88D6";

// Tab 定义

// 选项配置
const GENDERS = ["无", "男", "女"];
const PATIENT_TYPES = ["电子", "临时", "普通"];
// 顾客来源：「到店」展开为三个子选项（路过/家近/公司近）
const SOURCES = [
  "到店（路过）", "到店（家近）", "到店（公司近）",
  "转介绍", "网络预约", "电话预约", "微信预约", "老顾客推荐", "其他",
];
// 需要以蓝色标签形式展示的“到店”类选项
const STORE_VISIT_SOURCES = ["到店（路过）", "到店（家近）", "到店（公司近）"];
const NET_CONSULTANTS = ["杨文利", "侯睿", "洪紫钥"];
const CONSULTANTS = ["洪紫钥", "杨文利", "侯睿"];
const RELATIONS = ["配偶", "父母", "子女", "兄弟姐妹", "亲戚", "朋友", "其他"];

// 字段类型
type FieldKind = "input" | "select" | "textarea" | "history" | "address" | "occupation" | "license-plate" | "readonly";

// 字段宽度档位：窄字段同行并排，宽字段独占
// narrow ≈ 半屏内可挤 2-3 个；half ≈ 半屏；full ≈ 整行
type FieldWidth = "narrow" | "half" | "full" | "name" | "gender" | "auto" | "date" | "tiny" | "zodiac";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  inputType?: string;
  readOnly?: boolean;
  width?: FieldWidth; // 默认 full
}

// 字段分组（取消 Tab，改为连续表单：个人信息 -> 顾客信息；首诊信息已移入「诊疗记录」）
const PERSONAL_FIELDS: FieldDef[] = [
  { key: "name", label: "姓名", placeholder: "请输入姓名", kind: "input", width: "name" },
  { key: "nickname", label: "昵称", placeholder: "请输入昵称", kind: "input", width: "auto" },
  { key: "gender", label: "性别", placeholder: "无", kind: "select", options: GENDERS, width: "gender" },
  { key: "birthday", label: "生日", placeholder: "请选择", kind: "input", inputType: "date", width: "date" },
  { key: "age", label: "年龄", placeholder: "", kind: "input", inputType: "number", width: "tiny" },
  { key: "zodiac", label: "星座", placeholder: "", kind: "input", readOnly: true, width: "zodiac" },
  { key: "chineseZodiac", label: "生肖", placeholder: "", kind: "input", readOnly: true, width: "zodiac" },
  { key: "mobile", label: "手机", placeholder: "请输入手机号", kind: "input", inputType: "tel", width: "half" },
  { key: "medicalNo", label: "顾客编号", placeholder: "系统自动生成", kind: "input", readOnly: true, width: "half" },
  { key: "emergencyContact", label: "紧急联系人", placeholder: "姓名", kind: "input", width: "half" },
  { key: "emergencyRelation", label: "关系", placeholder: "请选择", kind: "select", options: RELATIONS, width: "half" },
  { key: "occupation", label: "职业", placeholder: "搜索职业名称…", kind: "occupation", width: "half" },
  { key: "emergencyPhone", label: "联系人电话", placeholder: "电话", kind: "input", inputType: "tel", width: "full" },
  { key: "email", label: "邮箱", placeholder: "请输入邮箱地址", kind: "input", inputType: "email", width: "full" },
  { key: "address", label: "地址", placeholder: "点击选择省市区并填写门牌号", kind: "address", width: "full" },
  { key: "licensePlate", label: "车牌", placeholder: "点击输入车牌号", kind: "license-plate", width: "half" },
];
const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "patientType", label: "顾客类型", placeholder: "电子", kind: "select", options: PATIENT_TYPES, width: "half" },
  { key: "source", label: "顾客来源", placeholder: "请选择", kind: "select", options: SOURCES, width: "half" },
  { key: "netConsultant", label: "网电咨询师", placeholder: "请选择", kind: "select", options: NET_CONSULTANTS, width: "half" },
  { key: "consultant", label: "咨询师", placeholder: "请选择", kind: "select", options: CONSULTANTS, width: "half" },
  { key: "_yabanAccount", label: "牙伴账号", placeholder: "", kind: "readonly", width: "half" },
  { key: "_yabanPassword", label: "初始密码", placeholder: "", kind: "readonly", width: "half" },
  { key: "referrerUsername", label: "推荐人", placeholder: "搜索脉动网用户名", kind: "input", width: "full" },
  { key: "history", label: "AI健康标签", placeholder: "点击选择或搜索", kind: "history", width: "full" },
  { key: "patientRemark", label: "顾客备注", placeholder: "请输入顾客备注", kind: "textarea", width: "full" },
];
// 所有字段（用于必填校验等遍历）
const ALL_FIELDS: FieldDef[] = [...PERSONAL_FIELDS, ...CUSTOMER_FIELDS];

// 宽度档位 → flex-basis（基于容器百分比，配合 flex-wrap 自动换行）
const WIDTH_BASIS: Record<FieldWidth, string> = {
  narrow: "calc(33.333% - 8px)",
  half: "calc(50% - 6px)",
  full: "100%",
  // 首行：姓名约4字宽、性别约1字宽、昵称占满剩余（姓名+性别+昵称同一行）
  name: "108px",
  gender: "92px",
  auto: "100px",
  // 生日/年龄/星座同行：生日弹性占余，年龄最窄，星座够3字
  date: "0",
  tiny: "0",
  zodiac: "0",
};

// 根据生日年份计算生肖
function calcChineseZodiac(birthday: string): string {
  if (!birthday) return "";
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return "";
  const animals = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
  // 1900 为鼠年，以此为基准取模
  const idx = ((d.getFullYear() - 1900) % 12 + 12) % 12;
  return animals[idx];
}

// 根据生日(YYYY-MM-DD)计算周岁年龄
function calcAge(birthday: string): string {
  if (!birthday) return "";
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  if (age < 0) age = 0; // 选了当天或未来日期时按 0 岁计，不返回空
  if (age > 150) return "";
  return String(age);
}

// 根据生日计算星座
function calcZodiac(birthday: string): string {
  if (!birthday) return "";
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const edges = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const names = [
    "摩羯", "水瓶", "双鱼", "白羊", "金牛", "双子",
    "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯",
  ];
  return day < edges[month - 1] ? names[month - 1] : names[month];
}

export default function YabanPatientCreate() {
  const [, setLocation] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  // 编辑模式：路由形如 /yaban/patient/:id/edit
  const [isEditRoute, editParams] = useRoute("/yaban/patient/:id/edit");
  const editId = isEditRoute && editParams?.id ? Number(editParams.id) : 0;
  const isEdit = editId > 0;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [licensePlateOpen, setLicensePlateOpen] = useState(false);
  // 头像：null 表示跟随年龄+性别自动适配；非 null 表示用户手动指定
  const [avatarManual, setAvatarManual] = useState<AvatarKey | null>(null);
  // 备用随机密码：页面加载时生成一次，无手机号时使用
  const [randomPwd] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  // 牙伴账号 / 初始密码提示弹窗
  const [yabanTipType, setYabanTipType] = useState<"account" | "password" | null>(null);
  // 推荐人搜索
  const [referrerSearch, setReferrerSearch] = useState("");
  const referrerQuery = trpc.yabanCustomer.searchReferrer.useQuery(
    { query: referrerSearch },
    { enabled: referrerSearch.length >= 1, refetchOnWindowFocus: false }
  );
  // 推荐人数（编辑模式下查询该顾客作为推荐人的人数）
  const referralCountQuery = trpc.yabanCustomer.getReferralCount.useQuery(
    { customerId: editId },
    { enabled: isEdit && editId > 0, refetchOnWindowFocus: false }
  );
  // 推荐列表弹窗
  const [referralListOpen, setReferralListOpen] = useState(false);
  const referralListQuery = trpc.yabanCustomer.getReferralList.useQuery(
    { customerId: editId },
    { enabled: referralListOpen && isEdit && editId > 0, refetchOnWindowFocus: false }
  );
  const [form, setForm] = useState<Record<string, string>>({
    gender: "无",
    patientType: "电子",
  });

  const setField = (key: string, value: string) => {
    setForm((prev) => {
      let v = value;
      // 年龄：仅保留整数，去除小数点与非数字字符，并去除前导零（06 -> 6）
      if (key === "age") {
        v = v.replace(/[^0-9]/g, "");
        if (v) v = String(parseInt(v, 10));
      }
      const next = { ...prev, [key]: v };
      // 选择生日时自动计算年龄与星座
      if (key === "birthday") {
        next.age = calcAge(value);
        next.zodiac = calcZodiac(value);
        next.chineseZodiac = calcChineseZodiac(value);
      }
      return next;
    });
  };

  // 预取系统将分配的顾客编号，仅新增模式使用（编辑模式编号由原数据回填）
  const previewCode = trpc.yabanCustomer.previewCode.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: !isEdit,
  });
  useEffect(() => {
    if (isEdit) return;
    const code = previewCode.data?.code;
    if (code) {
      setForm((prev) => (prev.medicalNo ? prev : { ...prev, medicalNo: code }));
    }
  }, [previewCode.data?.code, isEdit]);

  // 编辑模式：加载原顾客数据并回填表单
  const detailQuery = trpc.yabanCustomer.detail.useQuery(
    { id: editId },
    { enabled: isEdit, refetchOnWindowFocus: false }
  );
  useEffect(() => {
    const d = detailQuery.data as any;
    if (!isEdit || !d) return;
    setForm({
      name: d.name ?? "",
      gender: d.gender ?? "无",
      birthday: d.birthday ?? "",
      age: d.age != null ? String(d.age) : "",
      zodiac: d.zodiac ?? "",
      chineseZodiac: d.chinese_zodiac ?? "",
      patientType: d.patient_type ?? "电子",
      medicalNo: d.medical_no ?? "",
      nickname: d.nickname ?? "",
      email: d.email ?? "",
      mobile: d.mobile ?? "",
      phone: d.phone ?? "",
      region: d.region ?? "",
      address: d.address ?? "",
      licensePlate: d.license_plate ?? "",
      emergencyContact: d.emergency_contact ?? "",
      emergencyRelation: d.emergency_relation ?? "",
      occupation: d.occupation ?? "",
      emergencyPhone: d.emergency_phone ?? "",
      source: d.source ?? "",
      netConsultant: d.net_consultant ?? "",
      consultant: d.consultant ?? "",
      yabanUsername: d.yaban_username ?? "",
      yabanPassword: d.yaban_password ?? "",
      referrerUsername: d.referrer_username ?? "",
      history: d.history ?? "",
      patientRemark: d.remark ?? "",
      chiefComplaint: d.chief_complaint ?? "",
    });
    if (d.avatar) setAvatarManual(d.avatar as AvatarKey);
  }, [detailQuery.data, isEdit]);

  const handleBack = () => {
    if (isEdit) {
      setLocation(`/yaban/patient/${editId}`);
    } else {
      setLocation("/yaban");
    }
  };

  const utils = trpc.useUtils();
  const createMutation = trpc.yabanCustomer.create.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      utils.yabanCustomer.list.invalidate();
      setLocation("/yaban/patients");
    },
    onError: (e) => {
      toast.error(e.message || "保存失败，请重试");
    },
  });
  const updateMutation = trpc.yabanCustomer.update.useMutation({
    onSuccess: () => {
      toast.success("修改成功");
      utils.yabanCustomer.list.invalidate();
      utils.yabanCustomer.detail.invalidate({ id: editId });
      setLocation(`/yaban/patient/${editId}`);
    },
    onError: (e) => {
      toast.error(e.message || "保存失败，请重试");
    },
  });

  // 头像：手动选过则用手动值，否则按年龄+性别自动适配
  const autoKey = autoAvatarKey(form.age, form.gender);
  const effectiveAvatar: AvatarKey | null = avatarManual || autoKey;

  const handleSave = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    // 编辑模式下，若顾客数据尚未加载完成，禁止保存
    if (isEdit && !detailQuery.data) {
      toast.error("数据加载中，请稍候再保存");
      return;
    }
    // 姓名必填（按钮已禁用，此处作二次保护）
    if (!form.name?.trim()) return;
    // 新建时计算实际密码（手机号后6位或页面预生成的随机密码）
    const mob = (form.mobile || "").trim();
    const finalPwd = !isEdit
      ? (mob.length >= 6 ? mob.slice(-6) : randomPwd)
      : undefined; // 编辑模式不传密码，后端保持原值
    const payload = {
      name: form.name,
      gender: form.gender,
      birthday: form.birthday,
      age: form.age,
      zodiac: form.zodiac,
      chineseZodiac: form.chineseZodiac,
      patientType: form.patientType,
      nickname: form.nickname,
      email: form.email,
      mobile: form.mobile,
      phone: form.phone,
      region: form.region,
      address: form.address,
      licensePlate: form.licensePlate,
      emergencyContact: form.emergencyContact,
      emergencyRelation: form.emergencyRelation,
      occupation: form.occupation,
      emergencyPhone: form.emergencyPhone,
      avatar: effectiveAvatar || undefined,
      source: form.source,
      netConsultant: form.netConsultant,
      consultant: form.consultant,
      history: form.history,
      remark: form.patientRemark,
      referrerUsername: form.referrerUsername || undefined,
      ...(finalPwd !== undefined ? { yabanPassword: finalPwd } : {}),
    };
    if (isEdit) {
      // 编辑：不修改顾客编号，传入 id
      updateMutation.mutate({ ...payload, id: editId });
    } else {
      // 新增：顾客编号为只读预览值，由后端按实际流水生成（避免并发同号）
      createMutation.mutate({ ...payload, medicalNo: undefined });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="text-base font-medium" style={{ color: ACCENT }}>
            取消
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-base font-semibold text-gray-900 leading-tight">{isEdit ? "编辑顾客" : "新建顾客"}</h1>
            {clinicName && <span className="text-[11px] font-normal text-gray-400 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={handleSave} className="text-base font-medium" style={{ color: ACCENT }}>
            {createMutation.isPending || updateMutation.isPending ? "保存中" : "保存"}
          </button>
        </div>
      </div>

      {/* 表单内容区：连续表单（个人信息 -> 顾客信息） */}
      <div className="flex-1 overflow-y-auto pb-8">
        {/* 头像区：按年龄+性别自动适配，可点击更换 */}
        {(
          <div className="relative z-0 bg-white mt-2 px-3 pt-6 pb-4 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setAvatarOpen(true)}
              className="relative z-10 w-20 h-20 active:opacity-80"
            >
              <span className="block w-full h-full rounded-full overflow-hidden bg-gray-100">
                {effectiveAvatar ? (
                  <img
                    src={avatarSrc(effectiveAvatar)}
                    alt="顾客头像"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                    <UserRound className="w-9 h-9" />
                  </span>
                )}
              </span>
              {/* 相机角标：小尺寸，压在圆圈右下边缘，一半在圈内、一半在圈外 */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-white shadow-md"
                style={{ backgroundColor: ACCENT }}
              >
                <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
              </span>
            </button>
          </div>
        )}
        {/* 个人信息 */}
        <div className="bg-white mt-2 px-3 py-3">
          <div className="px-1 pb-2 text-[13px] font-semibold text-gray-800">个人信息</div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {PERSONAL_FIELDS.map((f) => (
              <FieldCell
                key={f.key}
                field={f}
                value={form[f.key] || ""}
                open={openKey === f.key}
                onInput={(v) => setField(f.key, v)}
                onToggle={() => setOpenKey(openKey === f.key ? null : f.key)}
                onSelect={(v) => {
                  setField(f.key, v);
                  setOpenKey(null);
                }}
                onOpenHistory={() => setHistoryOpen(true)}
                onOpenAddress={() => setAddressOpen(true)}
                onOpenLicensePlate={() => setLicensePlateOpen(true)}
              />
            ))}
          </div>
        </div>

        {/* 顾客信息 */}
        <div className="bg-white mt-2 px-3 py-3">
          <div className="px-1 pb-2 text-[13px] font-semibold text-gray-800">顾客信息</div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {(() => {
              // 新建模式：联动实时预览；编辑模式：显示第一次保存时固定的值（不可改）
              const uname = (form.name || "").trim();
              const mob = (form.mobile || "").trim();
              const previewAccount = isEdit ? (form.yabanUsername || "") : uname;
              const previewPwd = isEdit
                ? (form.yabanPassword || "")
                : (mob.length >= 6 ? mob.slice(-6) : uname ? randomPwd : "");
              return CUSTOMER_FIELDS.map((f) => {
                let displayValue = form[f.key] || "";
                if (f.key === "_yabanAccount") displayValue = previewAccount;
                if (f.key === "_yabanPassword") displayValue = previewPwd;

                // 推荐人字段：自定义搜索输入框 + 下拉候选列表
                if (f.key === "referrerUsername") {
                  const referrerResults = referrerSearch.length >= 1 ? (referrerQuery.data || []) : [];
                  const showDropdown = referrerSearch.length >= 1 && referrerResults.length > 0;
                  const refCount = referralCountQuery.data;
                  const directCount = refCount?.direct ?? 0;
                  const totalCount = refCount?.total ?? 0;
                  const countLabel = isEdit
                    ? (totalCount > 0 ? `直接${directCount}人 共${totalCount}人` : "暂无")
                    : "保存后显示";
                  return (
                    <div key={f.key} className="w-full flex gap-x-2 relative">
                      {/* 左：推荐人搜索 */}
                      <div className="relative" style={{ flex: "1 1 calc(50% - 6px)" }}>
                        <div className="px-1 pb-1 pt-0.5">
                          <span className="text-[11px] text-gray-400">推荐人</span>
                        </div>
                        <div className="flex items-center bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                          <input
                            type="text"
                            className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder-gray-300"
                            placeholder="搜索脉动网用户名"
                            value={form.referrerUsername || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setField("referrerUsername", v);
                              setReferrerSearch(v);
                            }}
                          />
                          {form.referrerUsername && (
                            <button
                              type="button"
                              className="ml-1 text-gray-300 active:text-gray-500"
                              onClick={() => { setField("referrerUsername", ""); setReferrerSearch(""); }}
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                        </div>
                        {showDropdown && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                            {referrerResults.map((u: any) => (
                              <button
                                key={u.id}
                                type="button"
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 active:bg-blue-100 border-b border-gray-50 last:border-0"
                                onClick={() => {
                                  setField("referrerUsername", u.username);
                                  setReferrerSearch("");
                                }}
                              >
                                <span className="font-medium">{u.username}</span>
                                {u.name && <span className="ml-2 text-gray-400 text-xs">{u.name}</span>}
                                {u.mobile && <span className="ml-2 text-gray-300 text-xs">{u.mobile}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 右：推荐人数（只读，可点击查看列表） */}
                      <div style={{ flex: "1 1 calc(50% - 6px)" }}>
                        <div className="px-1 pb-1 pt-0.5">
                          <span className="text-[11px] text-gray-400">已推荐人数</span>
                        </div>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 min-h-[42px] active:bg-gray-100"
                          onClick={() => isEdit && setReferralListOpen(true)}
                        >
                          <span className="text-sm" style={{ color: totalCount > 0 ? "#1E88D6" : undefined }}>
                            {countLabel}
                          </span>
                          {isEdit && totalCount > 0 && (
                            <ChevronRight size={14} className="text-gray-300 ml-1 flex-shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <FieldCell
                    key={f.key}
                    field={f}
                    value={displayValue}
                    open={openKey === f.key}
                    onInput={(v) => setField(f.key, v)}
                    onToggle={() => setOpenKey(openKey === f.key ? null : f.key)}
                    onSelect={(v) => {
                      setField(f.key, v);
                      setOpenKey(null);
                    }}
                    onOpenHistory={() => setHistoryOpen(true)}
                    onOpenAddress={() => setAddressOpen(true)}
                    onReadonlyClick={f.key === "_yabanAccount" || f.key === "_yabanPassword"
                      ? () => setYabanTipType(f.key === "_yabanAccount" ? "account" : "password")
                      : undefined
                    }
                  />
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* 底部固定保存按鈕 */}
      <div
        className="sticky bottom-0 left-0 right-0 px-4 pt-3 pb-8 bg-white border-t border-gray-100"
        style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}
      >
        {(() => {
          const isBusy = createMutation.isPending || updateMutation.isPending;
          const canSave = !!(form.name?.trim());
          const isDisabled = isBusy || !canSave;
          return (
            <button
              type="button"
              onClick={handleSave}
              disabled={isDisabled}
              className="w-full h-12 rounded-xl text-base font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{
                background: isDisabled ? "#C0C0C0" : ACCENT,
                boxShadow: isDisabled ? "none" : `0 3px 12px ${ACCENT}55`,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
            >
              {isBusy ? "保存中…" : "保存"}
            </button>
          );
        })()}
      </div>

      {/* AI健康标签选择器 */}
      {(() => {
        const parsed = parseHistory(form.history || "");
        return (
          <MedicalHistoryPicker
            open={historyOpen}
            value={parsed.names}
            remark={parsed.remark}
            onClose={() => setHistoryOpen(false)}
            onConfirm={(names, remark) => {
              setField("history", serializeHistory(names, remark));
              setHistoryOpen(false);
            }}
          />
        );
      })()}

      {/* 所在地区选择器（省市区级联 + 门牌号） */}
      <AddressPicker
        open={addressOpen}
        value={form.address || ""}
        onClose={() => setAddressOpen(false)}
        onConfirm={(full) => {
          setField("address", full);
          setAddressOpen(false);
        }}
      />

      {/* 头像选择器（12 款默认头像） */}
      <AvatarPicker
        open={avatarOpen}
        value={effectiveAvatar}
        onClose={() => setAvatarOpen(false)}
        onConfirm={(key) => {
          setAvatarManual(key);
          setAvatarOpen(false);
        }}
      />

      {/* 车牌输入器 */}
      <LicensePlatePicker
        open={licensePlateOpen}
        value={form.licensePlate || ""}
        onClose={() => setLicensePlateOpen(false)}
        onConfirm={(plate) => {
          setField("licensePlate", plate);
          setLicensePlateOpen(false);
        }}
      />

      {/* 牙伴账号 / 初始密码提示弹窗 */}
      {/* 推荐列表概览弹窗 */}
      {referralListOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setReferralListOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl px-5 pt-5 pb-10 max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <span className="text-base font-semibold text-gray-800">已推荐人员概览</span>
              <button type="button" onClick={() => setReferralListOpen(false)} className="text-gray-400">
                <X size={18} />
              </button>
            </div>
            {/* 统计摘要 */}
            {(() => {
              const cnt = referralCountQuery.data;
              return (
                <div className="flex gap-3 mb-4 flex-shrink-0">
                  <div className="flex-1 bg-blue-50 rounded-xl px-4 py-2.5 text-center">
                    <div className="text-lg font-bold" style={{ color: "#1E88D6" }}>{cnt?.direct ?? 0}</div>
                    <div className="text-xs text-gray-400 mt-0.5">直接推荐</div>
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-xl px-4 py-2.5 text-center">
                    <div className="text-lg font-bold" style={{ color: "#1E88D6" }}>{cnt?.total ?? 0}</div>
                    <div className="text-xs text-gray-400 mt-0.5">全部代数</div>
                  </div>
                </div>
              );
            })()}
            {/* 列表 */}
            <div className="overflow-y-auto flex-1">
              {referralListQuery.isLoading ? (
                <div className="text-center text-gray-400 text-sm py-8">加载中...</div>
              ) : !referralListQuery.data?.length ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无推荐记录</div>
              ) : (
                <div className="space-y-1">
                  {referralListQuery.data.map((item: any) => (
                    <div key={item.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#E3F0FB", color: "#1E88D6", minWidth: 28, textAlign: "center" }}>第{item.level}代</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{item.name || item.username}</div>
                        {item.name && item.username !== item.name && (
                          <div className="text-xs text-gray-400 truncate">{item.username}</div>
                        )}
                      </div>
                      {item.mobile && <span className="text-xs text-gray-400 flex-shrink-0">{item.mobile}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {yabanTipType && (() => {
        const uname = (form.name || "").trim();
        const mob = (form.mobile || "").trim();
        const previewAccount = isEdit ? (form.yabanUsername || "") : uname;
        const previewPwd = isEdit
          ? (form.yabanPassword || "")
          : (mob.length >= 6 ? mob.slice(-6) : uname ? randomPwd : "");
        const isAccount = yabanTipType === "account";
        const copyValue = isAccount ? previewAccount : previewPwd;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setYabanTipType(null)}>
            <div
              className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl px-5 pt-5 pb-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-base font-semibold text-gray-800">
                  {isAccount ? "牙伴账号说明" : "初始密码说明"}
                </span>
                <button type="button" onClick={() => setYabanTipType(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>

              {/* 当前内容展示 + 复制 */}
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 mb-4">
                <span className="flex-1 text-sm font-semibold" style={{ color: ACCENT }}>{copyValue || "—"}</span>
                {copyValue && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-white px-3 py-1.5 rounded-lg active:opacity-70"
                    style={{ background: ACCENT }}
                    onClick={() => {
                      navigator.clipboard.writeText(copyValue);
                      toast.success("已复制");
                    }}
                  >
                    <Copy className="w-3 h-3" />复制
                  </button>
                )}
              </div>

              {/* 引导文案 */}
              <div className="text-sm text-gray-600 leading-relaxed space-y-2">
                {isAccount ? (
                  <>
                    <p>可将此账号分享给客户，客户可使用账号和初始密码登录牙伴网，查看个人诊疗档案。</p>
                    <p className="font-medium text-gray-700">登录方式：</p>
                    <p>① 微信小程序搜索「人脉永动」</p>
                    <p>② 网页版：<span className="text-blue-500">www.jiangyuchen.cn</span>（苹果用户可添加到桌面，作为 App 使用）</p>
                  </>
                ) : (
                  <>
                    <p>此为系统初始密码，客户可使用此密码登录牙伴网。</p>
                    <p>登录后建议客户自行修改密码以保障安全。</p>
                    <p className="font-medium text-gray-700">登录方式：</p>
                    <p>① 微信小程序搜索「人脉永动」</p>
                    <p>② 网页版：<span className="text-blue-500">www.jiangyuchen.cn</span>（苹果用户可添加到桌面，作为 App 使用）</p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 字段单元格：label 在上、控件在下，按 width 档位自适应宽度并随屏幕换行
function FieldCell({
  field,
  value,
  open,
  onInput,
  onToggle,
  onSelect,
  onOpenHistory,
  onOpenAddress,
  onOpenLicensePlate,
  onReadonlyClick,
}: {
  field: FieldDef;
  value: string;
  open: boolean;
  onInput: (v: string) => void;
  onToggle: () => void;
  onSelect: (v: string) => void;
  onOpenHistory?: () => void;
  onOpenAddress?: () => void;
  onOpenLicensePlate?: () => void;
  onReadonlyClick?: () => void;
}) {
  const basis = WIDTH_BASIS[field.width || "full"];
  // 长内容字段（多行文本、AI健康标签、地址）标题在上、控件占满整行；其余短字段标题与控件同行
  const stacked = field.kind === "textarea" || field.kind === "history";

  const label = (
    <label className={`text-gray-700 truncate shrink-0 ${stacked ? "block text-base mb-1.5" : "text-base"}`}>
      {field.label}
    </label>
  );

  // 统一的控件外框样式（浅灰底，聚焦时蓝边）
  const boxCls =
    "w-full h-10 px-3 rounded-lg bg-gray-50 border border-[#D6E6F5] flex items-center text-sm transition-colors focus-within:bg-white focus-within:border-[#1E88D6]";

  let control: JSX.Element;

  // 职业智能搜索控件内部状态
  const [occQuery, setOccQuery] = useState(value || "");
  const [occSuggestions, setOccSuggestions] = useState<string[]>([]);
  const [occOpen, setOccOpen] = useState(false);
  const occRef = useRef<HTMLDivElement>(null);

  // 同步外部 value 变化到输入框
  useEffect(() => {
    setOccQuery(value || "");
  }, [value]);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!occOpen) return;
    const handler = (e: MouseEvent) => {
      if (occRef.current && !occRef.current.contains(e.target as Node)) {
        setOccOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [occOpen]);

  if (field.kind === "occupation") {
    control = (
      <div ref={occRef} className="relative w-full">
        <div className={`${boxCls} gap-1`}>
          <input
            type="text"
            value={occQuery}
            placeholder={field.placeholder}
            className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-gray-300 text-gray-800 text-sm"
            onChange={(e) => {
              const q = e.target.value;
              setOccQuery(q);
              onInput(q);
              if ((q || "").trim()) {
                setOccSuggestions(searchOccupations(q, 12));
                setOccOpen(true);
              } else {
                setOccSuggestions([]);
                setOccOpen(false);
              }
            }}
            onFocus={() => {
              if ((occQuery || "").trim()) {
                setOccSuggestions(searchOccupations(occQuery, 12));
                setOccOpen(true);
              }
            }}
          />
          {occQuery ? (
            <button
              type="button"
              onClick={() => {
                setOccQuery("");
                onInput("");
                setOccSuggestions([]);
                setOccOpen(false);
              }}
              className="shrink-0 text-gray-300 active:text-gray-500"
            >
              <XCircle className="w-4 h-4" />
            </button>
          ) : null}
        </div>
        {occOpen && occSuggestions.length > 0 && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOccOpen(false)} />
            <div className="absolute left-0 top-full z-30 mt-1 w-full max-w-[240px] bg-white rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden max-h-52 overflow-y-auto">
              {occSuggestions.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setOccQuery(opt);
                    onInput(opt);
                    onSelect(opt);
                    setOccOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm active:bg-gray-100 flex items-center justify-between gap-3 ${
                    i > 0 ? "border-t border-gray-50" : ""
                  }`}
                  style={value === opt ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                >
                  {opt}
                  {value === opt && <Check className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  } else if (field.kind === "license-plate") {
    // 车牌显示：有値时显示车牌样式 + 复制按鈕
    control = (
      <div className={`${boxCls} justify-between`}>
        <button
          type="button"
          onClick={onOpenLicensePlate}
          className="flex-1 flex items-center min-w-0 active:opacity-70"
        >
          {value ? (
            <span
              className="font-bold tracking-widest text-sm px-1"
              style={{ color: "#1a3a8f", letterSpacing: "0.12em" }}
            >
              {value}
            </span>
          ) : (
            <span className="text-gray-300 text-sm">{field.placeholder}</span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(value).then(() => {
                  toast.success("车牌已复制");
                });
              }}
              className="p-1 rounded active:bg-gray-100"
              title="复制车牌"
            >
              <Copy className="w-4 h-4" style={{ color: ACCENT }} />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-gray-300" onClick={onOpenLicensePlate} />
        </div>
      </div>
    );
  } else if (field.kind === "address") {
    control = (
      <button
        type="button"
        onClick={onOpenAddress}
        className={`${boxCls} justify-between text-left active:bg-gray-100`}
      >
        <span className={`truncate ${value ? "text-gray-800" : "text-gray-300"}`}>
          {value || field.placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
      </button>
    );
  } else if (field.kind === "history") {
    control = (
      <button
        type="button"
        onClick={onOpenHistory}
        className={`${boxCls} justify-between text-left active:bg-gray-100`}
      >
        <span className={`truncate ${value ? "text-gray-800" : "text-gray-300"}`}>
          {value || field.placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
      </button>
    );
  } else if (field.kind === "select") {
    // 性别选中时的淡色底色（女=淡粉 男=淡蓝），不影响字色
    let genderStyle: React.CSSProperties = {};
    if (field.key === "gender") {
      if (value === "女") genderStyle = { backgroundColor: "#FCE7F0", borderColor: "#F7C5DA" };
      else if (value === "男") genderStyle = { backgroundColor: "#E3F0FB", borderColor: "#BBD9F2" };
    }
    // 有值时隐藏箭头，避免挡住文字
    const showArrow = !value;
    control = (
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          style={genderStyle}
          className={`${boxCls} ${field.key === "gender" && value ? "justify-center" : "justify-between"} active:bg-gray-100`}
        >
          {field.key === "source" && STORE_VISIT_SOURCES.includes(value) ? (
            <span className="flex items-center gap-2">
              <span className="text-gray-800 text-sm">到店</span>
              <span
                className="inline-flex items-center px-1 rounded font-medium leading-4"
                style={{ background: ACCENT, color: "#fff", fontSize: "9px" }}
              >
                {value.replace(/到店（(.+)）/, '$1')}
              </span>
            </span>
          ) : (
            <span className={`truncate ${field.key === "gender" && value ? "text-center" : ""} ${value ? "text-gray-800" : "text-gray-300"}`}>
              {value || field.placeholder}
            </span>
          )}
          {showArrow && (
            <ChevronDown
              className={`w-4 h-4 text-gray-300 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={onToggle} />
            <div className="absolute left-0 top-full z-30 mt-1 min-w-full max-w-[240px] bg-white rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden">
              {(field.options || []).map((opt, i) => {
                const selected = value === opt;
                const isTag = field.key === "source" && STORE_VISIT_SOURCES.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className={`w-full px-4 py-2.5 text-left text-sm active:bg-gray-100 flex items-center justify-between gap-3 ${i > 0 ? "border-t border-gray-50" : ""}`}
                    style={!isTag && selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                  >
                    {isTag ? (
                      <span className="flex items-center gap-2">
                        <span style={{ color: "#374151" }}>到店</span>
                        <span
                          className="inline-flex items-center px-1 rounded font-medium leading-4"
                          style={{ background: ACCENT, color: "#fff", fontSize: "9px" }}
                        >
                          {opt.replace(/到店（(.+)）/, '$1')}
                        </span>
                      </span>
                    ) : (
                      opt
                    )}
                    {selected && <Check className="w-4 h-4" style={{ color: ACCENT }} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  } else if (field.kind === "textarea") {
    control = (
      <textarea
        value={value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={field.placeholder}
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-[#D6E6F5] text-sm text-gray-800 placeholder-gray-300 outline-none resize-none transition-colors focus:bg-white focus:border-[#1E88D6]"
      />
    );
  } else if (field.inputType === "date") {
    // 生日：隐藏的原生 date input 负责弹出系统选择器（可直接选年份），
    // 上层用自定义文本展示“2026.06.26”格式，强制单行居中
    const dotDate = value ? value.replace(/-/g, ".") : "";
    control = (
      <div className={`${boxCls} relative justify-center`}>
        <span
          className={`whitespace-nowrap ${dotDate ? "text-gray-800" : "text-gray-300"}`}
        >
          {dotDate || field.placeholder}
        </span>
        <input
          type="date"
          value={value}
          onChange={(e) => onInput(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    );
  } else if (field.kind === "readonly") {
    // 牙伴账号 / 初始密码只读联动展示，右侧复制按鈕，点击内容区弹提示
    control = (
      <div className={`${boxCls} bg-gray-50 gap-1`}>
        <button
          type="button"
          className="flex-1 min-w-0 text-left text-sm truncate"
          style={{ color: value ? ACCENT : undefined, background: "transparent", border: "none", padding: 0 }}
          onClick={() => value && onReadonlyClick?.()}
        >
          {value || <span className="text-gray-300">—</span>}
        </button>
        {value && (
          <button
            type="button"
            className="shrink-0 text-gray-400 active:text-blue-500 p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(value).then(() => {
                // 复制成功短暂反馈
              });
            }}
            title="复制"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  } else {
    // input
    control = (
      <div className={`${boxCls} ${field.readOnly ? "bg-gray-100" : ""}`}>
        <input
          type={field.key === "age" ? "text" : field.inputType || "text"}
          inputMode={field.key === "age" ? "numeric" : undefined}
          value={value}
          readOnly={field.readOnly}
          onChange={(e) => onInput(e.target.value)}
          placeholder={field.placeholder}
          className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-gray-300 text-gray-800 ${field.key === "age" || field.key === "zodiac" ? "text-center" : ""}`}
        />
      </div>
    );
  }

  if (stacked) {
    return (
      <div style={{ flex: `1 1 ${basis}`, minWidth: 140, maxWidth: "100%" }} className="py-1.5">
        {label}
        {control}
      </div>
    );
  }

  // 不同宽度档的 flex 行为：
  //  - auto（昵称）：尽量占满本行剩余空间
  //  - name/gender：固定较窄、不放大
  //  - 其余：可放大、半屏基准
  const w = field.width || "full";
  let flexStyle: string;
  let minW: number;
  if (w === "auto") {
    flexStyle = `999 1 ${basis}`;
    minW = 88;
  } else if (w === "name") {
    flexStyle = `0 1 ${basis}`;
    minW = 96;
  } else if (w === "gender") {
    flexStyle = `0 1 ${basis}`;
    minW = 84;
  } else if (w === "narrow") {
    flexStyle = `1 1 ${basis}`;
    minW = 96;
  } else if (w === "date") {
    // 生日：固定较小宽，够显示 2026/06/18 即可，不贪占，为星座留出两字空间
    flexStyle = `0 1 auto`;
    minW = 120;
  } else if (w === "tiny") {
    // 年龄：可伸展平分剩余空间
    flexStyle = `1 1 0`;
    minW = 70;
  } else if (w === "zodiac") {
    // 星座：可伸展，保证两字不被截断
    flexStyle = `1 1 0`;
    minW = 78;
  } else {
    flexStyle = `1 1 ${basis}`;
    minW = 150;
  }

  return (
    <div
      style={{ flex: flexStyle, minWidth: minW, maxWidth: w === "date" ? 150 : "100%" }}
      className={`py-1.5 flex items-center ${w === "tiny" || w === "zodiac" || w === "date" ? "gap-1.5" : "gap-2"}`}
    >
      {label}
      <div className="flex-1 min-w-0">{control}</div>
    </div>
  );
}
