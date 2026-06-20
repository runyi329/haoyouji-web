"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.searchContacts = searchContacts;
exports.countContacts = countContacts;
exports.addContact = addContact;
exports.updateContact = updateContact;
exports.deleteContact = deleteContact;
exports.addContactInteraction = addContactInteraction;
exports.getEarliestContactDate = getEarliestContactDate;
exports.getContactDetail = getContactDetail;
exports.addTagToContact = addTagToContact;
exports.removeTagFromContact = removeTagFromContact;
exports.updateContactField = updateContactField;
exports.deleteContactField = deleteContactField;
exports.setContactReferrer = setContactReferrer;
exports.queryCompanyInfo = queryCompanyInfo;
var db_1 = require("./db");
var schema_1 = require("../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
var ai_rate_limit_1 = require("./ai-rate-limit");
/**
 * 获取用户所有可见的人脉ID列表
 */
function getAllVisibleContactIds(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, ownContacts, ownContactIds;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId))];
                case 2:
                    ownContacts = _a.sent();
                    ownContactIds = ownContacts.map(function (c) { return c.id; });
                    // TODO: 2. 获取共享给我的人脉ID（VIP 3 功能，暂时不实现）
                    return [2 /*return*/, ownContactIds];
            }
        });
    });
}
/**
 * 搜索人脉
 */
function searchContacts(userId, filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, conditions, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleIds = _a.sent();
                    if (visibleIds.length === 0) {
                        return [2 /*return*/, []];
                    }
                    conditions = [(0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleIds)];
                    if (filters.name) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.name, "%".concat(filters.name, "%")));
                    }
                    if (filters.company) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.company, "%".concat(filters.company, "%")));
                    }
                    if (filters.region) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.region, "%".concat(filters.region, "%")));
                    }
                    if (filters.position) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.position, "%".concat(filters.position, "%")));
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.contacts.id,
                            name: schema_1.contacts.name,
                            phone: schema_1.contacts.phone,
                            company: schema_1.contacts.company,
                            position: schema_1.contacts.position,
                            region: schema_1.contacts.region,
                            gender: schema_1.contacts.gender,
                            createdAt: schema_1.contacts.createdAt,
                        })
                            .from(schema_1.contacts)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results];
            }
        });
    });
}
/**
 * 统计人脉数量
 */
function countContacts(userId, filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, conditions, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleIds = _b.sent();
                    if (visibleIds.length === 0) {
                        return [2 /*return*/, 0];
                    }
                    conditions = [(0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleIds)];
                    if (filters === null || filters === void 0 ? void 0 : filters.region) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.region, "%".concat(filters.region, "%")));
                    }
                    if (filters === null || filters === void 0 ? void 0 : filters.company) {
                        conditions.push((0, drizzle_orm_1.like)(schema_1.contacts.company, "%".concat(filters.company, "%")));
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.contacts)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))];
                case 3:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * 添加人脉
 */
function addContact(userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "add_contact")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.contacts).values({
                            parentUserId: userId,
                            name: data.name,
                            phone: data.phone || null,
                            company: data.company || null,
                            position: data.position || null,
                            region: data.region || null,
                            gender: data.gender || null,
                        })];
                case 3:
                    result = _a.sent();
                    // 记录操作日志
                    return [4 /*yield*/, (0, ai_rate_limit_1.logAIOperation)(userId, "add_contact", { contactId: result[0].insertId, name: data.name })];
                case 4:
                    // 记录操作日志
                    _a.sent();
                    return [2 /*return*/, {
                            id: result[0].insertId,
                            name: data.name,
                        }];
            }
        });
    });
}
/**
 * 修改人脉信息
 */
