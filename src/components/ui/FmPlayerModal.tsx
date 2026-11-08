"use client";

/**
 * 首页「伴游FM / 旅途FM」按钮内的面板。
 * 内容与 /fm「完整体验」页完全一致（唱片机播放器 + 上方节目单），点按钮立即出声。
 */
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFmPrefetch } from "@/lib/fm-player";
import { FmExperience } from "@/components/ui/FmExperience";

export function FmPlayerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 面板未打开时也预取音频，保证点击按钮瞬间出声
  useFmPrefetch();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* 遮罩 */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-zinc-900/45 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* 面板：移动端全屏，桌面居中，内容即「完整体验」界面 */}
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full h-full md:h-auto md:w-[min(94vw,520px)] md:max-h-[94vh] md:rounded-[28px] bg-[#FFF9F6] shadow-[0_30px_80px_rgba(0,0,0,0.28)] overflow-y-auto flex flex-col"
          >
            <FmExperience variant="modal" initialView="player" onBack={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
