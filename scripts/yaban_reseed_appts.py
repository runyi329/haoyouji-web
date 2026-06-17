#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
牙伴演示院（tenant_id=9999）预约重生脚本。
目标：让日历热力图（基准 cnt/8）呈现自然的忙闲深浅层次。
仅重建预约（yaban_appointment），不动医生/排班/成员。

每日量级分布（按热力图基准 cnt/8 设计，让蓝→白→红都出现）：
  周日休息：0
  约30% 日子：1~3 条（浅蓝/空闲）
  约35% 日子：4~6 条（中间过渡）
  约25% 日子：7~10 条（偏暖/较忙）
  约10% 日子：11~16 条（红/约满）
覆盖范围：今天往前 30 天 + 往后 14 天。
输出：一段可直接执行的 SQL（DELETE + 批量 INSERT）到 stdout。
"""
import random
import sys
from datetime import date, timedelta

TENANT = 9999
random.seed(20260617)  # 固定种子，结果可复现

DOCTORS = ["王医生", "李医生", "张医生", "刘医生", "陈医生"]
CUSTOMERS = ["赵敏", "孙浩", "周婷", "吴磊", "郑雪"]
PROJECTS = ["复诊检查", "洁牙", "补牙", "根管治疗", "拔牙", "戴牙", "备牙取模", "种植", "拆线", "全口洁治"]
ROOMS = ["1诊室", "2诊室", "3诊室", "VIP诊室"]
DURATIONS = [30, 30, 30, 45, 60, 60, 90]  # 偏向 30/60 分钟

# 候选起始时段（09:00~17:30，半小时颗粒），分钟数
SLOTS = [h * 60 + m for h in range(9, 18) for m in (0, 30) if h * 60 + m <= 17 * 60 + 30]


def hm(mins):
    return f"{mins // 60:02d}:{mins % 60:02d}"


def pick_daily_count():
    r = random.random()
    if r < 0.30:
        return random.randint(1, 3)
    if r < 0.65:
        return random.randint(4, 6)
    if r < 0.90:
        return random.randint(7, 10)
    return random.randint(11, 16)


def esc(s):
    return s.replace("'", "''")


def main():
    today = date.today()
    start = today - timedelta(days=30)
    end = today + timedelta(days=14)

    rows = []
    d = start
    while d <= end:
        if d.weekday() == 6:  # 周日休息（Python: Monday=0, Sunday=6）
            d += timedelta(days=1)
            continue
        cnt = pick_daily_count()
        # 当天为每位医生准备一份可用时段，避免同一医生时段重叠
        used = {doc: set() for doc in DOCTORS}
        made = 0
        attempts = 0
        while made < cnt and attempts < cnt * 6:
            attempts += 1
            doc = random.choice(DOCTORS)
            slot = random.choice(SLOTS)
            dur = random.choice(DURATIONS)
            # 重叠检查（同医生）
            conflict = False
            for (s0, e0) in used[doc]:
                if slot < e0 and slot + dur > s0:
                    conflict = True
                    break
            if conflict:
                continue
            used[doc].add((slot, slot + dur))
            cust = random.choice(CUSTOMERS)
            proj = random.choice(PROJECTS)
            room = random.choice(ROOMS)
            # 过去的预约带完成/到院/取消等状态，未来的为已预约
            if d < today:
                status = random.choices(
                    ["done", "left", "paid", "treated", "missed", "cancelled"],
                    weights=[40, 15, 15, 15, 8, 7],
                )[0]
            elif d == today:
                status = random.choices(
                    ["booked", "confirmed", "treating", "done"],
                    weights=[40, 30, 15, 15],
                )[0]
            else:
                status = random.choices(["booked", "confirmed"], weights=[70, 30])[0]
            rows.append((
                TENANT, esc(cust), esc(doc), esc(room), esc(proj),
                d.isoformat(), hm(slot), hm(slot + dur), dur, status,
            ))
            made += 1
        d += timedelta(days=1)

    out = []
    out.append("START TRANSACTION;")
    out.append(f"DELETE FROM yaban_appointment WHERE tenant_id={TENANT};")
    # 批量插入
    CHUNK = 200
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        vals = []
        for r in chunk:
            tenant, cust, doc, room, proj, dt, st, et, dur, status = r
            vals.append(
                f"({tenant},'{cust}','{doc}','{room}','{proj}','{dt}','{st}','{et}',{dur},'{status}',NOW())"
            )
        out.append(
            "INSERT INTO yaban_appointment "
            "(tenant_id, patient_name, doctor, room, project, appoint_date, appoint_time, end_time, duration, status, created_at) VALUES "
            + ",".join(vals) + ";"
        )
    out.append("COMMIT;")
    # 校验输出
    out.append(
        f"SELECT appoint_date, COUNT(*) cnt FROM yaban_appointment WHERE tenant_id={TENANT} "
        "GROUP BY appoint_date ORDER BY appoint_date;"
    )
    sys.stdout.write("\n".join(out) + "\n")
    sys.stderr.write(f"[gen] total appointments: {len(rows)}\n")


if __name__ == "__main__":
    main()
