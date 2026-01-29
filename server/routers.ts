import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { loginWithPassword, registerWithPassword, hashPassword } from "./auth";
import { sdk } from "./_core/sdk";
import { textToSpeech } from "./_core/tts";
import * as dbContacts from "./db-contacts";
import * as dbReminderTypes from "./db-reminder-types";
import * as dbReferrerStats from "./db-referrer-stats";
import * as dbAnalytics from "./db-analytics";
import * as dbPoints from "./db-points";
import * as dbTagAnalytics from "./db-tag-analytics";
import { addPointsForAction } from "./db-point-system";
import * as dbLedger from "./db-ledger";
import { getDb } from "./db";
import { contacts, contactFieldCategories, contactFieldValues, contactTags, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      console.log("[Logout] Clearing cookie with options:", {
        cookieName: COOKIE_NAME,
        cookieOptions,
        host: ctx.req.headers.host,
        protocol: ctx.req.protocol,
        forwardedProto: ctx.req.headers['x-forwarded-proto']
      });
      
      // 方法1: 使用clearCookie
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      
      // 方法2: 设置过期的cookie来强制覆盖
      ctx.res.cookie(COOKIE_NAME, '', {
        ...cookieOptions,
        maxAge: 0,
        expires: new Date(0)
      });
      
      // 方法3: 清除所有可能的domain变体（处理代理环境）
      const host = ctx.req.headers.host;
      if (host) {
        const hostname = host.split(':')[0];
        // 清除当前域名的cookie
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, domain: hostname });
        ctx.res.cookie(COOKIE_NAME, '', {
          ...cookieOptions,
          domain: hostname,
          maxAge: 0,
          expires: new Date(0)
        });
        
        // 如果是子域名，也清除父域名的cookie
        const parts = hostname.split('.');
        if (parts.length > 2) {
          const parentDomain = parts.slice(-2).join('.');
          ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, domain: `.${parentDomain}` });
          ctx.res.cookie(COOKIE_NAME, '', {
            ...cookieOptions,
            domain: `.${parentDomain}`,
            maxAge: 0,
            expires: new Date(0)
          });
        }
      }
      
      return { success: true } as const;
    }),
    
    // 用户名密码登录
    loginWithPassword: publicProcedure
      .input(z.object({
        username: z.string().min(1).max(20),
        password: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const ipAddress = ctx.req.ip || ctx.req.headers["x-forwarded-for"] as string || "unknown";
        const result = await loginWithPassword(input.username, input.password, ipAddress);
        
        if (!result.success) {
          throw new TRPCError({
            code: result.isLocked ? "FORBIDDEN" : "UNAUTHORIZED",
            message: result.error || "登录失败",
          });
        }
        
        // 获取完整用户信息
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户不存在" });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "",
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 用户名密码注册
    registerWithPassword: publicProcedure
      .input(z.object({
        username: z.string().min(1).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await registerWithPassword(
          input.username,
          input.password,
          input.name,
          input.email
        );
        
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "注册失败",
          });
        }
        
        // 获取新创建的用户
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建用户失败" });
        }
        
        // 如果是家长，自动创建family
        if (user.role === "parent") {
          const familyName = input.name || input.username;
          await db.createFamilyForParent(user.id, familyName);
        }
        
        // 自动登录
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "",
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 更新个人信息（用户自己更新）
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserInfo(ctx.user.id, {
          name: input.name,
        });
        
        // 如果需要更新email,也可以在这里添加
        if (input.email) {
          const db_instance = await getDb();
          if (db_instance) {
            await db_instance.update(users).set({ email: input.email }).where(eq(users.id, ctx.user.id));
          }
        }
        
        return { success: true };
      }),
    
    // 上传头像
    uploadAvatar: protectedProcedure
      .input(z.object({
        imageData: z.string(), // base64 encoded image
      }))
      .mutation(async ({ ctx, input }) => {
        // 将base64转换为buffer
        const base64Data = input.imageData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        
        // 上传到S3
        const fileKey = `avatars/${ctx.user.id}-${nanoid()}.png`;
        const { url } = await storagePut(fileKey, buffer, "image/png");
        
        // 更新数据库
        const db_instance = await getDb();
        if (db_instance) {
          await db_instance.update(users).set({ avatar: url }).where(eq(users.id, ctx.user.id));
        }
        
        return { success: true, avatarUrl: url };
      }),
    
    // 游客模式登录（开发专用）
    guestLogin: publicProcedure
      .mutation(async ({ ctx }) => {        
        // 使用专门的游客用户ID（guest_dev）
        const guestUserId = 5070293;
        
        // 获取游客用户信息
        const user = await db.getUserById(guestUserId);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "游客用户不存在" });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || "游客",
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    // 修改密码
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(6),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "无法修改密码" });
        }
        
        const { verifyPassword } = await import("./auth");
        const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "当前密码错误" });
        }
        
        const newHash = await hashPassword(input.newPassword);
        await db.updateUserPassword(ctx.user.id, newHash);
        
        return { success: true };
      }),
    
    // 一键登录（管理员和家长功能）
    quickLogin: protectedProcedure
      .input(z.object({
        targetUserId: z.number(),
        password: z.string().optional(), // 宝宝切换回家长时需要提供家长密码
      }))
      .mutation(async ({ ctx, input }) => {
        // 超级管理员可以登录任何账户
        if (ctx.user.role === "super_admin") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        // 家长只能切换到自己管理的宝宝账户
        if (ctx.user.role === "parent") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          if (targetUser.role !== "baby") {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到宝宝账户" });
          }
          
          const kids = await db.getKidsByParent(ctx.user.id);
          const isMyKid = kids.some(kid => kid.userId === input.targetUserId);
          
          if (!isMyKid) {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到自己管理的宝宝账户" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        // 宝宝可以切换回家长账户（需要验证家长密码）
        if (ctx.user.role === "baby") {
          const targetUser = await db.getUserById(input.targetUserId);
          if (!targetUser) {
            throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
          }
          
          if (targetUser.role !== "parent") {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到家长账户" });
          }
          
          // 验证当前宝宝是否属于目标家长
          const kids = await db.getKidsByParent(input.targetUserId);
          const isMyParent = kids.some(kid => kid.userId === ctx.user.id);
          
          if (!isMyParent) {
            throw new TRPCError({ code: "FORBIDDEN", message: "只能切换到自己的家长账户" });
          }
          
          // 验证家长密码
          if (!input.password) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "请输入家长密码" });
          }
          
          const { verifyPassword } = await import("./auth");
          if (!targetUser.passwordHash) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "家长账户未设置密码" });
          }
          const isPasswordValid = await verifyPassword(input.password, targetUser.passwordHash);
          
          if (!isPasswordValid) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "家长密码错误" });
          }
          
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(targetUser.id.toString(), {
            name: targetUser.name || targetUser.username || "",
            expiresInMs: 24 * 60 * 60 * 1000,
          });
          
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: 24 * 60 * 60 * 1000,
          });
          
          return { 
            success: true,
            user: {
              id: targetUser.id,
              username: targetUser.username,
              name: targetUser.name,
              role: targetUser.role,
            },
          };
        }
        
        throw new TRPCError({ code: "FORBIDDEN", message: "无权使用一键登录功能" });
      }),
  }),

  // 通用文件上传API
  upload: router({
    file: protectedProcedure
      .input(z.object({
        base64Data: z.string(),
        contentType: z.string(),
        prefix: z.string().default("uploads"),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        const ext = input.contentType.split("/")[1] || "bin";
        const fileKey = `${input.prefix}/${Date.now()}-${nanoid()}.${ext}`;
        
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        
        return { url, fileKey };
      }),
  }),
  
  // ==================== 管理后台 ====================
  admin: router({
    // 获取所有用户
    getUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllUsers();
    }),
    
    // 解锁用户
    unlockUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以解锁用户" });
        }
        await db.unlockUser(input.userId);
        return { success: true };
      }),
    
    // 设置用户角色
    setUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["super_admin", "parent", "baby"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以设置角色" });
        }
        await db.updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    
    // 创建用户（管理员创建）
    createUser: protectedProcedure
      .input(z.object({
        username: z.string().min(1).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        role: z.enum(["super_admin", "parent", "baby"]).default("parent"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建用户" });
        }
        
        const existingUser = await db.getUserByUsername(input.username);
        if (existingUser) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "用户名已存在" });
        }
        
        const passwordHash = await hashPassword(input.password);
        const userId = await db.createUserWithPassword({
          username: input.username,
          passwordHash,
          name: input.name,
          role: input.role,
        });
        
        return { success: true, userId };
      }),
    
    // 重置用户密码
    resetUserPassword: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以重置密码" });
        }
        
        const passwordHash = await hashPassword(input.newPassword);
        await db.updateUserPassword(input.userId, passwordHash);
        return { success: true };
      }),
    
    // 获取所有家长用户
    getAllParents: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllParents();
    }),
    
    // 获取家庭的所有子功能权限
    getFamilyFeatures: protectedProcedure
      .input(z.object({ familyId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        return db.getFamilyFeatures(input.familyId);
      }),
    
    // 更新子功能权限
    updateFamilyFeature: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        featureName: z.string(),
        subFeatureName: z.string(),
        enabled: z.boolean(),
        settings: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        await db.upsertFamilyFeature(input);
        return { success: true };
      }),
    
    // 批量更新子功能权限
    batchUpdateFamilyFeatures: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        features: z.array(z.object({
          featureName: z.string(),
          subFeatureName: z.string(),
          enabled: z.boolean(),
          settings: z.any().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        await db.batchUpdateFamilyFeatures(input.familyId, input.features);
        return { success: true };
      }),
    
    // 获取当前用户的功能权限（家长/宝宝使用）
    getMyFamilyFeatures: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      if (!user.familyId) {
        return [];
      }
      return db.getFamilyFeatures(user.familyId);
    }),
    
    // 获取功能树（带家庭权限状态）
    getFeatureTree: protectedProcedure
      .input(z.object({
        familyId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        
        // 导入功能树结构
        const { FEATURE_TREE, buildFeatureTree } = await import("../shared/featureTree");
        
        // 获取家庭的所有权限记录
        const familyFeatures = await db.getFamilyFeatures(input.familyId);
        const featureMap = new Map(familyFeatures.map(f => [f.path, f]));
        
        // 合并功能树和权限状态
        const featuresWithStatus = FEATURE_TREE.map(node => ({
          ...node,
          enabled: featureMap.get(node.path)?.enabled ?? false,
        }));
        
        return buildFeatureTree(featuresWithStatus);
      }),
    
    // 批量更新功能权限（按path）
    batchUpdateFeaturesByPath: protectedProcedure
      .input(z.object({
        familyId: z.number(),
        updates: z.array(z.object({
          path: z.string(),
          enabled: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        console.log('[batchUpdateFeaturesByPath] 收到保存请求:', {
          familyId: input.familyId,
          updatesCount: input.updates.length,
          updates: input.updates.slice(0, 10),
        });
        await db.batchUpdateFeaturesByPath(input.familyId, input.updates);
        
        // 检查是否包含"好友记 - 共享权限"，如果有则同步更新用户表的sharingEnabled字段
        const sharingPermissionUpdate = input.updates.find(u => u.path === '社交/好友记/好友记 - 共享权限');
        if (sharingPermissionUpdate !== undefined) {
          console.log('[batchUpdateFeaturesByPath] 同步更新用户sharingEnabled:', sharingPermissionUpdate.enabled);
          await db.updateUsersSharingEnabled(input.familyId, sharingPermissionUpdate.enabled);
        }
        
        console.log('[batchUpdateFeaturesByPath] 保存成功');
        return { success: true };
      }),
    
    // 同步功能树到数据库（初始化/更新时使用）
    syncFeatureTree: protectedProcedure
      .input(z.object({
        familyId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以同步功能树" });
        }
        
        // 导入功能树结构
        const { FEATURE_TREE } = await import("../shared/featureTree");
        
        // 转换为数据库格式
        const features = FEATURE_TREE.map(node => ({
          featureName: node.path.split('/')[0], // 顶级模块名称
          subFeatureName: node.name,
          parentFeature: node.parentId ? FEATURE_TREE.find(n => n.id === node.parentId)?.name ?? null : null,
          level: node.level,
          path: node.path,
          displayOrder: node.displayOrder,
          enabled: false, // 默认关闭
        }));
        
        await db.syncFamilyFeatures(input.familyId, features);
        return { success: true };
      }),
    
    // 检查功能权限
    checkPermission: protectedProcedure
      .input(z.object({
        path: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const user = ctx.user;
        if (!user.familyId) {
          return false;
        }
        return db.checkFeaturePermission(user.familyId, input.path);
      }),
    
    // 获取所有家庭
    getFamilies: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      return db.getAllFamilies();
    }),
    
    // 更新用户的家庭归属
    updateUserFamily: protectedProcedure
      .input(z.object({
        userId: z.number(),
        familyId: z.number().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户家庭归属" });
        }
        await db.updateUserFamily(input.userId, input.familyId);
        return { success: true };
      }),
    
    // 更新用户关系：关联家长和宝宝
    updateUserRelation: protectedProcedure
      .input(z.object({
        userId: z.number(),
        relatedUserId: z.number().nullable(),
        relationType: z.enum(['parent', 'child']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改用户关系" });
        }
        await db.updateUserRelation(input.userId, input.relatedUserId, input.relationType);
        return { success: true };
      }),
    
    // 批量删除用户
    deleteUsers: protectedProcedure
      .input(z.object({
        userIds: z.array(z.number()),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除用户" });
        }
        await db.deleteUsers(input.userIds);
        return { success: true };
      }),
    
    // 更新用户基本信息
    updateUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        username: z.string().optional(),
        name: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以编辑用户信息" });
        }
        await db.updateUserInfo(input.userId, {
          username: input.username,
          name: input.name,
        });
        return { success: true };
      }),
    
    // 获取用户的功能权限
    getUserPermissions: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
        }
        const dbPermissions = await import("./db-permissions");
        return await dbPermissions.getUserPermissions(input.userId);
      }),
    
    // 获取所有可用功能列表
    getAllFeatures: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以访问" });
      }
      const dbPermissions = await import("./db-permissions");
      return dbPermissions.getAllFeatures();
    }),
    
    // 设置用户功能权限
    setUserPermissions: protectedProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.object({
          featureKey: z.string(),
          isEnabled: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改权限" });
        }
        const dbPermissions = await import("./db-permissions");
        await dbPermissions.setUserPermissions(input.userId, input.permissions);
        return { success: true };
      }),
  }),

  // ==================== 功能权限检查 ====================
  features: router({
    // 检查用户的功能权限（普通用户可访问）
    checkPermission: protectedProcedure
      .input(z.object({ path: z.string() }))
      .query(async ({ ctx, input }) => {
        console.log('[features.checkPermission] ========== 开始检查 ==========');
        console.log('[features.checkPermission] 调用参数:', {
          userId: ctx.user.id,
          username: ctx.user.username,
          familyId: ctx.user.familyId,
          sharingEnabled: ctx.user.sharingEnabled,
          path: input.path
        });

        // 对于"好友记 - 共享权限"，直接返回user.sharingEnabled
        if (input.path === '社交/好友记/好友记 - 共享权限') {
          console.log('[features.checkPermission] 返回用户级别权限:', ctx.user.sharingEnabled);
          return { enabled: ctx.user.sharingEnabled || false };
        }

        // 其他功能仍然使用familyFeatures表
        if (!ctx.user.familyId) {
          console.log('[features.checkPermission] 用户没有familyId，返回false');
          return { enabled: false };
        }

        const feature = await db.checkFeaturePermission(ctx.user.familyId, input.path);
        console.log('[features.checkPermission] 权限检查结果:', {
          familyId: ctx.user.familyId,
          path: input.path,
          result: feature
        });
        console.log('[features.checkPermission] ========== 检查结束 ==========');
        return { enabled: feature || false };
      }),
  }),

  // ==================== 孩子档案 ====================
  children: router({
    list: protectedProcedure.query(async ({ ctx }) => {

      return db.getChildrenByParent(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        avatar: z.string().optional(),
        birthday: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createChildProfile({
          parentId: ctx.user.id,
          name: input.name,
          avatar: input.avatar,
          birthday: input.birthday ? new Date(input.birthday) : undefined,
        });
        return { id };
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getChildById(input.id);
      }),
  }),

  // ==================== 游戏 ====================
  games: router({
    saveRecord: protectedProcedure
      .input(z.object({
        gameType: z.enum(["memory", "puzzle", "math"]),
        score: z.number(),
        level: z.number().default(1),
        duration: z.number().default(0),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 保存游戏记录
        const id = await db.createGameRecord({
          userId: ctx.user.id,
          childId: input.childId,
          gameType: input.gameType,
          score: input.score,
          level: input.level,
          duration: input.duration,
        });

        // 计算积分奖励
        const pointsEarned = Math.floor(input.score / 10);
        if (pointsEarned > 0) {
          await db.updateUserPoints(ctx.user.id, pointsEarned);
          if (input.childId) {
            await db.updateChildPoints(input.childId, pointsEarned);
          }
          await db.createPointTransaction({
            userId: ctx.user.id,
            childId: input.childId,
            amount: pointsEarned,
            type: "game",
            referenceId: id,
            description: `游戏奖励: ${input.gameType}`,
          });
        }

        return { id, pointsEarned };
      }),
    getRecords: protectedProcedure
      .input(z.object({ gameType: z.string().optional() }))
      .query(async ({ ctx, input }) => {
        return db.getGameRecordsByUser(ctx.user.id, input.gameType);
      }),
    getLeaderboard: publicProcedure
      .input(z.object({ gameType: z.enum(["memory", "puzzle", "math"]), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getTopScores(input.gameType, input.limit);
      }),
  }),
  antonym: router({
    getRandomPairs: publicProcedure
      .input(z.object({ 
        count: z.number().min(10).max(50).default(10),
        difficulty: z.enum(['beginner', 'advanced']).default('beginner') // 初级/高级
      }))
      .query(async ({ input }) => {
        return db.getRandomAntonymPairs(input.count, input.difficulty);
      }),
    
    getAllPairs: publicProcedure.query(async () => {
      return db.getAllAntonymPairs();
    }),
    
    createPair: protectedProcedure
      .input(z.object({
        word: z.string().min(1).max(50),
        antonym: z.string().min(1).max(50),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can add antonyms" });
        }
        const id = await db.createAntonymPair(input);
        return { id };
      }),
    
    updatePair: protectedProcedure
      .input(z.object({
        id: z.number(),
        word: z.string().optional(),
        antonym: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update antonyms" });
        }
        const { id, ...data } = input;
        await db.updateAntonymPair(id, data);
        return { success: true };
      }),
    
    deletePair: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete antonyms" });
        }
        await db.deleteAntonymPair(input.id);
        return { success: true };
      }),
  }),


  // ==================== 知识 ====================
  knowledge: router({
    getCategories: publicProcedure.query(async () => {
      return db.getAllKnowledgeCategories();
    }),
    createCategory: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建分类" });
        }
        const id = await db.createKnowledgeCategory(input);
        return { id };
      }),
    updateCategory: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新分类" });
        }
        const { id, ...data } = input;
        await db.updateKnowledgeCategory(id, data);
        return { success: true };
      }),
    deleteCategory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除分类" });
        }
        await db.deleteKnowledgeCategory(input.id);
        return { success: true };
      }),
    getItems: publicProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ input }) => {
        return db.getKnowledgeItemsByCategory(input.categoryId);
      }),
    getItem: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const item = await db.getKnowledgeItemById(input.id);
        if (item) {
          await db.incrementKnowledgeViewCount(input.id);
        }
        return item;
      }),
    createItem: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        title: z.string().min(1).max(200),
        content: z.string(),
        coverImage: z.string().optional(),
        images: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建内容" });
        }
        const id = await db.createKnowledgeItem({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id };
      }),
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
        coverImage: z.string().optional(),
        images: z.array(z.string()).optional(),
        isPublished: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以更新内容" });
        }
        const { id, ...data } = input;
        await db.updateKnowledgeItem(id, data);
        return { success: true };
      }),
    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除内容" });
        }
        await db.deleteKnowledgeItem(input.id);
        return { success: true };
      }),
  }),

  // ==================== 相册 ====================
  albums: router({
    // 公开访问：获取所有相册
    list: publicProcedure.query(async () => {
      return db.getAllPublicAlbums();
    }),
    // 公开访问：获取相册详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        return album;
      }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        childId: z.number().optional(),
        isPublic: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createAlbum({
          userId: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        coverImage: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        const { id, ...data } = input;
        await db.updateAlbum(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.id);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        await db.deleteAlbum(input.id);
        return { success: true };
      }),
  }),

  // ==================== 照片 ====================
  photos: router({
    // 公开访问：获取相册中的照片列表
    list: publicProcedure
      .input(z.object({ albumId: z.number() }))
      .query(async ({ input }) => {
        const album = await db.getAlbumById(input.albumId);
        if (!album) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }
        return db.getPhotosByAlbum(input.albumId);
      }),
    // 公开访问：获取单张照片详情
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPhotoById(input.id);
      }),
    upload: protectedProcedure
      .input(z.object({
        albumId: z.number(),
        fileData: z.string(), // base64 encoded
        fileName: z.string(),
        mimeType: z.string(),
        description: z.string().optional(),
        takenAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const album = await db.getAlbumById(input.albumId);
        if (!album || album.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "相册不存在" });
        }

        // 上传到S3
        const buffer = Buffer.from(input.fileData, "base64");
        const fileKey = `photos/${ctx.user.id}/${nanoid()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // 保存到数据库
        const id = await db.createPhoto({
          albumId: input.albumId,
          userId: ctx.user.id,
          url,
          fileKey,
          description: input.description,
          takenAt: input.takenAt ? new Date(input.takenAt) : undefined,
        });

        // 如果是相册第一张照片，设为封面
        if (!album.coverImage) {
          await db.updateAlbum(input.albumId, { coverImage: url });
        }

        return { id, url };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        takenAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const photo = await db.getPhotoById(input.id);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
        }
        const { id, ...data } = input;
        await db.updatePhoto(id, {
          ...data,
          takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const photo = await db.getPhotoById(input.id);
        if (!photo || photo.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "照片不存在" });
        }
        await db.deletePhoto(input.id);
        return { success: true };
      }),
    addComment: protectedProcedure
      .input(z.object({
        photoId: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createPhotoComment({
          photoId: input.photoId,
          userId: ctx.user.id,
          content: input.content,
        });
        return { id };
      }),
    getComments: protectedProcedure
      .input(z.object({ photoId: z.number() }))
      .query(async ({ input }) => {
        return db.getCommentsByPhoto(input.photoId);
      }),
  }),

  // ==================== 奖励系统 ====================
  rewards: router({
    // 勋章
    getBadges: publicProcedure.query(async () => {
      return db.getAllBadges();
    }),
    getUserBadges: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserBadges(ctx.user.id);
    }),
    awardBadge: protectedProcedure
      .input(z.object({
        badgeId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.awardBadge({
          userId: ctx.user.id,
          badgeId: input.badgeId,
          childId: input.childId,
        });
        return { id };
      }),

    // 任务
    getTasks: protectedProcedure.query(async () => {
      return db.getActiveTasks();
    }),
    getMyTasks: protectedProcedure.query(async ({ ctx }) => {
      return db.getTasksByCreator(ctx.user.id);
    }),
    createTask: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        taskType: z.enum(["daily", "weekly", "custom"]).default("custom"),
        points: z.number().default(10),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createTask({
          createdBy: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    updateTask: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        points: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        const { id, ...data } = input;
        await db.updateTask(id, data);
        return { success: true };
      }),
    completeTask: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await db.getTaskById(input.taskId);
        if (!task) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        // 记录完成
        const id = await db.completeTask({
          taskId: input.taskId,
          userId: ctx.user.id,
          childId: input.childId,
          pointsEarned: task.points,
        });

        // 发放积分
        await db.updateUserPoints(ctx.user.id, task.points);
        if (input.childId) {
          await db.updateChildPoints(input.childId, task.points);
        }
        await db.createPointTransaction({
          userId: ctx.user.id,
          childId: input.childId,
          amount: task.points,
          type: "task",
          referenceId: input.taskId,
          description: `完成任务: ${task.title}`,
        });

        return { id, pointsEarned: task.points };
      }),
    getCompletions: protectedProcedure.query(async ({ ctx }) => {
      return db.getTaskCompletionsByUser(ctx.user.id);
    }),

    // 奖品
    list: publicProcedure.query(async ({ ctx }) => {
      // 未登录或超级管理员：返回所有活跃奖品
      if (!ctx.user || ctx.user.role === "super_admin") {
        return db.getActiveRewards();
      }
      
      // 家长：只返回自己创建的奖品
      if (ctx.user.role === "parent") {
        return db.getRewardsByCreator(ctx.user.id);
      }
      
      // 其他角色：返回所有活跃奖品
      return db.getActiveRewards();
    }),
    getRewards: publicProcedure.query(async () => {
      return db.getActiveRewards();
    }),
    createReward: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        icon: z.string().optional(),
        pointsCost: z.number().default(100),
        stock: z.number().default(-1),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createReward({
          createdBy: ctx.user.id,
          ...input,
        });
        return { id };
      }),
    updateReward: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        pointsCost: z.number().optional(),
        stock: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.id);
        if (!reward) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
        }
        // 家长只能编辑自己创建的奖品，超级管理员可以编辑所有奖品
        if (ctx.user.role !== "super_admin" && reward.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此奖品" });
        }
        const { id, ...data } = input;
        await db.updateReward(id, data);
        return { success: true };
      }),
    redeemReward: protectedProcedure
      .input(z.object({
        rewardId: z.number(),
        childId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.rewardId);
        if (!reward || !reward.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
        }

        // 检查积分
        const user = await db.getUserById(ctx.user.id);
        if (!user || user.points < reward.pointsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "积分不足" });
        }

        // 检查库存
        if (reward.stock !== -1 && reward.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
        }

        // 扣除积分
        await db.updateUserPoints(ctx.user.id, -reward.pointsCost);
        if (input.childId) {
          await db.updateChildPoints(input.childId, -reward.pointsCost);
        }

        // 减少库存
        if (reward.stock !== -1) {
          await db.updateReward(input.rewardId, { stock: reward.stock - 1 });
        }

        // 创建兑换记录
        const id = await db.redeemReward({
          rewardId: input.rewardId,
          userId: ctx.user.id,
          childId: input.childId,
          pointsSpent: reward.pointsCost,
        });

        // 记录积分交易
        await db.createPointTransaction({
          userId: ctx.user.id,
          childId: input.childId,
          amount: -reward.pointsCost,
          type: "reward",
          referenceId: input.rewardId,
          description: `兑换奖品: ${reward.name}`,
        });

        return { id };
      }),
    getRedemptions: protectedProcedure.query(async ({ ctx }) => {
      return db.getRedemptionsByUser(ctx.user.id);
    }),
    updateRedemptionStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected", "completed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
        }
        await db.updateRedemptionStatus(input.id, input.status);
        return { success: true };
      }),

    // 积分
    getPoints: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      return { points: user?.points ?? 0 };
    }),
    deleteReward: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const reward = await db.getRewardById(input.id);
        if (!reward || reward.createdBy !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在" });
        }
        await db.deleteReward(input.id);
        return { success: true };
      }),
    getTransactions: protectedProcedure.query(async ({ ctx }) => {
      return db.getPointTransactionsByUser(ctx.user.id);
    }),
    
    // 获取积分历史记录
    getPointHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        return dbPoints.getPointHistory(ctx.user.id, input.limit);
      }),
    
    // 获取积分统计数据
    getPointStats: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      const stats = await dbPoints.getPointStats(ctx.user.id);
      return {
        currentPoints: user?.points ?? 0,
        ...stats,
      };
    }),
    
    // 用星星兑换奖品
    redeemWithStars: publicProcedure
      .input(z.object({
        kidId: z.number(),
        rewardId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const reward = await db.getRewardById(input.rewardId);
        if (!reward || !reward.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "奖品不存在或已下架" });
        }

        // 检查孩子的星星数
        const kid = await db.getSpecialKidById(input.kidId);
        if (!kid || kid.stars < reward.pointsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
        }

        // 检查库存
        if (reward.stock !== -1 && reward.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
        }

        // 扣除星星
        await db.updateSpecialKidStars(input.kidId, -reward.pointsCost);

        // 减少库存
        if (reward.stock !== -1) {
          await db.updateReward(input.rewardId, { stock: reward.stock - 1 });
        }

        // 创建兑换记录
        const redemptionId = await db.redeemReward({
          rewardId: input.rewardId,
          userId: reward.createdBy, // 使用奖品创建者作为userId
          childId: input.kidId,
          pointsSpent: reward.pointsCost,
        });

        return { 
          id: redemptionId,
          itemName: reward.name,
        };
      }),
  }),

  // ==================== 喵喵旺旺专属模块 ====================
  specialKids: router({
    // 获取喵喵和斺斺的信息
    // 根据用户角色返回不同的宝宝列表：
    // - super_admin: 返回所有宝宝（喵喵、斺斺）- 仅用于首页展示
    // - parent: 只返回该家长的家庭中的宝宝
    // - baby: 返回空列表
    list: publicProcedure
      .input(z.object({ forManagement: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        // 未登录：返回所有特殊宝宝（喵喵、旺旺），供演示
        if (!ctx.user) {
          return db.getSpecialKids();
        }
        
        // 超级管理员：
        // - 如果是宝贝档案管理页面（forManagement=true），返回自己的宝宝（空列表）
        // - 如果是首页（forManagement=false），返回所有特殊宝宝用于演示
        if (ctx.user.role === "super_admin") {
          if (input?.forManagement) {
            return db.getKidsByParent(ctx.user.id);
          }
          return db.getSpecialKids();
        }
        
        // 家长：只返回自己家庭中的宝宝
        if (ctx.user.role === "parent") {
          return db.getKidsByParent(ctx.user.id);
        }
        
        // 宝宝：返回自己的信息（用于显示“切换回家长”按钮）
        if (ctx.user.role === "baby") {
          const db_instance = await db.getDb();
          if (!db_instance) return [];
          
          const { specialKids, users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          
          const kids = await db_instance.select({
            id: specialKids.id,
            userId: specialKids.userId,
            parentUserId: specialKids.parentUserId,
            name: specialKids.name,
            avatar: specialKids.avatar,
            stars: specialKids.stars,
            position: specialKids.position,
            createdAt: specialKids.createdAt,
            updatedAt: specialKids.updatedAt,
            username: users.username,
          }).from(specialKids)
            .leftJoin(users, eq(specialKids.userId, users.id))
            .where(eq(specialKids.userId, ctx.user.id));
          
          return kids as any[];
        }
        
        return [];
      }),
    
    // 获取单个孩子信息
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSpecialKidById(input.id);
      }),
    
    // 更新孩子信息（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        avatar: z.string().optional(),
        starsChange: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改" });
        }
        // 更新基本信息
        if (input.name || input.avatar) {
          await db.updateSpecialKid(input.id, {
            name: input.name,
            avatar: input.avatar,
          });
        }
        // 调整星星数量
        if (input.starsChange !== undefined && input.starsChange !== 0) {
          await db.updateSpecialKidStars(input.id, input.starsChange);
        }
        return { success: true };
      }),
    
    // 上传头像
    uploadAvatar: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        filename: z.string(),
        contentType: z.string(),
        fileData: z.instanceof(Uint8Array),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有家长和超级管理员可以上传头像
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝头像" });
        }
        
        const buffer = Buffer.from(input.fileData);
        const ext = input.contentType.split("/")[1] || "jpg";
        const fileKey = `kids/avatar-${input.id || Date.now()}-${nanoid()}.${ext}`;
        
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        
        // 如果提供了宝宝ID，更新数据库
        if (input.id) {
          await db.updateSpecialKid(input.id, { avatar: url });
        }
        
        return { url };
      }),
    
    // 创建宝宝（家长添加）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以添加宝宝" });
        }
        
        const existingKids = await db.getKidsByParent(ctx.user.id);
        const kidCount = existingKids?.length || 0;
        
        let position: "left" | "right" = "left";
        if (kidCount === 1) {
          position = "right";
        } else if (kidCount >= 2) {
          position = "left";
        }
        
        // 为宝宝创建登录账户
        // 账号规则：baby_姓名_随机数
        // 密码：固定为 123456
        const defaultPassword = "123456";
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        const username = `baby_${input.name}_${randomSuffix}`;
        const passwordHash = await hashPassword(defaultPassword);
        
        const userId = await db.createUserWithPassword({
          username,
          passwordHash,
          name: input.name,
          role: "baby",
        });
        
        if (!userId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建宝宝账户失败" });
        }
        
        const kid = await db.createSpecialKid({
          name: input.name,
          position,
          parentUserId: ctx.user.id,
          userId,
        });
        
        // 返回宝宝信息和账户信息
        return {
          ...kid,
          account: {
            username,
            password: defaultPassword,
          },
        };
      }),
    
    // 删除宝宝
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // 超级管理员可以删除任何宝宝
        if (ctx.user.role === "super_admin") {
          await db.deleteSpecialKid(input.id);
          return { success: true };
        }
        
        // 家长只能删除自己的宝宝
        if (ctx.user.role === "parent") {
          // 先检查这个宝宝是否属于当前家长
          const kid = await db.getSpecialKidById(input.id);
          if (!kid || kid.parentUserId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "你只能删除自己的宝宝" });
          }
          
          await db.deleteSpecialKid(input.id);
          return { success: true };
        }
        
        // 宝宝角色不能删除
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除宝宝" });
      }),
    
    // 获取孩子的奖励记录
    getRewards: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getStarRewardsByKid(input.kidId);
      }),
  }),
  
  // ==================== 五角星奖励规则 ====================
  starRules: router({
    // 获取所有奖励规则
    list: publicProcedure.query(async () => {
      return db.getStarRewardRules();
    }),
    
    // 更新奖励规则（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        starsReward: z.number().min(0),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改奖励规则" });
        }
        await db.updateStarRewardRule(input.id, {
          starsReward: input.starsReward,
          isActive: input.isActive,
        });
        return { success: true };
      }),
    
    // 创建自定义奖励规则（管理员）
    create: protectedProcedure
      .input(z.object({
        activityType: z.string().min(1),
        activityName: z.string().min(1),
        starsReward: z.number().min(0),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建奖励规则" });
        }
        const id = await db.createStarRewardRule(input);
        return { id };
      }),
    
    // 删除奖励规则（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除奖励规则" });
        }
        await db.deleteStarRewardRule(input.id);
        return { success: true };
      }),
  }),
  
  // ==================== 五角星奖励发放 ====================
  starRewards: router({
    // 发放奖励（游戏获胜等）
    award: publicProcedure
      .input(z.object({
        kidId: z.number(),
        activityType: z.string(),
        description: z.string().optional(),
        customStars: z.number().optional(), // 自定义星星数量（反义词游戏等根据题数变化）
      }))
      .mutation(async ({ input }) => {
        // 获取奖励规则
        const rule = await db.getStarRewardRuleByType(input.activityType);
        if (!rule || !rule.isActive) {
          return { success: false, starsEarned: 0, message: "该活动没有奖励" };
        }
        
        // 使用自定义星星数量（如果提供），否则使用规则默认值
        const starsToAward = input.customStars ?? rule.starsReward;
        
        // 创建奖励记录
        await db.createStarReward({
          kidId: input.kidId,
          activityType: input.activityType,
          starsEarned: starsToAward,
          description: input.description || rule.activityName,
        });
        
        return { 
          success: true, 
          starsEarned: starsToAward,
          activityName: rule.activityName,
        };
      }),
    
    // 管理员手动发放奖励
    manualAward: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        stars: z.number().min(1),
        description: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以手动发放奖励" });
        }
        
        await db.createStarReward({
          kidId: input.kidId,
          activityType: "manual",
          starsEarned: input.stars,
          description: input.description,
        });
        
        return { success: true };
      }),
  }),
  
  // ==================== 星星商城 ====================
  starShop: router({
    // 获取商品列表
    list: publicProcedure.query(async () => {
      return db.getStarShopItems();
    }),
    
    // 获取所有商品（包括下架的，管理员用）
    listAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有商品" });
      }
      return db.getAllStarShopItems();
    }),
    
    // 创建商品（管理员）
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        image: z.string().optional(),
        starsCost: z.number().min(1),
        stock: z.number().default(-1),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以创建商品" });
        }
        const id = await db.createStarShopItem(input);
        return { id };
      }),
    
    // 更新商品（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        starsCost: z.number().optional(),
        stock: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以修改商品" });
        }
        const { id, ...data } = input;
        await db.updateStarShopItem(id, data);
        return { success: true };
      }),
    
    // 删除商品（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以删除商品" });
        }
        await db.deleteStarShopItem(input.id);
        return { success: true };
      }),
    
    // 兑换商品
    redeem: publicProcedure
      .input(z.object({
        kidId: z.number(),
        itemId: z.number(),
      }))
      .mutation(async ({ input }) => {
        // 获取孩子信息
        const kid = await db.getSpecialKidById(input.kidId);
        if (!kid) {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到孩子信息" });
        }
        
        // 获取商品信息
        const item = await db.getStarShopItemById(input.itemId);
        if (!item || !item.isActive) {
          throw new TRPCError({ code: "NOT_FOUND", message: "商品不存在或已下架" });
        }
        
        // 检查星星是否足够
        if (kid.stars < item.starsCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "星星不足" });
        }
        
        // 检查库存
        if (item.stock !== -1 && item.stock <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "商品已售罄" });
        }
        
        // 创建兑换记录
        const id = await db.createStarRedemption({
          kidId: input.kidId,
          itemId: input.itemId,
          starsSpent: item.starsCost,
        });
        
        // 更新库存
        if (item.stock !== -1) {
          await db.updateStarShopItem(input.itemId, { stock: item.stock - 1 });
        }
        
        return { id, itemName: item.name };
      }),
    
    // 获取兑换记录
    getRedemptions: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getStarRedemptionsByKid(input.kidId);
      }),
    
    // 获取所有兑换记录（管理员）
    getAllRedemptions: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以查看所有兑换记录" });
      }
      return db.getAllStarRedemptions();
    }),
    
    // 更新兑换状态（管理员）
    updateRedemptionStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected", "completed"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以处理兑换" });
        }
        await db.updateStarRedemptionStatus(input.id, input.status);
        return { success: true };
      }),
  }),

  // ==================== 游戏排序偏好 ====================
  gameOrder: router({
    // 获取孩子的游戏排序偏好
    get: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        const preference = await db.getGameOrderPreference(input.kidId);
        if (!preference) {
          return { gameOrders: null };
        }
        return { gameOrders: JSON.parse(preference.gameOrders) };
      }),

    // 保存孩子的游戏排序偏好
    save: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameOrders: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        await db.saveGameOrderPreference(input.kidId, input.gameOrders);
        return { success: true };
      }),
  }),

  // ==================== 错题本 ====================
  wrongQuestions: router({
    // 记录错题
    add: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameType: z.enum(["math", "antonym", "character"]),
        questionData: z.string(), // JSON字符串
        userAnswer: z.string(),
        correctAnswer: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.createWrongQuestion(input);
        return { success: true };
      }),

    // 获取错题列表
    list: publicProcedure
      .input(z.object({
        kidId: z.number(),
        gameType: z.enum(["math", "antonym", "character"]).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getWrongQuestionsByKid(input.kidId, input.gameType);
      }),

    // 标记为已复习
    markReviewed: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.markWrongQuestionReviewed(input.id);
        return { success: true };
      }),

    // 删除错题
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteWrongQuestion(input.id);
        return { success: true };
      }),

    // 获取错题统计
    stats: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWrongQuestionStats(input.kidId);
      }),
  }),

  // ==================== 汉字学习 ====================
  character: router({
    // 获取随机汉字题目
    getRandomCharacters: publicProcedure
      .input(z.object({
        count: z.number().min(5).max(1000).default(10),
        category: z.string().optional(),
        difficulty: z.number().min(1).max(5).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getRandomCharacters(input.count, input.category, input.difficulty);
      }),

    // 获取所有汉字（管理后台用）
    getAll: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        difficulty: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getAllCharacters(input);
      }),

    // 创建汉字（管理员）
    create: protectedProcedure
      .input(z.object({
        character: z.string().min(1).max(10),
        pinyin: z.string().min(1).max(50),
        imageUrl: z.string().url(),
        fileKey: z.string(),
        category: z.string().min(1).max(50),
        difficulty: z.number().min(1).max(5).default(1),
        strokeCount: z.number().min(0).default(0),
        commonWords: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can create characters" });
        }
        const id = await db.createCharacter(input);
        return { id };
      }),

    // 更新汉字（管理员）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        character: z.string().optional(),
        pinyin: z.string().optional(),
        imageUrl: z.string().optional(),
        fileKey: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.number().optional(),
        strokeCount: z.number().optional(),
        commonWords: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update characters" });
        }
        const { id, ...data } = input;
        await db.updateCharacter(id, data);
        return { success: true };
      }),

    // 删除汉字（管理员）
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete characters" });
        }
        await db.deleteCharacter(input.id);
        return { success: true };
      }),

    // 记录学习
    recordLearning: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
        isCorrect: z.boolean(),
        timeSpent: z.number(), // 秒
      }))
      .mutation(async ({ input }) => {
        const id = await db.recordCharacterLearning(input);
        return { id };
      }),

    // 获取学习记录
    getLearningRecords: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getCharacterLearningRecords(input.kidId, input.characterId);
      }),

    // 获取汉字统计信息
    getStats: publicProcedure
      .query(async () => {
        return await db.getCharacterStats();
      }),

    // 获取快闪识字记录
    getFlashcardRecord: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getFlashcardRecordByCharacter(input.kidId, input.characterId);
      }),

    // 获取所有快闪识字记录
    getAllFlashcardRecords: publicProcedure
      .input(z.object({
        kidId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getFlashcardRecords(input.kidId);
      }),

    // 记录认识
    recordKnown: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.incrementFlashcardKnown(input.kidId, input.characterId);
        return { success: true };
      }),

    // 记录忘记
    recordForgotten: publicProcedure
      .input(z.object({
        kidId: z.number(),
        characterId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.incrementFlashcardForgotten(input.kidId, input.characterId);
        return { success: true };
      }),
  }),

  // ==================== 刷牙游戏 ====================
  brushing: router({
    // 创建刷牙记录
    create: publicProcedure
      .input(z.object({
        kidId: z.number(),
        duration: z.number().min(120).max(300), // 2-5分钟
        completed: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        // 创建刷牙记录
        const session = await db.createBrushingSession({
          kidId: input.kidId,
          duration: input.duration,
          completed: input.completed,
          starsEarned: 1, // 完成刷牙获得1颗星
        });

        if (!session) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建刷牙记录失败" });
        }

        // 发放星星奖励
        await db.createStarReward({
          kidId: input.kidId,
          activityType: "brushing_complete",
          starsEarned: 1,
          description: "完成刷牙任务",
        });

        return { session, starsEarned: 1 };
      }),

    // 获取刷牙记录列表
    list: publicProcedure
      .input(z.object({
        kidId: z.number(),
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        return await db.getBrushingSessions(input.kidId, input.limit);
      }),

    // 获取刷牙统计
    stats: publicProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return await db.getBrushingStats(input.kidId);
      }),
  }),

  // ==================== 邀请码管理 ====================
  invitations: router({
    // 创建邀请码（仅超级管理员）
    create: protectedProcedure
      .input(z.object({
        familyName: z.string().optional(),
        maxUses: z.number().min(1).max(100).optional(),
        expiresInDays: z.number().min(1).max(365).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以创建邀请码' });
        }
        
        const expiresAt = input.expiresInDays 
          ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
          : undefined;
        
        const result = await db.createInvitation({
          familyName: input.familyName,
          maxUses: input.maxUses || 1,
          expiresAt,
          createdBy: ctx.user.id,
        });
        
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建邀请码失败' });
        }
        
        return result;
      }),
    
    // 获取所有邀请码（仅超级管理员）
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看邀请码列表' });
      }
      return await db.getAllInvitations();
    }),
    
    // 验证邀请码（公开接口）
    validate: publicProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        const result = await db.validateInvitation(input.code);
        return {
          valid: result.valid,
          familyName: result.invitation?.familyName,
          error: result.error,
        };
      }),
    
    // 使用邀请码注册（公开接口）
    register: publicProcedure
      .input(z.object({
        code: z.string(),
        username: z.string().min(1).max(20),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const passwordHash = await hashPassword(input.password);
        
        const result = await db.useInvitationToRegister({
          code: input.code,
          username: input.username,
          passwordHash,
          name: input.name,
          email: input.email,
        });
        
        if (!result.success) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || '注册失败' });
        }
        
        // 获取新创建的用户并创建session
        const user = await db.getUserByUsername(input.username);
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '创建用户失败' });
        }
        
        // 创建session token
        const sessionToken = await sdk.createSessionToken(user.id.toString(), {
          expiresInMs: ONE_YEAR_MS,
          name: user.name || user.username || '',
        });
        
        // 设置cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            familyId: result.familyId,
          },
        };
      }),
    
    // 停用邀请码（仅超级管理员）
    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无权停用邀请码' });
        }
        
        const success = await db.deactivateInvitation(input.id);
        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '停用失败' });
        }
        
        return { success: true };
      }),
  }),

  // ==================== 家庭管理 ====================
  families: router({
    // 获取所有家庭（仅超级管理员）
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看家庭列表' });
      }
      return await db.getAllFamilies();
    }),
    
    // 获取家庭成员
    members: protectedProcedure
      .input(z.object({ familyId: z.number() }))
      .query(async ({ ctx, input }) => {
        // 超级管理员可以查看任何家庭，家长只能查看自己家庭
        if (ctx.user.role !== 'super_admin' && ctx.user.familyId !== input.familyId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无权查看该家庭成员' });
        }
        return await db.getFamilyMembers(input.familyId);
      }),
  }),

  // ==================== 初始化 ====================
  init: router({
    setup: publicProcedure.mutation(async () => {
      await db.initializeDefaultData();
      await db.initDefaultStarRewardRules();
      await db.initSpecialKids();
      return { success: true };
    }),
  }),

  // ==================== 语音合成 ====================
  tts: router({
    speak: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(500),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
      }))
      .mutation(async ({ input }) => {
        return await textToSpeech(input);
      }),
  }),

  // ==================== 首页横幅 ====================
  homeBanner: router({
    // 获取当前活跃的横幅（公开接口）
    get: publicProcedure.query(async () => {
      return await db.getActiveHomeBanner();
    }),
    
    // 更新横幅（仅超级管理员）
    update: protectedProcedure
      .input(z.object({
        title: z.string().max(200).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员可以更新横幅' });
        }
        await db.upsertHomeBanner(input);
        return { success: true };
      }),
  }),

  // 20加法游戏
  addition20: router({
    // 获取游戏配置
    getConfig: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        const config = await db.getAddition20Config(input.kidId);
        return config || {
          kidId: input.kidId,
          difficulty: "easy" as const,
          questionCount: 10,
          answerMode: "choice" as const,
        };
      }),

    // 保存游戏配置（家长使用）
    saveConfig: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        questionCount: z.number().min(10).max(50).optional(),
        answerMode: z.enum(["choice", "input"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以修改配置
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以修改游戏配置" });
        }
        await db.upsertAddition20Config(input);
        return { success: true };
      }),

    // 保存游戏记录
    saveRecord: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        questionCount: z.number(),
        correctCount: z.number(),
        duration: z.number(),
        answerMode: z.enum(["choice", "input"]),
        starsEarned: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await db.saveAddition20Record(input);
        return { id };
      }),

    // 获取游戏记录
    getRecords: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getAddition20Records(input.kidId, input.limit);
      }),

    // 获取最高分
    getHighScore: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getAddition20HighScore(input.kidId);
      }),

    // ==================== 有奖挑战相关 ====================

    // 创建有奖挑战（家长使用）
    createChallenge: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        targetCorrectCount: z.number().min(10).max(1000),
        penaltyPerWrong: z.number().min(0).max(10).default(0),
        rewardTitle: z.string().min(1).max(100),
        rewardImageUrl: z.string().optional(),
        rewardFileKey: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以创建挑战
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以创建挑战" });
        }

        // 检查是否已有活跃的挑战
        const existingChallenge = await db.getActiveAddition20Challenge(input.kidId);
        if (existingChallenge) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "已有进行中的挑战，请先完成或取消" });
        }

        const id = await db.createAddition20Challenge({
          ...input,
          parentId: ctx.user.id,
        });
        return { id };
      }),

    // 获取活跃挑战
    getActiveChallenge: protectedProcedure
      .input(z.object({ kidId: z.number() }))
      .query(async ({ input }) => {
        return db.getActiveAddition20Challenge(input.kidId);
      }),

    // 更新挑战进度
    updateChallengeProgress: protectedProcedure
      .input(z.object({
        challengeId: z.number(),
        currentCorrectCount: z.number().optional(),
        totalAttempted: z.number().optional(),
        totalCorrect: z.number().optional(),
        totalWrong: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { challengeId, ...data } = input;
        await db.updateAddition20ChallengeProgress(challengeId, {
          ...data,
          lastPlayedAt: new Date(),
        });
        return { success: true };
      }),

    // 完成挑战
    completeChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.completeAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 暂停挑战（休息保存）
    pauseChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.pauseAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 恢复挑战
    resumeChallenge: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .mutation(async ({ input }) => {
        await db.resumeAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 取消/放弃挑战（需要家长密码验证）
    cancelChallenge: protectedProcedure
      .input(z.object({ 
        challengeId: z.number(),
        password: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        // 验证家长密码
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "请先设置家长密码" });
        }
        
        const bcrypt = await import("bcryptjs");
        const isValid = await bcrypt.default.compare(input.password, user.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
        }
        
        // 取消挑战
        await db.cancelAddition20Challenge(input.challengeId);
        return { success: true };
      }),

    // 获取挑战历史
    getChallengeHistory: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        return db.getAddition20ChallengeHistory(input.kidId, input.limit);
      }),

    // 验证家长密码
    verifyParentPassword: protectedProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // 检查权限：只有家长或管理员可以验证
        if (ctx.user.role !== "super_admin" && ctx.user.role !== "parent") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有家长可以验证密码" });
        }

        // 获取当前用户的密码哈希
        const user = await db.getUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "未设置密码" });
        }

        // 验证密码
        const bcrypt = await import("bcryptjs");
        const isValid = await bcrypt.default.compare(input.password, user.passwordHash);
        
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "密码错误" });
        }

        return { success: true };
      }),
  }),

  // 阅读识字游戏
  readingGame: router({
    // 获取故事列表
    getStories: protectedProcedure
      .input(z.object({ kidId: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getReadingStories(input.kidId);
      }),

    // 获取单个故事
    getStory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getReadingStoryById(input.id);
      }),

    // 创建自定义故事
    createStory: protectedProcedure
      .input(z.object({
        title: z.string(),
        content: z.string().max(5000, "故事内容最多5000字"),
        type: z.enum(["custom", "ai_generated"]),
        kidId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const storyId = await db.createReadingStory({
          title: input.title,
          content: input.content,
          type: input.type,
          createdBy: ctx.user.id,
          kidId: input.kidId,
        });
        return { storyId };
      }),

    // 更新故事
    updateStory: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().max(5000).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateReadingStory(input.id, {
          title: input.title,
          content: input.content,
        });
        return { success: true };
      }),

    // 删除故事
    deleteStory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteReadingStory(input.id);
        return { success: true };
      }),

    // AI生成故事
    generateStory: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        theme: z.string().optional(), // 主题（可选）
        wordCount: z.number().min(50).max(500).default(100), // 字数限制
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        
        // 计算字数范围（允许±10%的浮动）
        const minWords = Math.max(input.wordCount - 10, 30);
        const maxWords = input.wordCount + 10;
        
        const prompt = input.theme 
          ? `请为学龄前儿童创作一个主题为「${input.theme}」的故事。

重要要求：
1. 故事总字数必须严格控制在 ${minWords}-${maxWords} 字之间，目标是 ${input.wordCount} 字。
2. 请精确计算字数，不要超出范围。
3. 故事应该有趣、有教育意义，使用简单易懂的语言。
4. 如果字数较少（50-100字），请创作简短的小故事。`
          : `请为学龄前儿童创作一个故事。

重要要求：
1. 故事总字数必须严格控制在 ${minWords}-${maxWords} 字之间，目标是 ${input.wordCount} 字。
2. 请精确计算字数，不要超出范围。
3. 故事应该有趣、有教育意义，使用简单易懂的语言。
4. 请随机选择一个适合孩子的主题（如动物、植物、友谊、勇气等）。
5. 如果字数较少（50-100字），请创作简短的小故事。`;
        
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "你是一个儿童故事作家，擅长创作适合学龄前儿童的故事。" },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "story",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "故事标题" },
                  content: { type: "string", description: "故事内容" },
                },
                required: ["title", "content"],
                additionalProperties: false,
              },
            },
          },
        });
        
        const content = response.choices[0].message.content;
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const storyData = JSON.parse(contentStr || "{}");
        
        // 生成故事配图
        let coverImageUrl: string | undefined;
        try {
          const { generateImage } = await import("./_core/imageGeneration");
          const imagePrompt = `为儿童故事《${storyData.title}》创作一幅卡通风格的封面插图。故事简介：${storyData.content.substring(0, 100)}...

要求：
1. 卡通风格，色彩明亮温暖
2. 适合学龄前儿童观看
3. 画面简洁可爱，不要文字
4. 体现故事主题和情节`;
          
          const result = await generateImage({
            prompt: imagePrompt,
          });
          
          coverImageUrl = result.url;
        } catch (error) {
          console.error("生成故事配图失败：", error);
          // 如果图片生成失败，不影响故事创建
        }
        
        // 保存AI生成的故事
        const storyId = await db.createReadingStory({
          title: storyData.title,
          content: storyData.content,
          type: "ai_generated",
          coverImageUrl,
          createdBy: ctx.user.id,
          kidId: input.kidId,
        });
        
        return { 
          storyId,
          title: storyData.title,
          content: storyData.content,
          coverImageUrl,
        };
      }),

    // 文本转语音（TTS）
    textToSpeech: protectedProcedure
      .input(z.object({ text: z.string().max(1000) }))
      .mutation(async ({ input }) => {
        // 使用Manus内置TTS API
        const response = await fetch(`${process.env.BUILT_IN_FORGE_API_URL}/tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
          },
          body: JSON.stringify({
            text: input.text,
            voice: "zh-CN-XiaoxiaoNeural", // 使用中文女声
          }),
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TTS服务调用失败" });
        }
        
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");
        
        return { audioData: base64Audio };
      }),

    // 创建阅读记录
    createRecord: protectedProcedure
      .input(z.object({
        kidId: z.number(),
        storyId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const recordId = await db.createReadingRecord(input);
        return { recordId };
      }),

    // 更新阅读记录
    updateRecord: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        clickCount: z.number().optional(),
        readDuration: z.number().optional(),
        completed: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const updateData: any = {};
        if (input.clickCount !== undefined) updateData.clickCount = input.clickCount;
        if (input.readDuration !== undefined) updateData.readDuration = input.readDuration;
        if (input.completed) updateData.completedAt = new Date();
        
        await db.updateReadingRecord(input.recordId, updateData);
        return { success: true };
      }),

    // 获取阅读记录
    getRecords: protectedProcedure
      .input(z.object({ kidId: z.number(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        return db.getReadingRecords(input.kidId, input.limit);
      }),
  }),

  // ==================== 宝宝词库 ====================
  vocabulary: router({
    // 获取总词库列表（超级管理员）
    masterList: protectedProcedure
      .input(z.object({
        language: z.enum(["chinese", "english"]).optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        search: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以查看总词库" });
        }
        return await db.getVocabularyMasterList(input);
      }),

    // 创建总词库词汇（超级管理员）
    masterCreate: protectedProcedure
      .input(z.object({
        word: z.string().min(1).max(100),
        language: z.enum(["chinese", "english"]),
        translation: z.string().max(200).optional(),
        pinyin: z.string().max(100).optional(),
        pronunciation: z.string().max(100).optional(),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
        example: z.string().optional(),
        imageUrl: z.string().optional(),
        audioUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以添加总词库" });
        }
        const vocab = await db.createVocabularyMaster(input);
        return { id: vocab?.id };
      }),

    // 更新总词库词汇（超级管理员）
    masterUpdate: protectedProcedure
      .input(z.object({
        id: z.number(),
        word: z.string().optional(),
        translation: z.string().optional(),
        pinyin: z.string().optional(),
        pronunciation: z.string().optional(),
        category: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        example: z.string().optional(),
        imageUrl: z.string().optional(),
        audioUrl: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以修改总词库" });
        }
        const { id, ...data } = input;
        await db.updateVocabularyMaster(id, data);
        return { success: true };
      }),

    // 删除总词库词汇（超级管理员）
    masterDelete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只有超级管理员可以删除总词库" });
        }
        await db.deleteVocabularyMaster(input.id);
        return { success: true };
      }),

    // 获取家长词库列表
    familyList: protectedProcedure
      .input(z.object({
        language: z.enum(["chinese", "english"]).optional(),
        kidId: z.number().nullable().optional(),
        wordType: z.enum(["character", "word"]).optional(),
      }))
      .query(async ({ ctx, input }) => {
        // 家长只能查看自己的词库
        return await db.getFamilyVocabularyList(ctx.user.id, input.language, input.kidId, input.wordType);
      }),

    // 添加词汇到家长词库
    familyAdd: protectedProcedure
      .input(z.object({
        kidId: z.number().nullable().optional(),
        word: z.string().min(1).max(100),
        language: z.enum(["chinese", "english"]),
        wordType: z.enum(["character", "word"]).default("word"),
        translation: z.string().max(200).optional(),
        pinyin: z.string().max(100).optional(),
        pronunciation: z.string().max(100).optional(),
        category: z.string().default("general"),
        difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
        customNote: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { kidId, customNote, ...vocabData } = input;

        // 1. 检查总词库是否已存在该词汇
        let masterVocab = await db.findVocabularyMasterByWord(vocabData.word, vocabData.language);

        // 2. 如果不存在，自动添加到总词库
        if (!masterVocab) {
          masterVocab = await db.createVocabularyMaster(vocabData);
          if (!masterVocab) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "添加到总词库失败" });
          }
        }

        // 3. 添加到家长词库
        const familyVocab = await db.addVocabularyToFamily({
          parentUserId: ctx.user.id,
          vocabularyId: masterVocab.id,
          kidId,
          addedBy: ctx.user.id,
          customNote,
        });

        return { success: true, id: familyVocab?.id };
      }),

    // 从家长词库删除词汇
    familyRemove: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.removeVocabularyFromFamily(ctx.user.id, input.vocabularyId);
        return { success: true };
      }),

    // 更新家长词库备注
    familyUpdateNote: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
        customNote: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateFamilyVocabularyNote(ctx.user.id, input.vocabularyId, input.customNote);
        return { success: true };
      }),

    // 更新学习进度
    updateMasteryLevel: protectedProcedure
      .input(z.object({
        vocabularyId: z.number(),
        masteryLevel: z.enum(["not_started", "learning", "mastered"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateFamilyVocabularyMasteryLevel(ctx.user.id, input.vocabularyId, input.masteryLevel);
        return { success: true };
      }),

    // OCR识别图片中的文字
    recognizeImage: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
        contentType: z.enum(["character", "word", "english"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { recognizeText } = await import("./_core/ocr");
        return await recognizeText(input.imageUrl, input.contentType);
      }),

    // 获取词库统计数据
    stats: protectedProcedure
      .input(z.object({
        kidId: z.number().nullable().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getFamilyVocabularyStats(ctx.user.id, input.kidId);
      }),

    // 从文本中提取词汇
    extractWords: protectedProcedure
      .input(z.object({
        text: z.string(),
        useLLM: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const { extractWords, extractWordsWithLLM } = await import("./_core/ocr");
        
        if (input.useLLM) {
          const words = await extractWordsWithLLM(input.text);
          return { words };
        } else {
          // 检测语言
          const hasChinese = /[\u4e00-\u9fa5]/.test(input.text);
          const hasEnglish = /[a-zA-Z]/.test(input.text);
          let language: "chinese" | "english" | "mixed" = "chinese";
          if (hasChinese && hasEnglish) {
            language = "mixed";
          } else if (hasEnglish && !hasChinese) {
            language = "english";
          }
          
          const words = extractWords(input.text, language);
          return { words };
        }
      }),
  }),

  // ==================== 游戏使用统计 ====================
  gameStats: router({
    // 获取所有游戏的使用统计
    getUsageStats: protectedProcedure
      .query(async ({ ctx }) => {
        // 只有超级管理员可以查看统计数据
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以查看游戏统计数据',
          });
        }

        const stats = await db.getGameUsageStats();
        return stats;
      }),
  }),

  // ==================== VI配置管理 ====================
  vi: router({
    // 获取家长的VI配置
    getConfig: publicProcedure
      .input(z.object({
        parentUserId: z.number(),
      }))
      .query(async ({ input }) => {
        const config = await db.getViConfigByParentUserId(input.parentUserId);
        return config;
      }),

    // 更新家长的VI配置（仅超级管理员）
    updateConfig: protectedProcedure
      .input(z.object({
        parentUserId: z.number(),
        viThemeId: z.string().nullable().optional(),
        customConfig: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有超级管理员可以配置VI
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以配置VI',
          });
        }

        const config = await db.upsertViConfig({
          parentUserId: input.parentUserId,
          viThemeId: input.viThemeId,
          customConfig: input.customConfig,
          createdBy: ctx.user.id,
        });

        return config;
      }),

    // 重置家长的VI配置（仅超级管理员）
    resetConfig: protectedProcedure
      .input(z.object({
        parentUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 只有超级管理员可以重置VI
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '只有超级管理员可以重置VI',
          });
        }

        const success = await db.deleteViConfig(input.parentUserId);
        return { success };
      }),

    // 获取可用的VI主题列表
    getAvailableThemes: publicProcedure
      .query(async () => {
        // TODO: 等待用户上传VI方案后返回实际主题列表
        const themes = await db.getAvailableViThemes();
        return themes;
      }),
  }),

  // 人脉管理
  contacts: router({
  // 获取人脉关系健康度汇总统计
  overviewStats: protectedProcedure
    .query(async ({ ctx }) => {
      const stats = await dbContacts.getContactsOverviewStats(ctx.user.id);
      return stats;
    }),

  // 获取累计使用天数
  getTotalUsageDays: protectedProcedure
    .query(async ({ ctx }) => {
      const firstContactCreatedAt = await dbContacts.getFirstContactCreatedAt(ctx.user.id);
      if (!firstContactCreatedAt) {
        return 0;
      }
      // 将字符串日期转换为Date对象，然后获取毫秒时间戳
      const firstContactDate = new Date(firstContactCreatedAt).getTime();
      const now = Date.now();
      const diffInMs = now - firstContactDate;
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
      return diffInDays;
    }),

  // 名片OCR识别
  recognizeBusinessCard: protectedProcedure
    .input(z.object({ imageUrl: z.string() }))
    .mutation(async ({ input }) => {
      // 调用LLM识别名片
      const { invokeLLM } = await import("./_core/llm");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是一个专业的名片识别助手。请从名片图片中提取联系人信息,以JSON格式返回。如果某个字段无法识别,返回空字符串。"
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请识别这张名片中的信息,提取姓名、公司、职位、电话、邮箱、地址等字段。"
              },
              {
                type: "image_url",
                image_url: {
                  url: input.imageUrl
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "business_card_info",
            strict: true,
            schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "姓名" },
                company: { type: "string", description: "公司名称" },
                title: { type: "string", description: "职位" },
                phone: { type: "string", description: "电话号码" },
                email: { type: "string", description: "邮箱地址" },
                address: { type: "string", description: "地址" },
                wechat: { type: "string", description: "微信号" },
                website: { type: "string", description: "网站" }
              },
              required: ["name", "company", "title", "phone", "email", "address", "wechat", "website"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "名片识别失败"
        });
      }

      const result = JSON.parse(content);
      return result;
    }),

  // 获取人脉列表
  list: protectedProcedure
    .input(z.object({
      searchQuery: z.string().optional(),
      sortBy: z.enum(['tagCount_desc', 'tagCount_asc', 'interactionCount_desc', 'interactionCount_asc']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const contacts = await dbContacts.getContactsByParent(ctx.user.id, input.searchQuery);
      
      if (contacts.length === 0) {
        return [];
      }
      
      // 获取所有联系人ID
      const contactIds = contacts.map(c => c.id);
      
      // 并行批量查询所有需要的数据（只查询一次）
      const [allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap] = await Promise.all([
        // 推荐人统计只查询一次
        dbReferrerStats.getReferrerStats(ctx.user.id).catch(err => {
          console.error('获取介绍人贡献统计失败:', err);
          return [];
        }),
        // 批量获取所有联系人的标签
        dbContacts.getTagsForContacts(contactIds),
        // 批量获取所有联系人的个人标签
        dbContacts.getPersonalTagsForContacts(contactIds),
        // 批量获取所有联系人的联络统计
        dbContacts.getInteractionStatsForContacts(contactIds),
        // 批量获取所有联系人的最后联络时间和今日联络状态
        dbContacts.getInteractionInfoForContacts(contactIds),
        // 批量获取所有联系人的字段值（公司、职位等）
        dbContacts.getFieldValuesForContacts(contactIds),
      ]);
      
      // 创建推荐人统计的Map以便快速查找
      const referrerStatsMap = new Map(
        allReferrerStats.map(stat => [stat.contactId, stat])
      );
      
      // 为每个人脉组装详情数据（不再需要单独查询）
      const contactsWithDetails = contacts.map((contact) => {
        // 从批量查询结果中获取数据
        const tags = tagsMap.get(contact.id) || [];
        const personalTags = personalTagsMap.get(contact.id) || [];
        const interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
        const interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
        const referrerStats = referrerStatsMap.get(contact.id) || null;
        const fieldValues = fieldValuesMap.get(contact.id) || [];
        
        return {
          ...contact,
          tags,
          personalTags,
          fieldValues,
          lastInteractionDate: interactionInfo.lastInteraction,
          daysSinceLastInteraction: interactionInfo.lastInteraction 
            ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
            : null,
          hasTodayInteraction: interactionInfo.hasTodayInteraction,
          hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined,
          totalInteractions: interactionStats?.totalInteractions || 0,
          directReferrals: referrerStats?.directReferrals || 0,
          indirectReferrals: referrerStats?.indirectReferrals || 0,
        };
      });
      
      // 根据 sortBy 参数排序
      if (input.sortBy) {
        contactsWithDetails.sort((a, b) => {
          if (input.sortBy === 'tagCount_desc') {
            // 标签数量：由高到低（标签数 + 个人标签数）
            return (b.tags.length + b.personalTags.length) - (a.tags.length + a.personalTags.length);
          } else if (input.sortBy === 'tagCount_asc') {
            // 标签数量：由低到高
            return (a.tags.length + a.personalTags.length) - (b.tags.length + b.personalTags.length);
          } else if (input.sortBy === 'interactionCount_desc') {
            // 联络次数：由高到低
            return (b.totalInteractions || 0) - (a.totalInteractions || 0);
          } else if (input.sortBy === 'interactionCount_asc') {
            // 联络次数：由低到高
            return (a.totalInteractions || 0) - (b.totalInteractions || 0);
          }
          return 0;
        });
      }
      
      return contactsWithDetails;
    }),

  // 获取人脉详情
  get: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      console.log('[contacts.get] 查询人脉详情:', { contactId: input.id, userId: ctx.user.id });
      
      const contact = await dbContacts.getContactById(input.id);
      if (!contact) {
        console.error('[contacts.get] 人脉不存在:', input.id);
        throw new TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
      }
      
      console.log('[contacts.get] 找到人脉:', { id: contact.id, name: contact.name, parentUserId: contact.parentUserId });
      
      const tags = await dbContacts.getContactTagsByContactId(contact.id);
      const interactions = await dbContacts.getContactInteractions(contact.id);
      const lastInteraction = await dbContacts.getLastInteractionDate(contact.id);
      const hasTodayInteraction = await dbContacts.hasTodayInteraction(contact.id);
      
      // 获取介绍人贡献统计（该人脉作为介绍人的贡献值）
      let referrerContribution = null;
      try {
        const allReferrerStats = await dbReferrerStats.getReferrerStats(ctx.user.id);
        referrerContribution = allReferrerStats.find(stat => stat.contactId === contact.id) || null;
      } catch (error) {
        console.error('获取介绍人贡献统计失败:', error);
        // 失败时不影响整个API，继续返回其他数据
      }
      
      return {
        ...contact,
        tags,
        interactions,
        lastInteractionDate: lastInteraction,
        daysSinceLastInteraction: lastInteraction 
          ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
          : null,
        hasTodayInteraction,
        hasReferrer: contact.referrerId !== null && contact.referrerId !== undefined,
        // 介绍人贡献数据
        referrerContribution: referrerContribution ? {
          directReferrals: referrerContribution.directReferrals,
          indirectReferrals: referrerContribution.indirectReferrals,
          totalScore: referrerContribution.totalScore,
        } : null,
      };
    }),

  // 创建人脉
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "姓名不能为空"),
      title: z.string().optional(), // 称谓
      gender: z.string().optional(),
      birthDate: z.string().optional(),
      occupation: z.string().optional(),
      address: z.string().optional(),
      region: z.string().optional(), // 所在地区
      wechat: z.string().optional(),
      phone: z.string().optional(),
      referrerId: z.number().optional(), // 介绍人 ID
      tagIds: z.array(z.number()).optional(),
      customFields: z.array(z.object({
        fieldName: z.string(),
        fieldValue: z.string(),
      })).optional(), // 自定义字段
    }))
    .mutation(async ({ ctx, input }) => {
      const { tagIds, customFields, ...contactData } = input;
      
      const contactId = await dbContacts.createContact({
        ...contactData,
        parentUserId: ctx.user.id,
      });
      
      if (!contactId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建人脉失败" });
      }
      
      // 添加标签关联
      if (tagIds && tagIds.length > 0) {
        await Promise.all(
          tagIds.map(tagId => dbContacts.addTagToContact(contactId, tagId))
        );
      }
      
      // 添加自定义字段
      if (customFields && customFields.length > 0) {
        await dbContacts.addCustomFields(contactId, customFields);
      }
      
      // 奖励积分：添加人脉
      await addPointsForAction(ctx.user.id, 'add_contact', contactId);
      
      // 如果设置了推荐人，给推荐人奖励积分
      if (input.referrerId) {
        // 需要找到推荐人对应的 userId
        const referrerContact = await dbContacts.getContactById(input.referrerId);
        if (referrerContact && referrerContact.parentUserId) {
          await addPointsForAction(referrerContact.parentUserId, 'be_referrer', contactId);
        }
      }
      
      return { id: contactId };
    }),

  // 更新人脉
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1, "姓名不能为空").optional(),
      title: z.string().optional(), // 称谓
      gender: z.string().optional(),
      birthDate: z.string().optional(),
      occupation: z.string().optional(),
      address: z.string().optional(),
      region: z.string().optional(), // 所在地区
      wechat: z.string().optional(),
      phone: z.string().optional(),
      referrerId: z.number().optional(), // 介绍人 ID
    }))
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;
      await dbContacts.updateContact(id, updateData);
      return { success: true };
    }),

  // 设置介绍人（独立API，专门用于设置/清除介绍人）
  setReferrer: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      referrerId: z.number().nullable(), // null表示清除介绍人
    }))
    .mutation(async ({ ctx, input }) => {
      const { contactId, referrerId } = input;
      
      // 验证人脉属于当前用户
      const contact = await dbContacts.getContactById(contactId);
      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "人脉不存在" });
      }
      if (contact.parentUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权操作此人脉" });
      }
      
      // 如果设置介绍人，验证介绍人存在且属于当前用户
      if (referrerId !== null) {
        const referrer = await dbContacts.getContactById(referrerId);
        if (!referrer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "介绍人不存在" });
        }
        if (referrer.parentUserId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "介绍人不属于您的人脉" });
        }
        // 不能设置自己为介绍人
        if (referrerId === contactId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能设置自己为介绍人" });
        }
      }
      
      // 更新介绍人
      await dbContacts.updateContact(contactId, { referrerId: referrerId });
      return { success: true };
    }),

  // 获取可选择的介绍人列表（独立API，避免依赖list API的复杂逻辑）
  listForReferrer: protectedProcedure
    .input(z.object({
      excludeContactId: z.number().optional(), // 排除当前人脉（编辑时不能选择自己）
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      // 直接查询数据库，只获取必要的字段
      const allContacts = await db.select({
        id: contacts.id,
        name: contacts.name,
        title: contacts.title,
      }).from(contacts)
        .where(eq(contacts.parentUserId, ctx.user.id))
        .orderBy(contacts.name);
      
      // 排除指定的人脉
      if (input.excludeContactId) {
        return allContacts.filter((c: { id: number; name: string; title: string | null }) => c.id !== input.excludeContactId);
      }
      
      return allContacts;
    }),

  // 自定义字段管理
  customFields: router({
    // 获取人脉的自定义字段
    list: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .query(async ({ input }) => {
        return await dbContacts.getCustomFieldsByContactId(input.contactId);
      }),

    // 添加自定义字段
    add: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        fieldName: z.string().min(1, "字段名称不能为空"),
        fieldValue: z.string(),
      }))
      .mutation(async ({ input }) => {
        const id = await dbContacts.addCustomField(input);
        return { id };
      }),

    // 更新自定义字段
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        fieldName: z.string().optional(),
        fieldValue: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await dbContacts.updateCustomField(id, data);
        return { success: true };
      }),

    // 删除自定义字段
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await dbContacts.deleteCustomField(input.id);
        return { success: true };
      }),
  }),

  // 删除人脉
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await dbContacts.deleteContact(input.id);
      return { success: true };
    }),

  // 获取统计数据
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getContactStats(ctx.user.id);
    }),

  // 获取公司列表（所有有公司名称的联系人，标注重复）
  companyList: protectedProcedure
    .query(async ({ ctx }) => {
      const result = await dbContacts.getCompanyList(ctx.user.id);
      console.log('[companyList] 返回数据示例:', result.slice(0, 3));
      console.log('[companyList] 总共返回', result.length, '条记录');
      return result;
    }),

  // 获取累计联络次数
  totalInteractionCount: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTotalInteractionCount(ctx.user.id);
    }),

  // 获取累计标签数量
  totalTagCount: protectedProcedure
    .query(async ({ ctx }) => {
      return await dbContacts.getTotalTagCount(ctx.user.id);
    }),

  // 标签管理
  tags: router({
    // 获取所有标签
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getContactTags(ctx.user.id);
      }),

    // 搜索标签（模糊搜索标签名称）
    search: protectedProcedure
      .input(z.object({
        keyword: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.searchTags(ctx.user.id, input.keyword || '');
      }),

    // 创建自定义标签
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "标签名称不能为空"),
        color: z.string().default("#3b82f6"),
      }))
      .mutation(async ({ ctx, input }) => {
        const tagId = await dbContacts.createContactTag({
          name: input.name,
          color: input.color,
          parentUserId: ctx.user.id,
          isPreset: false,
        });
        return { id: tagId };
      }),

    // 编辑标签
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "标签名称不能为空").optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateContactTag(input.id, ctx.user.id, {
          name: input.name,
          color: input.color,
        });
        return { success: true };
      }),

    // 删除自定义标签
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deleteContactTag(input.id, ctx.user.id);
        return { success: true };
      }),

    // 批量更新标签排序
    updateOrder: protectedProcedure
      .input(z.object({
        tagOrders: z.array(z.object({
          id: z.number(),
          sortOrder: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateTagsOrder(ctx.user.id, input.tagOrders);
        return { success: true };
      }),

    // 获取标签大数据分析
    analytics: protectedProcedure
      .input(z.object({
        scope: z.enum(['all', 'mine', 'shared', 'global']).default('all'),
      }))
      .query(async ({ ctx, input }) => {
        const { scope } = input;
        const [overallStats, globalRanking, personalRanking, userDistribution, recentTags] = await Promise.all([
          dbTagAnalytics.getTagOverallStats(ctx.user.id, scope),
          dbTagAnalytics.getGlobalTagRanking(ctx.user.id, scope, 50),
          dbTagAnalytics.getPersonalTagRanking(ctx.user.id, scope, 50),
          dbTagAnalytics.getTagUserDistribution(ctx.user.id, scope),
          dbTagAnalytics.getRecentTags(ctx.user.id, scope, 20),
        ]);

        return {
          overallStats,
          globalRanking,
          personalRanking,
          userDistribution,
          recentTags,
        };
      }),

    // 为人脉添加标签
    addToContact: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        tagId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.addTagToContact(input.contactId, input.tagId);
        
        // 奖励积分：打标签
        await addPointsForAction(ctx.user.id, 'add_tag', input.contactId);
        
        return { success: true };
      }),

    // 移除人脉的标签
    removeFromContact: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.removeTagFromContact(input.contactId, input.tagId);
        return { success: true };
      }),
    
    // 批量为多个人脉设置标签（用于关注周期标签等）
    batchAddToContacts: protectedProcedure
      .input(z.object({
        contactIds: z.array(z.number()),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { contactIds, tagId } = input;
        let successCount = 0;
        let skipCount = 0;
        
        for (const contactId of contactIds) {
          try {
            // 检查是否已经有这个标签
            const existingTags = await dbContacts.getContactTagsByContactId(contactId);
            const hasTag = existingTags.some(t => t.id === tagId);
            
            if (!hasTag) {
              await dbContacts.addTagToContact(contactId, tagId);
              successCount++;
            } else {
              skipCount++;
            }
          } catch (error) {
            console.error(`Failed to add tag to contact ${contactId}:`, error);
          }
        }
        
        return { 
          success: true, 
          successCount, 
          skipCount,
          totalCount: contactIds.length 
        };
      }),
    
    // 批量为多个人脉移除标签
    batchRemoveFromContacts: protectedProcedure
      .input(z.object({
        contactIds: z.array(z.number()),
        tagId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { contactIds, tagId } = input;
        let successCount = 0;
        let skipCount = 0;
        
        for (const contactId of contactIds) {
          try {
            // 检查是否有这个标签
            const existingTags = await dbContacts.getContactTagsByContactId(contactId);
            const hasTag = existingTags.some(t => t.id === tagId);
            
            if (hasTag) {
              await dbContacts.removeTagFromContact(contactId, tagId);
              successCount++;
            } else {
              skipCount++;
            }
          } catch (error) {
            console.error(`Failed to remove tag from contact ${contactId}:`, error);
          }
        }
        
        return { 
          success: true, 
          successCount, 
          skipCount,
          totalCount: contactIds.length 
        };
      }),
  }),

  // 个人标签管理（针对单个人脉的自定义标签）
  personalTags: router({
    // 获取人脉的个人标签列表
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getPersonalTagsByContactId(input.contactId);
      }),

    // 创建个人标签
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        name: z.string().min(1, "标签名称不能为空"),
        color: z.string().default("#8b5cf6"),
      }))
      .mutation(async ({ ctx, input }) => {
        const tagId = await dbContacts.createPersonalTag({
          contactId: input.contactId,
          parentUserId: ctx.user.id,
          name: input.name,
          color: input.color,
        });
        return { id: tagId };
      }),

    // 更新个人标签
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "标签名称不能为空").optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updatePersonalTag(input.id, ctx.user.id, {
          name: input.name,
          color: input.color,
        });
        return { success: true };
      }),

    // 删除个人标签
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deletePersonalTag(input.id, ctx.user.id);
        return { success: true };
      }),

    // 获取个人标签使用统计
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getPersonalTagsStats(ctx.user.id);
      }),
  }),

  // 字段分类管理（全局字段定义）
  fieldCategories: router({
    // 获取所有字段分类
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getContactFieldCategories(ctx.user.id);
      }),

    // 创建字段分类
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "字段名称不能为空"),
        fieldType: z.enum(["text", "number", "date", "select"]).default("text"),
        options: z.array(z.string()).optional(),
        isRequired: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const category = await db.createContactFieldCategory({
          parentUserId: ctx.user.id,
          name: input.name,
          fieldType: input.fieldType,
          options: input.options || null,
          isRequired: input.isRequired,
          sortOrder: 0,
        });
        if (!category) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建字段分类失败" });
        }
        return category;
      }),

    // 删除字段分类
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const success = await db.deleteContactFieldCategory(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段分类失败" });
        }
        return { success: true };
      }),
  }),

  // 字段值管理
  fieldValues: router({
    // 获取所有可用的字段类目
    categories: protectedProcedure
      .query(async () => {
        return await dbContacts.getFieldCategories();
      }),

    // 获取人脉的所有字段值
    list: protectedProcedure
      .input(z.object({ contactId: z.number() }))
      .query(async ({ input }) => {
        return await dbContacts.getContactFieldValues(input.contactId);
      }),

    // 批量设置人脉的字段值
    set: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        values: z.array(z.object({
          categoryId: z.number(),
          value: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const success = await db.setContactFieldValues(input.contactId, input.values);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "设置字段值失败" });
        }
        return { success: true };
      }),

    // 添加单个字段值
    add: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        categoryId: z.number(),
        value: z.string(),
      }))
      .mutation(async ({ input }) => {
        const newFieldValue = await dbContacts.addFieldValue(input.contactId, input.categoryId, input.value);
        return newFieldValue;
      }),

    // 删除单个字段值
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const success = await dbContacts.deleteFieldValue(input.id);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "删除字段值失败" });
        }
        return { success: true };
      }),
  }),

  // 联络记录
  interactions: router({
    // 记录一次联络
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const interactionId = await dbContacts.createContactInteraction({
          contactId: input.contactId,
          interactionDate: new Date(),
          note: input.note,
        });
        
        // 奖励积分：每次联络
        await addPointsForAction(ctx.user.id, 'communication', input.contactId);
        
        return { id: interactionId };
      }),

    // 获取联络历史
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getContactInteractions(input.contactId);
      }),

    // 获取联络统计信息
    stats: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getContactInteractionStats(input.contactId);
      }),

    // 删除联络记录
    delete: protectedProcedure
      .input(z.object({
        interactionId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.deleteContactInteraction(input.interactionId);
        return { success: true };
      }),

    // 更新联络记录
    update: protectedProcedure
      .input(z.object({
        interactionId: z.number(),
        interactionDate: z.date().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await dbContacts.updateContactInteraction({
          id: input.interactionId,
          interactionDate: input.interactionDate,
          note: input.note,
        });
        return { success: true };
      }),
  }),

  // 提醒类型管理
  reminderTypes: router({
    // 创建提醒类型
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "类型名称不能为空"),
        icon: z.string().default("🔔"),
        color: z.string().default("#6366f1"),
      }))
      .mutation(async ({ ctx, input }) => {
        const newType = await dbReminderTypes.createReminderType({
          userId: ctx.user.id,
          name: input.name,
          icon: input.icon,
          color: input.color,
          isDefault: false,
        });
        return newType;
      }),

    // 获取用户的所有提醒类型
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbReminderTypes.getReminderTypesByUserId(ctx.user.id);
      }),

    // 更新提醒类型
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "类型名称不能为空").optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const updated = await dbReminderTypes.updateReminderType(id, ctx.user.id, data);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "提醒类型不存在" });
        }
        return updated;
      }),

    // 删除提醒类型
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await dbReminderTypes.deleteReminderType(input.id, ctx.user.id);
        if (!success) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "无法删除默认类型或类型不存在" });
        }
        return { success: true };
      }),
  }),

  // 提醒管理
  reminders: router({
    // 创建提醒
    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        title: z.string().min(1, "提醒事项不能为空"),
        reminderDate: z.number().optional(), // Unix timestamp (ms), 普通提醒必填
        reminderType: z.enum(["normal", "birthday"]).default("normal"),
        birthMonth: z.number().min(1).max(12).optional(), // 生日月份，生日提醒必填
        birthDay: z.number().min(1).max(31).optional(), // 生日日期，生日提醒必填
      }))
      .mutation(async ({ ctx, input }) => {
        // 验证：普通提醒必须有reminderDate，生日提醒必须有birthMonth和birthDay
        if (input.reminderType === "normal" && !input.reminderDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "普通提醒必须指定提醒时间" });
        }
        if (input.reminderType === "birthday" && (!input.birthMonth || !input.birthDay)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "生日提醒必须指定月份和日期" });
        }
        
        // 生日提醒：计算今年的生日日期
        let reminderDate: Date;
        if (input.reminderType === "birthday") {
          const now = new Date();
          const currentYear = now.getFullYear();
          reminderDate = new Date(currentYear, input.birthMonth! - 1, input.birthDay!);
          // 如果今年的生日已过，设置为明年的生日
          if (reminderDate < now) {
            reminderDate = new Date(currentYear + 1, input.birthMonth! - 1, input.birthDay!);
          }
        } else {
          reminderDate = new Date(input.reminderDate!);
        }
        
        const reminderId = await dbContacts.createReminder({
          contactId: input.contactId,
          userId: ctx.user.id,
          title: input.title,
          reminderDate,
          reminderType: input.reminderType,
          isRecurring: input.reminderType === "birthday", // 生日提醒自动循环
          birthMonth: input.birthMonth,
          birthDay: input.birthDay,
          isCompleted: false,
        });
        return { id: reminderId };
      }),

    // 获取某个人脉的所有提醒
    list: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.getContactReminders(input.contactId, ctx.user.id);
      }),

    // 更新提醒（标记完成/未完成）
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        isCompleted: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.updateReminder(input.id, ctx.user.id, {
          isCompleted: input.isCompleted,
        });
        return { success: true };
      }),

    // 删除提醒
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbContacts.deleteReminder(input.id, ctx.user.id);
        return { success: true };
      }),

    // 获取今日提醒人数
    todayCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getTodayRemindersCount(ctx.user.id);
      }),

    // 获取本周提醒人数
    weekCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getWeekRemindersCount(ctx.user.id);
      }),

    // 获取本月提醒人数
    monthCount: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getMonthRemindersCount(ctx.user.id);
      }),
  }),

  // 区域统计和筛选
  regions: router({
    // 获取所有省份的人数统计
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        return await dbContacts.getRegionStats(ctx.user.id);
      }),

    // 按区域筛选人脉列表
    list: protectedProcedure
      .input(z.object({
        region: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbContacts.getContactsByRegion(ctx.user.id, input.region);
      }),
  }),

  // 容器顺序管理
  featureOrder: router({
    // 获取用户的容器顺序（合并默认定义和用户自定义顺序）
    get: protectedProcedure
      .query(async ({ ctx }) => {
        const [definitions, userOrder] = await Promise.all([
          db.getActiveFeatureDefinitions(),
          db.getUserFeatureOrder(ctx.user.id),
        ]);
        
        // 创建用户顺序映射
        const userOrderMap = new Map(
          userOrder.map(o => [o.featureId, o.position])
        );
        
        // 合并：用户有自定义顺序的使用自定义，否则使用默认
        const features = definitions.map(def => ({
          featureId: def.featureId,
          title: def.title,
          description: def.description,
          position: userOrderMap.get(def.featureId) ?? def.defaultPosition,
        }));
        
        // 按position排序
        features.sort((a, b) => a.position - b.position);
        
        return features;
      }),
    
    // 保存用户的容器顺序
    save: protectedProcedure
      .input(z.object({
        orders: z.array(z.object({
          featureId: z.number(),
          position: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveUserFeatureOrder(ctx.user.id, input.orders);
        return { success: true };
      }),
  }),

  // 介绍人贡献统计
  referrerStats: router({
    // 获取介绍人贡献排行榜
    leaderboard: protectedProcedure
      .input(z.object({
        directWeight: z.number().optional(),
        indirectWeight: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await dbReferrerStats.getReferrerStats(ctx.user.id);
      }),
  }),

  // 导出所有人脉数据
  exportAll: protectedProcedure
    .input(z.object({
      scope: z.enum(['current_user', 'all_users']).default('current_user'),
    }))
    .query(async ({ ctx, input }) => {
      const scope = input.scope;
      
      // 只有超级管理员才能导出所有用户数据
      if (scope === 'all_users' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '只有超级管理员才能导出所有用户数据' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // 1. 根据scope查询人脉
      const contactsList = scope === 'all_users'
        ? await db.select().from(contacts) // 查询所有用户的人脉
        : await db.select().from(contacts).where(eq(contacts.parentUserId, ctx.user.id)); // 只查询当前用户的人脉
      
      // 2. 根据scope查询标签和字段分类
      const tags = scope === 'all_users'
        ? await db.select().from(contactTags) // 查询所有标签
        : await dbContacts.getContactTags(ctx.user.id); // 只查询当前用户的标签
      
      // 3. 查询所有字段分类
      const fieldCategoriesList = scope === 'all_users'
        ? await db.select().from(contactFieldCategories) // 查询所有字段分类
        : await db.select().from(contactFieldCategories).where(eq(contactFieldCategories.parentUserId, ctx.user.id));
      
      // 4. 为每个人脉查询详细信息
      const contactsWithDetails = await Promise.all(contactsList.map(async (contact: any) => {
        // 查询扩展信息
        const fieldValuesList = await db.select().from(contactFieldValues).where(eq(contactFieldValues.contactId, contact.id));
        
        // 查询标签关系
        const contactTags = await dbContacts.getContactTagsByContactId(contact.id);
        
        // 查询联络记录
        const interactions = await dbContacts.getContactInteractions(contact.id);
        
        // 查询提醒事项
        const reminders = await dbContacts.getContactReminders(contact.id, contact.parentUserId);
        
        return {
          ...contact,
          fieldValues: fieldValuesList,
          tags: contactTags,
          interactions,
          reminders,
        };
      }));
      
      // 5. 生成备份数据
      return {
        exportDate: new Date().toISOString(),
        scope,
        exportedBy: ctx.user.id,
        summary: {
          totalContacts: contactsList.length,
          totalTags: tags.length,
          totalFieldCategories: fieldCategoriesList.length,
          totalInteractions: contactsWithDetails.reduce((sum: number, c: any) => sum + c.interactions.length, 0),
          totalReminders: contactsWithDetails.reduce((sum: number, c: any) => sum + c.reminders.length, 0),
        },
        tags,
        fieldCategories: fieldCategoriesList,
        contacts: contactsWithDetails,
      };
    }),

    // 获取推荐关系（直接或间接）
    getReferrals: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        type: z.enum(['direct', 'indirect']),
      }))
      .query(async ({ input }) => {
        if (input.type === 'direct') {
          const referrals = await dbContacts.getDirectReferrals(input.contactId);
          return {
            referrals,
            stats: {
              total: referrals.length,
              levelDistribution: [{ level: 1, count: referrals.length }],
            },
          };
        } else {
          const referrals = await dbContacts.getIndirectReferrals(input.contactId);
          // 统计各层级人数
          const levelCounts = new Map<number, number>();
          referrals.forEach((r: any) => {
            const count = levelCounts.get(r.level) || 0;
            levelCounts.set(r.level, count + 1);
          });
          const levelDistribution = Array.from(levelCounts.entries())
            .map(([level, count]) => ({ level, count }))
            .sort((a, b) => a.level - b.level);
          
          return {
            referrals,
            stats: {
              total: referrals.length,
              levelDistribution,
            },
          };
        }
      }),
    getReferralChain: protectedProcedure
      .input(z.object({
        contactId: z.number(),
      }))
      .query(async ({ input }) => {
        return await dbContacts.getReferralChain(input.contactId);
      }),
  }),

  // ==================== 人脉共享管理 ====================
  sharing: router({
    // 创建共享连接
    createConnection: protectedProcedure
      .input(z.object({
        receiverUsername: z.string().min(1, "请输入接收者用户名"),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 共享功能对所有用户开放，不再检查权限
        
        // 查找接收者用户
        const receiver = await db.getUserByUsername(input.receiverUsername);
        if (!receiver) {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到该用户" });
        }
        
        // 不能连接自己
        if (receiver.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能连接自己" });
        }
        
        // 检查是否已存在连接
        const existingConnection = await db.getSharingConnection(ctx.user.id, receiver.id);
        if (existingConnection) {
          throw new TRPCError({ code: "CONFLICT", message: "已存在与该用户的连接" });
        }
        
        // 创建连接
        const connectionId = await db.createSharingConnection({
          sharerId: ctx.user.id,
          receiverId: receiver.id,
          status: 'active', // 直接激活，不需要确认
          note: input.note,
        });
        
        // 初始化默认权限（全部共享）
        const defaultFields = ['name', 'title', 'gender', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags'];
        for (const fieldName of defaultFields) {
          await db.createSharingPermission({
            connectionId,
            fieldName,
            isShared: true,
          });
        }
        
        // 奖励积分：共享人脉
        await addPointsForAction(ctx.user.id, 'share_contact', connectionId);
        
        return { connectionId, receiverName: receiver.name || receiver.username };
      }),

    // 删除共享连接
    deleteConnection: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || connection.sharerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        // 删除权限配置
        await db.deleteSharingPermissionsByConnectionId(input.connectionId);
        // 删除连接
        await db.deleteSharingConnection(input.connectionId);
        
        return { success: true };
      }),

    // 获取我的共享连接列表（作为分享者）
    listMyConnections: protectedProcedure
      .query(async ({ ctx }) => {
        const connections = await db.getSharingConnectionsBySharerId(ctx.user.id);
        
        // 为每个连接获取接收者信息、权限配置和共享人数
        const connectionsWithDetails = await Promise.all(
          connections.map(async (conn: any) => {
            const receiver = await db.getUserById(conn.receiverId);
            const permissions = await db.getSharingPermissionsByConnectionId(conn.id);
            // 统计共享给该用户的人数（当前用户的所有联系人）
            const contacts = await dbContacts.getContactsByParent(ctx.user.id);
            const sharedContactCount = contacts.length;
            return {
              ...conn,
              receiverName: receiver?.name || receiver?.username || '未知用户',
              receiverUsername: receiver?.username || '',
              permissions,
              sharedContactCount, // 共享给对方的人数
            };
          })
        );
        
        return connectionsWithDetails;
      }),

    // 获取共享给我的连接列表（作为接收者）
    listSharedToMe: protectedProcedure
      .query(async ({ ctx }) => {
        const connections = await db.getSharingConnectionsByReceiverId(ctx.user.id);
        
        // 为每个连接获取分享者信息和共享人数
        const connectionsWithDetails = await Promise.all(
          connections.map(async (conn: any) => {
            const sharer = await db.getUserById(conn.sharerId);
            // 统计分享者共享给我的人数（分享者的所有联系人）
            const contacts = await dbContacts.getContactsByParent(conn.sharerId);
            const sharedContactCount = contacts.length;
            return {
              ...conn,
              sharerName: sharer?.name || sharer?.username || '未知用户',
              sharerUsername: sharer?.username || '',
              sharedContactCount, // 对方共享给我的人数
            };
          })
        );
        
        return connectionsWithDetails;
      }),

    // 更新共享权限配置
    updatePermissions: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
        permissions: z.array(z.object({
          fieldName: z.string(),
          isShared: z.boolean(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || connection.sharerId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        // 更新权限
        for (const perm of input.permissions) {
          await db.upsertSharingPermission(input.connectionId, perm.fieldName, perm.isShared);
        }
        
        return { success: true };
      }),

    // 获取共享权限配置
    getPermissions: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        // 检查连接是否属于当前用户
        const connection = await db.getSharingConnectionById(input.connectionId);
        if (!connection || (connection.sharerId !== ctx.user.id && connection.receiverId !== ctx.user.id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "连接不存在" });
        }
        
        return await db.getSharingPermissionsByConnectionId(input.connectionId);
      }),

    // 获取共享给我的人脉列表（数据聚合）
    getSharedContacts: protectedProcedure
      .query(async ({ ctx }) => {
        // 获取所有共享给我的连接（只返回active状态）
        const allConnections = await db.getSharingConnectionsByReceiverId(ctx.user.id);
        const connections = allConnections.filter((conn: any) => conn.status === 'active');
        
        if (connections.length === 0) {
          return [];
        }
        
        // 为每个连接获取分享者的人脉数据
        const allSharedContacts: any[] = [];
        
        for (const conn of connections) {
          // 获取分享者信息
          const sharer = await db.getUserById(conn.sharerId);
          if (!sharer) continue;
          
          // 获取权限配置
          const permissions = await db.getSharingPermissionsByConnectionId(conn.id);
          const sharedFields = permissions.filter((p: any) => p.isShared).map((p: any) => p.fieldName);
          const sharedFieldsSet = new Set(sharedFields);
          
          // 获取分享者的人脉列表
          const contacts = await dbContacts.getContactsByParent(conn.sharerId);
          
          if (contacts.length === 0) continue;
          
          // 获取所有联系人ID
          const contactIds = contacts.map((c: any) => c.id);
          
          // 并行批量查询所有需要的数据（和contacts.list一样）
          const [allReferrerStats, tagsMap, personalTagsMap, interactionStatsMap, interactionInfoMap, fieldValuesMap] = await Promise.all([
            dbReferrerStats.getReferrerStats(conn.sharerId).catch(() => []),
            dbContacts.getTagsForContacts(contactIds),
            dbContacts.getPersonalTagsForContacts(contactIds),
            dbContacts.getInteractionStatsForContacts(contactIds),
            dbContacts.getInteractionInfoForContacts(contactIds),
            dbContacts.getFieldValuesForContacts(contactIds),
          ]);
          
          // 创建推荐人统计的Map
          const referrerStatsMap = new Map(
            allReferrerStats.map((stat: any) => [stat.contactId, stat])
          );
          
          // 为每个人脉组装详情数据
          const contactsWithDetails = contacts.map((contact: any) => {
            const tags = tagsMap.get(contact.id) || [];
            const personalTags = personalTagsMap.get(contact.id) || [];
            const interactionStats = interactionStatsMap.get(contact.id) || { totalInteractions: 0 };
            const interactionInfo = interactionInfoMap.get(contact.id) || { lastInteraction: null, hasTodayInteraction: false };
            const referrerStats = referrerStatsMap.get(contact.id) || null;
            const fieldValues = fieldValuesMap.get(contact.id) || [];
            
            // 基础字段（始终返回）
            const result: any = {
              id: contact.id,
              _sharedBy: sharer.name || sharer.username,
              _sharerUserId: conn.sharerId,
              createdAt: contact.createdAt,
              updatedAt: contact.updatedAt,
            };
            
            // 根据权限配置过滤字段
            // 姓名始终显示（必须的）
            if (sharedFieldsSet.has('name') || sharedFieldsSet.size === 0) {
              result.name = contact.name;
            }
            
            // 其他基本字段根据权限配置
            if (sharedFieldsSet.has('title')) result.title = contact.title;
            if (sharedFieldsSet.has('phone')) result.phone = contact.phone;
            if (sharedFieldsSet.has('occupation')) result.occupation = contact.occupation;
            if (sharedFieldsSet.has('avatar')) result.avatar = contact.avatar;
            if (sharedFieldsSet.has('notes')) result.notes = contact.notes;
            if (sharedFieldsSet.has('isBlacklisted')) result.isBlacklisted = contact.isBlacklisted;
            
            // 标签始终显示（重要信息）
            result.tags = tags;
            result.personalTags = personalTags;
            
            // 字段值（公司、职位等）始终显示
            result.fieldValues = fieldValues;
            
            // 联络信息始终显示（让接收方知道分享者的联络情况）
            result.lastInteractionDate = interactionInfo.lastInteraction;
            result.daysSinceLastInteraction = interactionInfo.lastInteraction 
              ? Math.floor((Date.now() - new Date(interactionInfo.lastInteraction).getTime()) / (1000 * 60 * 60 * 24))
              : null;
            result.hasTodayInteraction = interactionInfo.hasTodayInteraction;
            result.totalInteractions = interactionStats?.totalInteractions || 0;
            
            // 推荐人信息
            result.hasReferrer = contact.referrerId !== null && contact.referrerId !== undefined;
            result.directReferrals = referrerStats?.directReferrals || 0;
            result.indirectReferrals = referrerStats?.indirectReferrals || 0;
            
            return result;
          });
          
          allSharedContacts.push(...contactsWithDetails);
        }
        
        return allSharedContacts;
      }),

    // 搜索用户（用于添加连接时搜索）
    searchUsers: protectedProcedure
      .input(z.object({
        query: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        const users = await db.searchUsersByUsername(input.query);
        // 过滤掉自己
        return users.filter((u: any) => u.id !== ctx.user.id).map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name,
        }));
      }),
  }),

  // 锦炼计数系统
  exercise: router({
    // 获取锻炼项目列表
    getTypes: protectedProcedure
      .query(async ({ ctx }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.getExerciseTypes(ctx.user.id);
      }),

    // 创建锻炼项目
    createType: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        icon: z.string().default("💪"),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.createExerciseType(ctx.user.id, input.name, input.icon);
      }),

    // 更新锻炼项目
    updateType: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        icon: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        const { id, ...data } = input;
        return await dbExercise.updateExerciseType(id, ctx.user.id, data);
      }),

    // 删除锻炼项目
    deleteType: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.deleteExerciseType(input.id, ctx.user.id);
      }),

    // 保存锻炼记录
    saveRecord: protectedProcedure
      .input(z.object({
        exerciseTypeId: z.number(),
        count: z.number().min(0),
        recordDate: z.string(), // YYYY-MM-DD格式
      }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.upsertExerciseRecord(
          ctx.user.id,
          input.exerciseTypeId,
          input.count,
          input.recordDate
        );
      }),

    // 获取锻炼记录
    getRecords: protectedProcedure
      .input(z.object({
        exerciseTypeId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.getExerciseRecordsByDateRange(
          ctx.user.id,
          input.exerciseTypeId,
          input.startDate,
          input.endDate
        );
      }),

    // 删除锻炼记录
    deleteRecord: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.deleteExerciseRecord(input.id, ctx.user.id);
      }),

    // 检查是否已设置家长密码
    hasPassword: protectedProcedure
      .query(async ({ ctx }) => {
        const dbExercise = await import("./db-exercise");
        return await dbExercise.hasParentPassword(ctx.user.id);
      }),

    // 设置家长密码
    setPassword: protectedProcedure
      .input(z.object({ password: z.string().min(4).max(20) }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        await dbExercise.setParentPassword(ctx.user.id, input.password);
        return { success: true };
      }),

    // 验证家长密码
    verifyPassword: protectedProcedure
      .input(z.object({ password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const dbExercise = await import("./db-exercise");
        const isValid = await dbExercise.verifyParentPassword(ctx.user.id, input.password);
        return { isValid };
      }),
  }),

  // 数据分析
  analytics: router({
    // 获取“我的”数据分析
    myData: protectedProcedure
      .query(async ({ ctx }) => {
        const data = await dbAnalytics.getMyDataAnalytics(ctx.user.id);
        return data;
      }),
    
    // 获取地域分布趋势数据
    regionTrend: protectedProcedure
      .input(z.object({
        months: z.number().min(1).max(24).default(6),
        regions: z.array(z.string()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { getRegionTrend } = await import('./db-region-trend');
        return await getRegionTrend(ctx.user.id, input.months, input.regions);
      }),
    
    // 获取海外和其他类别的趋势数据
    overseasAndOtherTrend: protectedProcedure
      .input(z.object({
        months: z.number().min(1).max(24).default(6),
      }))
      .query(async ({ ctx, input }) => {
        const { getOverseasAndOtherTrend } = await import('./db-region-trend');
        return await getOverseasAndOtherTrend(ctx.user.id, input.months);
      }),
  }),
  
  // 用户偏好设置
  userPreferences: router({
    // 获取用户首页卡片排序
    getHomeCardOrder: protectedProcedure
      .query(async ({ ctx }) => {
        const preference = await db.getUserPreference(ctx.user.id);
        return preference?.homeCardOrder || null;
      }),
    
    // 保存用户首页卡片排序
    saveHomeCardOrder: protectedProcedure
      .input(z.object({
        cardOrder: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.saveHomeCardOrder(ctx.user.id, input.cardOrder);
        return { success: true };
      }),
  }),

  // 积分系统
  pointSystem: router({
    // 获取当前用户积分
    getMyPoints: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserPoints } = await import('./db-point-system');
        const points = await getUserPoints(ctx.user.id);
        return { points };
      }),
    
    // 获取当前用户的积分变动记录
    getMyPointLogs: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        const { getUserPointLogs } = await import('./db-point-system');
        const logs = await getUserPointLogs(ctx.user.id, input.limit);
        return logs;
      }),
    
    // 管理员：获取所有积分规则
    getAllRules: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllPointRules } = await import('./db-point-system');
        return await getAllPointRules();
      }),
    
    // 管理员：更新积分规则
    updateRule: protectedProcedure
      .input(z.object({
        actionType: z.string(),
        points: z.number().optional(),
        isActive: z.boolean().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { updatePointRule } = await import('./db-point-system');
        await updatePointRule(input.actionType, {
          points: input.points,
          isActive: input.isActive,
          description: input.description,
        });
        return { success: true };
      }),
    
    // 管理员：获取所有用户及其积分
    getAllUsers: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllUsersWithPoints } = await import('./db-point-system');
        return await getAllUsersWithPoints(input.page, input.pageSize);
      }),
    
    // 管理员：搜索用户
    searchUsers: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { searchUsersByUsername } = await import('./db-point-system');
        return await searchUsersByUsername(input.keyword);
      }),
    
    // 管理员：手动调整用户积分
    adjustUserPoints: protectedProcedure
      .input(z.object({
        userId: z.number(),
        points: z.number(),
        description: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { adjustUserPointsByAdmin } = await import('./db-point-system');
        await adjustUserPointsByAdmin(
          input.userId,
          input.points,
          input.description,
          ctx.user.id
        );
        return { success: true };
      }),
    
    // 管理员：获取所有积分变动记录
    getAllLogs: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).default(100),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'super_admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
        }
        const { getAllPointLogs } = await import('./db-point-system');
        return await getAllPointLogs(input.limit);
      }),
  }),

  // 个人中心常用功能管理
  profileFeatures: router({
    // 获取用户的常用功能列表
    getFavorites: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserFavoriteFeatures } = await import('./db-profile-features');
        const favorites = await getUserFavoriteFeatures(ctx.user.id, ctx.user.role);
        return { favorites };
      }),
    
    // 保存用户的常用功能配置
    saveFavorites: protectedProcedure
      .input(z.object({
        featureIds: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveUserFavoriteFeatures } = await import('./db-profile-features');
        await saveUserFavoriteFeatures(ctx.user.id, input.featureIds);
        return { success: true };
      }),
  }),

  // 账本管理
  ledger: router({
    // 获取用户的所有账本
    list: protectedProcedure
      .input(z.object({
        isArchived: z.boolean().optional().default(false),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getUserLedgers(ctx.user.id, input.isArchived);
      }),

    // 获取单个账本详情
    getById: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerById(input.ledgerId, ctx.user.id);
      }),

    // 获取账本成员列表
    getMembers: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id);
      }),

    // 获取账本金额范围
    getAmountRange: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerAmountRange(input.ledgerId, ctx.user.id);
      }),

    // 创建新账本
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        description: z.string().optional(),
        type: z.string().optional(),
        currency: z.string().optional(),
        memberNickname: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ledger = await dbLedger.createLedger({
          name: input.name,
          description: input.description,
          type: input.type,
          currency: input.currency,
          createdBy: ctx.user.id,
        });
        return ledger;
      }),

    // 更新账本信息
    update: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.updateLedger(input.ledgerId, ctx.user.id, {
          name: input.name,
          description: input.description,
        });
        return { success: true };
      }),

    // 更新成员昵称
    updateMemberNickname: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        nickname: z.string().min(1).max(20),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.updateMemberNickname(input.ledgerId, ctx.user.id, input.nickname);
        return { success: true };
      }),

    // 存档/取消存档账本
    archive: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        isArchived: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.archiveLedger(input.ledgerId, ctx.user.id, input.isArchived);
        return { success: true };
      }),

    // 删除账本
    delete: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.deleteLedger(input.ledgerId, ctx.user.id);
        return { success: true };
      }),

    // 生成邀请token
    generateInviteToken: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const token = await dbLedger.generateInviteToken(input.ledgerId, ctx.user.id);
        return { token };
      }),

    // 通过邀请token加入账本
    joinByToken: protectedProcedure
      .input(z.object({
        token: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ledger = await dbLedger.joinLedgerByToken(input.token, ctx.user.id);
        return ledger;
      }),

    // 移除账本成员
    removeMember: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await dbLedger.removeLedgerMember(input.ledgerId, ctx.user.id, input.userId);
        return { success: true };
      }),

    // 获取账本分类列表
    getCategories: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        type: z.enum(['income', 'expense']).optional(),
        parentId: z.number().nullable().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerCategories(input.ledgerId, ctx.user.id, input.type, input.parentId);
      }),

    // 添加账本分类
    addCategory: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        name: z.string().min(1).max(50),
        type: z.enum(['income', 'expense']),
        parentId: z.number().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addLedgerCategory({
          ...input,
          createdBy: ctx.user.id,
        });
      }),

    // 删除账本分类
    deleteCategory: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        cascade: z.boolean().optional().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteLedgerCategory(
          input.categoryId,
          ctx.user.id,
          input.cascade
        );
      }),

    // 获取成员权限列表
    getMemberPermissions: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const result = await dbLedger.getMemberPermissions(input.ledgerId, ctx.user.id);
        
        // 从主数据库获取用户信息
        const membersWithUserInfo = await Promise.all(
          result.members.map(async (member: any) => {
            const user = await db.getUserById(member.userId);
            return {
              ...member,
              userName: user?.name || '未知用户',
              userAvatar: user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
              ledgerName: result.ledgerName,
            };
          })
        );
        
        return membersWithUserInfo;
      }),

    // 更新成员权限
    updateMemberPermission: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        memberId: z.number(),
        permissionType: z.enum(['view', 'add', 'edit', 'delete']),
        permissionValue: z.enum(['all', 'own', 'none']),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.updateMemberPermission(
          input.ledgerId,
          input.memberId,
          input.permissionType,
          input.permissionValue,
          ctx.user.id
        );
      }),

    // 获取AI雇员列表
    getAIEmployees: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getAIEmployees(input.ledgerId, ctx.user.id);
      }),

    // 添加AI雇员
    addAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        avatarType: z.string(),
        nickname: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addAIEmployee(
          input.ledgerId,
          input.avatarType,
          input.nickname,
          ctx.user.id
        );
      }),

    // 删除AI雇员
    removeAIEmployee: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        employeeId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.removeAIEmployee(
          input.ledgerId,
          input.employeeId,
          ctx.user.id
        );
      }),

    // 获取报表数据
    getReport: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        year: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getLedgerReport(input.ledgerId, ctx.user.id, input.year);
      }),

    // 获取日历数据（指定月份的每日收支统计）
    getCalendarData: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        year: z.number(),
        month: z.number(),
        memberIds: z.array(z.number()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getCalendarData(input.ledgerId, ctx.user.id, input.year, input.month, input.memberIds);
      }),

    // 获取指定日期的记账记录
    getDayRecords: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        date: z.string(),
        memberIds: z.array(z.number()).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getDayRecords(input.ledgerId, ctx.user.id, input.date, input.memberIds);
      }),

    // 添加记账记录
    addTransaction: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        type: z.enum(['income', 'expense']),
        amount: z.number().positive(),
        categoryId: z.number(),
        subcategoryId: z.number().optional(),
        description: z.string().optional(),
        transactionDate: z.string(),
        images: z.array(z.string()).optional(),
        memberId: z.number().optional(),
        accountId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.addTransaction({
          ...input,
          userId: ctx.user.id,
        });
      }),

    // 获取记账记录列表（按日期分组）
    getTransactions: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        type: z.enum(['income', 'expense']).optional(),
        categoryId: z.number().optional(),
        memberId: z.number().optional(),
        amountMin: z.string().optional(),
        amountMax: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { ledgerId, ...options } = input;
        return await dbLedger.getTransactionsList(ledgerId, ctx.user.id, options);
      }),

    // 删除记账记录
    deleteTransaction: protectedProcedure
      .input(z.object({
        recordId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteTransaction(input.recordId, ctx.user.id);
      }),

    // 更新记账记录
    updateTransaction: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        type: z.enum(['income', 'expense']).optional(),
        amount: z.number().positive().optional(),
        categoryId: z.number().optional(),
        subcategoryId: z.number().optional(),
        description: z.string().optional(),
        transactionDate: z.string().optional(),
        images: z.array(z.string()).optional(),
        memberId: z.number().optional(),
        accountId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { recordId, ...data } = input;
        return await dbLedger.updateTransaction(recordId, ctx.user.id, data);
      }),

    // ==================== 审批相关 ====================
    
    // 获取审批规则
    getApprovalRules: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getApprovalRules(input.ledgerId, ctx.user.id);
      }),

    // 保存审批规则
    saveApprovalRules: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        rules: z.array(z.object({
          recorderId: z.number().nullable(),
          approverType: z.enum(['all', 'specific']),
          approverIds: z.array(z.number()).optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.saveApprovalRules(input.ledgerId, ctx.user.id, input.rules);
      }),

    // 删除审批规则
    deleteApprovalRule: protectedProcedure
      .input(z.object({
        ruleId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.deleteApprovalRule(input.ruleId, ctx.user.id);
      }),

    // 审批记账
    approveTransaction: protectedProcedure
      .input(z.object({
        transactionId: z.number(),
        action: z.enum(['approved', 'rejected']),
        comment: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await dbLedger.approveTransaction(
          input.transactionId,
          ctx.user.id,
          input.action,
          input.comment
        );
      }),

    // 获取单条记账详情
    getTransactionDetail: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
        transactionId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getTransactionDetail(
          input.ledgerId,
          input.transactionId,
          ctx.user.id
        );
      }),

    // 获取待审批的记账列表
    getPendingApprovals: protectedProcedure
      .input(z.object({
        ledgerId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await dbLedger.getPendingApprovals(input.ledgerId, ctx.user.id);
      }),
  }),
});

// 管理员容器定义管理（独立 router，仅超级管理员可用）
export const adminFeatureRouter = router({
  // 获取所有容器定义
  list: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      return db.getAllFeatureDefinitions();
    }),
  
  // 创建或更新容器定义
  upsert: protectedProcedure
    .input(z.object({
      featureId: z.number(),
      title: z.string(),
      description: z.string().optional(),
      isActive: z.boolean(),
      defaultPosition: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可访问' });
      }
      await db.upsertFeatureDefinition({
        ...input,
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),
});

export type AppRouter = typeof appRouter;
