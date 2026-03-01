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
exports.generateInvitePoster = generateInvitePoster;
var child_process_1 = require("child_process");
var util_1 = require("util");
var path_1 = require("path");
var promises_1 = require("fs/promises");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * 生成用户专属邀请海报
 * @param userId 用户ID
 * @param username 用户名
 * @returns 海报文件路径（相对于public目录）
 */
function generateInvitePoster(userId, username) {
    return __awaiter(this, void 0, void 0, function () {
        var inviteUrl, templatePath, postersDir, outputFilename, outputPath, scriptPath, command, _a, stdout, stderr, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    inviteUrl = "https://jiangyuchen.cn/invite?uid=".concat(userId);
                    templatePath = path_1.default.join(process.cwd(), 'client/public/assets/poster_template.png');
                    postersDir = path_1.default.join(process.cwd(), 'client/public/posters');
                    return [4 /*yield*/, promises_1.default.mkdir(postersDir, { recursive: true })];
                case 1:
                    _b.sent();
                    outputFilename = "poster_".concat(userId, "_").concat(Date.now(), ".png");
                    outputPath = path_1.default.join(postersDir, outputFilename);
                    scriptPath = path_1.default.join(process.cwd(), 'server/generate_poster.py');
                    command = "python3.11 \"".concat(scriptPath, "\" \"").concat(username, "\" \"").concat(inviteUrl, "\" \"").concat(templatePath, "\" \"").concat(outputPath, "\"");
                    console.log('Generating poster with command:', command);
                    return [4 /*yield*/, execAsync(command)];
                case 2:
                    _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
                    if (stderr) {
                        console.error('Poster generation stderr:', stderr);
                    }
                    if (stdout) {
                        console.log('Poster generation stdout:', stdout);
                    }
                    // 返回相对路径（用于前端访问）
                    return [2 /*return*/, "/posters/".concat(outputFilename)];
                case 3:
                    error_1 = _b.sent();
                    console.error('Error generating poster:', error_1);
                    throw new Error('Failed to generate invite poster');
                case 4: return [2 /*return*/];
            }
        });
    });
}
