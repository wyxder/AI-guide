"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { destroyXingyunAgent, mountXingyunAgent, type XingyunAgentProfile } from "@/lib/xingyun/agent";

interface Props {
  height?: number;
  /** 星云驱动应用档案：shixian=诗仙（默认），xiaomei=小美 */
  profile?: XingyunAgentProfile;
  /**
   * 画面缩放系数（1 = 原始大小）。
   * 星云控制台的「透明背景-半身」构图会把形象绘制得略大于容器，
   * 适当小于 1 可让半身像完整落在容器内、不被裁切。
   */
  scale?: number;
}

const PROFILE_TEXT: Record<XingyunAgentProfile, { name: string; loading: string; failed: string }> = {
  shixian: { name: "诗仙", loading: "正在唤醒诗仙…", failed: "诗仙加载失败" },
  xiaomei: { name: "小美", loading: "正在唤醒小美…", failed: "小美加载失败" },
};

/**
 * 魔珐星云具身智能体 3D 渲染容器（诗仙 / 小美共用）。
 * 容器必须有明确宽高，否则 SDK 画布会折叠为零尺寸。
 */
export function XingyunAvatar({ height = 500, profile = "shixian", scale = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const text = PROFILE_TEXT[profile];

  useEffect(() => {
    mountedRef.current = true;
    const element = containerRef.current;
    if (!element) return;

    setReady(false);
    setError(null);
    setProgress(0);

    mountXingyunAgent(element, {
      onProgress: (value) => { if (mountedRef.current) setProgress(value); },
      onState: (state) => {
        if (!mountedRef.current) return;
        if (state === "running" || state === "ready") setReady(true);
      },
      onError: (message) => { if (mountedRef.current) setError(message); },
    }, { profile })
      .then(() => { if (mountedRef.current) setReady(true); })
      .catch((err) => {
        if (mountedRef.current) setError(err instanceof Error ? err.message : text.failed);
      });

    return () => {
      mountedRef.current = false;
      void destroyXingyunAgent();
    };
  }, [attempt, profile, text.failed]);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ height }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ height, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "center bottom" }}
      />

      {!ready && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0E1512] text-white">
          <Loader2 className="w-5 h-5 animate-spin text-[#D2A053]" />
          <span className="text-[11px] text-white/70">{text.loading}{progress > 0 ? ` ${progress}%` : ""}</span>
          <div className="w-28 h-[3px] rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#D2A053] transition-all duration-300" style={{ width: `${Math.max(progress, 6)}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 bg-[#0E1512] text-center">
          <Sparkles className="w-5 h-5 text-[#D2A053]" />
          <p className="text-[11px] leading-relaxed text-white/70">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D2A053] text-black text-[11px] font-bold hover:bg-[#E0B268] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            重新加载
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 「小美」渲染容器：固定使用小美 profile，保持与「诗仙」一致的加载与重试体验。
 */
export function XiaomeiAvatar({ height = 500 }: { height?: number }) {
  return <XingyunAvatar height={height} profile="xiaomei" scale={0.9} />;
}
