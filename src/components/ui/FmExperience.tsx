"use client";

/**
 * 伴游FM「完整体验」界面：唱片机播放器 + 节目单 + 配置偏好 + 文史词。
 * 同时供 /fm 独立页（variant="page"）与首页「伴游FM」按钮弹层（variant="modal"）复用。
 * 节目单固定显示在播放器组件上方。
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, ChevronLeft, X,
  Heart, MessageSquare, Shuffle, ListMusic, Smartphone, Download,
  MoreHorizontal, Check,
} from "lucide-react";
import { toast } from "sonner";
import { FM_TRACKS, FM_TRACK_MAP, formatFmTime } from "@/lib/fm-tracks";
import {
  useFmPlayer, playFmTrack, toggleFmPlay,
  seekFm, setFmQueue, pauseFm, toggleFmTrack,
} from "@/lib/fm-player";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };

type FmView = "interests" | "player" | "lyrics";

interface FmExperienceProps {
  /** page = /fm 独立页；modal = 首页按钮内的弹层 */
  variant?: "page" | "modal";
  /** 首次打开时显示的视图；弹层直接进入播放器，独立页先看偏好配置 */
  initialView?: FmView;
  /** 顶部返回/关闭按钮 */
  onBack?: () => void;
}

interface InterestItem {
  id: string;
  label: string;
  img: string;
  icon: string;
}

/** 兴趣气泡直接使用该曲目专属封面 */
const INTEREST_OPTIONS: InterestItem[] = [
  { id: "heritage", label: "非遗文化", img: "/images/fm/heritage.svg", icon: "🎨" },
  { id: "celebrities", label: "城市名人", img: "/images/fm/celebrities.svg", icon: "📜" },
  { id: "history", label: "历史典故", img: "/images/fm/history.svg", icon: "🏯" },
  { id: "food", label: "美食起源", img: "/images/fm/food.svg", icon: "🍜" },
  { id: "life", label: "市井生活", img: "/images/fm/life.svg", icon: "🍵" },
  { id: "landmarks", label: "城市地标", img: "/images/fm/landmarks.svg", icon: "🗼" },
  { id: "legends", label: "民间传说", img: "/images/fm/legends.svg", icon: "🐉" },
];

