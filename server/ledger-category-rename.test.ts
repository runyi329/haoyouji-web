import { describe, expect, it, vi, beforeEach } from "vitest";

const { referenceHelper } = vi.hoisted(() => ({ referenceHelper: vi.fn() }));
// AF behavior has its own audit/test module. Here verify its transaction boundary.
vi.mock("./ledger-category-rename-references", () => ({
  renameCurrentTagReferences: referenceHelper,
}));
import { renameLedgerCategoryPreservingConfig } from "./ledger-category-rename";

type Row = Record<string, any>;
type State = Record<string, Row[]>;
const SCOPED_REFERENCES = [
  "ledger_tag_config",
  "tag_interest_periods",
  "tag_interest_operation_logs",
  "ledger_admin_notes",
  "ledger_margin_logs",
  "ai_wallet_project_holds",
  "ai_wallet_project_hold_migrations",
  "dividend_records",
];
const FIXED_REFERENCES = [
  "ledger37_dividend_recovery_actions",
  "ledger37_dividend_batch_actions",
  "ledger37_pause_settlement_actions",
];
const ALL_REFERENCES = [
  ...SCOPED_REFERENCES,
  ...FIXED_REFERENCES,
  "ai_wallet_project_hold_transfers",
];

/** Offline executor: no real driver, network, DB module or DDL is imported. */
class MemoryConnection {
  state: State;
  schema: Record<string, string[]> = {};
  calls: { sql: string; params: any[] }[] = [];
  active = false;
  beginCount = 0;
  commitCount = 0;
  rollbackCount = 0;
  release = vi.fn();
  snapshot?: State;
  fail?: (sql: string, params: any[]) => boolean;
  failCommit = false;
  failRollback = false;
  beforeLedgerLock?: () => void;
  insensitiveNames = false;

