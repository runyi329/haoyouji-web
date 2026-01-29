/**
 * 敏感信息脱敏工具函数
 * 用于对电话、银行卡、身份证等敏感信息进行部分隐藏
 */

/**
 * 脱敏电话号码
 * 例如：13812345678 -> 138****5678
 */
function maskPhone(phone: string): string {
  if (phone.length === 11) {
    return phone.slice(0, 3) + '****' + phone.slice(7);
  }
  // 其他格式的电话号码，隐藏中间部分
  if (phone.length > 6) {
    return phone.slice(0, 3) + '****' + phone.slice(-3);
  }
  return phone;
}

/**
 * 脱敏银行卡号
 * 例如：6222021234567890123 -> 6222 **** **** 1234
 */
function maskBankCard(cardNumber: string): string {
  // 移除空格
  const cleaned = cardNumber.replace(/\s/g, '');
  if (cleaned.length >= 8) {
    return cleaned.slice(0, 4) + ' **** **** ' + cleaned.slice(-4);
  }
  return cardNumber;
}

/**
 * 脱敏身份证号
 * 例如：330102199001011234 -> 3301**********1234
 */
function maskIdCard(idCard: string): string {
  if (idCard.length === 18) {
    return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
  }
  if (idCard.length === 15) {
    return idCard.slice(0, 3) + '*******' + idCard.slice(-3);
  }
  return idCard;
}

/**
 * 脱敏邮箱
 * 例如：example@gmail.com -> ex****@gmail.com
 */
function maskEmail(email: string): string {
  const [username, domain] = email.split('@');
  if (!domain) return email;
  
  if (username.length <= 2) {
    return username + '****@' + domain;
  }
  return username.slice(0, 2) + '****@' + domain;
}

/**
 * 脱敏微信号/QQ号
 * 例如：abc123456 -> abc****56
 */
function maskAccount(account: string): string {
  if (account.length <= 4) {
    return account;
  }
  if (account.length <= 6) {
    return account.slice(0, 2) + '**' + account.slice(-2);
  }
  return account.slice(0, 3) + '****' + account.slice(-2);
}

/**
 * 脱敏姓名
 * 例如：张三 -> 张*，李四光 -> 李**
 */
function maskName(name: string): string {
  if (name.length <= 1) {
    return name;
  }
  if (name.length === 2) {
    return name[0] + '*';
  }
  return name[0] + '*'.repeat(name.length - 1);
}

/**
 * 脱敏地址
 * 保留前几个字和后几个字，中间用星号替换
 */
function maskAddress(address: string): string {
  if (address.length <= 6) {
    return address;
  }
  const visibleChars = Math.min(4, Math.floor(address.length / 3));
  return address.slice(0, visibleChars) + '****' + address.slice(-visibleChars);
}

/**
 * 智能脱敏函数
 * 根据字段名称和内容自动判断脱敏方式
 */
export function maskSensitiveInfo(fieldName: string, value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const lowerFieldName = fieldName.toLowerCase();
  const lowerValue = value.toLowerCase();

  // 电话号码
  if (
    lowerFieldName.includes('电话') ||
    lowerFieldName.includes('手机') ||
    lowerFieldName.includes('phone') ||
    lowerFieldName.includes('mobile') ||
    /^1[3-9]\d{9}$/.test(value)
  ) {
    return maskPhone(value);
  }

  // 银行卡号
  if (
    lowerFieldName.includes('银行卡') ||
    lowerFieldName.includes('卡号') ||
    lowerFieldName.includes('bank') ||
    lowerFieldName.includes('card')
  ) {
    // 银行卡信息格式：卡号 | 持卡人 | 开户行
    if (value.includes('|')) {
      const parts = value.split('|').map(p => p.trim());
      if (parts.length === 3) {
        return maskBankCard(parts[0]) + ' | ' + parts[1] + ' | ' + parts[2];
      }
    }
    return maskBankCard(value);
  }

  // 身份证
  if (
    lowerFieldName.includes('身份证') ||
    lowerFieldName.includes('idcard') ||
    /^\d{15}(\d{2}[0-9X])?$/.test(value)
  ) {
    return maskIdCard(value);
  }

  // 邮箱
  if (
    lowerFieldName.includes('邮箱') ||
    lowerFieldName.includes('email') ||
    lowerValue.includes('@')
  ) {
    return maskEmail(value);
  }

  // 微信号/QQ号
  if (
    lowerFieldName.includes('微信') ||
    lowerFieldName.includes('qq') ||
    lowerFieldName.includes('wechat')
  ) {
    return maskAccount(value);
  }

  // 地址
  if (
    lowerFieldName.includes('地址') ||
    lowerFieldName.includes('address') ||
    lowerFieldName.includes('住址')
  ) {
    return maskAddress(value);
  }

  // 默认：如果字符串较长，进行通用脱敏
  if (value.length > 10) {
    return maskAddress(value);
  }

  // 不需要脱敏
  return value;
}