export function FmExperience({ variant = "page", initialView = "interests", onBack }: FmExperienceProps) {
  const modal = variant === "modal";
  const [view, setView] = useState<FmView>(initialView);
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    modal ? FM_TRACKS.map(t => t.id) : ["history", "landmarks", "celebrities"]
  );
  const [isLiked, setIsLiked] = useState(false);

  const player = useFmPlayer();

  const playlist = selectedInterests.length > 0
    ? selectedInterests.map(id => FM_TRACK_MAP[id]).filter(Boolean)
    : FM_TRACKS;

  const playingTrack = player.currentId ? FM_TRACK_MAP[player.currentId] : null;
  const currentTrack = playingTrack || playlist[0] || FM_TRACKS[0];
  const currentTrackIndex = Math.max(0, playlist.findIndex(t => t.id === currentTrack.id));
  const duration = player.duration || currentTrack.duration;
  const progress = Math.min(player.progress, duration);

  /** 自动连播顺序跟随用户选择的兴趣 */
  useEffect(() => {
    const ids = selectedInterests.length ? selectedInterests : FM_TRACKS.map(t => t.id);
    setFmQueue(ids.filter(id => FM_TRACK_MAP[id]));
  }, [selectedInterests]);

  const playTrack = (index: number, autoPlay = true) => {
    const track = playlist[index];
    if (!track) return;
    setIsLiked(false);
    if (autoPlay) playFmTrack(track.id);
    else pauseFm();
  };

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div
      className={`text-zinc-800 flex flex-col font-sans select-none overflow-x-hidden relative ${
        modal ? "w-full h-full md:h-auto" : "min-h-screen pb-24 md:pb-6"
      }`}
      style={{ background: "linear-gradient(135deg, #FFF6F3 0%, #FFFDF9 50%, #FCF7F2 100%)" }}
    >
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fmBar { 0%,100% { height: 4px; } 50% { height: 16px; } }
        .fm-bar-sm { height: 5px; animation: fmBar .85s ease-in-out infinite; }
        .styled-scrollbar::-webkit-scrollbar { width: 4px; }
        .styled-scrollbar::-webkit-scrollbar-track { background: rgba(255, 91, 69, 0.03); }
        .styled-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 91, 69, 0.15); border-radius: 2px; }
        .fm-list::-webkit-scrollbar { height: 4px; }
        .fm-list::-webkit-scrollbar-thumb { background: rgba(210,160,83,.35); border-radius: 2px; }
        .fm-progress { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: #F0E4D4; outline: none; }
        .fm-progress::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #FF5B45; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
        .fm-progress::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #FF5B45; cursor: pointer; border: 2px solid #fff; }
      `}</style>

      {/* Ambient blurred cover background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentTrack.cover}
          className="w-full h-full object-cover opacity-5 blur-[90px] scale-150 saturate-150"
          alt=""
        />
        <div className="absolute inset-0 bg-orange-500/[0.02]" />
      </div>

      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 bg-white/30 backdrop-blur-md border-b border-[#FFE8E2] px-4 py-3.5 flex items-center justify-between relative shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onBack?.()}
            aria-label={modal ? "关闭伴游FM" : "返回首页"}
            className="w-9 h-9 rounded-xl bg-white border border-[#FFE8E2] flex items-center justify-center transition-all text-zinc-700 hover:bg-orange-50 active:scale-95 cursor-pointer shadow-sm"
          >
            {modal ? <X className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-zinc-800">伴游FM</h1>
            <p className="text-[10px] text-zinc-500">旅途畅听 · 智能人文精讲</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#FF5B45] animate-pulse"></span>
          <span className="text-[10px] font-bold text-[#FF5B45] bg-[#FFF0ED] px-2.5 py-0.5 rounded border border-[#FFE8E2] font-mono">
            FM TUNER LIVE
          </span>
        </div>
      </header>

      {/* ── Main Layout Wrapper ──
          用 div 而非 main：LayoutShell 全局注入了 `main{margin-left:240px!important}`，
          在首页弹层里会把内容整体推到右边并裁切。 */}
      <div role="main" className={`flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 flex flex-col items-center relative z-10 ${modal ? "justify-start" : "justify-center"}`}>

        {/* ── 节目单：位于播放器组件上方，每首曲目都有专属封面，点击即播 ── */}
        <div className="w-full max-w-md mb-5 bg-white/80 backdrop-blur-xl rounded-3xl border border-[#FFE8E2] p-4 shadow-[0_12px_30px_rgba(255,91,69,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
              <ListMusic className="w-3.5 h-3.5 text-[#FF5B45]" />
              节目单 · 点击封面即播
            </h3>
            <span className="text-[9px] font-mono text-zinc-400">
              已缓存 {player.bufferedIds.length}/{FM_TRACKS.length}
            </span>
          </div>
          <div className="fm-list flex gap-2.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: "thin" }}>
            {FM_TRACKS.map((track) => {
              const active = player.currentId === track.id;
              const playing = active && player.isPlaying;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    toggleFmTrack(track.id);
                    if (view !== "player") setView("player");
                  }}
                  title={`${track.title} · ${track.subtitle}`}
                  className="group shrink-0 w-[76px] text-center focus:outline-none"
                >
                  <div className={`relative w-[76px] h-[76px] rounded-xl overflow-hidden border-2 transition-all ${
                    active ? "border-[#FF5B45] shadow-[0_4px_14px_rgba(255,91,69,0.28)]" : "border-transparent group-hover:border-[#FFD2C8]"
                  }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={track.cover} alt={`${track.title} 封面`} className="w-full h-full object-cover" />
                    {playing && (
                      <span className="absolute inset-0 bg-black/35 flex items-end justify-center pb-1 gap-[2px]">
                        {[0, 1, 2].map(i => (
                          <span key={i} className="fm-bar-sm w-[3px] rounded-full bg-white" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </span>
                    )}
                  </div>
                  <span className={`block text-[9px] font-bold mt-1 truncate ${active ? "text-[#FF5B45]" : "text-zinc-600"}`}>
                    {track.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 播放器组件 ── */}
        <div className={`w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-[36px] border border-[#FFE8E2] shadow-[0_24px_50px_rgba(255,91,69,0.06)] overflow-hidden ${modal ? "min-h-[560px]" : "min-h-[620px]"} flex flex-col justify-between p-6`}>
          <AnimatePresence mode="wait">

            {/* 1. 配置偏好 */}
            {view === "interests" && (
              <motion.div
                key="interests"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING}
                className="flex flex-col justify-between flex-1"
              >
                <div className="space-y-6">
                  <div className="text-center space-y-1 relative">
                    <h2 className="text-2xl font-black text-[#FF5B45] tracking-wide" style={{ fontFamily: "var(--font-noto-serif)" }}>
                      配置收听偏好
                    </h2>
                    <p className="text-xs text-zinc-500">定制您的 FM 专属故事推荐库</p>
                  </div>

                  <div className="relative h-[300px] flex items-center justify-center">
                    <div className="absolute w-[260px] h-[260px] rounded-full border border-dashed border-[#FFE8E2]" />
                    <div className="absolute w-[160px] h-[160px] rounded-full border border-dashed border-orange-100" />

                    <div className="w-16 h-16 rounded-full bg-orange-50 border border-[#FFE8E2] shadow-inner flex items-center justify-center text-2xl relative z-10">
                      📻
                    </div>

                    {INTEREST_OPTIONS.map((opt, idx) => {
                      const checked = selectedInterests.includes(opt.id);
                      const angle = (idx * 2 * Math.PI) / INTEREST_OPTIONS.length;
                      const radius = idx % 2 === 0 ? 120 : 85;
                      const x = Math.cos(angle) * radius;
                      const y = Math.sin(angle) * radius;

                      return (
                        <motion.div
                          key={opt.id}
                          onClick={() => toggleInterest(opt.id)}
                          style={{ x, y }}
                          className="absolute w-16 h-16 rounded-full cursor-pointer flex flex-col items-center justify-center transition-all z-20 group"
                        >
                          <div className={`w-12 h-12 rounded-full overflow-hidden border-2 relative transition-all duration-300 group-hover:scale-105 ${
                            checked ? "border-[#FF5B45] shadow-[0_0_12px_rgba(255,91,69,0.25)]" : "border-zinc-200"
                          }`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={opt.img} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/20" />
                            {checked && (
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF5B45] text-white text-[9px] rounded-full flex items-center justify-center border border-white font-extrabold">
                                ✓
                              </span>
                            )}
                          </div>
                          <span className="text-[9.5px] font-black text-zinc-600 mt-1 block truncate w-full text-center">
                            {opt.label}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (playlist.length === 0) {
                      toast.warning("请至少选择一个收听偏好");
                      return;
                    }
                    setView("player");
                    playTrack(0, true);
                  }}
                  className="w-full py-4 bg-gradient-to-r from-[#FF7A5A] to-[#FF5B45] text-white text-xs font-black rounded-2xl shadow-lg shadow-orange-200/50 hover:brightness-105 transition-all cursor-pointer mt-6"
                >
                  选好了，开始收听
                </motion.button>
              </motion.div>
            )}

            {/* 2. 播放 */}
            {view === "player" && (
              <motion.div
                key="player"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING}
                className="flex flex-col justify-between flex-1 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="bg-orange-50/70 border border-[#FFE8E2] rounded-full p-0.5 flex">
                    <button
                      onClick={() => setView("player")}
                      className="px-4.5 py-1 text-[10.5px] font-black rounded-full bg-gradient-to-r from-[#FF7A5A] to-[#FF5B45] text-white shadow-sm"
                    >
                      播放
                    </button>
                    <button
                      onClick={() => setView("lyrics")}
                      className="px-4.5 py-1 text-[10.5px] font-bold rounded-full text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      文史词
                    </button>
                  </div>
                  <button
                    onClick={() => setView("interests")}
                    className="text-[10px] font-black text-[#FF5B45] bg-[#FFF0ED] px-3.5 py-1.5 rounded-full hover:bg-[#FFE0DB] border border-[#FFE0DB] transition-colors cursor-pointer"
                  >
                    配置偏好
                  </button>
                </div>

                {/* Vinyl Record */}
                <div className="relative flex-1 flex flex-col items-center justify-center py-6 min-h-[300px]">
                  <div className="absolute top-[-10px] left-[calc(50%-20px)] z-40 origin-[30px_30px] pointer-events-none">
                    <motion.svg
                      width="90"
                      height="140"
                      viewBox="0 0 100 150"
                      style={{ originX: "30px", originY: "30px" }}
                      animate={{ rotate: player.isPlaying ? 3 : -28 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="drop-shadow-[0_8px_15px_rgba(0,0,0,0.15)]"
                    >
                      <path d="M 30 30 L 30 55 L 72 108 L 68 122" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
                      <path d="M 30 30 L 30 55 L 72 108 L 68 122" fill="none" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
                      <circle cx="30" cy="30" r="14" fill="url(#pivotGrad)" stroke="#64748b" strokeWidth="1" />
                      <circle cx="30" cy="30" r="5" fill="#334155" />
                      <g transform="rotate(-15, 68, 122)">
                        <rect x="62" y="116" width="12" height="18" rx="2" fill="#334155" stroke="#94a3b8" strokeWidth="1" />
                        <rect x="65" y="128" width="6" height="4" fill="#FF5B45" />
                      </g>
                      <defs>
                        <radialGradient id="pivotGrad" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#e2e8f0" />
                          <stop offset="100%" stopColor="#64748b" />
                        </radialGradient>
                      </defs>
                    </motion.svg>
                  </div>

                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full bg-[#0d0d0d] border-[8px] border-[#1c1c1c] shadow-[0_20px_45px_rgba(0,0,0,0.35),inset_0_0_25px_rgba(0,0,0,0.95)] flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-2 rounded-full border border-white/5 opacity-40 pointer-events-none" />
                    <div className="absolute inset-5 rounded-full border border-black pointer-events-none" />
                    <div className="absolute inset-8 rounded-full border border-white/5 opacity-20 pointer-events-none" />
                    <div className="absolute inset-12 rounded-full border border-black pointer-events-none" />
                    <div className="absolute inset-16 rounded-full border border-white/5 opacity-10 pointer-events-none" />
                    <div className="absolute inset-20 rounded-full border border-black pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rotate-45 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-white/[0.04] to-transparent rotate-45 pointer-events-none" />

                    <div
                      className="w-36 h-36 sm:w-40 sm:h-40 rounded-full overflow-hidden border-[10px] border-black/90 relative shadow-inner"
                      style={{
                        animation: "spin 22s linear infinite",
                        animationPlayState: player.isPlaying ? "running" : "paused",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentTrack.cover}
                        className="w-full h-full object-cover select-none pointer-events-none"
                        alt={`${currentTrack.title} 封面`}
                      />
                    </div>
                  </div>
                </div>

                {/* Track Title and Social Actions */}
                <div className="flex items-center justify-between px-1.5 mt-3">
                  <div className="text-left max-w-[70%]">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-800 truncate">{currentTrack.title}</h3>
                      <span className="text-[8px] bg-[#FFF0ED] text-[#FF5B45] font-extrabold px-1 py-0.5 rounded-sm border border-[#FFE8E2] flex-shrink-0">
                        导览 FM
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="text-xs text-zinc-500 truncate">{currentTrack.artist}</p>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#4F6F52] bg-[#F0F6EF] border border-[#DCE8D8] px-2 py-0.5 rounded-full whitespace-nowrap">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        本地音源 · 秒播
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-zinc-500">
                    <button
                      onClick={() => {
                        setIsLiked(!isLiked);
                        toast(isLiked ? "已取消喜欢" : "已添加到喜欢的精讲列表");
                      }}
                      className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-all text-zinc-500"
                    >
                      <Heart className={`w-5 h-5 transition-colors ${isLiked ? 'fill-red-500 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.2)]' : 'hover:text-zinc-800'}`} />
                      <span className="text-[8px] mt-0.5 font-mono">{isLiked ? "1.2w" : "1.1w"}</span>
                    </button>

                    <button
                      onClick={() => toast.info("收听反馈已收集")}
                      className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-all hover:text-zinc-800"
                    >
                      <MessageSquare className="w-5 h-5 text-zinc-500" />
                      <span className="text-[8px] mt-0.5 font-mono">99+</span>
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 mt-5">
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={progress}
                    onChange={(e) => seekFm(Number(e.target.value))}
                    className="fm-progress w-full cursor-pointer"
                    aria-label="播放进度"
                  />
                  <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500">
                    <span>{formatFmTime(progress)}</span>
                    <span className="bg-orange-50 border border-[#FFE8E2] text-[#FF5B45] px-2 py-0.5 rounded text-[8px] tracking-wider scale-90">
                      {player.isPlaying ? "正在播放" : "即点即播"}
                    </span>
                    <span>{formatFmTime(duration)}</span>
                  </div>
                </div>

                {/* Playback controllers */}
                <div className="flex items-center justify-between px-4 mt-5">
                  <button
                    onClick={() => toast("随机播放模式开启")}
                    className="text-zinc-400 hover:text-[#FF5B45] transition-colors cursor-pointer active:scale-95"
                  >
                    <Shuffle className="w-4.5 h-4.5" />
                  </button>

                  <button
                    onClick={() => playTrack((currentTrackIndex - 1 + playlist.length) % playlist.length, true)}
                    className="text-zinc-600 hover:text-[#FF5B45] transition-colors cursor-pointer active:scale-95"
                  >
                    <SkipBack className="w-6 h-6" />
                  </button>

                  <button
                    onClick={() => toggleFmPlay()}
                    className="w-13 h-13 bg-gradient-to-r from-[#FF7A5A] to-[#FF5B45] text-white rounded-full flex items-center justify-center active:scale-95 hover:brightness-110 transition-all shadow-md shadow-orange-300/30"
                  >
                    {player.isPlaying ? <Pause className="w-5 h-5 fill-white text-white" /> : <Play className="w-5 h-5 ml-1 fill-white text-white" />}
                  </button>

                  <button
                    onClick={() => playTrack((currentTrackIndex + 1) % playlist.length, true)}
                    className="text-zinc-600 hover:text-[#FF5B45] transition-colors cursor-pointer active:scale-95"
                  >
                    <SkipForward className="w-6 h-6" />
                  </button>

                  <button
                    onClick={() => toast.info(`当前播单共 ${playlist.length} 首精讲`)}
                    className="text-zinc-400 hover:text-[#FF5B45] transition-colors cursor-pointer active:scale-95"
                  >
                    <ListMusic className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Bottom utility row */}
                <div className="flex items-center justify-between px-8 mt-5 pt-3 border-t border-zinc-100 text-zinc-400">
                  <button onClick={() => toast.success("正在投屏到周边音箱...")} className="hover:text-[#FF5B45] transition-colors active:scale-95">
                    <Smartphone className="w-4.5 h-4.5" />
                  </button>
                  <button onClick={() => toast.success("离线包下载开始...")} className="hover:text-[#FF5B45] transition-colors active:scale-95">
                    <Download className="w-4.5 h-4.5" />
                  </button>
                  <button onClick={() => toast.info("更多操作选项")} className="hover:text-[#FF5B45] transition-colors active:scale-95">
                    <MoreHorizontal className="w-4.5 h-4.5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* 3. 文史词 */}
            {view === "lyrics" && (
              <motion.div
                key="lyrics"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING}
                className="flex flex-col justify-between flex-1"
              >
                <div className="flex items-center justify-between">
                  <div className="bg-orange-50/70 border border-[#FFE8E2] rounded-full p-0.5 flex">
                    <button
                      onClick={() => setView("player")}
                      className="px-4.5 py-1 text-[10.5px] font-bold rounded-full text-zinc-500 hover:text-zinc-800 transition-colors"
                    >
                      播放
                    </button>
                    <button
                      onClick={() => setView("lyrics")}
                      className="px-4.5 py-1 text-[10.5px] font-black rounded-full bg-gradient-to-r from-[#FF7A5A] to-[#FF5B45] text-white shadow-sm"
                    >
                      文史词
                    </button>
                  </div>
                  <button
                    onClick={() => setView("interests")}
                    className="text-[10px] font-black text-[#FF5B45] bg-[#FFF0ED] px-3.5 py-1.5 rounded-full hover:bg-[#FFE0DB] border border-[#FFE0DB] transition-colors cursor-pointer"
                  >
                    配置偏好
                  </button>
                </div>

                <div className="flex-1 my-5 space-y-4 max-h-[340px] overflow-y-auto pr-1.5 styled-scrollbar">
                  <div className="text-center space-y-1 pb-2">
                    <h3 className="text-base font-bold text-zinc-800">{currentTrack.title}</h3>
                    <p className="text-[10px] text-zinc-500">— {currentTrack.subtitle} —</p>
                  </div>

                  <div className="text-xs leading-relaxed text-zinc-700 space-y-4 tracking-wide font-medium bg-[#FFFDF9]/60 p-4.5 rounded-2xl border border-[#FFE8E2]">
                    <p className="text-[#FF5B45] font-extrabold text-[12.5px] leading-relaxed text-center">
                      “听伴游FM 的人文旋律，带您漫步在蜀地的大街小巷...”
                    </p>
                    <p className="indent-6 text-justify">{currentTrack.text}</p>
                  </div>
                </div>

                {/* Bottom Mini Player */}
                <div className="bg-orange-50/50 border border-[#FFE8E2] rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => toggleFmPlay()}
                      className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#FF7A5A] to-[#FF5B45] text-white flex items-center justify-center active:scale-95 cursor-pointer hover:brightness-105"
                    >
                      {player.isPlaying ? <Pause className="w-3.5 h-3.5 fill-white text-white" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-white text-white" />}
                    </button>
                    <div className="text-left max-w-[160px]">
                      <span className="text-[10.5px] font-black text-zinc-800 block truncate">{currentTrack.title}</span>
                      <span className="text-[8.5px] text-zinc-500">
                        {player.isPlaying ? "正在播放 · 旅途音乐" : "点击播放 · 本地音源"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#FF5B45] font-extrabold">
                    {formatFmTime(progress)} / {formatFmTime(duration)}
                  </span>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
