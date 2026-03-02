"use strict";
/**
 * 北京时区工具函数
 * 统一处理时区转换，确保前端显示和后端统计都使用北京时间（UTC+8）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BEIJING_OFFSET_MS = void 0;
exports.getBeijingNow = getBeijingNow;
exports.getBeijingTimestamp = getBeijingTimestamp;
exports.utcToBeijing = utcToBeijing;
exports.beijingToUtc = beijingToUtc;
exports.getBeijingTodayStart = getBeijingTodayStart;
exports.getBeijingTodayEnd = getBeijingTodayEnd;
exports.getBeijingThisWeekStart = getBeijingThisWeekStart;
exports.getBeijingThisMonthStart = getBeijingThisMonthStart;
exports.getBeijingThisYearStart = getBeijingThisYearStart;
exports.formatBeijingTime = formatBeijingTime;
exports.calculateBeijingDaysDifference = calculateBeijingDaysDifference;
// 北京时区偏移量（毫秒）
exports.BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
/**
 * 获取当前北京时间的 Date 对象
 */
function getBeijingNow() {
    var now = new Date();
    var utcTime = now.getTime();
    var beijingTime = utcTime + exports.BEIJING_OFFSET_MS;
    return new Date(beijingTime);
}
/**
 * 获取当前北京时间的时间戳（毫秒）
 */
function getBeijingTimestamp() {
    return Date.now() + exports.BEIJING_OFFSET_MS;
}
/**
 * 将 UTC 时间戳转换为北京时间的 Date 对象
 */
function utcToBeijing(utcTimestamp) {
    return new Date(utcTimestamp + exports.BEIJING_OFFSET_MS);
}
/**
 * 将北京时间的 Date 对象转换为 UTC 时间戳
 */
function beijingToUtc(beijingDate) {
    return beijingDate.getTime() - exports.BEIJING_OFFSET_MS;
}
/**
 * 获取北京时间今天的开始时间（00:00:00）
 * @returns UTC 时间戳
 */
function getBeijingTodayStart() {
    var beijingNow = getBeijingTimestamp();
    var oneDayMs = 24 * 60 * 60 * 1000;
    var beijingStartOfDay = Math.floor(beijingNow / oneDayMs) * oneDayMs;
    return beijingStartOfDay - exports.BEIJING_OFFSET_MS; // 转回 UTC
}
/**
 * 获取北京时间今天的结束时间（23:59:59.999）
 * @returns UTC 时间戳
 */
function getBeijingTodayEnd() {
    return getBeijingTodayStart() + 24 * 60 * 60 * 1000 - 1;
}
/**
 * 获取北京时间本周的开始时间（周一 00:00:00）
 * @returns UTC 时间戳
 */
function getBeijingThisWeekStart() {
    var beijingNow = new Date(getBeijingTimestamp());
    var dayOfWeek = beijingNow.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    var daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 计算距离周一的天数
    var beijingMondayStart = new Date(beijingNow);
    beijingMondayStart.setUTCDate(beijingMondayStart.getUTCDate() - daysToMonday);
    beijingMondayStart.setUTCHours(0, 0, 0, 0);
    return beijingMondayStart.getTime() - exports.BEIJING_OFFSET_MS; // 转回 UTC
}
/**
 * 获取北京时间本月的开始时间（1号 00:00:00）
 * @returns UTC 时间戳
 */
function getBeijingThisMonthStart() {
    var beijingNow = new Date(getBeijingTimestamp());
    var beijingMonthStart = new Date(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), 1, 0, 0, 0, 0);
    return beijingMonthStart.getTime() - exports.BEIJING_OFFSET_MS; // 转回 UTC
}
/**
 * 获取北京时间本年的开始时间（1月1日 00:00:00）
 * @returns UTC 时间戳
 */
function getBeijingThisYearStart() {
    var beijingNow = new Date(getBeijingTimestamp());
    var beijingYearStart = new Date(beijingNow.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    return beijingYearStart.getTime() - exports.BEIJING_OFFSET_MS; // 转回 UTC
}
/**
 * 格式化北京时间为字符串
 * @param utcTimestamp UTC 时间戳
 * @param format 格式：'date' | 'datetime' | 'time'
 */
function formatBeijingTime(utcTimestamp, format) {
    if (format === void 0) { format = 'datetime'; }
    var beijingDate = utcToBeijing(utcTimestamp);
    var year = beijingDate.getUTCFullYear();
    var month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
    var day = String(beijingDate.getUTCDate()).padStart(2, '0');
    var hours = String(beijingDate.getUTCHours()).padStart(2, '0');
    var minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
    var seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0');
    if (format === 'date') {
        return "".concat(year, "-").concat(month, "-").concat(day);
    }
    else if (format === 'time') {
        return "".concat(hours, ":").concat(minutes, ":").concat(seconds);
    }
    else {
        return "".concat(year, "-").concat(month, "-").concat(day, " ").concat(hours, ":").concat(minutes, ":").concat(seconds);
    }
}
/**
 * 计算两个时间戳之间相差的天数（基于北京时间）
 */
function calculateBeijingDaysDifference(timestamp1, timestamp2) {
    var beijingTime1 = timestamp1 + exports.BEIJING_OFFSET_MS;
    var beijingTime2 = timestamp2 + exports.BEIJING_OFFSET_MS;
    var oneDayMs = 24 * 60 * 60 * 1000;
    var day1 = Math.floor(beijingTime1 / oneDayMs);
    var day2 = Math.floor(beijingTime2 / oneDayMs);
    return Math.abs(day2 - day1);
}
