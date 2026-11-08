"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { destroyXingyunAgent, mountXingyunAgent } from "@/lib/xingyun/agent";

interface Props {
  height?: number;
}

/**
 * 魔珐星云「诗仙」3D 具身智能体渲染容器。
 * 容器必须有明确宽高，否则 SDK 画布会折叠为零尺寸。
 */
export function XingyunAvatar({ height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    })
      .then(() => { if (mountedRef.current) setReady(true); })
      .catch((err) => {
        if (mountedRef.current) setError(err instanceof Error ? err.message : "诗仙加载失败");
      });

    return () => {
      mountedRef.current = false;
      void destroyXingyunAgent();
    };
  }, [attempt]);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" style={{ height }} />

      {!ready && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#0E1512] text-white">
          <Loader2 className="w-5 h-5 animate-spin text-[#D2A053]" />
          <span className="text-[11px] text-white/70">正在唤醒诗仙…{progress > 0 ? ` ${progress}%` : ""}</span>
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
