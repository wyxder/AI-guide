"use client";

import Link from "next/link";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, ChevronRight, Check, Radio,
} from "lucide-react";
import { FM_TRACKS, FM_TRACK_MAP, formatFmTime } from "@/lib/fm-tracks";
import {
  useFmPlayer, playFmTrack, toggleFmTrack, toggleFmPlay,
  nextFmTrack, prevFmTrack, seekFm, setFmVolume,
} from "@/lib/fm-player";

/** 首页「立即收听」入口：同步触发播放（保持用户手势），再平滑定位到歌单 */
export function startFmFromHome() {
  playFmTrack(FM_TRACKS[0].id);
  if (typeof document !== "undefined") {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    const id = isDesktop ? "fm-music-section-pc" : "fm-music-section-mobile";
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 60);
  }
}

function Equalizer() {
  return (
    <span className="flex items-end justify-center gap-[3px] h-6 w-9 rounded-full bg-white/95 shadow-lg">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="fm-bar w-[3px] rounded-full bg-[#D2A053]"
          style={{ animationDelay: `${i * 0.13}s` }}
        />
      ))}
    </span>
  );
}

/**
 * 首页伴游FM 音乐区：每首曲目都有专属封面，点击封面立即播放本地音乐。
 * 预取在挂载时完成，点击时音频已在内存中，无需等待网络或 TTS 合成。
 */
