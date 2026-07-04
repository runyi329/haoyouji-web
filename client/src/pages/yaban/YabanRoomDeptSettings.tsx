/**
 * 牙伴齿科管理 - 诊室科室设置
 * 路由：/yaban/settings/room-dept
 * 功能：两个 Tab（诊室 / 科室）
 *   上部：名称管理（增删改）
 *   下部：大类可见性开关（独立，控制预约页面是否显示该大类）
 */
import { useState, useRef, useEffect } from "react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import YabanClinicHeader from "./YabanClinicHeader";

type Tab = "room" | "dept";

function getCurrentTenantId(): number | undefined {
  try {
    const v = localStorage.getItem("yaban_current_tenant");
    return v != null ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

interface Item { id: number; name: string; sort: number; isActive: boolean }

function NameList({
  items,
  label,
  onAdd,
  onUpdate,
  onDelete,
}: {
  items: Item[];
  label: string;
  onAdd: (name: string) => void;
  onUpdate: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setEditVal(item.name);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const confirmEdit = () => {
    if (!editVal.trim()) { toast.error("名称不能为空"); return; }
    onUpdate(editId!, editVal.trim());
    setEditId(null);
  };

  const startAdd = () => {
    setAdding(true);
    setNewName("");
    setTimeout(() => addRef.current?.focus(), 50);
  };

  const confirmAdd = () => {
    if (!newName.trim()) { toast.error("名称不能为空"); return; }
    onAdd(newName.trim());
    setAdding(false);
    setNewName("");
  };

  return (
    <div>
      <div className="bg-white rounded overflow-hidden shadow-sm">
        {items.length === 0 && !adding && (
          <div className="py-8 text-center text-sm text-gray-400">暂无数据，点击下方「+」添加</div>
        )}
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 ${idx < items.length - 1 || adding ? "border-b border-gray-100" : ""}`}
          >
            {editId === item.id ? (
              <>
                <input
                  ref={editRef}
                  className="flex-1 border border-[#1E88D6] rounded px-3 py-1.5 text-sm outline-none"
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditId(null); }}
                />
                <button onClick={confirmEdit} className="p-1.5 rounded bg-[#1E88D6] text-white">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-gray-100 text-gray-500">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-800">{item.name}</span>
                <button onClick={() => startEdit(item)} className="p-1.5 rounded text-[#1E88D6] hover:bg-blue-50">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`确定删除「${item.name}」？`)) onDelete(item.id);
                  }}
                  className="p-1.5 rounded text-red-400 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        ))}
        {adding && (
          <div className="flex items-center gap-3 px-4 py-3">
            <input
              ref={addRef}
              className="flex-1 border border-[#1E88D6] rounded px-3 py-1.5 text-sm outline-none"
              placeholder="输入名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
            />
            <button onClick={confirmAdd} className="p-1.5 rounded bg-[#1E88D6] text-white">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setAdding(false); setNewName(""); }} className="p-1.5 rounded bg-gray-100 text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {!adding && (
        <button
          onClick={startAdd}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded bg-white text-[#1E88D6] text-sm font-medium shadow-sm active:bg-gray-50"
        >
          <Plus className="w-4 h-4" />
          添加{label}
        </button>
      )}
    </div>
  );
}

/** 大类可见性开关（独立于名称列表） */
function VisibilitySwitch({
  label,
  visible,
  onToggle,
}: {
  label: string;
  visible: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="bg-white rounded shadow-sm">
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-800">
            在预约页面显示「{label}」选项
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {visible
              ? `患者预约时可以选择${label}`
              : `患者预约时不显示${label}选项`}
          </div>
        </div>
        <span className={`text-xs mr-2 font-medium ${visible ? "text-[#1E88D6]" : "text-gray-400"}`}>
          {visible ? "显示" : "隐藏"}
        </span>
        {/* 拨动开关 */}
        <button
          onClick={() => onToggle(!visible)}
          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
            visible ? "bg-[#1E88D6]" : "bg-gray-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              visible ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default function YabanRoomDeptSettings() {
  const goBack = useSmartBack("/yaban/settings/website-features");
  const [tab, setTab] = useState<Tab>("room");
  const tenantId = getCurrentTenantId();

  // 诊室名称
  const roomQuery = trpc.yabanRoom.list.useQuery({ tenantId });
  const roomCreate = trpc.yabanRoom.create.useMutation({ onSuccess: () => { roomQuery.refetch(); toast.success("已添加"); } });
  const roomUpdate = trpc.yabanRoom.update.useMutation({ onSuccess: () => { roomQuery.refetch(); toast.success("已保存"); } });
  const roomDelete = trpc.yabanRoom.delete.useMutation({ onSuccess: () => { roomQuery.refetch(); toast.success("已删除"); } });

  // 科室名称
  const deptQuery = trpc.yabanDept.list.useQuery({ tenantId });
  const deptCreate = trpc.yabanDept.create.useMutation({ onSuccess: () => { deptQuery.refetch(); toast.success("已添加"); } });
  const deptUpdate = trpc.yabanDept.update.useMutation({ onSuccess: () => { deptQuery.refetch(); toast.success("已保存"); } });
  const deptDelete = trpc.yabanDept.delete.useMutation({ onSuccess: () => { deptQuery.refetch(); toast.success("已删除"); } });

  // 大类可见性（本地 state 驱动，乐观更新）
  const clinicQuery = trpc.yabanClinic.myClinic.useQuery(
    tenantId ? { tenantId } : undefined
  );
  const clinicData = clinicQuery.data?.clinic as any;
  const [showRoom, setShowRoom] = useState<boolean>(true);
  const [showDept, setShowDept] = useState<boolean>(true);
  const [visibilityInited, setVisibilityInited] = useState(false);

  // 服务端数据加载完成后初始化（tenantId 变化时重新初始化）
  useEffect(() => {
    if (clinicData) {
      setShowRoom(clinicData.showRoom !== false);
      setShowDept(clinicData.showDept !== false);
      setVisibilityInited(true);
    }
  }, [clinicData?.showRoom, clinicData?.showDept, tenantId]);

  const updateVisibility = trpc.yabanClinic.updateVisibility.useMutation({
    onSuccess: () => toast.success("已保存"),
    onError: (e) => {
      // 回滚：重新从服务端读取
      clinicQuery.refetch().then((res) => {
        const d = res.data?.clinic as any;
        if (d) { setShowRoom(d.showRoom !== false); setShowDept(d.showDept !== false); }
      });
      toast.error("保存失败", { description: e.message });
    },
  });

  const rooms = (roomQuery.data ?? []) as Item[];
  const depts = (deptQuery.data ?? []) as Item[];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">诊室科室设置</span>
        </div>
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-4">
        <div className="flex bg-white rounded-md overflow-hidden shadow-sm">
          {(["room", "dept"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-[#1E88D6] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {t === "room" ? "诊室" : "科室"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 上部：名称管理 */}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2 px-1">
            {tab === "room" ? "诊室" : "科室"}名称管理
          </div>
          {tab === "room" ? (
            <NameList
              items={rooms}
              label="诊室"
              onAdd={(name) => roomCreate.mutate({ name, tenantId })}
              onUpdate={(id, name) => roomUpdate.mutate({ id, name, tenantId })}
              onDelete={(id) => roomDelete.mutate({ id, tenantId })}
            />
          ) : (
            <NameList
              items={depts}
              label="科室"
              onAdd={(name) => deptCreate.mutate({ name, tenantId })}
              onUpdate={(id, name) => deptUpdate.mutate({ id, name, tenantId })}
              onDelete={(id) => deptDelete.mutate({ id, tenantId })}
            />
          )}
        </div>

        {/* 下部：大类可见性（始终同时显示两个开关，不跟随 Tab） */}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2 px-1">
            预约页面可见性
          </div>
          <div className="space-y-2">
            <VisibilitySwitch
              label="诊室"
              visible={showRoom}
              onToggle={(v) => { setShowRoom(v); updateVisibility.mutate({ tenantId, showRoom: v }); }}
            />
            <VisibilitySwitch
              label="科室"
              visible={showDept}
              onToggle={(v) => { setShowDept(v); updateVisibility.mutate({ tenantId, showDept: v }); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
