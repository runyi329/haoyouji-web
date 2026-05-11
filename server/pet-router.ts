import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

// ========== 宠物氢氧健康舱平台路由 ==========

export const petRouter = router({

  // 获取当前用户的宠物平台角色
  getMyRole: protectedProcedure.query(async ({ ctx }) => {
    const dbConn = await getDbConnection();
    if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });
    const [rows] = await dbConn.execute(
      `SELECT * FROM pet_user_roles WHERE user_id = ? LIMIT 1`,
      [ctx.user.id]
    ) as any[];
    const roleRow = (rows as any[])[0];
    // 超级管理员也可以查看所有数据
    if (!roleRow && ctx.user.role !== 'super_admin') return null;
    return roleRow ? {
      role: roleRow.role as 'manufacturer' | 'investor' | 'promoter' | 'petshop',
      remark: roleRow.remark,
    } : { role: 'admin' as const, remark: '超级管理员' };
  }),

  // 获取我关联的机器列表（含今日营业额和我的分润）
  getMyMachines: protectedProcedure.query(async ({ ctx }) => {
    const dbConn = await getDbConnection();
    if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

    // 先查角色
    const [roleRows] = await dbConn.execute(
      `SELECT role FROM pet_user_roles WHERE user_id = ? LIMIT 1`,
      [ctx.user.id]
    ) as any[];
    const roleRow = (roleRows as any[])[0];
    const isSuperAdmin = ctx.user.role === 'super_admin';

    let machineQuery = '';
    let machineParams: any[] = [];

    if (isSuperAdmin) {
      // 超级管理员看所有机器
      machineQuery = `SELECT m.*,
        u_petshop.name as petshop_user_name,
        u_investor.name as investor_user_name,
        u_promoter.name as promoter_user_name,
        u_mfr.name as manufacturer_user_name
        FROM pet_machines m
        LEFT JOIN users u_petshop ON m.petshop_user_id = u_petshop.id
        LEFT JOIN users u_investor ON m.investor_user_id = u_investor.id
        LEFT JOIN users u_promoter ON m.promoter_user_id = u_promoter.id
        LEFT JOIN users u_mfr ON m.manufacturer_user_id = u_mfr.id
        ORDER BY m.id DESC`;
    } else if (!roleRow) {
      return [];
    } else {
      const role = roleRow.role;
      const roleToColumn: Record<string, string> = {
        manufacturer: 'manufacturer_user_id',
        investor: 'investor_user_id',
        promoter: 'promoter_user_id',
        petshop: 'petshop_user_id',
      };
      const col = roleToColumn[role];
      if (!col) return [];
      machineQuery = `SELECT m.*,
        u_petshop.name as petshop_user_name,
        u_investor.name as investor_user_name,
        u_promoter.name as promoter_user_name,
        u_mfr.name as manufacturer_user_name
        FROM pet_machines m
        LEFT JOIN users u_petshop ON m.petshop_user_id = u_petshop.id
        LEFT JOIN users u_investor ON m.investor_user_id = u_investor.id
        LEFT JOIN users u_promoter ON m.promoter_user_id = u_promoter.id
        LEFT JOIN users u_mfr ON m.manufacturer_user_id = u_mfr.id
        WHERE m.${col} = ?
        ORDER BY m.id DESC`;
      machineParams = [ctx.user.id];
    }

    const [machineRows] = await dbConn.execute(machineQuery, machineParams) as any[];
    const machines = machineRows as any[];

    if (!machines || machines.length === 0) return [];

    // 查今日营业记录
    const today = new Date().toISOString().slice(0, 10);
    const machineIds = machines.map((m: any) => m.id);
    const placeholders = machineIds.map(() => '?').join(',');
    const [recordRows] = await dbConn.execute(
      `SELECT * FROM pet_daily_records WHERE machine_id IN (${placeholders}) AND record_date = ?`,
      [...machineIds, today]
    ) as any[];
    const todayRecords = recordRows as any[];
    const recordMap = new Map(todayRecords.map((r: any) => [r.machine_id, r]));

    // 查本月累计
    const monthStart = today.slice(0, 7) + '-01';
    const [monthRows] = await dbConn.execute(
      `SELECT machine_id,
        SUM(CAST(revenue AS DECIMAL(12,2))) as month_revenue,
        SUM(CAST(petshop_profit AS DECIMAL(12,2))) as month_petshop,
        SUM(CAST(investor_profit AS DECIMAL(12,2))) as month_investor,
        SUM(CAST(promoter_profit AS DECIMAL(12,2))) as month_promoter,
        SUM(CAST(manufacturer_profit AS DECIMAL(12,2))) as month_manufacturer
       FROM pet_daily_records
       WHERE machine_id IN (${placeholders}) AND record_date >= ?
       GROUP BY machine_id`,
      [...machineIds, monthStart]
    ) as any[];
    const monthData = monthRows as any[];
    const monthMap = new Map(monthData.map((r: any) => [r.machine_id, r]));

    const userRole = isSuperAdmin ? 'admin' : roleRow?.role;

    return machines.map((m: any) => {
      const todayRec = recordMap.get(m.id);
      const monthRec = monthMap.get(m.id);
      const todayRevenue = parseFloat(todayRec?.revenue ?? '0');
      const monthRevenue = parseFloat(monthRec?.month_revenue ?? '0');

      // 根据角色取对应分润
      let todayProfit = 0;
      let monthProfit = 0;
      if (userRole === 'petshop') {
        todayProfit = parseFloat(todayRec?.petshop_profit ?? '0');
        monthProfit = parseFloat(monthRec?.month_petshop ?? '0');
      } else if (userRole === 'investor') {
        todayProfit = parseFloat(todayRec?.investor_profit ?? '0');
        monthProfit = parseFloat(monthRec?.month_investor ?? '0');
      } else if (userRole === 'promoter') {
        todayProfit = parseFloat(todayRec?.promoter_profit ?? '0');
        monthProfit = parseFloat(monthRec?.month_promoter ?? '0');
      } else if (userRole === 'manufacturer') {
        todayProfit = parseFloat(todayRec?.manufacturer_profit ?? '0');
        monthProfit = parseFloat(monthRec?.month_manufacturer ?? '0');
      } else {
        // 管理员看总营业额
        todayProfit = todayRevenue;
        monthProfit = monthRevenue;
      }

      return {
        id: m.id,
        machineNo: m.machine_no,
        name: m.name,
        status: m.status,
        address: m.address,
        installDate: m.install_date,
        petshopName: m.petshop_name,
        petshopUserName: m.petshop_user_name,
        investorUserName: m.investor_user_name,
        promoterUserName: m.promoter_user_name,
        manufacturerUserName: m.manufacturer_user_name,
        ratios: {
          petshop: parseFloat(m.petshop_ratio ?? '40'),
          investor: parseFloat(m.investor_ratio ?? '35'),
          promoter: parseFloat(m.promoter_ratio ?? '10'),
          manufacturer: parseFloat(m.manufacturer_ratio ?? '15'),
        },
        today: {
          revenue: todayRevenue,
          myProfit: todayProfit,
        },
        month: {
          revenue: monthRevenue,
          myProfit: monthProfit,
        },
      };
    });
  }),

  // 录入/更新每日营业记录（管理员或宠物店）
  upsertDailyRecord: protectedProcedure
    .input(z.object({
      machineId: z.number(),
      recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      revenue: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库连接失败' });

      // 权限检查：超级管理员或该机器的宠物店
      const [machineRows] = await dbConn.execute(
        `SELECT * FROM pet_machines WHERE id = ? LIMIT 1`,
        [input.machineId]
      ) as any[];
      const machine = (machineRows as any[])[0];
      if (!machine) throw new TRPCError({ code: 'NOT_FOUND', message: '机器不存在' });

      const isSuperAdmin = ctx.user.role === 'super_admin';
      const isPetshop = machine.petshop_user_id === ctx.user.id;
      if (!isSuperAdmin && !isPetshop) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权录入此机器数据' });
      }

      // 根据分润比例计算各方利润
      const rev = input.revenue;
      const petshopProfit = (rev * parseFloat(machine.petshop_ratio ?? '40')) / 100;
      const investorProfit = (rev * parseFloat(machine.investor_ratio ?? '35')) / 100;
      const promoterProfit = (rev * parseFloat(machine.promoter_ratio ?? '10')) / 100;
      const manufacturerProfit = (rev * parseFloat(machine.manufacturer_ratio ?? '15')) / 100;

      await dbConn.execute(
        `INSERT INTO pet_daily_records
          (machine_id, record_date, revenue, petshop_profit, investor_profit, promoter_profit, manufacturer_profit, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          revenue = VALUES(revenue),
          petshop_profit = VALUES(petshop_profit),
          investor_profit = VALUES(investor_profit),
          promoter_profit = VALUES(promoter_profit),
          manufacturer_profit = VALUES(manufacturer_profit),
          updated_at = NOW()`,
        [input.machineId, input.recordDate, rev.toFixed(2),
         petshopProfit.toFixed(2), investorProfit.toFixed(2),
         promoterProfit.toFixed(2), manufacturerProfit.toFixed(2),
         ctx.user.id]
      );
      return { success: true };
    }),

  // 管理员：获取所有用户列表（用于分配角色）
  adminGetUsers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
    const dbConn = await getDbConnection();
    if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const [rows] = await dbConn.execute(
      `SELECT u.id, u.name, u.username, u.phone,
        pr.role as pet_role, pr.remark as pet_remark
       FROM users u
       LEFT JOIN pet_user_roles pr ON u.id = pr.user_id
       ORDER BY u.id DESC
       LIMIT 200`
    ) as any[];
    return rows as any[];
  }),

  // 管理员：设置用户角色
  adminSetUserRole: protectedProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(['manufacturer', 'investor', 'promoter', 'petshop']).nullable(),
      remark: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      if (input.role === null) {
        await dbConn.execute(`DELETE FROM pet_user_roles WHERE user_id = ?`, [input.userId]);
      } else {
        await dbConn.execute(
          `INSERT INTO pet_user_roles (user_id, role, remark) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role), remark = VALUES(remark), updated_at = NOW()`,
          [input.userId, input.role, input.remark ?? null]
        );
      }
      return { success: true };
    }),

  // 管理员：添加/编辑机器
  adminUpsertMachine: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      machineNo: z.string().min(1),
      name: z.string().optional(),
      petshopUserId: z.number().nullable().optional(),
      petshopName: z.string().optional(),
      investorUserId: z.number().nullable().optional(),
      promoterUserId: z.number().nullable().optional(),
      manufacturerUserId: z.number().nullable().optional(),
      petshopRatio: z.number().optional(),
      investorRatio: z.number().optional(),
      promoterRatio: z.number().optional(),
      manufacturerRatio: z.number().optional(),
      status: z.enum(['active', 'inactive', 'maintenance']).optional(),
      installDate: z.string().optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      if (input.id) {
        await dbConn.execute(
          `UPDATE pet_machines SET
            machine_no=?, name=?, petshop_user_id=?, petshop_name=?,
            investor_user_id=?, promoter_user_id=?, manufacturer_user_id=?,
            petshop_ratio=?, investor_ratio=?, promoter_ratio=?, manufacturer_ratio=?,
            status=?, install_date=?, address=?, updated_at=NOW()
           WHERE id=?`,
          [input.machineNo, input.name ?? null, input.petshopUserId ?? null, input.petshopName ?? null,
           input.investorUserId ?? null, input.promoterUserId ?? null, input.manufacturerUserId ?? null,
           input.petshopRatio ?? 40, input.investorRatio ?? 35, input.promoterRatio ?? 10, input.manufacturerRatio ?? 15,
           input.status ?? 'active', input.installDate ?? null, input.address ?? null, input.id]
        );
      } else {
        await dbConn.execute(
          `INSERT INTO pet_machines
            (machine_no, name, petshop_user_id, petshop_name, investor_user_id, promoter_user_id, manufacturer_user_id,
             petshop_ratio, investor_ratio, promoter_ratio, manufacturer_ratio, status, install_date, address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [input.machineNo, input.name ?? null, input.petshopUserId ?? null, input.petshopName ?? null,
           input.investorUserId ?? null, input.promoterUserId ?? null, input.manufacturerUserId ?? null,
           input.petshopRatio ?? 40, input.investorRatio ?? 35, input.promoterRatio ?? 10, input.manufacturerRatio ?? 15,
           input.status ?? 'active', input.installDate ?? null, input.address ?? null]
        );
      }
      return { success: true };
    }),

  // 获取机器的历史营业记录（最近30天）
  getMachineHistory: protectedProcedure
    .input(z.object({ machineId: z.number() }))
    .query(async ({ ctx, input }) => {
      const dbConn = await getDbConnection();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const [rows] = await dbConn.execute(
        `SELECT * FROM pet_daily_records WHERE machine_id = ? ORDER BY record_date DESC LIMIT 30`,
        [input.machineId]
      ) as any[];
      return rows as any[];
    }),
});
