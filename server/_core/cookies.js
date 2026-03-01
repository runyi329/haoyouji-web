"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionCookieOptions = getSessionCookieOptions;
var LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
function isIpAddress(host) {
    // Basic IPv4 check and IPv6 presence detection.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
        return true;
    return host.includes(":");
}
function isSecureRequest(req) {
    if (req.protocol === "https")
        return true;
    var forwardedProto = req.headers["x-forwarded-proto"];
    if (!forwardedProto)
        return false;
    var protoList = Array.isArray(forwardedProto)
        ? forwardedProto
        : forwardedProto.split(",");
    return protoList.some(function (proto) { return proto.trim().toLowerCase() === "https"; });
}
function getSessionCookieOptions(req) {
    // 检测是否是微信环境（微信浏览器或小程序）
    var userAgent = req.headers['user-agent'] || '';
    var isWeChat = /MicroMessenger/i.test(userAgent);
    var isSecure = isSecureRequest(req);
    // 微信环境下使用更宽松的Cookie设置
    if (isWeChat) {
        console.log('[Cookie] WeChat environment detected, using relaxed cookie settings');
        return {
            httpOnly: false, // 微信环境下允许JS访问，增强兼容性
            path: "/",
            sameSite: "lax", // 微信环境下使用lax更稳定
            secure: isSecure, // 根据协议动态设置
        };
    }
    // 非微信环境使用严格设置
    return {
        httpOnly: true,
        path: "/",
        sameSite: "none", // 支持跨域请求
        secure: true, // sameSite=none必须配合secure=true使用
    };
}