  constructor(state: State) {
    this.state = structuredClone(state);
    for (const [table, rows] of Object.entries(state)) {
      this.schema[table] = [...new Set(rows.flatMap(row => Object.keys(row)))];
    }
  }
  async beginTransaction() {
    expect(this.active).toBe(false);
    this.beginCount++;
    this.snapshot = structuredClone(this.state);
    this.active = true;
  }
  async commit() {
    if (this.failCommit) throw new Error("injected commit failure");
    expect(this.active).toBe(true);
    this.commitCount++;
    this.active = false;
  }
  async rollback() {
    this.rollbackCount++;
    if (this.failRollback) throw new Error("injected rollback failure");
    this.state = structuredClone(this.snapshot!);
    this.active = false;
  }
  equals(a: unknown, b: unknown, column: string) {
    if (
      this.insensitiveNames &&
      (column === "name" || column.endsWith("tag_name"))
    ) {
      return (
        String(a)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() ===
        String(b)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
      );
    }
    return a === b;
  }
  predicate(where: string, params: any[]) {
    const clauses = where
      .replace(/(?: ORDER BY id)?(?: FOR UPDATE)?$/, "")
      .split(" AND ");
    expect(clauses.length).toBe(params.length);
    return (row: Row) =>
      clauses.every((clause, index) => {
        const match = /^(\w+) (=|<>) \?$/.exec(clause);
        if (!match) throw new Error(`Unsupported WHERE: ${clause}`);
        const equal = this.equals(row[match[1]], params[index], match[1]);
        return match[2] === "=" ? equal : !equal;
      });
  }
  async execute(statement: string, params: any[] = []) {
    expect(this.active).toBe(true);
    const sql = statement.replace(/`/g, "").replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params: [...params] });
    if (this.fail?.(sql, params)) throw new Error("injected executor failure");
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|DELETE|REPLACE)\b/i);
    if (sql.includes("INFORMATION_SCHEMA.COLUMNS")) {
      return [
        params.flatMap(table =>
          (this.schema[table] ?? []).map(columnName => ({
            tableName: table,
            columnName,
          }))
        ),
        [],
      ];
    }
    const select = /^SELECT (.+) FROM (\w+) WHERE (.+)$/.exec(sql);
    if (select) {
      const [, fields, table, where] = select;
      if (!(table in this.state))
        throw new Error("missing table execution was not skipped");
      if (table === "ledgers") this.beforeLedgerLock?.();
      const isLocator = table === "ledger_categories" && where === "id = ?";
      expect(sql.endsWith(" FOR UPDATE")).toBe(!isLocator);
      const rows = this.state[table].filter(this.predicate(where, params));
      if (sql.includes(" ORDER BY id ")) rows.sort((a, b) => a.id - b.id);
      return [
        structuredClone(
          rows.map(row =>
            Object.fromEntries(
              fields.split(", ").map(field => [field, row[field]])
            )
          )
        ),
        [],
      ];
    }
    const update = /^UPDATE (\w+) SET (.+) WHERE (.+)$/.exec(sql);
    if (update) {
      const [, table, assignments, where] = update;
      const columns = assignments.split(", ").map(assignment => {
        const match = /^(\w+) = \?$/.exec(assignment);
        if (!match) throw new Error(`Unsupported assignment: ${assignment}`);
        return match[1];
      });
      const allowed =
        table === "ledger_members"
          ? ["initial_balances"]
          : table === "ledger_categories"
            ? ["name", "icon", "color"]
            : ["tag_name", "source_tag_name", "target_tag_name"];
      for (const column of columns) expect(allowed).toContain(column);
      const rows = this.state[table].filter(
        this.predicate(where, params.slice(columns.length))
      );
      for (const row of rows)
        columns.forEach((column, index) => {
          row[column] = params[index];
        });
      return [{ affectedRows: rows.length }, []];
    }
    throw new Error(`Unsupported offline SQL: ${sql}`);
  }
}

const rawBalances = String.raw`{
  "A": "000123.4500",
  "A__interest": "{\"id\":9007199254740993,\"amount\":\"1.230000\",\"date\":\"2026-01-01\"}",
  "A__margin_by_coin": "{ \"CNY\": [ {\"id\":\"m-1\",\"amount\":\"12.3400\",\"currency\":\"CNY\",\"date\":\"2026-02-03\"} ] }",
  "A__observation": { "notes": "A is historical", "nested": {"A": "not a top-level tag"} },
  "A__margins": [{"id":"m-2","amount":999999999999999999999999.123456,"asset":"USDT","recorded_at":"2026-03-04"}],
  "A__pause": "2026-06-07",
  "A__pause_date": null,
  "A__ratio": 1e-12,
  "A__future_unknown__suffix": "unchanged value",
  "other": "A__interest",
  "AB": "not in A namespace",
  "__proto__": {"pollution": false}
}`;

function fixture(ledgerId = 37, raw: any = rawBalances): MemoryConnection {
  const history = {
    id: "9007199254740993",
    user_id: 37,
    amount: "00123.450000",
    asset_code: "USDT",
    status: "settled",
    request_id: "request-original",
    wallet_request_id: "wallet-original",
    note: "A remains in historical prose",
    notes: "original A text",
    created_at: "2026-03-04 01:02:03",
    margin_entry_id: "margin-original",
    wallet_entry_id: "9223372036854775807",
  };
  const state: State = {
    ledgers: [{ id: ledgerId }, { id: 99 }],
    ledger_categories: [
      {
        id: 1,
        ledgerId,
        name: "A",
        parentId: 10,
        icon: "old-icon",
        color: "old-color",
        type: "expense",
        accounting_mode: "manual_balance",
        sortOrder: 7,
      },
      { id: 2, ledgerId, name: "Else", parentId: null },
      { id: 3, ledgerId: 99, name: "B", parentId: null },
      { id: 4, ledgerId: 99, name: "A", parentId: null },
    ],
    ledger_members: [
      { id: 10, ledgerId, initial_balances: raw, userId: 37, role: "owner" },
      { id: 11, ledgerId, initial_balances: "{}", userId: 38 },
      { id: 12, ledgerId: 99, initial_balances: rawBalances, userId: 37 },
    ],
  };
  for (const table of SCOPED_REFERENCES) {
    state[table] = [
      {
        ...history,
        ledger_id: ledgerId,
        tag_name: "A",
        interest_rate: "2.30000",
        interest_start_date: "2026-01-02",
        before_data: '{"tag":"A"}',
        after_data: "original raw snapshot",
        margin_by_coin: '{ "CNY": "100.00000" }',
      },
      { ...history, id: "different-ledger", ledger_id: 99, tag_name: "A" },
    ];
  }
  for (const table of FIXED_REFERENCES)
    state[table] = [
      {
        ...history,
        tag_name: "A",
        pause_date: "2026-04-05",
        margin_releases_json: '{"tag":"A","amount":"1.00"}',
      },
    ];
  state.ai_wallet_project_hold_transfers = [
    {
      ...history,
      ledger_id: ledgerId,
      source_tag_name: "A",
      target_tag_name: "Else",
      target_margin_entry_id: "t-1",
    },
    {
      ...history,
      id: "transfer-2",
      ledger_id: ledgerId,
      source_tag_name: "Else",
      target_tag_name: "A",
    },
    {
      ...history,
      id: "transfer-3",
      ledger_id: 99,
      source_tag_name: "A",
      target_tag_name: "A",
    },
  ];
  return new MemoryConnection(state);
}

beforeEach(() => {
  referenceHelper.mockReset();
  referenceHelper.mockImplementation(async (connection: MemoryConnection) => {
    expect(connection.active).toBe(true);
    expect(
      connection.calls.filter(call =>
        call.sql.startsWith("UPDATE ledger_categories")
      )
    ).toHaveLength(0);
  });
});

async function expectRollback(
  connection: MemoryConnection,
  message: RegExp = /./
) {
  const before = structuredClone(connection.state);
  await expect(
    renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" })
  ).rejects.toThrow(message);
  expect(connection.state).toEqual(before);
  expect(connection.rollbackCount).toBe(1);
  expect(connection.commitCount).toBe(0);
  expect(connection.release).not.toHaveBeenCalled();
}

describe("renameLedgerCategoryPreservingConfig offline transaction", () => {
  it("preserves exact member value bytes, saved interest/config and every unknown suffix", async () => {
    const connection = fixture();
    const before = structuredClone(connection.state);
    expect(
      await renameLedgerCategoryPreservingConfig(connection, 1, {
        name: " B ",
        icon: "new-icon",
      })
    ).toBe(true);
    // Only key tokens differ, preserving even large numeric literals and formatting.
    expect(connection.state.ledger_members[0].initial_balances).toBe(
      rawBalances.replace(/^(  )"A(?=__|":)/gm, '$1"B')
    );
    expect(connection.state.ledger_members[1]).toEqual(
      before.ledger_members[1]
    );
    expect(connection.state.ledger_members[2]).toEqual(
      before.ledger_members[2]
    );
    for (const table of SCOPED_REFERENCES) {
      expect(connection.state[table][0]).toEqual({
        ...before[table][0],
        tag_name: "B",
      });
      expect(connection.state[table][1]).toEqual(before[table][1]);
    }
    for (const table of FIXED_REFERENCES)
      expect(connection.state[table][0]).toEqual({
        ...before[table][0],
        tag_name: "B",
      });
    expect(connection.state.ai_wallet_project_hold_transfers).toEqual([
      { ...before.ai_wallet_project_hold_transfers[0], source_tag_name: "B" },
      { ...before.ai_wallet_project_hold_transfers[1], target_tag_name: "B" },
      before.ai_wallet_project_hold_transfers[2],
    ]);
    expect(connection.state.ledger_categories[0]).toEqual({
      ...before.ledger_categories[0],
      name: "B",
      icon: "new-icon",
    });
    expect(connection.calls[0].sql).toBe(
      "SELECT id, ledgerId, name, parentId FROM ledger_categories WHERE id = ?"
    );
    expect(connection.calls[1].sql).toBe(
      "SELECT id FROM ledgers WHERE id = ? FOR UPDATE"
    );
    expect(connection.calls[2].sql).toBe(
      "SELECT id, ledgerId, name, parentId FROM ledger_categories WHERE ledgerId = ? ORDER BY id FOR UPDATE"
    );
    expect(connection.calls.at(-1)!.sql).toMatch(/^UPDATE ledger_categories /);
    expect(connection.commitCount).toBe(1);
    expect(connection.release).not.toHaveBeenCalled();
    expect(referenceHelper).toHaveBeenCalledWith(
      connection,
      37,
      "A",
      "B",
      expect.any(Map)
    );
    const metadata = connection.calls.find(call =>
      call.sql.includes("INFORMATION_SCHEMA.COLUMNS")
    )!;
    expect(metadata.params).toEqual(
      expect.arrayContaining([
        "ledger_orders",
        "ledger_order_participants",
        ...ALL_REFERENCES,
      ])
    );
  });

  it.each([
    [
      "A",
      "A__B",
      '{ "A": "1.00", "A__ratio": 2, "A__pause": "date" }',
      '{ "A__B": "1.00", "A__B__ratio": 2, "A__B__pause": "date" }',
    ],
    [
      "A__B",
      "A",
      '{ "A__B": "1.00", "A__B__ratio": 2, "A__B__B": "source child" }',
      '{ "A": "1.00", "A__ratio": 2, "A__B": "source child" }',
    ],
  ])(
    "simultaneously moves overlapping %s -> %s namespaces",
    async (oldName, newName, raw, expected) => {
      const connection = fixture(37, raw);
      connection.state.ledger_categories[0].name = oldName;
      for (const table of ALL_REFERENCES) {
        for (const row of connection.state[table]) {
          for (const column of [
            "tag_name",
            "source_tag_name",
            "target_tag_name",
          ]) {
            if (row[column] === "A") row[column] = oldName;
          }
        }
      }
      await renameLedgerCategoryPreservingConfig(connection, 1, {
        name: newName,
      });
      expect(connection.state.ledger_members[0].initial_balances).toBe(
        expected
      );
    }
  );

  it.each([
    '{"A":1,"A__B":1}',
    '{"A__B__interest":"new content","A__pause":"old content"}',
  ])(
    "refuses A -> A__B when any destination namespace content already exists %#",
    async raw => {
      const connection = fixture(37, raw);
      const before = structuredClone(connection.state);
      await expect(
        renameLedgerCategoryPreservingConfig(connection, 1, { name: "A__B" })
      ).rejects.toThrow(/配置空间/);
      expect(connection.state).toEqual(before);
      expect(connection.calls.some(call => call.sql.startsWith("UPDATE"))).toBe(
        false
      );
    }
  );

  it("rejects case-only renames before changing any configuration", async () => {
    const connection = fixture();
    connection.insensitiveNames = true;
    const before = structuredClone(connection.state);
    await expect(
      renameLedgerCategoryPreservingConfig(connection, 1, { name: "a" })
    ).rejects.toThrow(/大小写/);
    expect(connection.state).toEqual(before);
    expect(connection.rollbackCount).toBe(1);
    expect(connection.calls.some(call => call.sql.startsWith("UPDATE"))).toBe(
      false
    );
  });

  it.each([
    " ",
    "{bad}",
    "null",
    "[]",
    '[{"A":1}]',
    '"text"',
    "42",
    "true",
    undefined,
    { A: 1 },
  ])(
    "rejects malformed/non-object member configuration %# before any write",
    async raw => {
      const connection = fixture();
      connection.state.ledger_members[1].initial_balances = raw;
      await expectRollback(connection, /initial_balances/);
      expect(
        connection.calls.filter(call => call.sql.startsWith("UPDATE"))
      ).toHaveLength(0);
    }
  );

  it.each([null, ""])("preserves a legitimate unconfigured member %# without fabricating or restoring config", async raw => {
    const connection = fixture();
    connection.state.ledger_members[1].initial_balances = raw;
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
    expect(connection.state.ledger_members[1].initial_balances).toBe(raw);
    expect(connection.calls.some(call => call.sql.startsWith("UPDATE ledger_members") && call.params[1] === 11)).toBe(false);
  });

  it("accepts empty objects and untouched values without fabricating config", async () => {
    const connection = fixture(37, " { } \n");
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
    expect(connection.state.ledger_members[0].initial_balances).toBe(" { } \n");
    expect(
      connection.calls.some(call =>
        call.sql.startsWith("UPDATE ledger_members")
      )
    ).toBe(false);
  });

  it("rejects duplicate JSON keys including escaped equivalents", async () => {
    const connection = fixture(37, String.raw`{"A":1,"\u0041":2}`);
    await expectRollback(connection, /重复键/);
  });

  it("handles escaped top-level keys and escaped new names without changing nested values", async () => {
    const connection = fixture(
      37,
      String.raw`{"\u0041__unknown":"quote\" brace } comma ,","A":{"\u0041":1},"other":[{},"a,b"]}`
    );
    const newName = 'B"\\';
    await renameLedgerCategoryPreservingConfig(connection, 1, {
      name: newName,
    });
    expect(connection.state.ledger_members[0].initial_balances).toBe(
      `{${JSON.stringify(newName + "__unknown")}:"quote\\\" brace } comma ,",${JSON.stringify(newName)}:{"\\u0041":1},"other":[{},"a,b"]}`
    );
  });

  it.each([
    '{"A":"same","B":"same"}',
    '{"A":1,"B__future":2}',
    '{"B__pause":null}',
  ])(
    "conservatively rejects destination residual data even equal values %#",
    async raw => {
      await expectRollback(fixture(37, raw), /配置空间/);
    }
  );

  it("rejects unrelated residue when collapsing A__B back to A", async () => {
    const connection = fixture(37, '{"A__B":1,"A__ratio":2}');
    connection.state.ledger_categories[0].name = "A__B";
    const before = structuredClone(connection.state);
    await expect(
      renameLedgerCategoryPreservingConfig(connection, 1, { name: "A" })
    ).rejects.toThrow(/配置空间/);
    expect(connection.state).toEqual(before);
  });

  it.each(["B", "A"])(
    "rejects another same-ledger category sharing %s globally regardless of parent",
    async name => {
      const connection = fixture();
      connection.state.ledger_categories[1].name = name;
      await expectRollback(connection, name === "A" ? /共享/ : /占用/);
    }
  );

  it("also respects DB case/accent-insensitive name conflicts", async () => {
    const connection = fixture();
    connection.insensitiveNames = true;
    connection.state.ledger_categories[1].name = "b";
    await expectRollback(connection, /占用/);
  });

  it("re-reads target old name after locking the ledger and all categories", async () => {
    const connection = fixture(
      37,
      '{"Fresh": "original", "Fresh__observation": [1,2]}'
    );
    connection.beforeLedgerLock = () => {
      connection.state.ledger_categories[0].name = "Fresh";
    };
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
    expect(connection.state.ledger_members[0].initial_balances).toBe(
      '{"B": "original", "B__observation": [1,2]}'
    );
    expect(referenceHelper).toHaveBeenCalledWith(
      connection,
      37,
      "Fresh",
      "B",
      expect.any(Map)
    );
  });

  it("same-name no-op still updates optional icon/color without parsing or migrating JSON", async () => {
    const connection = fixture(37, null);
    const before = structuredClone(connection.state);
    await renameLedgerCategoryPreservingConfig(connection, 1, {
      name: " A ",
      icon: "",
      color: "#123",
    });
    expect(connection.state).toEqual({
      ...before,
      ledger_categories: [
        { ...before.ledger_categories[0], icon: "", color: "#123" },
        ...before.ledger_categories.slice(1),
      ],
    });
    expect(referenceHelper).not.toHaveBeenCalled();
    expect(
      connection.calls.filter(call => call.sql.startsWith("UPDATE"))
    ).toHaveLength(1);
  });

  it("same-name no-op without optional fields retains all category settings", async () => {
    const connection = fixture();
    const before = structuredClone(connection.state);
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "A" });
    expect(connection.state).toEqual(before);
  });

  it("same-name no-op refuses ambiguous existing shared names", async () => {
    const connection = fixture();
    connection.state.ledger_categories[1].name = "A";
    await expect(
      renameLedgerCategoryPreservingConfig(connection, 1, { name: "A" })
    ).rejects.toThrow(/共享/);
    expect(connection.rollbackCount).toBe(1);
  });

  it("rejects target residual ledger_tag_config without reconstructing it", async () => {
    const connection = fixture();
    connection.state.ledger_tag_config.push({
      ledger_id: 37,
      tag_name: "B",
      margin_by_coin: "original",
    });
    await expectRollback(connection, /残留 ledger_tag_config/);
    expect(connection.calls.some(call => call.sql.startsWith("UPDATE"))).toBe(
      false
    );
  });

  it.each(ALL_REFERENCES)(
    "keeps both names' original records and refuses any destination residue in %s",
    async table => {
      const connection = fixture();
      const original = connection.state[table][0];
      const residual: Row = {
        ...original,
        id: "new-user-saved-content",
        tag_name: "B",
      };
      if (table === "ai_wallet_project_hold_transfers") {
        residual.source_tag_name = "B";
        residual.target_tag_name = "Else";
        delete residual.tag_name;
      }
      connection.state[table].push(residual);
      await expectRollback(connection, /残留/);
      expect(connection.calls.some(call => call.sql.startsWith("UPDATE"))).toBe(
        false
      );
    }
  );

  it.each(ALL_REFERENCES)(
    "skips absent optional %s using metadata",
    async table => {
      const connection = fixture();
      delete connection.state[table];
      delete connection.schema[table];
      await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
      expect(
        connection.calls.some(
          call =>
            call.sql.includes(`FROM ${table} `) ||
            call.sql.startsWith(`UPDATE ${table} `)
        )
      ).toBe(false);
      expect(connection.commitCount).toBe(1);
    }
  );

  it.each(ALL_REFERENCES)(
    "fails if present optional %s lacks a required name column",
    async table => {
      const connection = fixture();
      const missing =
        table === "ai_wallet_project_hold_transfers"
          ? "target_tag_name"
          : "tag_name";
      connection.schema[table] = connection.schema[table].filter(
        column => column !== missing
      );
      await expectRollback(connection, /缺少必要列/);
      expect(connection.calls.some(call => call.sql.startsWith("UPDATE"))).toBe(
        false
      );
    }
  );

  it.each([...SCOPED_REFERENCES, "ai_wallet_project_hold_transfers"])(
    "fails when scoped %s lacks ledger_id",
    async table => {
      const connection = fixture();
      connection.schema[table] = connection.schema[table].filter(
        column => column !== "ledger_id"
      );
      await expectRollback(connection, /缺少必要列/);
    }
  );

  it.each(FIXED_REFERENCES)(
    "fails when fixed-37 %s lacks user_id",
    async table => {
      const connection = fixture();
      connection.schema[table] = connection.schema[table].filter(
        column => column !== "user_id"
      );
      await expectRollback(connection, /缺少必要列/);
    }
  );

  it("works with all optional tables absent and no DDL", async () => {
    const connection = fixture();
    for (const table of ALL_REFERENCES) {
      delete connection.state[table];
      delete connection.schema[table];
    }
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
    expect(connection.state.ledger_categories[0].name).toBe("B");
  });

  it("does not touch fixed-37 tables for a different ledger or mutate other ledger rows", async () => {
    const connection = fixture(52);
    const before = structuredClone(connection.state);
    await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
    for (const table of FIXED_REFERENCES) {
      expect(connection.state[table]).toEqual(before[table]);
      expect(
        connection.calls.some(
          call =>
            call.sql.includes(`FROM ${table} `) ||
            call.sql.startsWith(`UPDATE ${table} `)
        )
      ).toBe(false);
    }
    for (const table of SCOPED_REFERENCES)
      expect(connection.state[table][1]).toEqual(before[table][1]);
    expect(connection.state.ledger_categories.slice(1)).toEqual(
      before.ledger_categories.slice(1)
    );
    expect(connection.state.ledger_members[2]).toEqual(
      before.ledger_members[2]
    );
  });

  it.each([
    "INFORMATION_SCHEMA.COLUMNS",
    "SELECT tag_name FROM ledger_tag_config",
    "UPDATE ledger_members",
    "UPDATE ledger_tag_config",
    "UPDATE tag_interest_periods",
    "UPDATE ai_wallet_project_hold_transfers",
    "UPDATE ledger_categories",
  ])(
    "does not swallow %s errors; rolls back any partial writes",
    async failure => {
      const connection = fixture();
      connection.fail = sql => sql.includes(failure);
      await expectRollback(connection, /injected executor failure/);
    }
  );

  it("rolls back a later member write failure after the first member was mutated", async () => {
    const connection = fixture();
    connection.state.ledger_members[1].initial_balances =
      '{"A__pause": "date"}';
    connection.fail = (sql, params) =>
      sql.startsWith("UPDATE ledger_members") && params[1] === 11;
    await expectRollback(connection, /injected/);
    expect(
      connection.calls.filter(call =>
        call.sql.startsWith("UPDATE ledger_members")
      )
    ).toHaveLength(2);
  });

  it("rolls back helper failure in the same transaction before category update", async () => {
    const connection = fixture();
    referenceHelper.mockRejectedValueOnce(new Error("AF helper failure"));
    await expectRollback(connection, /AF helper failure/);
    expect(
      connection.calls.some(call =>
        call.sql.startsWith("UPDATE ledger_categories")
      )
    ).toBe(false);
  });

  it("rolls back commit failure", async () => {
    const connection = fixture();
    connection.failCommit = true;
    await expectRollback(connection, /commit failure/);
  });

  it("reports both original error and rollback failure without releasing connection", async () => {
    const connection = fixture();
    connection.fail = sql => sql.includes("INFORMATION_SCHEMA.COLUMNS");
    connection.failRollback = true;
    try {
      await renameLedgerCategoryPreservingConfig(connection, 1, { name: "B" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(
        (error as AggregateError).errors.map(cause => cause.message)
      ).toEqual(["injected executor failure", "injected rollback failure"]);
    }
    expect(connection.release).not.toHaveBeenCalled();
  });

  it.each(["", " ", "x".repeat(51), null, 42])(
    "rejects invalid names %# before starting transaction",
    async name => {
      const connection = fixture();
      await expect(
        renameLedgerCategoryPreservingConfig(connection, 1, { name } as any)
      ).rejects.toThrow(/1–50/);
      expect(connection.beginCount).toBe(0);
    }
  );

  it("accepts 50 Unicode characters", async () => {
    const connection = fixture(37, "{}");
    await renameLedgerCategoryPreservingConfig(connection, 1, {
      name: "测".repeat(50),
    });
    expect(connection.state.ledger_categories[0].name).toBe("测".repeat(50));
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid category ID %s",
    async id => {
      const connection = fixture();
      await expect(
        renameLedgerCategoryPreservingConfig(connection, id, { name: "B" })
      ).rejects.toThrow(/分类 ID/);
      expect(connection.beginCount).toBe(0);
    }
  );

  it("rolls back nonexistent categories", async () => {
    const connection = fixture();
    connection.state.ledger_categories = [];
    await expectRollback(connection, /分类不存在/);
  });

  it("rolls back missing parent ledger", async () => {
    const connection = fixture();
    connection.state.ledgers = [];
    await expectRollback(connection, /账本不存在/);
  });
});
