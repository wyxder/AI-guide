"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, PhoneOff, GripHorizontal } from "lucide-react";
import { toast } from "sonner";

interface Props {
  recording: boolean;
  recognizing: boolean;
  recordSeconds: number;
  onTalkToggle: () => void;
  onHangUp: () => void;
  /** 接通瞬间回调，用于播报欢迎语 */
  onConnect?: () => void;
}

function formatDuration(total: number) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/** 摄像头小窗：9:16 竖屏小窗，可拖动，关闭即释放摄像头 */
export function VideoCallPreview({
  active,
  width = 72,
  height = 128,
  className = "",
  style,
}: {
  active: boolean;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFailed(true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setFailed(true);
        toast.error("无法开启摄像头，请检查浏览器权限");
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.06}
      whileDrag={{ scale: 1.04, boxShadow: "0 14px 32px rgba(0,0,0,0.5)" }}
      className={`absolute z-30 pointer-events-auto overflow-hidden rounded-[18px] bg-black/40 ${className}`}
      style={{
        width,
        height,
        border: "1.5px solid rgba(255,255,255,0.4)",
        boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
        touchAction: "none",
        cursor: "grab",
        ...style,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover pointer-events-none"
        style={{ transform: "scaleX(-1)" }}
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-1.5 text-center text-[9px] leading-tight text-white/75 bg-black/55 pointer-events-none">
          摄像头
          <br />
          不可用
        </div>
      )}
      {/* 拖动提示 */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-7 h-3 rounded-full flex items-center justify-center pointer-events-none"
        style={{ background: "rgba(0,0,0,0.35)" }}>
        <GripHorizontal className="w-3 h-3 text-white/80" />
      </div>
      <div
        className="absolute left-1 bottom-1 rounded px-1 py-[1px] text-[8px] text-white/90 pointer-events-none"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        我的画面
      </div>
    </motion.div>
  );
}

/** 数字人导游「语音通话」底部控制面板：仅语音说话 + 挂断，无白色遮罩 */
export function VoiceCallDock({
  recording,
  recognizing,
  recordSeconds,
  onTalkToggle,
  onHangUp,
  onConnect,
}: Props) {
  const connectCallbackRef = useRef(onConnect);
  const firedRef = useRef(false);

  // 识别进度（0-95 平滑推进，识别完成后补到 100 再淡出）
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const hadRecognizingRef = useRef(false);

  useEffect(() => {
    connectCallbackRef.current = onConnect;
  }, [onConnect]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      connectCallbackRef.current?.();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (recognizing) {
      hadRecognizingRef.current = true;
      const raf = requestAnimationFrame(() => {
        setShowProgress(true);
        setProgress(6);
      });
      const id = window.setInterval(() => {
        setProgress((p) => Math.min(95, p + (p < 60 ? 4 : 1)));
      }, 100);
      return () => {
        cancelAnimationFrame(raf);
        window.clearInterval(id);
      };
    }
    if (hadRecognizingRef.current) {
      const raf = requestAnimationFrame(() => setProgress(100));
      const id = window.setTimeout(() => {
        hadRecognizingRef.current = false;
        setShowProgress(false);
        setProgress(0);
      }, 420);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(id);
      };
    }
  }, [recognizing]);

  return (
    <div className="relative flex flex-col items-center">
      {/* 仅在聆听 / 识别时出现的动效提示，紧贴按钮 */}
      <AnimatePresence>
        {(recording || showProgress) && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="mb-2.5 flex items-center gap-2 px-3.5 h-8 rounded-full"
            style={{
              background: "rgba(6,14,18,0.36)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "0 4px 18px rgba(0,0,0,0.28)",
            }}
          >
            {showProgress ? (
              <>
                {/* 百分比环形进度 */}
                <div className="relative w-[22px] h-[22px] flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="asr-ring" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8FF7F0" />
                        <stop offset="55%" stopColor="#46F2E6" />
                        <stop offset="100%" stopColor="#7C9CFF" />
                      </linearGradient>
                    </defs>
                    <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.4" />
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="url(#asr-ring)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeDasharray={56.55}
                      animate={{ strokeDashoffset: 56.55 * (1 - progress / 100) }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    />
                  </svg>
                  <motion.span
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{ opacity: progress >= 100 ? 1 : [0.65, 1, 0.65] }}
                    transition={{ duration: 1.4, repeat: progress >= 100 ? 0 : Infinity }}
                  >
                    {progress >= 100 && (
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </motion.span>
                </div>
                <motion.span
                  className="text-[11.5px] font-semibold bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(90deg,#8FF7F0,#FFFFFF,#8FF7F0)",
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                  }}
                  animate={{ backgroundPositionX: ["0%", "200%"] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
                >
                  {progress >= 100 ? "识别完成" : "正在识别语音"}
                </motion.span>
                <span className="text-[11.5px] font-bold tabular-nums text-white/80">
                  {progress}%
                </span>
              </>
            ) : (
              <>
                <motion.span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "#46F2E6" }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="text-[11.5px] font-medium text-white/85">正在聆听，请说话…</span>
                <span className="text-[11.5px] font-semibold tabular-nums text-white/50">
                  {formatDuration(recordSeconds)}
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end justify-center gap-16 pb-1">
        {/* 语音说话 */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
            {/* 点击后才出现的水波涟漪 */}
            {recording &&
              [0, 1, 2].map((i) => (
                <motion.span
                  key={`ripple-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{ width: 64, height: 64, border: "2px solid rgba(72,236,225,0.7)" }}
                  animate={{ scale: [1, 2.05], opacity: [0.75, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: i * 0.5 }}
                />
              ))}
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={onTalkToggle}
              className="relative z-10 rounded-full flex items-center justify-center cursor-pointer"
              style={{
                width: 64,
                height: 64,
                background: recording
                  ? "linear-gradient(150deg,#46F2E6 0%,#00A09B 55%,#007C7A 100%)"
                  : "linear-gradient(150deg,#5CEBE1 0%,#12B5B0 60%,#078C88 100%)",
                border: "1.5px solid rgba(255,255,255,0.28)",
                boxShadow: recording
                  ? "inset 0 2px 6px rgba(255,255,255,0.45), 0 10px 26px rgba(0,180,175,0.55)"
                  : "inset 0 2px 6px rgba(255,255,255,0.4), 0 8px 22px rgba(0,160,155,0.42)",
                color: "white",
              }}
            >
              {recognizing ? (
                <motion.span
                  className="w-[22px] h-[22px] rounded-full"
                  style={{ background: "conic-gradient(from 0deg,#FFFFFF,#8FF7F0,#FFFFFF)" }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                />
              ) : recording ? (
                <span className="flex items-center gap-[4px] h-[22px]">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span
                      key={i}
                      className="w-[3.5px] rounded-full bg-white"
                      style={{ height: 22, transformOrigin: "center" }}
                      animate={{ scaleY: [0.3, 0.9, 0.4, 1, 0.3] }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                    />
                  ))}
                </span>
              ) : (
                <Mic className="w-[26px] h-[26px]" />
              )}
            </motion.button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-white/85">
            {recognizing ? "识别中" : recording ? "结束说话" : "语音说话"}
          </span>
        </div>

        {/* 挂断 */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              onClick={onHangUp}
              className="relative z-10 rounded-full flex items-center justify-center cursor-pointer"
              style={{
                width: 64,
                height: 64,
                background: "linear-gradient(150deg,#FF7A70 0%,#F04236 55%,#C81E14 100%)",
                border: "1.5px solid rgba(255,255,255,0.26)",
                boxShadow:
                  "inset 0 2px 6px rgba(255,255,255,0.4), 0 8px 22px rgba(214,45,36,0.48)",
                color: "white",
              }}
            >
              <PhoneOff className="w-[26px] h-[26px]" />
            </motion.button>
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-white/85">挂断</span>
        </div>
      </div>
    </div>
  );
}
