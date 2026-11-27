import { z } from "zod";

export type MibanInvoiceRequest = {
  type: "personal" | "company";
  title: string;
  taxNo?: string;
};

// 先拒绝控制字符，再清理首尾空白；不限制税号位数或擅自修改抬头内容。
const invoiceText = (label: string, maxLength: number) => z.string()
  .refine(value => !/[\u0000-\u001f\u007f-\u009f]/.test(value), `${label}不能包含控制字符`)
  .transform(value => value.trim())
  .pipe(z.string().min(1, `请填写${label}`).max(maxLength, `${label}过长`));

const invoiceTitleSchema = invoiceText("发票抬头", 200);
const invoiceTaxNoSchema = invoiceText("公司税号", 100);

/** 不传 invoiceRequest 即不索要发票。个人申请丢弃旧输入中可能残留的税号。 */
export const mibanInvoiceRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("personal"), title: invoiceTitleSchema }),
  z.object({ type: z.literal("company"), title: invoiceTitleSchema, taxNo: invoiceTaxNoSchema }),
]).transform((request): MibanInvoiceRequest => request.type === "personal"
  ? { type: "personal", title: request.title }
  : { type: "company", title: request.title, taxNo: request.taxNo });
