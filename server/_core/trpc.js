"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.adminProcedure = exports.protectedProcedure = exports.publicProcedure = exports.router = void 0;
var const_1 = require("@shared/const");
var server_1 = require("@trpc/server");
var superjson_1 = require("superjson");
var db_1 = require("../db");
var t = server_1.initTRPC.context().create({
    transformer: superjson_1.default,
});
exports.router = t.router;
// 在每个请求开始时设置isGuest标记
var setGuestContext = t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        (0, db_1.setCurrentIsGuest)(ctx.isGuest);
        return [2 /*return*/, next()];
    });
}); });
exports.publicProcedure = t.procedure.use(setGuestContext);
var requireUser = t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next, mockUser;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        // 开启DEV_BYPASS_AUTH时自动使用测试用户
        if (process.env.DEV_BYPASS_AUTH === 'true' && !ctx.user) {
            mockUser = {
                id: 28,
                openId: 'dev_mock_user',
                username: 'hyy329',
                passwordHash: '',
                name: '测试用户',
                email: null,
                loginMethod: 'password',
                role: 'parent',
                familyId: 1,
                avatar: null,
                points: 0,
                sharingEnabled: 0,
                isLocked: 0,
                failedLoginAttempts: 0,
                lastFailedLogin: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                lastSignedIn: new Date(),
            };
            return [2 /*return*/, next({
                    ctx: __assign(__assign({}, ctx), { user: mockUser }),
                })];
        }
        if (!ctx.user) {
            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: const_1.UNAUTHED_ERR_MSG });
        }
        return [2 /*return*/, next({
                ctx: __assign(__assign({}, ctx), { user: ctx.user }),
            })];
    });
}); });
exports.protectedProcedure = t.procedure.use(setGuestContext).use(requireUser);
exports.adminProcedure = t.procedure.use(t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        if (!ctx.user || ctx.user.role !== 'super_admin') {
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: const_1.NOT_ADMIN_ERR_MSG });
        }
        return [2 /*return*/, next({
                ctx: __assign(__assign({}, ctx), { user: ctx.user }),
            })];
    });
}); }));
