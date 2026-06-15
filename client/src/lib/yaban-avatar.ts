/**
 * 牙伴齿科 - 顾客默认头像库
 * 12 款扁平矢量卡通头像：6 年龄段 × 男女
 * 静态资源位于 client/public/avatars/{gender}_{age}.png
 * 按「年龄 + 性别」自动适配默认头像，用户可手动从 12 款中更换。
 */

// 年龄段标识（与文件名后缀一致）
export type AvatarAge = "child" | "teen" | "youth" | "middle" | "senior" | "elder";
export type AvatarGender = "male" | "female";

// 头像标识：如 "male_youth"
export type AvatarKey = `${AvatarGender}_${AvatarAge}`;

// 年龄段中文名（用于选择器展示）
export const AVATAR_AGE_LABEL: Record<AvatarAge, string> = {
  child: "儿童",
  teen: "青少年",
  youth: "青年",
  middle: "中年",
  senior: "中老年",
  elder: "老年",
};

export const AVATAR_AGE_ORDER: AvatarAge[] = ["child", "teen", "youth", "middle", "senior", "elder"];

// 头像静态资源路径
export function avatarSrc(key: AvatarKey): string {
  return `/avatars/${key}.png`;
}

// 全部 12 款头像标识（女在前、男在后，便于选择器排布）
export const ALL_AVATAR_KEYS: AvatarKey[] = [
  ...AVATAR_AGE_ORDER.map((a) => `female_${a}` as AvatarKey),
  ...AVATAR_AGE_ORDER.map((a) => `male_${a}` as AvatarKey),
];

// 由年龄（岁）映射到年龄段
export function ageToBucket(age: number): AvatarAge {
  if (age <= 11) return "child";
  if (age <= 17) return "teen";
  if (age <= 39) return "youth";
  if (age <= 54) return "middle";
  if (age <= 69) return "senior";
  return "elder";
}

// 性别中文 → 头像性别（未知/空默认按男性蓝色系，避免无图）
function genderToKey(gender: string): AvatarGender {
  return gender === "女" ? "female" : "male";
}

/**
 * 按年龄+性别自动适配默认头像标识。
 * @param ageStr 年龄字符串（可能为空）
 * @param gender 中文性别
 * @returns 头像标识，如 "female_youth"；信息不足时返回 null
 */
export function autoAvatarKey(ageStr: string | undefined, gender: string | undefined): AvatarKey | null {
  const age = ageStr ? parseInt(ageStr, 10) : NaN;
  if (isNaN(age)) return null;
  const bucket = ageToBucket(age);
  return `${genderToKey(gender || "")}_${bucket}` as AvatarKey;
}

// 12 款头像各自的圆内背景色（自原图提取），用于在方形照片格中铺底，
// 让放大裁切后残留的圆弧角与背景融合，避免出现白边。
export const AVATAR_BG: Record<string, string> = {
  female_child: "#FCB3B8",
  female_teen: "#F88871",
  female_youth: "#F68C8A",
  female_middle: "#D0807A",
  female_senior: "#B18D7C",
  female_elder: "#A56F5D",
  male_child: "#A2DBF8",
  male_teen: "#1B9CFB",
  male_youth: "#2097FB",
  male_middle: "#5C83AB",
  male_senior: "#A08776",
  male_elder: "#5E351E",
};

// 取某头像的背景色，未知时回退浅灰
export function avatarBg(key: AvatarKey | string | undefined): string {
  if (!key) return "#F0F7FA";
  return AVATAR_BG[key as string] || "#F0F7FA";
}
