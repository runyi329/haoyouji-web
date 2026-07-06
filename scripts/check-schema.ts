import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: "124.223.54.69", port: 3306,
    user: "root", password: "Miao@20190603", database: "crm_db"
  });
  const [appt] = await conn.execute("DESCRIBE yaban_appointment") as any[];
  console.log("yaban_appointment fields:", appt.map((r: any) => r.Field).join(", "));
  const [comm] = await conn.execute("DESCRIBE yaban_comm_record") as any[];
  console.log("yaban_comm_record fields:", comm.map((r: any) => r.Field).join(", "));
  await conn.end();
}
main().catch(console.error);