function updateContact(userId, contactId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "update_contact")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权修改此人脉");
                    }
                    updateData = {};
                    if (data.name !== undefined)
                        updateData.name = data.name;
                    if (data.phone !== undefined)
                        updateData.phone = data.phone;
                    if (data.company !== undefined)
                        updateData.company = data.company;
                    if (data.position !== undefined)
                        updateData.position = data.position;
                    if (data.region !== undefined)
                        updateData.region = data.region;
                    if (data.gender !== undefined)
                        updateData.gender = data.gender;
                    return [4 /*yield*/, db
                            .update(schema_1.contacts)
                            .set(updateData)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true, contactId: contactId }];
            }
        });
    });
}
/**
 * 删除人脉
 */
function deleteContact(userId, contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, contact;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "delete_contact")];
                case 1:
                    // 检查速率限制
                    _b.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _b.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权删除此人脉");
                    }
                    return [4 /*yield*/, db
                            .select({ name: schema_1.contacts.name })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))
                            .limit(1)];
                case 4:
                    contact = _b.sent();
                    // 删除人脉（级联删除会自动处理相关数据）
                    return [4 /*yield*/, db.delete(schema_1.contacts).where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))];
                case 5:
                    // 删除人脉（级联删除会自动处理相关数据）
                    _b.sent();
                    return [2 /*return*/, {
                            success: true,
                            contactId: contactId,
                            name: ((_a = contact[0]) === null || _a === void 0 ? void 0 : _a.name) || "未知",
                        }];
            }
        });
    });
}
/**
 * 添加联络记录（打卡）
 */
function addContactInteraction(userId, contactId, note) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, contact;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "add_interaction")];
                case 1:
                    // 检查速率限制
                    _b.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _b.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权为此人脉添加联络记录");
                    }
                    return [4 /*yield*/, db
                            .select({ name: schema_1.contacts.name })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))
                            .limit(1)];
                case 4:
                    contact = _b.sent();
                    // 插入联络记录
                    return [4 /*yield*/, db.insert(schema_1.contactInteractions).values({
                            contactId: contactId,
                            interactionDate: new Date().toISOString().split("T")[0],
                            notes: note,
                        })];
                case 5:
                    // 插入联络记录
                    _b.sent();
                    return [2 /*return*/, {
                            success: true,
                            contactName: ((_a = contact[0]) === null || _a === void 0 ? void 0 : _a.name) || "未知",
                            note: note,
                        }];
            }
        });
    });
}
/**
 * 获取最早的人脉创建时间（用于计算使用天数）
 */
function getEarliestContactDate(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleIds = _b.sent();
                    if (visibleIds.length === 0) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, db
                            .select({ createdAt: schema_1.contacts.createdAt })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.inArray)(schema_1.contacts.id, visibleIds))
                            .orderBy(schema_1.contacts.createdAt)
                            .limit(1)];
                case 3:
                    result = _b.sent();
                    return [2 /*return*/, ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.createdAt) || null];
            }
        });
    });
}
/**
 * 获取人脉的详细信息
 */
function getContactDetail(userId, contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, contact, fields, tags;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权查看此人脉");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))
                            .limit(1)];
                case 3:
                    contact = _a.sent();
                    if (!contact[0]) {
                        throw new Error("人脉不存在");
                    }
                    return [4 /*yield*/, db
                            .select({
                            category: schema_1.contactFieldCategories.name,
                            value: schema_1.contactFieldValues.value,
                        })
                            .from(schema_1.contactFieldValues)
                            .leftJoin(schema_1.contactFieldCategories, (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.categoryId, schema_1.contactFieldCategories.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contactId))];
                case 4:
                    fields = _a.sent();
                    return [4 /*yield*/, db
                            .select({ name: schema_1.contactTags.name })
                            .from(schema_1.contactTagRelations)
                            .leftJoin(schema_1.contactTags, (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, schema_1.contactTags.id))
                            .where((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId))];
                case 5:
                    tags = _a.sent();
                    return [2 /*return*/, __assign(__assign({}, contact[0]), { fields: fields, tags: tags.map(function (t) { return t.name; }) })];
            }
        });
    });
}
/**
 * 为人脉添加标签
 */
