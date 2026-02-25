// 测试时间范围计算（修正版）
const now = new Date();

// 方法1：使用toLocaleString获取北京时间
const beijingTimeStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
console.log('========== 时间范围计算测试（修正版） ==========\n');
console.log('当前时间（UTC）:', now.toISOString());
console.log('当前时间（北京，字符串）:', beijingTimeStr);

// 方法2：手动计算北京时间的今天00:00
// 获取UTC时间的年月日
const utcYear = now.getUTCFullYear();
const utcMonth = now.getUTCMonth();
const utcDate = now.getUTCDate();
const utcHours = now.getUTCHours();

// 计算北京时间的日期（UTC+8）
let beijingDate = utcDate;
let beijingMonth = utcMonth;
let beijingYear = utcYear;

if (utcHours >= 16) {
  // UTC 16:00 = 北京 00:00（第二天）
  beijingDate++;
  if (beijingDate > new Date(beijingYear, beijingMonth + 1, 0).getDate()) {
    beijingDate = 1;
    beijingMonth++;
    if (beijingMonth > 11) {
      beijingMonth = 0;
      beijingYear++;
    }
  }
}

// 北京时间今天00:00（UTC时间）
const beijingTodayStart = new Date(Date.UTC(beijingYear, beijingMonth, beijingDate, -8, 0, 0, 0));
const beijingTomorrowStart = new Date(beijingTodayStart.getTime() + 24 * 60 * 60 * 1000);

console.log('\n北京时间今天00:00（UTC表示）:', beijingTodayStart.toISOString());
console.log('北京时间明天00:00（UTC表示）:', beijingTomorrowStart.toISOString());

console.log('\nSQL查询条件：');
console.log(`  completed_at >= '${beijingTodayStart.toISOString().slice(0, 19).replace('T', ' ')}'`);
console.log(`  completed_at < '${beijingTomorrowStart.toISOString().slice(0, 19).replace('T', ' ')}'`);

// 验证：这个范围对应的北京时间
console.log('\n验证（转换为北京时间）：');
console.log('  开始:', new Date(beijingTodayStart.getTime() + 8 * 60 * 60 * 1000).toISOString());
console.log('  结束:', new Date(beijingTomorrowStart.getTime() + 8 * 60 * 60 * 1000).toISOString());
