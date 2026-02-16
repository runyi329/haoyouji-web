import { db } from './server/db';
import { equityInvestments, users } from './server/db/schema';
import { eq } from 'drizzle-orm';

async function checkUserSeat() {
  const userId = 870413;
  
  // 查询用户信息
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  console.log('用户信息:', user[0]);
  
  // 查询投资记录
  const investment = await db.select().from(equityInvestments).where(eq(equityInvestments.userId, userId)).limit(1);
  console.log('投资记录:', investment);
  
  if (investment && investment.length > 0) {
    console.log('座位编号:', investment[0].seatNumber);
  } else {
    console.log('没有投资记录');
  }
  
  process.exit(0);
}

checkUserSeat();