export function FmMusicSection({
  className = "",
  sectionId = "fm-music-section",
}: {
  className?: string;
  sectionId?: string;
}) {
  const player = useFmPlayer();
  const current = player.currentId ? FM_TRACK_MAP[player.currentId] : null;
  const duration = player.duration || current?.duration || 0;
  const progress = Math.min(player.progress, duration || 0);

  return (
    <section id={sectionId} className={`scroll-mt-6 ${className}`}>
      <style>{`
        @keyframes fmBar { 0%,100% { height: 5px; } 50% { height: 19px; } }
        .fm-bar { height: 6px; animation: fmBar .85s ease-in-out infinite; }
        .fm-scroll::-webkit-scrollbar { display: none; }
        .fm-cover-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 40px; height: 40px; opacity: 0; transition: opacity .2s ease; }
        .group:hover .fm-cover-play { opacity: 1; }
        @media (hover: none) {
          .fm-cover-play { left: auto; top: auto; right: 8px; bottom: 8px; transform: none; width: 28px; height: 28px; opacity: .92; }
        }
        .fm-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: #E9DEC6; outline: none; }
        .fm-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #D2A053; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
        .fm-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #D2A053; cursor: pointer; border: 2px solid #fff; }
      `}</style>

      <div className="rounded-[26px] border border-[#EFE3C9] bg-gradient-to-br from-[#FFFDF8] via-[#FFFCF5] to-[#FAF3E5] p-4 md:p-6 shadow-[0_8px_28px_rgba(210,160,83,0.09)]">
        {/* Header */}
        <div className="flex items-start md:items-center justify-between gap-3 mb-4 md:mb-5">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
            <div className="w-10 h-10 md:w-11 md:h-11 shrink-0 rounded-2xl bg-[#D2A053]/12 border border-[#D2A053]/25 flex items-center justify-center text-lg md:text-xl">
              📻
            </div>
            <div className="min-w-0">
              <h2
                className="text-[15px] md:text-lg font-black text-[#8A6524] tracking-wide flex items-center gap-2"
                style={{ fontFamily: "var(--font-noto-serif)" }}
              >
                伴游FM · 旅途歌单
                <Radio className="w-3.5 h-3.5 text-[#D2A053] hidden sm:block" />
              </h2>
              <p className="text-[10px] md:text-xs text-zinc-500 mt-0.5 truncate">
                聆听历史的回响 · 点击封面即刻收听
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[10px] font-bold text-[#4F6F52] bg-white/85 border border-[#DCE8D8] px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              本地音源 · 即点即播
            </span>
            <Link
              href="/fm"
              className="inline-flex items-center gap-0.5 text-[10px] md:text-xs font-bold text-[#8A6524] bg-white/80 border border-[#E8D7B4] hover:bg-[#F5E9CE] px-2.5 py-1.5 rounded-full transition-colors"
            >
              完整体验 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Cover grid — every track has its own artwork */}
        <div
          className="fm-scroll flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-4 lg:grid-cols-7 md:gap-4 md:overflow-visible md:pb-0"
          style={{ scrollbarWidth: "none" }}
        >
          {FM_TRACKS.map((track) => {
            const active = player.currentId === track.id;
            const playing = active && player.isPlaying;
            const buffered = player.bufferedIds.includes(track.id);
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => toggleFmTrack(track.id)}
                aria-label={`${playing ? "暂停" : "播放"} ${track.title}`}
                className="group flex-shrink-0 w-[124px] sm:w-[140px] md:w-auto text-left focus:outline-none"
              >
                <div
                  className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-200 ${
                    active
                      ? "border-[#D2A053] shadow-[0_8px_20px_rgba(210,160,83,0.30)]"
                      : "border-white/80 group-hover:border-[#E6D2A9] group-hover:shadow-[0_8px_18px_rgba(0,0,0,0.10)]"
                  }`}
                  style={{ backgroundColor: `${track.accent}22` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={track.cover}
                    alt={`${track.title} 封面`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div
                    className={`absolute inset-0 flex items-center justify-center transition-colors duration-200 ${
                      playing ? "bg-black/35" : "bg-black/0 group-hover:bg-black/25"
                    }`}
                  >
                    {playing && <Equalizer />}
                  </div>
                  {!playing && (
                    <span className="fm-cover-play rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                      <Play className="w-4 h-4 ml-0.5 text-[#8A6524] fill-[#8A6524]" />
                    </span>
                  )}
                  {buffered && (
                    <span
                      className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
                      title="已本地缓存，秒播"
                    >
                      <Check className="w-2.5 h-2.5 text-[#4F6F52]" strokeWidth={3.5} />
                    </span>
                  )}
                  {playing && (
                    <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black tracking-wider text-white bg-[#D2A053] px-1.5 py-0.5 rounded">
                      ON AIR
                    </span>
                  )}
                </div>
                <div className="mt-1.5 md:mt-2">
                  <div
                    className={`text-[11px] md:text-xs font-bold truncate ${
                      active ? "text-[#8A6524]" : "text-zinc-800"
                    }`}
                  >
                    {track.title}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5 truncate">
                    {formatFmTime(track.duration)} · {track.en}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Now playing control bar */}
        <div className="mt-4 pt-4 border-t border-[#EFE3C9] flex flex-col md:flex-row items-center gap-3 md:gap-5">
          <div className="flex items-center gap-3 w-full md:w-auto md:min-w-[210px]">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current?.cover ?? FM_TRACKS[0].cover}
                alt="当前封面"
                className={`w-12 h-12 rounded-xl object-cover border border-white shadow-sm ${
                  player.isPlaying ? "ring-2 ring-[#D2A053]/60" : ""
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-zinc-900 truncate">
                {current?.title ?? "选择一首，开始旅途"}
              </div>
              <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                {current
                  ? `${player.isPlaying ? "正在播放" : "已暂停"} · ${current.artist}`
                  : `${FM_TRACKS.length} 首本地人文轻音乐 · 已就绪`}
              </div>
              {player.error && (
                <div className="text-[10px] text-red-500 truncate">{player.error}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 md:gap-3 w-full md:flex-1">
            <button
              type="button"
              onClick={() => prevFmTrack()}
              aria-label="上一首"
              className="shrink-0 text-zinc-500 hover:text-[#8A6524] active:scale-90 transition-all"
            >
              <SkipBack className="w-4.5 h-4.5 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => toggleFmPlay()}
              aria-label={player.isPlaying ? "暂停" : "播放"}
              className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-[#E0B768] to-[#C08F3F] text-white flex items-center justify-center shadow-md shadow-[#D2A053]/30 hover:brightness-105 active:scale-95 transition-all"
            >
              {player.isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 ml-0.5 fill-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => nextFmTrack()}
              aria-label="下一首"
              className="shrink-0 text-zinc-500 hover:text-[#8A6524] active:scale-90 transition-all"
            >
              <SkipForward className="w-4.5 h-4.5 fill-current" />
            </button>

            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={progress}
                onChange={(e) => seekFm(Number(e.target.value))}
                className="fm-range w-full cursor-pointer"
                aria-label="播放进度"
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-400 mt-1">
                <span>{formatFmTime(progress)}</span>
                <span>{formatFmTime(duration)}</span>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              <Volume2 className="w-4 h-4 text-zinc-400" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={player.volume}
                onChange={(e) => setFmVolume(Number(e.target.value))}
                className="fm-range w-16 cursor-pointer"
                aria-label="音量"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
