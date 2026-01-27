import bcrypt from "bcryptjs";
import * as db from "./db";

const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA = 3;
const MAX_FAILED_ATTEMPTS_BEFORE_LOCK = 10;

export interface LoginResult {
  success: boolean;
  user?: {
    id: number;
    username: string | null;
    name: string | null;
    role: "super_admin" | "parent" | "baby";
  };
  error?: string;
  requiresCaptcha?: boolean;
  remainingAttempts?: number;
  isLocked?: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function loginWithPassword(
  username: string,
  password: string,
  ipAddress: string
): Promise<LoginResult> {
  // 检查IP级别的登录尝试
  const recentAttempts = await db.getRecentLoginAttempts(ipAddress, 30);
  const ipFailedCount = recentAttempts.length;

  // 如果IP级别失败次数过多，需要验证码
  const requiresCaptcha = ipFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA;

  // 查找用户
  const user = await db.getUserByUsername(username);
  
  if (!user) {
    // 记录失败尝试
    await db.recordLoginAttempt({
      ipAddress,
      username,
      success: 0,
    });
    
    return {
      success: false,
      error: "用户名或密码错误",
      requiresCaptcha,
      remainingAttempts: MAX_FAILED_ATTEMPTS_BEFORE_LOCK - ipFailedCount - 1,
    };
  }

  // 检查账户是否被锁定
  if (user.isLocked) {
    return {
      success: false,
      error: "账户已被锁定，请联系管理员解锁",
      isLocked: true,
    };
  }

  // 验证密码
  if (!user.passwordHash) {
    return {
      success: false,
      error: "此账户未设置密码登录",
    };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    // 更新用户失败次数
    const newFailedCount = (user.failedLoginAttempts || 0) + 1;
    await db.updateUserLoginAttempts(user.id, newFailedCount, new Date());

    // 记录失败尝试
    await db.recordLoginAttempt({
      ipAddress,
      username,
      success: 0,
    });

    // 检查是否需要锁定账户
    if (newFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_LOCK) {
      await db.lockUser(user.id);
      return {
        success: false,
        error: "登录失败次数过多，账户已被锁定",
        isLocked: true,
      };
    }

    return {
      success: false,
      error: "用户名或密码错误",
      requiresCaptcha: newFailedCount >= MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA,
      remainingAttempts: MAX_FAILED_ATTEMPTS_BEFORE_LOCK - newFailedCount,
    };
  }

  // 登录成功，重置失败次数
  await db.updateUserLoginAttempts(user.id, 0);
  
  // 记录成功登录
  await db.recordLoginAttempt({
    ipAddress,
    username,
    success: 1,
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
}

export async function registerWithPassword(
  username: string,
  password: string,
  name?: string,
  email?: string
): Promise<{ success: boolean; userId?: number; error?: string }> {
  // 检查用户名是否已存在
  const existingUser = await db.getUserByUsername(username);
  if (existingUser) {
    return {
      success: false,
      error: "用户名已存在",
    };
  }

  // 验证用户名格式
  if (username.length < 3 || username.length > 20) {
    return {
      success: false,
      error: "用户名长度需要在3-20个字符之间",
    };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return {
      success: false,
      error: "用户名只能包含字母、数字和下划线",
    };
  }

  // 验证密码强度
  if (password.length < 6) {
    return {
      success: false,
      error: "密码长度至少6个字符",
    };
  }

  // 创建用户
  const passwordHash = await hashPassword(password);
  const userId = await db.createUserWithPassword({
    username,
    passwordHash,
    name,
    email,
  });

  if (!userId) {
    return {
      success: false,
      error: "创建用户失败",
    };
  }

  return {
    success: true,
    userId,
  };
}

export { MAX_FAILED_ATTEMPTS_BEFORE_CAPTCHA, MAX_FAILED_ATTEMPTS_BEFORE_LOCK };
