/**
 * 牙伴齿科管理 - 新建顾客
 * 路由：/yaban/patient/create
 * 蓝白风格，3 个 Tab：个人信息（含联系方式）/ 顾客信息（含AI健康标签）/ 首诊信息
 * 顶栏：取消 / 新建顾客 / 保存；含「仅显示必填字段」开关
 * 布局：字段按实际输入宽度自适应流式排布，窄字段同行并排，充分利用横向空间
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronDown, ChevronRight, ChevronLeft, XCircle, Check, UserRound, Camera, Copy, X, PlusCircle } from "lucide-react";
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
// 顾客来源：改为两级动态加载，不再使用静态常量
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
  { key: "consultant", label: "咨询师", placeholder: "请选择", kind: "select", options: CONSULTANTS, width: "half" },
  // source 已改为自定义两级选择渲染，单独占一行
  { key: "_sourceCustom", label: "顾客来源", placeholder: "请选择", kind: "readonly", width: "full" },
  // 关联亲友 + 亲友关系：自定义渲染，单独占一行两列
  { key: "_relativeCustom", label: "关联亲友", placeholder: "搜索顾客姓名/手机号", kind: "readonly", width: "full" },
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
  // 当前正在编辑第几块车牌（1/2/3）
  const [licensePlateIndex, setLicensePlateIndex] = useState<1 | 2 | 3>(1);
  // 当前显示几块车牌输入框（1~3，点「+」增加）
  const [plateCount, setPlateCount] = useState<1 | 2 | 3>(1);
  // 头像：null 表示跟随年龄+性别自动适配；非 null 表示用户手动指定
  const [avatarManual, setAvatarManual] = useState<AvatarKey | null>(null);
  // 备用随机密码：页面加载时生成一次，无手机号时使用
  const [randomPwd] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  // 牙伴账号 / 初始密码提示弹窗
  const [yabanTipType, setYabanTipType] = useState<"account" | "password" | null>(null);
  // 顾客类型：动态读取门店配置
  const patientTypesQuery = trpc.yabanCustomer.listPatientTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dynamicPatientTypes = patientTypesQuery.data?.map((t) => t.label) ?? ["电子", "临时", "普通"];

  // 顾客来源：动态读取门店配置（两级结构）
  const customerSourcesQuery = trpc.yabanCustomer.listCustomerSources.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dynamicSourceList = customerSourcesQuery.data ?? [];
  // 来源两级选择弹窗状态
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  // 当前选中的主标题（第一级）
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);

  // 亲友关联：搜索已有顾客
  const [relativeSearch, setRelativeSearch] = useState("");
  const [relativePickerOpen, setRelativePickerOpen] = useState(false);
  // 当前选中的亲友顾客对象
  const [relativeSelected, setRelativeSelected] = useState<{ id: number; name: string; mobile?: string } | null>(null);
  // 亲友关系类型：动态读取门店配置
  const relationTypesQuery = trpc.yabanCustomer.listRelations.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dynamicRelationTypes = relationTypesQuery.data?.map((r: any) => r.label) ?? ["夫妻", "父母", "子女", "兄弟姐妹", "朋友", "其他"];
  // 亲友关系下拉弹窗
  const [relationPickerOpen, setRelationPickerOpen] = useState(false);
  // 搜索亲友顾客
  const relativeQuery = trpc.yabanCustomer.searchCustomer.useQuery(
    { query: relativeSearch || undefined },
    { enabled: relativePickerOpen, refetchOnWindowFocus: false }
  );

  // 推荐人搜索
  const [referrerSearch, setReferrerSearch] = useState("");
  const [referrerPickerOpen, setReferrerPickerOpen] = useState(false);
  const referrerQuery = trpc.yabanCustomer.searchReferrer.useQuery(
    { query: referrerSearch || "" },
    { enabled: referrerPickerOpen, refetchOnWindowFocus: false }
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
      licensePlate2: d.license_plate2 ?? "",
      licensePlate3: d.license_plate3 ?? "",
      emergencyContact: d.emergency_contact ?? "",
      emergencyRelation: d.emergency_relation ?? "",
      occupation: d.occupation ?? "",
      emergencyPhone: d.emergency_phone ?? "",
      source: d.source ?? "",
      sourceTag: d.source_tag ?? "",
      netConsultant: d.net_consultant ?? "",
      consultant: d.consultant ?? "",
      yabanUsername: d.yaban_username ?? "",
      yabanPassword: d.yaban_password ?? "",
      referrerUsername: d.referrer_username ?? "",
      relativeRelation: d.relative_relation ?? "",
      history: d.history ?? "",
      patientRemark: d.remark ?? "",
      chiefComplaint: d.chief_complaint ?? "",
    });
    if (d.avatar) setAvatarManual(d.avatar as AvatarKey);
    // 回填亲友关联
    if (d.relative_id) {
      setRelativeSelected({ id: d.relative_id, name: d.relative_name ?? String(d.relative_id), mobile: d.relative_mobile ?? "" });
    }
    // 编辑模式：根据已有车牌数量初始化 plateCount
    const pc = d.license_plate3 ? 3 : d.license_plate2 ? 2 : 1;
    setPlateCount(pc as 1 | 2 | 3);
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
  const deleteMutation = trpc.yabanCustomer.deleteCustomer.useMutation({
    onSuccess: () => {
      toast.success("档案已删除");
      utils.yabanCustomer.list.invalidate();
      setLocation("/yaban/patients");
    },
    onError: (e) => {
      toast.error(e.message || "删除失败，请重试");
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
      licensePlate2: form.licensePlate2 || undefined,
      licensePlate3: form.licensePlate3 || undefined,
      emergencyContact: form.emergencyContact,
      emergencyRelation: form.emergencyRelation,
      occupation: form.occupation,
      emergencyPhone: form.emergencyPhone,
      avatar: effectiveAvatar || undefined,
      source: form.source,
      sourceTag: form.sourceTag || undefined,
      netConsultant: form.netConsultant,
      consultant: form.consultant,
      history: form.history,
      remark: form.patientRemark,
      referrerUsername: form.referrerUsername || undefined,
      relativeId: relativeSelected?.id || undefined,
      relativeRelation: form.relativeRelation || undefined,
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
            {PERSONAL_FIELDS.map((f) => {
              // 车牌字段：特殊处理，支持多块 + 动态标题
              if (f.key === "licensePlate") {
                const PLATE_KEYS: ("licensePlate" | "licensePlate2" | "licensePlate3")[] = ["licensePlate", "licensePlate2", "licensePlate3"];
                const PLATE_LABELS = plateCount === 1 ? ["车牌"] : ["车牌一", "车牌二", "车牌三"];
                const nextPlateNum = plateCount + 1;
                return (
                  <>
                    {PLATE_KEYS.slice(0, plateCount).map((pk, idx) => {
                      const isLast = idx === plateCount - 1;
                      return (
                        <FieldCell
                          key={pk}
                          field={{ ...f, key: pk, label: PLATE_LABELS[idx] }}
                          value={form[pk] || ""}
                          open={false}
                          onInput={() => {}}
                          onToggle={() => {}}
                          onSelect={() => {}}
                          onOpenLicensePlate={() => {
                            setLicensePlateIndex((idx + 1) as 1 | 2 | 3);
                            setLicensePlateOpen(true);
                          }}
                          onAddPlate={isLast && plateCount < 3 ? () => {
                            if (window.confirm(`是否添加第 ${nextPlateNum} 块车牌？`)) {
                              setPlateCount((c) => Math.min(c + 1, 3) as 1 | 2 | 3);
                            }
                          } : undefined}
                          extraWrapClass={idx > 0 ? "w-full" : undefined}
                        />
                      );
                    })}
                  </>
                );
              }
              return (
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
              );
            })}
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
                // 顾客类型：动态替换选项
                const field = f.key === "patientType"
                  ? { ...f, options: dynamicPatientTypes }
                  : f;
                const fResolved = field;
                let displayValue = form[f.key] || "";
                if (f.key === "_yabanAccount") displayValue = previewAccount;
                if (f.key === "_yabanPassword") displayValue = previewPwd;

                // 推荐人字段：自定义搜索输入框 + 下拉候选列表 + 所属医院（联动只读）
                if (f.key === "referrerUsername") {
                  // 先渲染推荐人行，再在其后追加所属医院
                  const referrerResults = referrerQuery.data || [];
                  const showDropdown = referrerPickerOpen && referrerResults.length > 0;
                  const refCount = referralCountQuery.data;
                  const directCount = refCount?.direct ?? 0;
                  const totalCount = refCount?.total ?? 0;
                  const countLabel = totalCount > 0 ? `直接${directCount}人 共${totalCount}人` : "0人";
                  return (
                    <>
                      {/* 推荐人（左半）：内嵌搜索展开模式 */}
                      <div
                        key={f.key}
                        style={{ flex: "1 1 calc(50% - 6px)", minWidth: 150 }}
                        className="py-1.5 flex items-start gap-2"
                      >
                        <label className="text-gray-700 text-base shrink-0 mt-2.5" style={{ minWidth: "4em", display: "inline-block" }}>推荐人</label>
                        <div className="flex-1 min-w-0">
                          {/* 已选中状态：显示账号名 + 清除按鈕 */}
                          {form.referrerUsername && !referrerPickerOpen ? (
                            <div className="flex items-center bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-2">
                              <span className="flex-1 text-sm text-gray-800 truncate">{form.referrerUsername}</span>
                              <button
                                type="button"
                                className="text-gray-300 flex-shrink-0"
                                onClick={() => { setField("referrerUsername", ""); setReferrerPickerOpen(false); setReferrerSearch(""); }}
                              >
                                <XCircle size={15} />
                              </button>
                            </div>
                          ) : !referrerPickerOpen ? (
                            /* 未选中状态：点击展开搜索 */
                            <button
                              type="button"
                              className="w-full flex items-center justify-between bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-2 active:bg-gray-100"
                              onClick={() => { setReferrerSearch(""); setReferrerPickerOpen(true); }}
                            >
                              <span className="text-sm text-gray-300">AI搜索</span>
                              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                            </button>
                          ) : (
                            /* 展开状态：内嵌搜索框 + 候选列表（浮层，不占文档流） */
                            <div className="relative">
                              <div className="flex items-center bg-white rounded-lg border-2 border-[#1E88D6] h-10 px-3 gap-2">
                                <input
                                  type="text"
                                  autoFocus
                                  className="flex-1 bg-transparent text-sm outline-none min-w-0"
                                  placeholder="AI搜索"
                                  value={referrerSearch}
                                  onChange={(e) => setReferrerSearch(e.target.value)}
                                />
                                <button type="button" onClick={() => { setReferrerPickerOpen(false); setReferrerSearch(""); }} className="text-gray-300">
                                  <X size={15} />
                                </button>
                              </div>
                              {/* 候选列表：绝对定位浮层，不占位置 */}
                              {referrerPickerOpen && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                                  {referrerQuery.isLoading ? (
                                    <div className="text-center text-gray-400 text-sm py-4">搜索中...</div>
                                  ) : !referrerQuery.data?.length ? (
                                    <div className="text-center text-gray-400 text-sm py-4">未找到匹配用户</div>
                                  ) : (
                                    referrerQuery.data.map((u: any) => (
                                      <button
                                        key={u.id}
                                        type="button"
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-blue-50 border-b border-gray-50 last:border-0"
                                        onClick={() => {
                                          setField("referrerUsername", u.username);
                                          setReferrerPickerOpen(false);
                                          setReferrerSearch("");
                                        }}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium text-gray-800 truncate">{u.username}</div>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 推荐的人（右半） */}
                      <div
                        key="_referralCount"
                        style={{ flex: "1 1 calc(50% - 6px)", minWidth: 150 }}
                        className="py-1.5 flex items-center gap-2"
                      >
                        <label className="text-gray-700 text-base shrink-0" style={{ minWidth: "4em", display: "inline-block" }}>推荐的人</label>
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-1 active:bg-gray-100"
                            onClick={() => totalCount > 0 && setReferralListOpen(true)}
                          >
                            <span className="text-sm" style={{ color: totalCount > 0 ? "#1E88D6" : undefined }}>
                              {countLabel}
                            </span>
                            {totalCount > 0 && (
                              <ChevronRight size={14} className="text-gray-300 ml-1 flex-shrink-0" />
                            )}
                          </button>
                        </div>
                      </div>
                      {/* 所属医院（只读联动，整行，标题在左内容框在右） */}
                      <div key="_clinic" style={{ flex: "1 1 100%", minWidth: 0 }} className="py-1.5 flex items-center gap-2">
                        <label className="text-gray-700 text-base shrink-0" style={{ minWidth: "4em", display: "inline-block" }}>所属医院</label>
                        <div className="flex-1 min-w-0">
                          <div className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-[#D6E6F5] flex items-center text-sm">
                            <span style={{ color: clinicName ? "#1E88D6" : "#9ca3af" }}>
                              {clinicName || "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                }

                // 顾客来源：自定义两级选择渲染
                if (f.key === "_sourceCustom") {
                  // 显示当前选中的来源（主标题 + 副标签）
                  const srcLabel = form.source || "";
                  const tagLabel = form.sourceTag || "";
                  const srcObj = dynamicSourceList.find((s) => s.label === srcLabel);
                  const tagObj = srcObj?.tags.find((t) => t.label === tagLabel);
                  return (
                    <div
                      key="_sourceCustom"
                      style={{ flex: "1 1 100%", minWidth: 0 }}
                      className="py-1.5 flex items-center gap-2"
                    >
                      <label className="text-gray-700 text-base shrink-0" style={{ minWidth: "4em", display: "inline-block" }}>顾客来源</label>
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => { setSelectedSourceId(null); setSourcePickerOpen(true); }}
                          className="w-full flex items-center justify-between bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-2 active:bg-gray-100"
                        >
                          {srcLabel ? (
                            <span className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-sm text-gray-800 truncate">{srcLabel}</span>
                              {tagObj && (
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white flex-shrink-0"
                                  style={{ backgroundColor: tagObj.color || "#9E9E9E" }}
                                >
                                  {tagLabel}
                                </span>
                              )}
                              {tagLabel && !tagObj && (
                                <span className="text-xs text-gray-400 flex-shrink-0">{tagLabel}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-300">请选择</span>
                          )}
                          <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
                        </button>
                      </div>
                    </div>
                  );
                }

                // 关联亲友 + 亲友关系：自定义两列渲染
                if (f.key === "_relativeCustom") {
                  const relativeResults = relativeSearch.length >= 1 ? (relativeQuery.data || []) : [];
                  const showRelativeDropdown = relativeSearch.length >= 1 && relativeResults.length > 0;
                  return (
                    <>
                      {/* 关联亲友（左半）：内嵌搜索 */}
                      <div
                        key="_relativeCustom"
                        style={{ flex: "1 1 calc(50% - 6px)", minWidth: 150 }}
                        className="py-1.5 flex items-start gap-2"
                      >
                        <label className="text-gray-700 text-base shrink-0 mt-2.5" style={{ minWidth: "4em", display: "inline-block" }}>关联亲友</label>
                        <div className="flex-1 min-w-0 relative">
                          {relativeSelected && !relativePickerOpen ? (
                            <div className="flex items-center bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-2">
                              <span className="flex-1 text-sm text-gray-800 truncate">{relativeSelected.name}{relativeSelected.mobile ? ` (${relativeSelected.mobile.slice(-4)})` : ""}</span>
                              <button type="button" className="text-gray-300 flex-shrink-0" onClick={() => { setRelativeSelected(null); setRelativeSearch(""); }}>
                                <XCircle size={15} />
                              </button>
                            </div>
                          ) : !relativePickerOpen ? (
                            <button type="button" onClick={() => setRelativePickerOpen(true)} className="w-full flex items-center bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3">
                              <span className="text-sm text-gray-300">AI 搜索</span>
                            </button>
                          ) : (
                            <div className="relative">
                              <input
                                autoFocus
                                className="w-full h-10 px-3 rounded-lg border border-[#1E88D6] bg-white text-sm outline-none"
                                placeholder="AI 搜索..."
                                value={relativeSearch}
                                onChange={(e) => setRelativeSearch(e.target.value)}
                              />
                              <button type="button" onClick={() => { setRelativePickerOpen(false); setRelativeSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300">
                                <XCircle size={15} />
                              </button>
                              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                                  {relativeQuery.isLoading ? (
                                    <div className="text-center text-gray-400 text-sm py-4">搜索中...</div>
                                  ) : !relativeQuery.data?.length ? (
                                    <div className="text-center text-gray-400 text-sm py-4">未找到匹配顾客</div>
                                  ) : (
                                    relativeQuery.data.map((u: any) => (
                                      <button
                                        key={u.id}
                                        type="button"
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                        onClick={() => {
                                          setRelativeSelected({ id: u.id, name: u.name || u.username, mobile: u.mobile });
                                          setRelativePickerOpen(false);
                                          setRelativeSearch("");
                                        }}
                                      >
                                        <span className="font-medium text-gray-800">{u.name || u.username}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 亲友关系（右半）：下拉选择 */}
                      <div
                        key="_relativeRelation"
                        style={{ flex: "1 1 calc(50% - 6px)", minWidth: 150 }}
                        className="py-1.5 flex items-start gap-2"
                      >
                        <label className="text-gray-700 text-base shrink-0 mt-2.5" style={{ minWidth: "4em", display: "inline-block" }}>亲友关系</label>
                        <div className="flex-1 min-w-0 relative">
                          <button
                            type="button"
                            onClick={() => setRelationPickerOpen(!relationPickerOpen)}
                            className="w-full flex items-center justify-between bg-gray-50 rounded-lg border border-[#D6E6F5] h-10 px-3 gap-2 active:bg-gray-100"
                          >
                            <span className={`text-sm ${form.relativeRelation ? 'text-gray-800' : 'text-gray-300'}`}>
                              {form.relativeRelation || ""}
                            </span>
                            <ChevronDown className="w-4 h-4 text-gray-300 shrink-0" />
                          </button>
                          {relationPickerOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                              {/* 空选项，可取消已选关系 */}
                              <button
                                type="button"
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-50 border-b border-gray-50"
                                onClick={() => { setField("relativeRelation", ""); setRelationPickerOpen(false); }}
                              >
                                &nbsp;
                              </button>
                              {dynamicRelationTypes.map((rel: string) => (
                                <button
                                  key={rel}
                                  type="button"
                                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                  onClick={() => { setField("relativeRelation", rel); setRelationPickerOpen(false); }}
                                >
                                  {rel}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                }

                return (
                  <FieldCell
                    key={f.key}
                     field={fResolved}
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
                    fixedLabelWidth
                    historyTags={f.key === "history" ? parseHistory(form.history || "").names : undefined}
                    onRemoveHistoryTag={f.key === "history" ? (tag) => {
                      const parsed = parseHistory(form.history || "");
                      const newNames = parsed.names.filter((n) => n !== tag);
                      setField("history", serializeHistory(newNames, parsed.remark));
                    } : undefined}
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
          const isDeleting = deleteMutation.isPending;
          const canSave = !!(form.name?.trim());
          const isDisabled = isBusy || !canSave;
          return (
            <div className="flex gap-3">
              {/* 删除档案：仅编辑模式显示 */}
              {isEdit && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    if (!window.confirm(`确定要删除「${form.name || "该顾客"}」的档案？`)) return;
                    if (!window.confirm("删除后不可恢复，请再次确认！")) return;
                    deleteMutation.mutate({ id: editId });
                  }}
                  className="flex-shrink-0 h-12 px-5 rounded-xl text-base font-semibold text-white flex items-center justify-center transition-all active:scale-95"
                  style={{
                    background: isDeleting ? "#C0C0C0" : "#E53E3E",
                    boxShadow: isDeleting ? "none" : "0 3px 12px rgba(229,62,62,0.35)",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                  }}
                >
                  {isDeleting ? "删除中…" : "删除"}
                </button>
              )}
              {/* 保存按鈕 */}
              <button
                type="button"
                onClick={handleSave}
                disabled={isDisabled}
                className="flex-1 h-12 rounded-xl text-base font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{
                  background: isDisabled ? "#C0C0C0" : ACCENT,
                  boxShadow: isDisabled ? "none" : `0 3px 12px ${ACCENT}55`,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
              >
                {isBusy ? "保存中…" : "保存"}
              </button>
            </div>
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

      {/* 车牌输入器（支持3块，按 licensePlateIndex 区分） */}
      <LicensePlatePicker
        open={licensePlateOpen}
        value={licensePlateIndex === 1 ? (form.licensePlate || "") : licensePlateIndex === 2 ? (form.licensePlate2 || "") : (form.licensePlate3 || "")}
        onClose={() => setLicensePlateOpen(false)}
        onConfirm={(plate) => {
          if (licensePlateIndex === 1) setField("licensePlate", plate);
          else if (licensePlateIndex === 2) setField("licensePlate2", plate);
          else setField("licensePlate3", plate);
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

      {/* 顾客来源两级选择弹窗 */}
      {sourcePickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => { setSourcePickerOpen(false); setSelectedSourceId(null); }}>
          <div
            className="mt-auto bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">
                {selectedSourceId == null ? "选择来源" : "选择副标签"}
              </span>
              <button
                onClick={() => {
                  if (selectedSourceId != null) {
                    setSelectedSourceId(null);
                  } else {
                    setSourcePickerOpen(false);
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"
              >
                {selectedSourceId != null ? <ChevronLeft className="w-4 h-4 text-gray-500" /> : <X className="w-4 h-4 text-gray-500" />}
              </button>
            </div>

            <div className="px-4 py-3">
              {selectedSourceId == null ? (
                /* 第一级：选主标题 */
                <div className="space-y-1">
                  {dynamicSourceList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">暂无来源选项</p>
                  ) : (
                    dynamicSourceList.map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          if (src.tags.length === 0) {
                            // 无副标签，直接确认
                            setField("source", src.label);
                            setField("sourceTag", "");
                            setSourcePickerOpen(false);
                            setSelectedSourceId(null);
                          } else {
                            // 有副标签，进入第二级
                            setSelectedSourceId(src.id);
                          }
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 active:bg-blue-50"
                      >
                        <span className="text-sm font-medium text-gray-800">{src.label}</span>
                        <div className="flex items-center gap-2">
                          {src.tags.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: t.color || "#9E9E9E" }}
                            >
                              {t.label}
                            </span>
                          ))}
                          {src.tags.length > 3 && <span className="text-xs text-gray-400">+{src.tags.length - 3}</span>}
                          {src.tags.length > 0 && <ChevronRight className="w-4 h-4 text-gray-300" />}
                        </div>
                      </button>
                    ))
                  )}
                  {/* 清除选择 */}
                  {form.source && (
                    <button
                      type="button"
                      onClick={() => {
                        setField("source", "");
                        setField("sourceTag", "");
                        setSourcePickerOpen(false);
                        setSelectedSourceId(null);
                      }}
                      className="w-full flex items-center justify-center py-3 text-sm text-red-400"
                    >
                      清除来源
                    </button>
                  )}
                </div>
              ) : (
                /* 第二级：选副标签 */
                (() => {
                  const srcObj = dynamicSourceList.find((s) => s.id === selectedSourceId);
                  if (!srcObj) return null;
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 mb-3">已选主标题：<span className="font-medium text-gray-700">{srcObj.label}</span></p>
                      {/* 不选副标签（仅选主标题） */}
                      <button
                        type="button"
                        onClick={() => {
                          setField("source", srcObj.label);
                          setField("sourceTag", "");
                          setSourcePickerOpen(false);
                          setSelectedSourceId(null);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 active:bg-blue-50 border-2 border-dashed border-gray-200"
                      >
                        <span className="text-sm text-gray-500">仅选「{srcObj.label}」，不选副标签</span>
                      </button>
                      {/* 副标签列表 */}
                      {srcObj.tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setField("source", srcObj.label);
                            setField("sourceTag", tag.label);
                            setSourcePickerOpen(false);
                            setSelectedSourceId(null);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 active:bg-blue-50"
                        >
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium text-white"
                            style={{ backgroundColor: tag.color || "#9E9E9E" }}
                          >
                            {tag.label}
                          </span>
                          {form.source === srcObj.label && form.sourceTag === tag.label && (
                            <Check className="w-4 h-4 ml-auto" style={{ color: ACCENT }} />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()
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
  fixedLabelWidth,
  historyTags,
  onRemoveHistoryTag,
  onAddPlate,
  extraWrapClass,
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
  fixedLabelWidth?: boolean;
  historyTags?: string[];
  onRemoveHistoryTag?: (tag: string) => void;
  /** 车牌字段：传入则在复制按鈕右边显示「+」，点击后弹确认添加下一块车牌 */
  onAddPlate?: () => void;
  /** 额外的外层 wrapper className，例如 w-full 强制另起一行 */
  extraWrapClass?: string;
}) {
  const basis = WIDTH_BASIS[field.width || "full"];
  // 长内容字段（多行文本、AI健康标签、地址）标题在上、控件占满整行；其余短字段标题与控件同行
  const stacked = field.kind === "textarea" || field.kind === "history";

  const label = (
    <label
      className={`text-gray-700 shrink-0 ${stacked ? "block text-base mb-1.5" : "text-base"}`}
      style={!stacked && fixedLabelWidth ? { minWidth: "4em", display: "inline-block" } : undefined}
    >
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
    // 车牌显示：有值时显示车牌样式 + 复制按钮 + 「+」（最后一块且有值时）
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
          {value && onAddPlate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddPlate(); }}
              className="p-1 rounded active:bg-gray-100"
              title="添加车牌"
            >
              <PlusCircle className="w-4 h-4" style={{ color: ACCENT }} />
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
    const tags = historyTags || [];
    if (tags.length > 0) {
      // 已有标签：胶囊展示 + 末尾「+」按钮继续添加
      control = (
        <div className="flex flex-wrap gap-1.5 items-center min-h-[40px] py-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "#E3F0FB", color: ACCENT, border: `1px solid #BBD9F2` }}
            >
              {tag}
              <button
                type="button"
                className="ml-0.5 flex items-center justify-center rounded-full hover:bg-blue-200 active:bg-blue-300"
                style={{ width: 14, height: 14 }}
                onClick={() => onRemoveHistoryTag?.(tag)}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center justify-center rounded-full border border-dashed border-[#1E88D6] text-[#1E88D6] active:bg-blue-50"
            style={{ width: 28, height: 28, flexShrink: 0 }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span>
          </button>
        </div>
      );
    } else {
      // 无标签：显示占位按钮
      control = (
        <button
          type="button"
          onClick={onOpenHistory}
          className={`${boxCls} justify-between text-left active:bg-gray-100`}
        >
          <span className="text-gray-300">{field.placeholder}</span>
          <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
        </button>
      );
    }
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
          <span className={`truncate ${field.key === "gender" && value ? "text-center" : ""} ${value ? "text-gray-800" : "text-gray-300"}`}>
              {value || field.placeholder}
            </span>
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
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className={`w-full px-4 py-2.5 text-left text-sm active:bg-gray-100 flex items-center justify-between gap-3 ${i > 0 ? "border-t border-gray-50" : ""}`}
                    style={selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                  >
                    {opt}
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
      style={extraWrapClass === "w-full" ? { flex: "1 1 100%", minWidth: "100%" } : { flex: flexStyle, minWidth: minW, maxWidth: w === "date" ? 150 : "100%" }}
      className={`py-1.5 flex items-center ${w === "tiny" || w === "zodiac" || w === "date" ? "gap-1.5" : "gap-2"}${extraWrapClass ? ` ${extraWrapClass}` : ""}`}
    >
      {label}
      <div className="flex-1 min-w-0">{control}</div>
    </div>
  );
}
