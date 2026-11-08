"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { QrCode, Download } from "lucide-react";
import { toast } from "sonner";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };

interface Spot { id: number; name: string; category: string }

export function QRCodePanel({ theme = "light" }: { theme?: "light" | "tech" }) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/spots").then((r) => r.json())
      .then((d) => { setSpots(Array.isArray(d) ? d.slice(0, 6) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const generateQR = async (spotId: number) => {
    setGenerating((prev) => ({ ...prev, [spotId]: true }));
    try {
      const res = await fetch(`/api/admin/spots/${spotId}/qrcode`);
      const data = await res.json();
      setQrMap((prev) => ({ ...prev, [spotId]: data.qrcode ?? data.qrCode }));
      toast.success("二维码生成成功");
    } catch {
      toast.error("生成失败");
    } finally {
      setGenerating((prev) => ({ ...prev, [spotId]: false }));
    }
  };

  const downloadQR = (spotName: string, qrData: string) => {
    const link = document.createElement("a");
    link.href = qrData;
    link.download = `${spotName}-二维码.png`;
    link.click();
    toast.success("二维码已下载");
  };

  const isTech = theme === "tech";

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <QrCode className="w-[18px] h-[18px]" style={{ color: isTech ? "#5CECFF" : "#4F6F52" }} />
          <h3 className="tech-panel-title" style={{ fontSize: 13 }}>
            景点导览二维码
          </h3>
        </div>
        {isTech && <span className="tech-chip">扫码讲解</span>}
      </div>

      {loading ? (
        <div className={isTech ? "tech-skeleton h-32" : "skeleton h-32 rounded-xl"} />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {spots.map((spot, i) => (
            <motion.div key={spot.id}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING, delay: i * 0.05 }}
              className={isTech ? "p-3 space-y-2" : "card-ink p-3 space-y-2"}
              style={isTech ? {
                background: "rgba(9,40,54,0.55)",
                border: "1px solid rgba(64,224,255,0.18)",
                clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
              } : undefined}>
              <p className="text-[12px] font-medium truncate" style={{ color: isTech ? "#A8D0E2" : "#1E2522" }}>{spot.name}</p>
              {qrMap[spot.id] ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrMap[spot.id]} alt={spot.name}
                    className="w-full rounded-lg"
                    style={isTech ? { border: "1px solid rgba(64,224,255,0.3)", background: "#04141d" } : undefined} />
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => downloadQR(spot.name, qrMap[spot.id])}
                    className="w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                    style={isTech
                      ? { background: "rgba(92,236,255,0.12)", color: "#5CECFF", border: "1px solid rgba(92,236,255,0.32)" }
                      : { background: "rgba(79,111,82,0.1)", color: "#4F6F52" }}>
                    <Download className="w-3 h-3" /> 下载
                  </motion.button>
                </div>
              ) : (
                <motion.button whileTap={{ scale: 0.94 }} onClick={() => generateQR(spot.id)}
                  disabled={generating[spot.id]}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold"
                  style={isTech
                    ? { background: "linear-gradient(135deg, #9DF7FF, #0FB9D6)", color: "#032029", boxShadow: "0 0 14px rgba(92,236,255,0.35)" }
                    : { background: "linear-gradient(135deg,#4F6F52,#3A5240)", color: "white" }}>
                  {generating[spot.id] ? "生成中..." : "生成二维码"}
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <p className="text-[10px] px-0.5" style={{ color: isTech ? "#4E7F94" : "#8F9F8F" }}>
        游客扫码可直达景点详情并自动开启语音讲解
      </p>
    </div>
  );
}
