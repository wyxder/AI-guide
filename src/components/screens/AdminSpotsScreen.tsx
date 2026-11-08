"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Search, MapPin, Star, Eye, EyeOff, X, Save, QrCode } from "lucide-react";
import { toast } from "sonner";
import { request } from "@/lib/api/request";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };

interface Spot {
  id: number; name: string; category: string; description: string;
  imageUrl: string; duration: number; distance: string; rating: number;
  visitCount: number; isActive: boolean; tags: string[];
  location?: { lat: number; lng: number };
}

const CAT_LABELS: Record<string, string> = {
  cultural: "人文", nature: "自然", history: "历史", family: "亲子",
};
const CAT_COLORS: Record<string, string> = {
  cultural: "#22D3EE", nature: "#3DFDC0", history: "#A78BFA", family: "#FFC857",
};

function SpotFormModal({
  spot, onClose, onSave,
}: {
  spot: Partial<Spot> | null;
  onClose: () => void;
  onSave: (data: Partial<Spot>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Spot>>(spot ?? { category: "cultural", isActive: true, duration: 30, tags: [] });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof Spot, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const toastId = toast.loading("正在上传封面图...");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        set("imageUrl", data.url);
        toast.success("上传成功！");
      } else {
        toast.error(data.error || "上传失败");
      }
    } catch {
      toast.error("上传出错");
    } finally {
      toast.dismiss(toastId);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }} transition={SPRING}
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,30,42,0.86)", maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #1A4F62" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-noto-serif)", color: "#DDF4FF" }}>
            {spot?.id ? "编辑景点" : "新增景点"}
          </h3>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onClose}>
            <X className="w-5 h-5" style={{ color: "#6E93A8" }} />
          </motion.button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>景点名称 *</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF", fontSize: 16 }}
              value={form.name ?? ""} onChange={(e) => set("name", e.target.value)}
              placeholder="如：揽月亭" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>分类</label>
              <select className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF" }}
                value={form.category ?? "cultural"} onChange={(e) => set("category", e.target.value)}>
                {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>建议游览（分钟）</label>
              <input type="number" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF", fontSize: 16 }}
                value={form.duration ?? 30} onChange={(e) => set("duration", Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>距入口距离</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF", fontSize: 16 }}
              value={form.distance ?? ""} onChange={(e) => set("distance", e.target.value)}
              placeholder="如：500m from entrance" />
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>景点介绍 *</label>
            <textarea rows={4} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF", fontSize: 16 }}
              value={form.description ?? ""} onChange={(e) => set("description", e.target.value)}
              placeholder="介绍景点历史、特色与游览要点…" />
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1.5 block" style={{ color: "#6E93A8" }}>景点封面图片</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <div className="flex gap-3 items-center">
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-dashed border-[#1A4F62] flex items-center justify-center bg-[#0B2534] relative group flex-shrink-0">
                {form.imageUrl ? (
                  <>
                    <img src={form.imageUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => set("imageUrl", "")}
                      className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                      删除
                    </button>
                  </>
                ) : (
                  <Plus className="w-4 h-4 text-[#6E93A8]" />
                )}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0B2534] text-[#A8CFE0] border border-[#1A4F62] hover:bg-[#123B4E] transition-colors">
                上传图片
              </button>
              <input className="flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF" }}
                value={form.imageUrl ?? ""} onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="或输入图片URL..." />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium mb-1 block" style={{ color: "#6E93A8" }}>地图坐标 (经纬度) *</label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <span className="text-[10px] text-[#6E93A8]">经度 Lng</span>
                <input type="number" step="0.000001" className="w-full px-3 py-2 rounded-xl text-sm outline-none font-mono"
                  style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF" }}
                  value={form.location?.lng ?? 120.150000}
                  onChange={(e) => set("location", { lat: form.location?.lat ?? 30.250000, lng: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <span className="text-[10px] text-[#6E93A8]">纬度 Lat</span>
                <input type="number" step="0.000001" className="w-full px-3 py-2 rounded-xl text-sm outline-none font-mono"
                  style={{ background: "#0B2534", border: "1px solid #1A4F62", color: "#DDF4FF" }}
                  value={form.location?.lat ?? 30.250000}
                  onChange={(e) => set("location", { lat: parseFloat(e.target.value) || 0, lng: form.location?.lng ?? 120.150000 })} />
              </div>
            </div>

            <div className="relative w-full h-36 rounded-xl overflow-hidden border border-[#1A4F62] bg-[#061B26] cursor-crosshair group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                const lng = 120.120000 + x * 0.05;
                const lat = 30.270000 - y * 0.03;
                set("location", { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) });
              }}>
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#164C5E_1px,transparent_1px)] [background-size:16px_16px]" />
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <path d="M 0,90 Q 80,40 180,110 T 360,50" fill="none" stroke="#1C7FA8" strokeWidth="12" strokeLinecap="round" />
                <path d="M 50,0 Q 120,80 200,60 T 400,120" fill="none" stroke="#1F5B70" strokeWidth="4" strokeDasharray="6,6" />
                <circle cx="80" cy="40" r="14" fill="#164C5E" stroke="#22D3EE" strokeWidth="1" />
                <text x="80" y="44" fontSize="8" textAnchor="middle" fill="#A8CFE0" fontWeight="bold">翠湖</text>
                <circle cx="280" cy="70" r="14" fill="#3A2E12" stroke="#FFC857" strokeWidth="1" />
                <text x="280" y="74" fontSize="8" textAnchor="middle" fill="#FFC857" fontWeight="bold">揽月峰</text>
              </svg>

              {(() => {
                const lng = form.location?.lng ?? 120.150000;
                const lat = form.location?.lat ?? 30.250000;
                const xPct = ((lng - 120.120000) / 0.05) * 100;
                const yPct = ((30.270000 - lat) / 0.03) * 100;
                return (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                    style={{ left: `${Math.max(0, Math.min(100, xPct))}%`, top: `${Math.max(0, Math.min(100, yPct))}%` }}>
                    <MapPin className="w-5 h-5 text-[#FF6B81] drop-shadow" />
                  </div>
                );
              })()}
              <div className="absolute bottom-2 right-2 bg-[#0A2130]/85 text-[8px] px-1.5 py-0.5 rounded border border-[#1A4F62] text-[#22D3EE]">
                点击选取位置
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[11px] font-medium" style={{ color: "#6E93A8" }}>上架状态</label>
            <motion.button whileTap={{ scale: 0.92 }}
              onClick={() => set("isActive", !form.isActive)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{
                background: form.isActive ? "rgba(34,211,238,0.1)" : "rgba(110,147,168,0.1)",
                color: form.isActive ? "#22D3EE" : "#6E93A8",
                border: `1px solid ${form.isActive ? "rgba(34,211,238,0.3)" : "#1A4F62"}`,
              }}>
              {form.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {form.isActive ? "已上架" : "已下架"}
            </motion.button>
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#0B2534", color: "#A8CFE0", border: "1px solid #1A4F62" }}>
            取消
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }}
            disabled={saving || !form.name}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(135deg,#9DF7FF,#17B6D6)", color: "#032029", opacity: saving ? 0.7 : 1 }}>
            <Save className="w-4 h-4" />
            {saving ? "保存中…" : "保存景点"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AdminSpotsScreen() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editSpot, setEditSpot] = useState<Partial<Spot> | null | undefined>(undefined);
  const [catFilter, setCatFilter] = useState("all");
  const csvRef = useRef<HTMLInputElement>(null);

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("正在导入景点数据...");
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length <= 1) {
        toast.dismiss(toastId);
        toast.error("CSV文件为空或只有表头");
        return;
      }

      const parseCSVLine = (text: string) => {
        const result = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = "";
          } else {
            cur += char;
          }
        }
        result.push(cur.trim());
        return result;
      };

      let successCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 1 || !cols[0]) continue;

        const name = cols[0];
        const category = cols[1] || "cultural";
        const description = cols[2] || "";
        const duration = parseInt(cols[3]) || 30;
        const distance = cols[4] || "";
        const lat = parseFloat(cols[5]) || 30.25;
        const lng = parseFloat(cols[6]) || 120.15;

        await request("/api/admin/spots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            description,
            duration,
            distance,
            location: { lat, lng },
            isActive: true,
          }),
        });
        successCount++;
      }

      toast.dismiss(toastId);
      toast.success(`成功导入 ${successCount} 个景点！`);
      fetchSpots();
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error(`导入失败: ${err.message || err}`);
    }
  };

  const fetchSpots = () => {
    setLoading(true);
    request("/api/spots").then((r) => r.json())
      .then((d) => { setSpots(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { setTimeout(fetchSpots, 0); }, []);

  const filtered = spots.filter((s) => {
    const q = search.toLowerCase();
    return (catFilter === "all" || s.category === catFilter)
      && (s.name.includes(q) || s.description?.toLowerCase().includes(q));
  });

  const handleSave = async (data: Partial<Spot>) => {
    if (data.id) {
      await request(`/api/admin/spots/${data.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      toast.success("景点已更新");
    } else {
      await request("/api/admin/spots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      toast.success("景点已新增");
    }
    fetchSpots();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除该景点？")) return;
    await request(`/api/admin/spots/${id}`, { method: "DELETE" });
    toast.success("已删除");
    fetchSpots();
  };

  const handleToggle = async (spot: Spot) => {
    await request(`/api/admin/spots/${spot.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !spot.isActive }),
    });
    fetchSpots();
  };

  const downloadQR = async (id: number, name: string) => {
    const res = await request(`/api/admin/spots/${id}/qrcode`);
    const { qrcode } = await res.json();
    const a = document.createElement("a"); a.href = qrcode; a.download = `${name}_导览二维码.png`; a.click();
    toast.success(`${name} 二维码已下载`);
  };

  return (
    <div className="tech-screen min-h-svh">
      <div className="w-full px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-noto-serif)", color: "#DDF4FF" }}>
              景点管理
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "#6E93A8" }}>
              共 {spots.length} 个景点 · {spots.filter((s) => s.isActive).length} 个上架中
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => csvRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(8,30,42,0.86)", border: "1px solid #1A4F62", color: "#A8CFE0" }}>
              批量导入 (CSV)
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => setEditSpot(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "linear-gradient(135deg,#9DF7FF,#17B6D6)", color: "#032029", boxShadow: "0 0 18px rgba(92,236,255,0.35)" }}>
              <Plus className="w-4 h-4" />新增景点
            </motion.button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[180px]"
            style={{ background: "rgba(8,30,42,0.86)", border: "1px solid #1A4F62" }}>
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#6E93A8" }} />
            <input className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "#DDF4FF", fontSize: 16 }}
              placeholder="搜索景点名称或描述…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {[{ id: "all", label: "全部" }, ...Object.entries(CAT_LABELS).map(([k, v]) => ({ id: k, label: v }))].map((c) => (
              <motion.button key={c.id} whileTap={{ scale: 0.93 }} onClick={() => setCatFilter(c.id)}
                className="px-3 py-2 rounded-xl text-xs font-medium"
                style={{
                  background: catFilter === c.id ? "rgba(92,236,255,0.12)" : "rgba(8,30,42,0.86)",
                  color: catFilter === c.id ? "#22D3EE" : "#6E93A8",
                  border: `1px solid ${catFilter === c.id ? "rgba(34,211,238,0.3)" : "#1A4F62"}`,
                }}>
                {c.label}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1A4F62", background: "rgba(8,30,42,0.86)" }}>
          <div className="grid gap-0 divide-y" style={{ borderColor: "#1A4F62" }}>
            {/* Head */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-3"
              style={{ background: "#0B2534" }}>
              {["景点名称 / 介绍", "分类 / 评分", "游览时长 / 状态", "操作"].map((h) => (
                <span key={h} className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6E93A8" }}>{h}</span>
              ))}
            </div>

            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="px-5 py-4">
                  <div className="skeleton h-4 w-1/3 rounded mb-2" />
                  <div className="skeleton h-3 w-2/3 rounded" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">🗺️</p>
                <p className="text-sm" style={{ color: "#6E93A8" }}>暂无景点数据</p>
              </div>
            ) : filtered.map((spot) => (
              <motion.div key={spot.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="grid md:grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-4 items-center animate-fade-in"
                style={{ opacity: spot.isActive ? 1 : 0.55 }}>
                {/* Name + desc with Enlarged Cover Image */}
                <div className="flex items-center gap-4">
                  <div className="w-28 h-18 rounded-xl overflow-hidden flex-shrink-0 border border-[#123B4E]"
                    style={{ background: "#0B2534" }}>
                    {spot.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={spot.imageUrl} alt={spot.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl bg-[#0B2534] opacity-40">🏞️</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[13px] line-clamp-1" style={{ color: "#DDF4FF" }}>{spot.name}</p>
                    <p className="text-[11px] line-clamp-2 mt-1 leading-relaxed" style={{ color: "#6E93A8" }}>{spot.description}</p>
                  </div>
                </div>
                {/* Category + rating */}
                <div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                    style={{ background: `${CAT_COLORS[spot.category] ?? "#22D3EE"}15`, color: CAT_COLORS[spot.category] ?? "#22D3EE" }}>
                    {CAT_LABELS[spot.category] ?? spot.category}
                  </span>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Star className="w-3.5 h-3.5" fill="#FFC857" style={{ color: "#FFC857" }} />
                    <span className="text-[11px] font-bold" style={{ color: "#A8CFE0" }}>{(spot.rating / 10).toFixed(1)}</span>
                    <span className="text-[10px]" style={{ color: "#6E93A8" }}>· {spot.visitCount} 次</span>
                  </div>
                </div>
                {/* Duration + status */}
                <div>
                  <p className="text-[12px] font-medium" style={{ color: "#A8CFE0" }}>游览约 {spot.duration} 分钟</p>
                  <motion.button whileTap={{ scale: 0.93 }} onClick={() => handleToggle(spot)}
                    className="mt-1.5 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
                    style={{
                      background: spot.isActive ? "rgba(34,211,238,0.06)" : "rgba(110,147,168,0.06)",
                      color: spot.isActive ? "#22D3EE" : "#6E93A8",
                      borderColor: spot.isActive ? "rgba(34,211,238,0.15)" : "rgba(110,147,168,0.15)",
                    }}>
                    {spot.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {spot.isActive ? "已上架" : "已下架"}
                  </motion.button>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <motion.button whileTap={{ scale: 0.88 }}
                    onClick={() => downloadQR(spot.id, spot.name)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border"
                    style={{ background: "rgba(255,200,87,0.06)", color: "#FFC857", borderColor: "rgba(255,200,87,0.15)" }}
                    title="下载二维码">
                    <QrCode className="w-3.5 h-3.5" />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.88 }}
                    onClick={() => setEditSpot(spot)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border"
                    style={{ background: "rgba(34,211,238,0.06)", color: "#22D3EE", borderColor: "rgba(34,211,238,0.15)" }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.88 }}
                    onClick={() => handleDelete(spot.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border"
                    style={{ background: "rgba(255,107,129,0.05)", color: "#FF6B81", borderColor: "rgba(255,107,129,0.12)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {editSpot !== undefined && (
          <SpotFormModal
            spot={editSpot}
            onClose={() => setEditSpot(undefined)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