function addTagToContact(userId, contactId, tagName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, tag, tagId, result, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "tag_operation")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权为此人脉添加标签");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactTags)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.name, tagName), (0, drizzle_orm_1.eq)(schema_1.contactTags.userId, userId)))
                            .limit(1)];
                case 4:
                    tag = _a.sent();
                    if (!(tag.length === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.insert(schema_1.contactTags).values({
                            name: tagName,
                            userId: userId,
                        })];
                case 5:
                    result = _a.sent();
                    tagId = result[0].insertId;
                    return [3 /*break*/, 7];
                case 6:
                    tagId = tag[0].id;
                    _a.label = 7;
                case 7: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.contactTagRelations)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tagId)))
                        .limit(1)];
                case 8:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        return [2 /*return*/, { success: true, message: "标签已存在" }];
                    }
                    // 添加标签关系
                    return [4 /*yield*/, db.insert(schema_1.contactTagRelations).values({
                            contactId: contactId,
                            tagId: tagId,
                        })];
                case 9:
                    // 添加标签关系
                    _a.sent();
                    return [2 /*return*/, { success: true, tagName: tagName }];
            }
        });
    });
}
/**
 * 从人脉移除标签
 */
function removeTagFromContact(userId, contactId, tagName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, tag;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "tag_operation")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权移除此人脉的标签");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactTags)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTags.name, tagName), (0, drizzle_orm_1.eq)(schema_1.contactTags.userId, userId)))
                            .limit(1)];
                case 4:
                    tag = _a.sent();
                    if (tag.length === 0) {
                        throw new Error("标签不存在");
                    }
                    // 删除标签关系
                    return [4 /*yield*/, db
                            .delete(schema_1.contactTagRelations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactTagRelations.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactTagRelations.tagId, tag[0].id)))];
                case 5:
                    // 删除标签关系
                    _a.sent();
                    return [2 /*return*/, { success: true, tagName: tagName }];
            }
        });
    });
}
/**
 * 添加或更新人脉的扩展字段
 */
function updateContactField(userId, contactId, categoryName, value) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, category, categoryId, result, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "field_operation")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权修改此人脉的扩展字段");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.name, categoryName), (0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.userId, userId)))
                            .limit(1)];
                case 4:
                    category = _a.sent();
                    if (!(category.length === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, db.insert(schema_1.contactFieldCategories).values({
                            name: categoryName,
                            userId: userId,
                        })];
                case 5:
                    result = _a.sent();
                    categoryId = result[0].insertId;
                    return [3 /*break*/, 7];
                case 6:
                    categoryId = category[0].id;
                    _a.label = 7;
                case 7: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.contactFieldValues)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.categoryId, categoryId)))
                        .limit(1)];
                case 8:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 10];
                    // 更新现有字段
                    return [4 /*yield*/, db
                            .update(schema_1.contactFieldValues)
                            .set({ value: value })
                            .where((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.id, existing[0].id))];
                case 9:
                    // 更新现有字段
                    _a.sent();
                    return [3 /*break*/, 12];
                case 10: 
                // 插入新字段
                return [4 /*yield*/, db.insert(schema_1.contactFieldValues).values({
                        contactId: contactId,
                        categoryId: categoryId,
                        value: value,
                    })];
                case 11:
                    // 插入新字段
                    _a.sent();
                    _a.label = 12;
                case 12: return [2 /*return*/, { success: true, categoryName: categoryName, value: value }];
            }
        });
    });
}
/**
 * 删除人脉的扩展字段
 */
function deleteContactField(userId, contactId, categoryName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, category;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 检查速率限制
                return [4 /*yield*/, (0, ai_rate_limit_1.checkRateLimit)(userId, "field_operation")];
                case 1:
                    // 检查速率限制
                    _a.sent();
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 3:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权删除此人脉的扩展字段");
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.name, categoryName), (0, drizzle_orm_1.eq)(schema_1.contactFieldCategories.userId, userId)))
                            .limit(1)];
                case 4:
                    category = _a.sent();
                    if (category.length === 0) {
                        throw new Error("字段分类不存在");
                    }
                    // 删除字段值
                    return [4 /*yield*/, db
                            .delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contactFieldValues.contactId, contactId), (0, drizzle_orm_1.eq)(schema_1.contactFieldValues.categoryId, category[0].id)))];
                case 5:
                    // 删除字段值
                    _a.sent();
                    return [2 /*return*/, { success: true, categoryName: categoryName }];
            }
        });
    });
}
/**
 * 设置人脉的推荐人
 */
