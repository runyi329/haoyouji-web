# Debug Notes

## 问题：500错误

### 分析
`getUserSeatNumber` 中使用了 `firstInvestments.rows`，但项目中其他地方使用 `db.execute` 的返回格式不一致：
- 有些用 `(result as any)?.[0]` 
- 有些用 `result.rows`
- 有些用 `Array.isArray(result) ? result : (result.rows || [])`

### 修复方案
使用更安全的格式：`const rows = Array.isArray(firstInvestments) ? firstInvestments : (firstInvestments.rows || firstInvestments[0] || []);`
