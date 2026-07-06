/**
 * 向演示门店 9999 插入模拟数据（今日预约、随访，本周和本月数据）
 * 运行：npx tsx scripts/seed-demo-data.ts
 */
import mysql from "mysql2/promise";

const TENANT_ID = 9999;

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function toStr(d: Date) { return d.toISOString().slice(0, 10); }

async function main() {
  const conn = await mysql.createConnection({
    host: "124.223.54.69", port: 3306,
    user: "root", password: "Miao@20190603", database: "crm_db"
  });
  console.log("✅ 数据库连接成功");

  // ── 1. 查询演示门店现有顾客 ──────────────────────────────────
  const [customers] = await conn.execute(
    `SELECT id, name FROM yaban_customer WHERE tenant_id = ? ORDER BY id ASC LIMIT 20`,
    [TENANT_ID]
  ) as any[];

  if (customers.length === 0) {
    console.log("❌ 演示门店无顾客");
    await conn.end();
    return;
  }
  console.log(`找到 ${customers.length} 位顾客：`, customers.slice(0, 5).map((c: any) => c.name).join("、") + "...");

  // ── 2. 医生列表 ──────────────────────────────────────────────
  const doctorNames = ["张医生", "李医生", "王医生", "刘医生", "陈医生"];

  // ── 辅助函数：插入预约 ──────────────────────────────────────
  async function insertAppt(dateStr: string, time: string, cust: any, doctor: string, status = "confirmed") {
    await conn.execute(
      `INSERT INTO yaban_appointment
         (tenant_id, patient_id, patient_name, doctor, appoint_date, appoint_time, status, remark, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '演示数据', NOW())`,
      [TENANT_ID, cust.id, cust.name, doctor, dateStr, time, status]
    );
  }

  // ── 辅助函数：插入随访 ──────────────────────────────────────
  async function insertFollow(dateStr: string, cust: any, status = "pending") {
    await conn.execute(
      `INSERT INTO yaban_comm_record
         (tenant_id, customer_id, biz_type, record_type, raw_text, followup_date, followup_status, comm_at, created_at)
       VALUES (?, ?, 'followup', 'text', '演示数据-随访', ?, ?, NOW(), NOW())`,
      [TENANT_ID, cust.id, dateStr, status]
    );
  }

  // ── 3. 今日预约（5条）──────────────────────────────────────
  await conn.execute(
    `DELETE FROM yaban_appointment WHERE tenant_id = ? AND appoint_date = ? AND remark = '演示数据'`,
    [TENANT_ID, todayStr]
  );

  const todayAppts = [
    { time: "09:00:00", status: "confirmed" },
    { time: "10:30:00", status: "arrived" },
    { time: "11:00:00", status: "confirmed" },
    { time: "14:00:00", status: "pending" },
    { time: "15:30:00", status: "pending" },
  ];
  for (let i = 0; i < todayAppts.length; i++) {
    await insertAppt(todayStr, todayAppts[i].time, customers[i % customers.length], doctorNames[i % doctorNames.length], todayAppts[i].status);
  }
  console.log(`✅ 今日预约插入 ${todayAppts.length} 条`);

  // ── 4. 今日随访（3条）──────────────────────────────────────
  await conn.execute(
    `DELETE FROM yaban_comm_record WHERE tenant_id = ? AND biz_type = 'followup' AND followup_date = ? AND raw_text = '演示数据-随访'`,
    [TENANT_ID, todayStr]
  );
  const followStatuses = ["pending", "pending", "done"];
  for (let i = 0; i < 3; i++) {
    await insertFollow(todayStr, customers[(i + 5) % customers.length], followStatuses[i]);
  }
  console.log(`✅ 今日随访插入 3 条`);

  // ── 5. 本周其他天 ────────────────────────────────────────────
  const monday = getMonday(today);
  const weekApptCounts = [3, 5, 4, 6, 2, 1, 0]; // 周一到周日每天预约数
  const weekFollowCounts = [1, 2, 1, 3, 1, 0, 0];

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + offset);
    const ds = toStr(d);
    if (ds === todayStr) continue;

    await conn.execute(
      `DELETE FROM yaban_appointment WHERE tenant_id = ? AND appoint_date = ? AND remark = '演示数据'`,
      [TENANT_ID, ds]
    );
    await conn.execute(
      `DELETE FROM yaban_comm_record WHERE tenant_id = ? AND biz_type = 'followup' AND followup_date = ? AND raw_text = '演示数据-随访'`,
      [TENANT_ID, ds]
    );

    for (let i = 0; i < weekApptCounts[offset]; i++) {
      await insertAppt(ds, `${String(9 + i).padStart(2, "0")}:00:00`, customers[i % customers.length], doctorNames[i % doctorNames.length]);
    }
    for (let i = 0; i < weekFollowCounts[offset]; i++) {
      await insertFollow(ds, customers[(i + 3) % customers.length]);
    }
  }
  console.log(`✅ 本周其他天数据插入完成`);

  // ── 6. 本月其他天（月视角）──────────────────────────────────
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayTime = monday.getTime();
  const sundayTime = mondayTime + 6 * 86400000;

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dTime = new Date(ds + "T00:00:00").getTime();
    if (dTime >= mondayTime && dTime <= sundayTime) continue; // 本周已处理

    const seed = (day * 7 + 3) % 9;
    if (seed === 0) continue;

    await conn.execute(
      `DELETE FROM yaban_appointment WHERE tenant_id = ? AND appoint_date = ? AND remark = '演示数据'`,
      [TENANT_ID, ds]
    );
    for (let i = 0; i < seed; i++) {
      await insertAppt(ds, `${String(9 + (i % 8)).padStart(2, "0")}:00:00`, customers[i % customers.length], doctorNames[i % doctorNames.length]);
    }
  }
  console.log(`✅ 本月其他天预约数据插入完成`);

  await conn.end();
  console.log("🎉 全部演示数据插入完成！");
}

main().catch(console.error);