function setContactReferrer(userId, contactId, referrerName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, visibleIds, referrer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getAllVisibleContactIds(userId)];
                case 2:
                    visibleIds = _a.sent();
                    if (!visibleIds.includes(contactId)) {
                        throw new Error("无权修改此人脉的推荐人");
                    }
                    return [4 /*yield*/, db
                            .select({ id: schema_1.contacts.id })
                            .from(schema_1.contacts)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.contacts.name, referrerName), (0, drizzle_orm_1.eq)(schema_1.contacts.parentUserId, userId)))
                            .limit(1)];
                case 3:
                    referrer = _a.sent();
                    if (referrer.length === 0) {
                        throw new Error("\u63A8\u8350\u4EBA\u300C".concat(referrerName, "\u300D\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5148\u6DFB\u52A0\u8BE5\u4EBA\u8109"));
                    }
                    // 更新推荐人
                    return [4 /*yield*/, db
                            .update(schema_1.contacts)
                            .set({ referrerId: referrer[0].id })
                            .where((0, drizzle_orm_1.eq)(schema_1.contacts.id, contactId))];
                case 4:
                    // 更新推荐人
                    _a.sent();
                    return [2 /*return*/, { success: true, referrerName: referrerName }];
            }
        });
    });
}
/**
 * 查询企业工商信息（企查查API）
 */
function queryCompanyInfo(searchKey) {
    return __awaiter(this, void 0, void 0, function () {
        var appKey, secretKey, timespan, crypto_1, token, url, response, errorText, data, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    appKey = process.env.QICHACHA_APP_KEY;
                    secretKey = process.env.QICHACHA_SECRET_KEY;
                    if (!appKey || !secretKey) {
                        throw new Error("企查查API密钥未配置，请联系管理员");
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 7, , 8]);
                    timespan = Math.floor(Date.now() / 1000).toString();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('crypto'); })];
                case 2:
                    crypto_1 = _b.sent();
                    token = crypto_1
                        .createHash('md5')
                        .update(appKey + timespan + secretKey)
                        .digest('hex')
                        .toUpperCase();
                    url = "https://api.qichacha.com/FuzzySearch/GetList?key=".concat(appKey, "&searchKey=").concat(encodeURIComponent(searchKey));
                    return [4 /*yield*/, fetch(url, {
                            method: 'GET',
                            headers: {
                                'Token': token,
                                'Timespan': timespan
                            }
                        })];
                case 3:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.text()];
                case 4:
                    errorText = _b.sent();
                    console.error('[企查查API错误]', errorText);
                    throw new Error("\u4F01\u67E5\u67E5API\u8C03\u7528\u5931\u8D25: ".concat(response.status));
                case 5: return [4 /*yield*/, response.json()];
                case 6:
                    data = _b.sent();
                    // 4. 处理返回结果
                    if (data.Status !== '200') {
                        throw new Error("\u4F01\u67E5\u67E5API\u8FD4\u56DE\u9519\u8BEF: ".concat(data.Message || '未知错误'));
                    }
                    // 返回搜索结果
                    return [2 /*return*/, {
                            success: true,
                            total: ((_a = data.Result) === null || _a === void 0 ? void 0 : _a.length) || 0,
                            companies: data.Result || []
                        }];
                case 7:
                    error_1 = _b.sent();
                    console.error('[queryCompanyInfo错误]', error_1);
                    throw new Error("\u67E5\u8BE2\u4F01\u4E1A\u4FE1\u606F\u5931\u8D25: ".concat(error_1.message));
                case 8: return [2 /*return*/];
            }
        });
    });
}
var templateObject_1;
