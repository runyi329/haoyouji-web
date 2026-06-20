import { getDb } from "./db";
import { todos } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * 获取用户的待办事项统计
 */
export async function getTodoStats(userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return { pending: 0, completed: 0, total: 0 };

  const allTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId));

  const pending = allTodos.filter((t: any) => t.status === 'pending' || t.status === 'in_progress').length;
  const completed = allTodos.filter((t: any) => t.status === 'completed').length;
  const total = allTodos.length;

  return {
    pending,
    completed,
    total,
  };
}

/**
 * 获取用户的待办事项列表
 */
export async function getTodoList(userId: number, status?: string) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) return [];

  let query = db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(desc(todos.createdAt));

  const result = await query;

  if (status) {
    return result.filter((t: any) => t.status === status);
  }

  return result;
}

/**
 * 创建待办事项
 */
export async function createTodo(data: {
  userId: number;
  creatorId: number;
  title: string;
  description?: string;
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high';
  relatedContactId?: number;
}) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  const [todo] = await db.insert(todos).values(data).$returningId();
  return todo;
}

/**
 * 更新待办事项状态
 */
export async function updateTodoStatus(todoId: number, userId: number, status: 'pending' | 'in_progress' | 'completed' | 'cancelled') {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  const completedAt = status === 'completed' ? new Date() : null;
  
  await db
    .update(todos)
    .set({ status, completedAt })
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}

/**
 * 删除待办事项
 */
export async function deleteTodo(todoId: number, userId: number) {
  const db = await getDb();
 if (!db) throw new Error("Database not available");
  if (!db) throw new Error("Database not available");

  await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
}
