"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBackupEmail = sendBackupEmail;
var nodemailer_1 = require("nodemailer");
// SMTP 配置 - 使用 QQ 邮箱
var SMTP_CONFIG = {
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
        user: 'tina_u@qq.com',
        pass: 'wqettalptfmebgdf',
    },
};
// 创建邮件传输器（延迟创建，避免启动时报错）
var _transporter = null;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer_1.default.createTransport(SMTP_CONFIG);
    }
    return _transporter;
}
/**
 * 发送账本备份邮件（带 Excel 附件）
 */
function sendBackupEmail(options) {
    return __awaiter(this, void 0, void 0, function () {
        var to, ledgerName, excelBuffer, stats, now, dateStr, filename, htmlContent, transporter;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    to = options.to, ledgerName = options.ledgerName, excelBuffer = options.excelBuffer, stats = options.stats;
                    now = new Date();
                    dateStr = "".concat(now.getFullYear(), "-").concat(String(now.getMonth() + 1).padStart(2, '0'), "-").concat(String(now.getDate()).padStart(2, '0'));
                    filename = "".concat(ledgerName, "_\u8D26\u76EE\u5907\u4EFD_").concat(dateStr, ".xlsx");
                    htmlContent = "\n<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"UTF-8\">\n  <style>\n    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }\n    .container { max-width: 600px; margin: 0 auto; padding: 20px; }\n    .header { background-color: #D32F2F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }\n    .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }\n    .stats-table { width: 100%; border-collapse: collapse; margin: 20px 0; }\n    .stats-table td { padding: 12px; border-bottom: 1px solid #e0e0e0; }\n    .stats-table td:first-child { font-weight: bold; color: #666; width: 40%; }\n    .stats-table td:last-child { text-align: right; }\n    .income { color: #4CAF50; font-weight: bold; }\n    .expense { color: #D32F2F; font-weight: bold; }\n    .balance { color: #2196F3; font-weight: bold; font-size: 18px; }\n    .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }\n  </style>\n</head>\n<body>\n  <div class=\"container\">\n    <div class=\"header\">\n      <h2>\u8D26\u672C\u81EA\u52A8\u5907\u4EFD</h2>\n    </div>\n    <div class=\"content\">\n      <p>\u60A8\u597D\uFF01</p>\n      <p>\u8FD9\u662F\u60A8\u7684\u8D26\u672C\u300C".concat(ledgerName, "\u300D\u7684\u5B9A\u671F\u81EA\u52A8\u5907\u4EFD\uFF0C\u8BF7\u67E5\u6536\u9644\u4EF6\u4E2D\u7684 Excel \u6587\u4EF6\u3002</p>\n      \n      <h3>\u5907\u4EFD\u6982\u89C8</h3>\n      <table class=\"stats-table\">\n        <tr>\n          <td>\u8D26\u672C\u540D\u79F0</td>\n          <td>").concat(ledgerName, "</td>\n        </tr>\n        <tr>\n          <td>\u5907\u4EFD\u65F6\u95F4</td>\n          <td>").concat(dateStr, "</td>\n        </tr>\n        <tr>\n          <td>\u8BB0\u5F55\u603B\u6570</td>\n          <td>").concat(stats.totalRecords, " \u6761</td>\n        </tr>\n        <tr>\n          <td>\u65F6\u95F4\u8303\u56F4</td>\n          <td>").concat(stats.earliestDate || '无', " \u81F3 ").concat(stats.latestDate || '无', "</td>\n        </tr>\n        <tr>\n          <td>\u603B\u6536\u5165</td>\n          <td class=\"income\">+").concat(stats.totalIncome.toFixed(2), "</td>\n        </tr>\n        <tr>\n          <td>\u603B\u652F\u51FA</td>\n          <td class=\"expense\">-").concat(stats.totalExpense.toFixed(2), "</td>\n        </tr>\n        <tr>\n          <td>\u7ED3\u4F59</td>\n          <td class=\"balance\">").concat(stats.balance.toFixed(2), "</td>\n        </tr>\n      </table>\n    </div>\n    <div class=\"footer\">\n      <p>\u6B64\u90AE\u4EF6\u7531\u8109\u52A8\u5171\u4EAB\u8D26\u672C\u7CFB\u7EDF\u81EA\u52A8\u53D1\u9001\uFF0C\u8BF7\u52FF\u56DE\u590D\u3002</p>\n    </div>\n  </div>\n</body>\n</html>\n  ");
                    transporter = getTransporter();
                    return [4 /*yield*/, transporter.sendMail({
                            from: "\"\u8109\u52A8\u5171\u4EAB\u8D26\u672C\u5907\u4EFD\" <".concat(SMTP_CONFIG.auth.user, ">"),
                            to: to,
                            subject: "\u3010\u8109\u52A8\u5171\u4EAB\u8D26\u672C\u5907\u4EFD\u3011".concat(ledgerName, " (").concat(dateStr, ")"),
                            html: htmlContent,
                            attachments: [
                                {
                                    filename: filename,
                                    content: excelBuffer,
                                },
                            ],
                        })];
                case 1:
                    _a.sent();
                    console.log("[sendBackupEmail] \u90AE\u4EF6\u5DF2\u53D1\u9001\u81F3 ".concat(to));
                    return [2 /*return*/];
            }
        });
    });
}
