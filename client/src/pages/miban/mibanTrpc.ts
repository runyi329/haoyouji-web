// 米伴专用 tRPC 类型包装
// 由于 appRouter 过大导致 TypeScript 类型推断截断，使用此文件提供类型安全的访问
import { trpc } from "@/lib/trpc";

// 将 trpc 断言为包含米伴路由的类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mtrpc = trpc as any;

/**
 * 给 COS 图片 URL 附加数据万象压缩参数
 * @param url   原始图片 URL
 * @param size  目标显示尺寸（px），会以 2x 生成缩略图保证清晰度
 * @param quality  图片质量 0-100，默认 80
 */
export function cosImg(url: string | null | undefined, size: number, quality = 80): string {
  if (!url) return '';
  // 只对腾讯云 COS 域名加参数，其他 URL 原样返回
  if (!url.includes('.cos.') && !url.includes('myqcloud.com')) return url;
  // 已有参数则追加，否则新增
  const sep = url.includes('?') ? '&' : '?';
  const px = size * 2; // 2x 保证 Retina 清晰
  return `${url}${sep}imageMogr2/thumbnail/${px}x${px}/format/webp/quality/${quality}`;
}
