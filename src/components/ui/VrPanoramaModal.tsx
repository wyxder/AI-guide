"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Glasses, Loader2, Maximize2, Minimize2, X } from "lucide-react";

const PANORAMA_URL = "https://0cbfzbxod.wasee.com/m/0cbfzbxod";

interface VrPanoramaModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * VR 720° 全景漫游弹窗
 * 行程规划与首页共用同一套界面与交互。
 */
export function VrPanoramaModal({ open, onClose }: VrPanoramaModalProps) {
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // 打开期间锁定页面滚动
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // 原生全屏状态与浏览器同步（Esc 退出时也能正确复位）
  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === cardRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
      return;
    }
    if (fullscreen) {
      setFullscreen(false);
      return;
    }
    // 先铺满视口，再尝试升级为浏览器原生全屏
    setFullscreen(true);
    try {
      cardRef.current?.requestFullscreen?.().catch(() => {});
    } catch {
      /* 忽略不支持原生全屏的环境 */
    }
  };

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setFullscreen(false);
    // 下次打开时重新显示加载态
    setLoading(true);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className={`fixed inset-0 z-[140] flex items-center justify-center ${
            fullscreen ? "bg-black p-0" : "bg-black/85 backdrop-blur-md p-3 sm:p-6"
          }`}
        >
          <motion.div
            ref={cardRef}
            initial={{ scale: 0.94, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={`flex flex-col overflow-hidden bg-[#0F1412] border-white/15 shadow-2xl ${
              fullscreen
                ? "absolute inset-0 z-10 w-full h-full max-w-none max-h-none rounded-none border-0"
                : "w-full max-w-5xl h-[85dvh] sm:h-[80vh] max-h-[900px] rounded-2xl sm:rounded-3xl border"
            }`}
          >
            <div
              className={`items-center justify-between px-4 py-3 sm:px-5 border-b border-white/10 flex-shrink-0 ${
                fullscreen ? "hidden" : "flex"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-400/40 flex items-center justify-center flex-shrink-0">
                  <Glasses className="w-4.5 h-4.5 text-violet-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm text-white tracking-wide" style={{ fontFamily: "var(--font-noto-serif)" }}>
                    VR 720° 全景漫游
                  </h3>
                  <p className="text-[10px] text-white/50 mt-0.5 truncate">拖动画面或滑动屏幕，环视景区实景</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={toggleFullscreen}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
                  aria-label={fullscreen ? "退出全屏" : "全屏预览"}
                  title={fullscreen ? "退出全屏" : "全屏预览"}
                >
                  {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
                  aria-label="关闭 VR 全景"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 bg-black">
              {loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0F1412] text-white">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-300" />
                  <span className="text-xs text-white/60">正在加载 VR 全景场景…</span>
                </div>
              )}
              <iframe
                src={PANORAMA_URL}
                name="waseePanorama"
                title="VR 720° 全景漫游"
                loading="eager"
                allow="accelerometer; gyroscope; magnetometer; xr-spatial-tracking; fullscreen"
                allowFullScreen
                scrolling="no"
                onLoad={() => setLoading(false)}
                className="absolute inset-0 w-full h-full border-0"
              />

              {!fullscreen ? (
                <button
                  onClick={toggleFullscreen}
                  className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold text-white bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/20 shadow-lg transition-all cursor-pointer"
                  aria-label="全屏预览 VR 全景"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  全屏预览
                </button>
              ) : (
                <button
                  onClick={toggleFullscreen}
                  className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold text-white bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/20 shadow-lg transition-all cursor-pointer"
                  aria-label="退出全屏预览"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  退出全屏
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
