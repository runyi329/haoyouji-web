/**
 * 银行卡工具函数
 */

/**
 * 判断是否为银行卡字段
 */
export function isBankCardField(fieldName: string): boolean {
  const bankCardFields = ['银行卡号', '卡号', '银行账号', '账号'];
  return bankCardFields.some(field => fieldName.includes(field));
}

/**
 * 格式化银行卡号显示（每4位加空格）
 */
export function formatBankCardDisplay(cardNumber: string): string {
  if (!cardNumber) return '';
  
  // 移除所有空格
  const cleaned = cardNumber.replace(/\s/g, '');
  
  // 每4位添加一个空格
  return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * 解析银行卡信息
 */
export function parseBankCardInfo(value: string): {
  cardNumber: string;
  bankName?: string;
  cardholderName?: string;
} {
  // 简单解析，假设格式为：卡号 或 卡号|银行名称|持卡人
  const parts = value.split('|');
  
  return {
    cardNumber: parts[0]?.trim() || '',
    bankName: parts[1]?.trim(),
    cardholderName: parts[2]?.trim(),
  };
}

/**
 * 格式化银行卡信息用于复制（移除空格）
 */
export function formatBankCardForCopy(value: string): string {
  if (!value) return '';
  
  // 如果包含分隔符，说明是完整信息，只提取卡号
  if (value.includes('|')) {
    const { cardNumber } = parseBankCardInfo(value);
    return cardNumber.replace(/\s/g, '');
  }
  
  // 否则直接移除空格
  return value.replace(/\s/g, '');
}
