// 测试时间范围计算
const now = new Date();
const beijingOffset = 8 * 60; // 北京时区偏移（分钟）
const beijingNow = new Date(now.getTime() + beijingOffset * 60 * 1000);
const beijingToday = new Date(beijingNow.getFullYear(), beijingNow.getMonth(), beijingNow.getDate());
const beijingTomorrow = new Date(beijingToday.getTime() + 24 * 60 * 60 * 1000);

// 转换为UTC时间
const todayStartUTC = new Date(beijingToday.getTime() - beijingOffset * 60 * 1000);
const todayEndUTC = new Date(beijingTomorrow.getTime() - beijingOffset * 60 * 1000);

console.log('========== 时间范围计算测试 ==========\n');
console.log('当前时间（UTC）:', now.toISOString());
console.log('当前时间（北京）:', beijingNow.toISOString());
console.log('\n北京时间今天：');
console.log('  开始:', beijingToday.toISOString());
console.log('  结束:', beijingTomorrow.toISOString());
console.log('\nUTC时间范围（用于SQL查询）：');
console.log('  开始:', todayStartUTC.toISOString());
console.log('  结束:', todayEndUTC.toISOString());
console.log('\nSQL查询条件：');
console.log(`  completed_at >= '${todayStartUTC.toISOString().slice(0, 19).replace('T', ' ')}'`);
console.log(`  completed_at < '${todayEndUTC.toISOString().slice(0, 19).replace('T', ' ')}'`);
