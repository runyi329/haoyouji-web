/**
 * 向 ecosystem.config.cjs 注入支付宝环境变量
 * 每次部署时自动运行，确保支付宝 SDK 可以正常初始化
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'ecosystem.config.cjs');

if (!fs.existsSync(configPath)) {
  console.error('❌ ecosystem.config.cjs 不存在:', configPath);
  process.exit(1);
}

let content = fs.readFileSync(configPath, 'utf8');

if (content.includes('ALIPAY_APP_ID')) {
  console.log('ℹ️  支付宝环境变量已存在，跳过注入');
  process.exit(0);
}

const alipayVars = [
  "      ALIPAY_APP_ID: '2021006136636386',",
  "      ALIPAY_APP_PRIVATE_KEY: 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCyIm8L95U/YnGEe81YXcc31fCEC+ZGrdlayLvFtQKT8A5VumLCx+tn4O6+v6zzlUjQPt/l6AzeQ2wbyRrP730W1y7t7KB4S48g88TKTAdK0MtQ/lp+hkHcAaBt738tvuZ72Pp95gufsIOGx/aX5uF1zT1+QMgMosmuKdnNWbQBThM+ESBjtPXSV4a1gaF4zuMcfw2dNnTHaawHyiQ4PRlc9PBTryWJeM6nvPVI9Rw7vrgA0hdTImKr5+Q5UbPgvugZFcXtPrZ6sIIZ0wIpJLybppLIOXZ7OIrV1LsDiANhO1V1k/0fjHQ7M7q/tLKIh6f1GM4Hoj08JdYY62QVIAQxAgMBAAECggEAVj3nh2KxZkOR8/NAQoT8e2Lfk/5y2Us3zQUcK6br/ZWeSxD22ZiStvMmg0EnSbK/0tpt6dAD0uPPhlBB4+Ptqs45UUVbl4H1ZJ3Aa7SNX0Jg/PB3/YOghRRgiHkIGKywx8sP0z456HE77FgJYheMlkzsdaCFeeCiRejLIulIBcznXZ9rzwYxKGOJDzp+EgmX8qnaLWfTwuQn2fWyRW2NCHozBhEpS4tuBibeMCUv0lgiebXzBPqeInrZM5ZIu/9sWk9/19FKqKriI9BL1upllWTVsJax1QOF2QdjIhL3yzO/i7V0tI5IKvksWxmjWsqr/BcSE9ZftrlHIlMM5ng6AQKBgQDzrR8pyPTjGIgJ7/CRh5h8FyoSEPOAwJsR8e4idPxjN2mSuZg3/7PgGp33FjvElbscTAqGmocwUiNfzMpB72wQnBOl0GYuxhHUw1Xb3E4cglzLNGvA8kjyXuTF6d7MyXULxw3fK6KV8EZ958Cerp6tcZ59JztX5CnN52Sy5oCXkQKBgQC7JL4WqhijQdZAyy+R+7hd/5SzEWnCsvg+nzO/gz123dTKnGdXjOC27nuCfpJCeRDXfFSBS4iO1DyoQouvuke6lOZaXxwji69Qx8n0b6jNI0ww/JV2HsUd7zv1s565ud3wKPHTat+CxYWvozX3yT2d/Ofbt5Sji7HJ1BfpgtCSoQKBgQChh/3EgUZ01Go5zCi5EB3xBJoK59nDW+pv9uRZSxuT2cPOU+GoHYVr5bkZdk+gfXFPzMidegpr6ccxVlwtYT1NtWkA3ikekIZ5eBOOb3gIRhKlUdasTPA2WtlkqSfcsR8583Yqno5kvqa8B8kUZ8UgTNU3Oa6JEOL1b5K9VTehQQKBgQCI0IvHtgLdF7yzEdhtOUHINplXcFuJY53o6irC0AeXZwWyOjWy4+NE2YSiGjaDMk8FundtLvNet/rAaCYHCoB1/3WIjA/eTLiWrfkPIrKdhjild4MtH8Gr6MJFFlPsI94FPWnNzkwpJo5doUxLImxRnBtFniikh/QqQUxaArDJAQKBgBAMUukF0tovg+Riim6weXWk5/f8L/KTsOdC9JC7mIldXa90kAQ/18EtvWqle318ibxylHHgPtTlZGrIgnv3Zfg6Nr6LRevCJdvXb3s/e6vsEBe0pOFcFU6q3Oxcb+LkEr7m+sdM82Ktg62O09Dit1e/GV1kVzecqC+9YUk9EStz',",
  "      ALIPAY_PUBLIC_KEY: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhlAPaEm5MhQqrBOsgbc4PGB8PfoRUs5LXUUFbMDiKDufYXgdplx2Lc2mZCeoj+DrgW79UBKsyxQYDEcIh7qAV2ab75yzk8Er9Om+7qVFG60eG4dLXLqCLYGuXZ9DtQOna+b+vTA1zzgs9MqEfhUeobPVJTCjFd6zEsjGOSYuvDYb2RE1oRodTUPuo6rtisDMurAJy4zwjcebVmRAx904jGrIDqbemkbhSn5wgDOvLLCTc6T44yM2Gx2xULV9hq7aK90UelT80W+uaRodZm71rlqJGTMa3Qo10WrXYIb1XiJx4dKVn5RYbGs2Z9tGZ+QF6vWnYm/VnH+nhn9qvp8yWQIDAQAB'",
].join('\n');

// 在 USE_DEV_DB 行后面插入支付宝变量
content = content.replace(
  "      USE_DEV_DB: 'false'",
  "      USE_DEV_DB: 'false',\n" + alipayVars
);

fs.writeFileSync(configPath, content, 'utf8');
console.log('✅ 支付宝环境变量已成功注入 ecosystem.config.cjs');
