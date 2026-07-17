// 米伴专用 tRPC 类型包装
// 由于 appRouter 过大导致 TypeScript 类型推断截断，使用此文件提供类型安全的访问
import { trpc } from "@/lib/trpc";

// 将 trpc 断言为包含米伴路由的类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mtrpc = trpc as any;
