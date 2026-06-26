/**
 * 发票开票信息类型定义（独立文件，避免 Fast Refresh 冲突）
 */
export interface InvoiceInfo {
  company: string;
  title: string;
  email: string;
  mobile: string;
}

export const EMPTY_INVOICE: InvoiceInfo = { company: "", title: "", email: "", mobile: "" };
