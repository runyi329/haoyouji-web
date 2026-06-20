/**
 * 触觉反馈工具函数
 * 用于在移动端提供震动反馈
 */

/**
 * 触发轻微震动反馈
 * 适用于：按钮点击、选项选择等轻量级交互
 */
export function hapticLight() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10); // 10ms 轻微震动
  }
}

/**
 * 触发中等震动反馈
 * 适用于：重要操作确认、表单提交等
 */
export function hapticMedium() {
  if ('vibrate' in navigator) {
    navigator.vibrate(20); // 20ms 中等震动
  }
}

/**
 * 触发强烈震动反馈
 * 适用于：错误提示、删除操作等
 */
export function hapticHeavy() {
  if ('vibrate' in navigator) {
    navigator.vibrate(30); // 30ms 强烈震动
  }
}

/**
 * 触发成功反馈震动
 * 两次短震动模拟"哒哒"的感觉
 */
export function hapticSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate([10, 50, 10]); // 震动10ms，停50ms，再震动10ms
  }
}

/**
 * 触发错误反馈震动
 * 三次短震动
 */
export function hapticError() {
  if ('vibrate' in navigator) {
    navigator.vibrate([20, 50, 20, 50, 20]); // 三次震动
  }
}
