import { drizzle } from "drizzle-orm/mysql2";
import { users } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
const db = drizzle(DATABASE_URL);

const guestUser = await db.select().from(users).where(eq(users.id, 5070293));
console.log("游客用户信息：", JSON.stringify(guestUser, null, 2));
