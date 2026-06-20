/**
 * 将 Date 对象格式化为 MySQL DATETIME 格式
 * MySQL 需要 'YYYY-MM-DD HH:MM:SS' 格式，不接受 ISO 格式的 T 和 Z
 */
export function toMySQLDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
