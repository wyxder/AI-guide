"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, MapPin, MessageCircle, Sparkles, BookOpen, Bot,
  X, RefreshCw, Activity, Radio,
} from "lucide-react";
import { request } from "@/lib/api/request";
import Link from "next/link";
import { QRCodePanel } from "@/components/ui/QRCodePanel";
import { DigitalAvatar, type AvatarState } from "@/components/ui/DigitalAvatar";
import { XINGYUN_AVATAR_STYLE } from "@/lib/xingyun/preset";
import { XIAOMEI_AVATAR_STYLE } from "@/lib/xiaomei/preset";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };

/* ── 科技大屏配色 ─────────────────────────────────────────── */
const T = {
  cyan: "#5CECFF",
  cyanDeep: "#17B6D6",
  mint: "#3DFDC0",
  gold: "#FFC857",
  red: "#FF6B81",
  violet: "#A78BFA",
  text: "#DDF4FF",
  sub: "#A8D0E2",
  muted: "#7FA9BE",
  faint: "#4E7F94",
};

interface AnalyticsDay { date: string; totalVisitors: number; totalQuestions: number; satisfactionScore: number; sentimentPositive: number; sentimentNeutral: number; sentimentNegative: number; topQuestions: string[]; topSpotIds: number[] }

interface DrillLog { id: number; userId?: string; question: string; answer: string; createdAt: string }

const SPOT_NAMES: Record<number, string> = { 1: "揽月亭", 2: "翠玉湖", 3: "听松轩", 4: "百花谷", 5: "古窑遗址", 6: "溪流栈道" };
/* ── 数字人形象预设 ─────────────────────────────────────── */
const AVATAR_PRESETS = [
  { style: XINGYUN_AVATAR_STYLE, name: "诗仙·李白", short: "诗仙", role: "POET IMMORTAL · 星云具身智能体" },
  { style: XIAOMEI_AVATAR_STYLE, name: "小美", short: "小美", role: "XIAOMEI · 星云具身智能体" },
  { style: "live2d_Chitose", name: "Chitose", short: "Chitose", role: "LIVE2D · 千岁" },
  { style: "live2d_Hiyori", name: "Hiyori", short: "Hiyori", role: "LIVE2D · 日和" },
  { style: "live2d_Mao", name: "Mao", short: "Mao", role: "LIVE2D · 猫" },
  { style: "live2d_Shizuku", name: "Shizuku", short: "Shizuku", role: "LIVE2D · 雫" },
];

/* ── 播报示例：最新热门问题（20 条轮播） ─────────────────── */
const BROADCAST_QUESTIONS = [
  "景区有哪些景点？",
  "门票多少钱一张？",
  "揽月亭的开放时间是？",
  "怎么去翠玉湖？",
  "有没有儿童票和老人票？",
  "景区内可以坐观光车吗？",
  "听松轩有什么历史典故？",
  "百花谷最佳观赏季节是？",
  "古窑遗址可以体验制陶吗？",
  "溪流栈道全长多少米？",
  "附近有什么推荐的餐厅？",
  "停车场收费标准是多少？",
  "雨天游览有哪些室内景点？",
  "景区可以寄存行李吗？",
  "有讲解服务或语音导览吗？",
  "学生证可以享受优惠吗？",
  "景区内有卫生间和母婴室吗？",
  "夜游项目几点开始？",
  "可以带宠物入园吗？",
  "景区周边有什么住宿推荐？",
];

const INTEREST_COLORS: Record<string, string> = {
  "历史文化": T.cyan,
  "自然生态": T.mint,
  "亲子游览": T.gold,
  "人文艺术": T.violet,
};

/* ── 数字滚动组件 ─────────────────────────────────────────── */
function AnimatedNumber({ value, decimals = 0, className, style }: {
  value: number; decimals?: number; className?: string; style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className} style={style}>{display.toFixed(decimals)}</span>;
}

/* ── 面板标题 ─────────────────────────────────────────────── */
function PanelTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3.5">
      <div className="tech-panel-title min-w-0">{title}</div>
      {right}
    </div>
  );
}

export function AdminAnalyticsScreen() {
  const [data, setData] = useState<AnalyticsDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [hotSpots, setHotSpots] = useState<Array<{ spotId: number; visits: number }>>([]);
  const [wordCloud, setWordCloud] = useState<Array<{ word: string; count: number }>>([]);
  const [recommendations, setRecommendations] = useState<string>("");
  const [loadingRecommendations, setLoadingRecommendations] = useState<boolean>(true);
  const [interestData, setInterestData] = useState<Array<{ label: string; pct: number; count: number }>>([]);
  const [loadingInterests, setLoadingInterests] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");

  const [selectedSentimentLabel, setSelectedSentimentLabel] = useState("");
  const [drillDownLogs, setDrillDownLogs] = useState<DrillLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showDrillModal, setShowDrillModal] = useState(false);

  /* 核心指标：首次加载 + 30s 自动刷新 */
  const loadCore = useCallback(async () => {
    try {
      const [d, h, w, interests] = await Promise.all([
        request("/api/admin/analytics?days=7").then((r) => r.json()),
        request("/api/admin/analytics/hot-spots").then((r) => r.json()),
        request("/api/admin/analytics/wordcloud").then((r) => r.json()),
        request("/api/admin/analytics/interests").then((r) => r.json()),
      ]);
      setData(Array.isArray(d) ? d : []);
      setHotSpots(Array.isArray(h) ? h : []);
      setWordCloud(Array.isArray(w) ? w : []);
      if (interests?.interests) setInterestData(interests.interests);
      setLastSync(new Date());
    } catch {
      /* 静默容错，保持上一次数据 */
    } finally {
      setLoading(false);
      setLoadingInterests(false);
    }
  }, []);

  const loadRecommendations = useCallback(async () => {
    try {
      const rec = await request("/api/admin/analytics/recommendations").then((r) => r.json());
      setRecommendations(rec?.recommendations || "");
    } catch {
      setRecommendations("");
    } finally {
      setLoadingRecommendations(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
    loadRecommendations();
    const timer = setInterval(loadCore, 30000);
    return () => clearInterval(timer);
  }, [loadCore, loadRecommendations]);

  /* 数字人状态轮播，让形象展示更生动 */
  useEffect(() => {
    const seq: AvatarState[] = ["idle", "speaking", "happy", "thinking"];
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % seq.length;
      setAvatarState(seq[i]);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const manualRefresh = async () => {
    setRefreshing(true);
    await loadCore();
    setTimeout(() => setRefreshing(false), 500);
  };

  const openDrillDown = (sentiment: string, label: string) => {
    setSelectedSentimentLabel(label);
    setLoadingLogs(true);
    setShowDrillModal(true);
    request(`/api/admin/analytics/qa-logs?sentiment=${sentiment}`)
      .then((r) => r.json())
      .then((d) => {
        setDrillDownLogs(Array.isArray(d) ? d : []);
        setLoadingLogs(false);
      })
      .catch(() => setLoadingLogs(false));
  };

  /* ── 派生数据 ─────────────────────────────────────────── */
  const totalQuestions = data.reduce((s, d) => s + d.totalQuestions, 0);
  const avgVisitors = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.totalVisitors, 0) / data.length) : 0;
  const avgSat = data.length > 0 ? data.reduce((s, d) => s + d.satisfactionScore, 0) / data.length : 0;
  const displaySpots = hotSpots.length > 0 ? hotSpots.slice(0, 5) : [2, 1, 4, 6, 3].map((id) => ({ spotId: id, visits: 0 }));
  const topSpotName = hotSpots.length > 0 ? (SPOT_NAMES[hotSpots[0].spotId] ?? "翠玉湖") : "翠玉湖";
  const displayWords = wordCloud.length > 0 ? wordCloud.slice(0, 15) : [
    { word: "景点", count: 45 }, { word: "路线", count: 38 }, { word: "门票", count: 32 }, { word: "开放时间", count: 28 },
    { word: "交通", count: 22 }, { word: "特色", count: 19 }, { word: "历史", count: 17 }, { word: "推荐", count: 15 },
    { word: "美食", count: 13 }, { word: "停车", count: 11 },
  ];
  const topQs = (data[0]?.topQuestions && data[0].topQuestions.length > 0)
    ? data[0].topQuestions
    : ["景区有哪些景点？", "门票多少钱？", "揽月亭的历史？", "怎么去翠玉湖？", "有没有儿童票？"];
  const broadcastList = Array.from(new Set([...topQs, ...BROADCAST_QUESTIONS])).slice(0, 20);

  const sentiments = [
    { key: "positive", label: "正面/愉快", count: data.reduce((s, d) => s + (d.sentimentPositive || 0), 0), color: T.mint },
    { key: "neutral", label: "中立/思考", count: data.reduce((s, d) => s + (d.sentimentNeutral || 0), 0), color: T.cyan },
    { key: "negative", label: "负面/疑虑", count: data.reduce((s, d) => s + (d.sentimentNegative || 0), 0), color: T.red },
  ];
  const sentimentTotal = sentiments.reduce((s, x) => s + x.count, 0) || 1;
  const maxSentiment = Math.max(...sentiments.map((s) => s.count), 1);

  const syncTime = lastSync
    ? `${String(lastSync.getHours()).padStart(2, "0")}:${String(lastSync.getMinutes()).padStart(2, "0")}:${String(lastSync.getSeconds()).padStart(2, "0")}`
    : "--:--:--";

  const kpis = [
    { label: "平均日访客", unit: "人", icon: Users, color: T.cyan, node: <AnimatedNumber value={avgVisitors} className="tech-num text-[27px] font-black leading-none" style={{ color: T.cyan, textShadow: "0 0 18px rgba(92,236,255,0.55)" }} /> },
    { label: "问答总量", unit: "条", icon: MessageCircle, color: T.gold, node: <AnimatedNumber value={totalQuestions} className="tech-num text-[27px] font-black leading-none" style={{ color: T.gold, textShadow: "0 0 18px rgba(255,200,87,0.55)" }} /> },
    { label: "平均满意度", unit: "/50", icon: TrendingUp, color: T.mint, node: <AnimatedNumber value={avgSat} decimals={1} className="tech-num text-[27px] font-black leading-none" style={{ color: T.mint, textShadow: "0 0 18px rgba(61,253,192,0.5)" }} /> },
    { label: "最热景点", unit: "", icon: MapPin, color: T.violet, node: <span className="text-[22px] font-black leading-none" style={{ color: T.violet, textShadow: "0 0 18px rgba(167,139,250,0.5)" }}>{topSpotName}</span> },
  ];

  return (
    <div className="tech-screen min-h-svh w-full">
      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 md:px-6 pt-4 pb-10 space-y-4">

        {/* ── 状态条 ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-[19px] md:text-[22px] font-black tracking-[0.16em] text-[#eafaff]"
              style={{ textShadow: "0 0 20px rgba(92,236,255,0.5)" }}>
              运营数据总览
            </h1>
            <span className="tech-chip"><span className="tech-live-dot" />实时监控</span>
            <span className="hidden sm:inline tech-chip" style={{ color: T.gold, borderColor: "rgba(255,200,87,0.3)", background: "rgba(58,44,10,0.5)" }}>
              <Activity className="w-3 h-3" />近 7 日
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: T.muted }}>
            <span className="hidden sm:flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" style={{ color: T.mint }} />
              数据同步 {syncTime}
            </span>
            <motion.button whileTap={{ scale: 0.94 }} onClick={manualRefresh}
              className="tech-chip cursor-pointer hover:brightness-125 transition-all"
              style={{ color: T.cyan, borderColor: "rgba(92,236,255,0.35)" }}>
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> 刷新
            </motion.button>
          </div>
        </div>

        {/* ── 实时播报：最新热门问题轮播 ─────────────────── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
          className="tech-panel px-4 py-2 flex items-center gap-3 overflow-hidden">
          <span className="tech-chip shrink-0" style={{ color: T.mint, borderColor: "rgba(61,253,192,0.3)" }}>
            <span className="tech-live-dot" />播报
          </span>
          <div className="overflow-hidden flex-1 min-w-0">
            <div className="tech-marquee text-[11px]" style={{ color: T.muted, animationDuration: "80s" }}>
              {[0, 1].map((k) => (
                <span key={k} className="inline-flex">
                  {broadcastList.map((q, i) => (
                    <span key={`${k}-${i}`} className="mx-5 inline-flex items-center gap-1.5">
                      <span className="tech-num" style={{ color: T.cyanDeep }}>{String(i + 1).padStart(2, "0")}</span>
                      <span>{q}</span>
                      <span style={{ color: T.faint }}>◇</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
          <span className="tech-num text-[10px] shrink-0" style={{ color: T.faint }}>最新 {broadcastList.length} 条 · 每 30s 同步</span>
        </motion.div>

        {/* ── KPI ──────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {kpis.map((kpi, i) => (
            <motion.div key={kpi.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: i * 0.06 }}
              className="tech-panel relative px-4 py-3.5 min-h-[92px] flex items-center gap-3.5">
              <div className="tech-icon-halo w-11 h-11 shrink-0">
                <kpi.icon className="w-[22px] h-[22px]" style={{ color: kpi.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] tracking-[0.16em]" style={{ color: T.muted }}>{kpi.label}</p>
                <div className="mt-1.5 flex items-baseline gap-1.5 min-w-0">
                  {kpi.node}
                  {kpi.unit && <span className="text-[10px]" style={{ color: T.faint }}>{kpi.unit}</span>}
                </div>
              </div>
              <span className="absolute right-0 top-0 h-full w-[2px] opacity-60"
                style={{ background: `linear-gradient(180deg, transparent, ${kpi.color}, transparent)` }} />
            </motion.div>
          ))}
        </motion.div>

        {/* ── 三列主区 ─────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] gap-4">

          {/* 左列 */}
          <div className="flex flex-col gap-4 order-2 xl:order-1">
            {/* 景区全景 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.12 }}
              className="tech-panel tech-hero h-[232px] flex flex-col justify-between">
              <img src="/images/spots/10005.webp" alt="翠玉湖全景" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(4,16,26,0.78) 0%, rgba(4,16,26,0.18) 42%, rgba(4,16,26,0.94) 100%)" }} />
              <div className="tech-hero-scan" />
              {/* 光台 */}
              <div className="absolute left-1/2 pointer-events-none"
                style={{
                  bottom: 54, width: 190, height: 34, transform: "translateX(-50%)",
                  border: "1px solid rgba(92,236,255,0.55)", borderRadius: "50%",
                  boxShadow: "0 0 26px rgba(92,236,255,0.35), inset 0 0 26px rgba(92,236,255,0.2)",
                }} />

              <div className="relative z-10 flex items-start justify-between p-4">
                <span className="tech-chip">全景展示</span>
                <span className="tech-chip" style={{ color: T.mint, borderColor: "rgba(61,253,192,0.3)" }}>
                  <span className="tech-live-dot" />在线
                </span>
              </div>

              <div className="relative z-10 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[19px] font-black tracking-wider text-[#f0fbff]"
                      style={{ textShadow: "0 0 16px rgba(92,236,255,0.7)" }}>{topSpotName}</p>
                    <p className="text-[9px] tracking-[0.3em] mt-1" style={{ color: T.faint }}>CUIYU LAKE · 核心景点</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <div className="text-right">
                      <p className="tech-num text-[15px] font-black" style={{ color: T.cyan }}>{totalQuestions}</p>
                      <p className="text-[9px]" style={{ color: T.faint }}>近7日问答</p>
                    </div>
                    <div className="w-px h-8" style={{ background: "rgba(92,236,255,0.25)" }} />
                    <div className="text-right">
                      <p className="tech-num text-[15px] font-black" style={{ color: T.mint }}>{avgSat.toFixed(1)}</p>
                      <p className="text-[9px]" style={{ color: T.faint }}>满意度</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 游客兴趣画像 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.22 }}
              className="tech-panel p-4">
              <PanelTitle title="游客兴趣画像" right={
                <span className="tech-chip" style={{ color: T.mint, borderColor: "rgba(61,253,192,0.28)" }}>
                  <span className="tech-live-dot" />实时统计
                </span>
              } />
              {loadingInterests ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="tech-skeleton h-8" />)}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {(interestData.length > 0 ? interestData : [
                    { label: "历史文化", pct: 35, count: 0 },
                    { label: "自然生态", pct: 28, count: 0 },
                    { label: "亲子游览", pct: 22, count: 0 },
                    { label: "人文艺术", pct: 15, count: 0 },
                  ]).map((item) => {
                    const color = INTEREST_COLORS[item.label] || T.cyan;
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-[11px] mb-1.5">
                          <span style={{ color: T.sub }}>{item.label}</span>
                          <span className="tech-num" style={{ color }}>
                            {item.pct}%{item.count > 0 ? ` (${item.count}次)` : ""}
                          </span>
                        </div>
                        <div className="h-[6px] rounded-sm overflow-hidden"
                          style={{ background: "rgba(92,236,255,0.08)" }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${item.pct}%` }}
                            transition={{ duration: 0.9, delay: 0.2, ease: "easeOut" }}
                            className="h-full rounded-sm"
                            style={{ background: `linear-gradient(90deg, ${color}44, ${color})`, boxShadow: `0 0 10px ${color}66` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* 热门问题 Top5 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.26 }}
              className="tech-panel p-4">
              <PanelTitle title="热门问题 Top5" right={<span className="tech-chip" style={{ color: T.gold, borderColor: "rgba(255,200,87,0.28)" }}>游客真实提问</span>} />
              <div className="space-y-2.5">
                {topQs.slice(0, 5).map((q, i) => (
                  <div key={i} className="flex items-center gap-2.5 min-w-0 group" title={q}>
                    <span className="tech-num w-5 h-5 flex items-center justify-center text-[10px] font-black shrink-0"
                      style={{
                        color: i < 3 ? "#04141d" : T.faint,
                        background: i < 3 ? "linear-gradient(135deg, #FFE39B, #FFC857)" : "rgba(92,236,255,0.10)",
                        border: i < 3 ? "none" : "1px solid rgba(92,236,255,0.2)",
                        boxShadow: i < 3 ? "0 0 10px rgba(255,200,87,0.35)" : "none",
                        clipPath: "polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)",
                      }}>{i + 1}</span>
                    <span className="text-[11.5px] truncate flex-1 min-w-0 transition-colors group-hover:text-white"
                      style={{ color: T.sub }}>{q}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* 中列：数字人形象展示（可切换形象） */}
          <div className="flex flex-col order-1 xl:order-2">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.14 }}
              className="tech-panel relative p-4 flex flex-col flex-1 overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-52 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(92,236,255,0.20), transparent 72%)" }} />

              <PanelTitle title="数字人形象展示" right={
                <span className="tech-chip" style={{ color: T.mint, borderColor: "rgba(61,253,192,0.28)" }}>
                  <span className="tech-live-dot" />在线服务中
                </span>
              } />

              {/* 舞台（固定高度 + 等比缩放，避免面板过高） */}
              <div className="relative w-full shrink-0" style={{ height: 392 }}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[282px] h-[282px] rounded-full pointer-events-none"
                  style={{ border: "1px solid rgba(92,236,255,0.14)" }} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[228px] h-[228px] pointer-events-none">
                  <div className="w-full h-full rounded-full"
                    style={{ border: "1px dashed rgba(92,236,255,0.30)", animation: "techSpinSlow 26s linear infinite" }} />
                </div>
                <div className="absolute left-1/2 bottom-[44px] -translate-x-1/2 w-[178px] h-[24px] pointer-events-none"
                  style={{
                    border: "1px solid rgba(92,236,255,0.5)",
                    borderRadius: "50%",
                    boxShadow: "0 0 22px rgba(92,236,255,0.4), inset 0 0 18px rgba(92,236,255,0.2)",
                  }} />

                <div className="absolute left-1/2 top-1/2 z-10"
                  style={{ transform: "translate(-50%, -50%) scale(0.7)", transformOrigin: "center center" }}>
                  <DigitalAvatar state={avatarState} size="hero" avatarStyle={AVATAR_PRESETS[avatarIndex].style} />
                </div>
              </div>

              <div className="relative z-10 text-center">
                <p className="text-[17px] font-black tracking-[0.12em] text-[#EAFAFF]"
                  style={{ textShadow: "0 0 16px rgba(92,236,255,0.55)" }}>{AVATAR_PRESETS[avatarIndex].name}</p>
                <p className="text-[9.5px] tracking-[0.22em] mt-1" style={{ color: T.faint }}>{AVATAR_PRESETS[avatarIndex].role}</p>
                <div className="flex items-center justify-center gap-2 mt-2.5">
                  <span className="tech-chip">今日接待 {totalQuestions} 次</span>
                  <span className="tech-chip" style={{ color: T.mint, borderColor: "rgba(61,253,192,0.28)" }}>
                    满意度 {avgSat.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* 形象切换 */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] tracking-[0.16em]" style={{ color: T.faint }}>点击切换形象</span>
                  <span className="tech-num text-[10px]" style={{ color: T.cyan }}>
                    {avatarIndex + 1} / {AVATAR_PRESETS.length}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {AVATAR_PRESETS.map((preset, i) => {
                    const active = avatarIndex === i;
                    return (
                      <motion.button key={preset.style} whileTap={{ scale: 0.94 }}
                        onClick={() => setAvatarIndex(i)}
                        className="relative flex flex-col items-center gap-1 py-1.5 cursor-pointer transition-colors"
                        style={{
                          border: active ? "1px solid rgba(92,236,255,0.75)" : "1px solid rgba(64,224,255,0.15)",
                          background: active ? "rgba(92,236,255,0.12)" : "rgba(6,26,36,0.55)",
                          boxShadow: active ? "0 0 14px rgba(92,236,255,0.25)" : "none",
                          clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
                        }}>
                        <DigitalAvatar state="idle" size="sm" avatarStyle={preset.style} />
                        <span className="text-[9px] truncate max-w-full" style={{ color: active ? T.cyan : T.muted }}>
                          {preset.short}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>

          {/* 右列 */}
          <div className="flex flex-col gap-4 order-3 xl:order-3">
            {/* 热门景点排行 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.2 }}
              className="tech-panel p-4">
              <PanelTitle title="热门景点排行" right={<span className="tech-chip" style={{ color: T.gold, borderColor: "rgba(255,200,87,0.28)" }}>TOP 5</span>} />
              <div className="space-y-2.5">
                {displaySpots.map((s, i) => {
                  const ratio = s.visits > 0 ? (s.visits / (displaySpots[0]?.visits || 1)) : (5 - i) / 5;
                  return (
                    <div key={s.spotId} className="flex items-center gap-2.5">
                      <span className="tech-num w-5 h-5 flex items-center justify-center text-[10px] font-black shrink-0"
                        style={{
                          color: i < 3 ? "#04141d" : T.faint,
                          background: i < 3 ? "linear-gradient(135deg, #FFE39B, #FFC857)" : "rgba(92,236,255,0.10)",
                          border: i < 3 ? "none" : "1px solid rgba(92,236,255,0.2)",
                          clipPath: "polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)",
                          boxShadow: i < 3 ? "0 0 10px rgba(255,200,87,0.35)" : "none",
                        }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11.5px] font-medium truncate" style={{ color: T.sub }}>{SPOT_NAMES[s.spotId] ?? `景点${s.spotId}`}</span>
                          <span className="tech-num text-[10px] shrink-0" style={{ color: T.muted }}>{s.visits > 0 ? `${s.visits}次` : "暂无"}</span>
                        </div>
                        <div className="h-[5px] overflow-hidden" style={{ background: "rgba(92,236,255,0.08)" }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${ratio * 100}%` }}
                            transition={{ duration: 0.8, delay: i * 0.08 }}
                            className="h-full"
                            style={{
                              background: i < 3 ? "linear-gradient(90deg, #FFC85744, #FFC857)" : "linear-gradient(90deg, rgba(92,236,255,0.25), rgba(92,236,255,0.75))",
                              boxShadow: i < 3 ? "0 0 8px rgba(255,200,87,0.6)" : "0 0 8px rgba(92,236,255,0.4)",
                            }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* 问题高频词 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.24 }}
              className="tech-panel p-4">
              <PanelTitle title="问题高频词" right={<span className="tech-chip">实时抓取</span>} />
              {displayWords.length > 0 ? (
                <div className="flex flex-wrap gap-2 leading-loose">
                  {displayWords.map((w, i) => {
                    const maxCount = displayWords[0]?.count || 1;
                    const ratio = w.count / maxCount;
                    const fontSize = Math.round(10 + ratio * 9);
                    const hot = i < 3;
                    const color = hot ? T.gold : T.cyan;
                    return (
                      <motion.span key={w.word}
                        initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ ...SPRING, delay: 0.18 + i * 0.045 }}
                        className="px-2 py-[3px] font-medium cursor-default"
                        style={{
                          fontSize,
                          color,
                          borderRadius: 2,
                          background: `${color}14`,
                          border: `1px solid ${color}${hot ? "55" : "33"}`,
                          textShadow: hot ? "0 0 10px rgba(255,200,87,0.4)" : "0 0 8px rgba(92,236,255,0.3)",
                          clipPath: "polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)",
                        }}>
                        {w.word}<span className="ml-1 tech-num text-[9px] opacity-65">{w.count}</span>
                      </motion.span>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] py-6 text-center" style={{ color: T.faint }}>暂无高频词数据</div>
              )}
            </motion.div>

            {/* 问答情感分布 */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.28 }}
              className="tech-panel p-4">
              <PanelTitle title="问答情感分布" right={<span className="tech-chip">点击柱形下钻</span>} />
              {loading ? <div className="tech-skeleton h-[150px]" /> : (
                <div className="flex items-end justify-around h-[150px]">
                  {sentiments.map((s) => {
                    const pct = Math.round((s.count / sentimentTotal) * 100);
                    return (
                      <motion.button key={s.key} whileHover={{ y: -4 }} whileTap={{ scale: 0.95 }}
                        onClick={() => openDrillDown(s.key, s.label)}
                        className="flex flex-col items-center gap-1.5 focus:outline-none cursor-pointer group">
                        <span className="tech-num text-[10px] font-bold" style={{ color: s.color }}>
                          {s.count}次 ({pct}%)
                        </span>
                        <div className="w-11 relative overflow-hidden"
                          style={{
                            height: `${Math.max(16, (s.count / maxSentiment) * 92)}px`,
                            background: `linear-gradient(180deg, ${s.color}cc, ${s.color}33)`,
                            boxShadow: `0 0 14px ${s.color}66, inset 0 0 8px rgba(255,255,255,0.2)`,
                            clipPath: "polygon(0 6px, 6px 0, 100% 0, 100% 100%, 0 100%)",
                          }}>
                          <span className="absolute inset-x-0 top-0 h-1/3 opacity-50"
                            style={{ background: "linear-gradient(180deg, #ffffff, transparent)" }} />
                        </div>
                        <span className="text-[10px]" style={{ color: T.sub }}>{s.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* ── 第四排：AI 建议 + 快捷入口 + 二维码 ─────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_minmax(0,0.85fr)_minmax(0,0.85fr)] gap-4">
          {/* 快捷入口 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.3 }}
            className="tech-panel p-4 order-2">
            <PanelTitle title="运营快捷入口" right={<span className="tech-chip">管理中心</span>} />
            <div className="space-y-2.5">
              {[
                { href: "/admin/knowledge", icon: BookOpen, label: "知识库管理", desc: "上传与维护景区文档", color: T.cyan },
                { href: "/admin/spots", icon: MapPin, label: "景点管理", desc: "增删改查景点信息", color: T.gold },
                { href: "/admin/avatar", icon: Bot, label: "数字人配置", desc: "外观与音色参数", color: T.violet },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                    style={{ background: `${item.color}0d`, border: `1px solid ${item.color}33`, clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)" }}>
                    <item.icon className="w-4 h-4 shrink-0" style={{ color: item.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold" style={{ color: T.sub }}>{item.label}</p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: T.faint }}>{item.desc}</p>
                    </div>
                    <span className="text-[10px]" style={{ color: item.color }}>进入 ›</span>
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.32 }}
            className="tech-panel p-4 order-1">
            <PanelTitle title="AI 智能运营建议" right={
              <span className="tech-chip" style={{ color: T.gold, borderColor: "rgba(255,200,87,0.3)" }}>
                <Sparkles className="w-3 h-3" />实时生成
              </span>
            } />
            <p className="text-[10px] -mt-1 mb-3" style={{ color: T.faint }}>基于游客近期真实提问与满意度反馈实时生成</p>
            {loadingRecommendations ? (
              <div className="space-y-2.5 py-1">
                {[3 / 4, 5 / 6, 2 / 3, 1 / 2, 4 / 5].map((w, i) => (
                  <div key={i} className="tech-skeleton h-3" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            ) : (
              <div className="space-y-2 text-[12px] leading-relaxed tech-scroll max-h-[300px] overflow-y-auto pr-1">
                {recommendations.split("\n").map((line, idx) => {
                  if (line.startsWith("###") || line.startsWith("##")) {
                    return (
                      <p key={idx} className="font-black text-[12.5px] pt-2 pb-0.5 flex items-center gap-1.5"
                        style={{ color: T.cyan, textShadow: "0 0 10px rgba(92,236,255,0.4)" }}>
                        <span className="w-1 h-1 rounded-full" style={{ background: T.cyan }} />
                        {line.replace(/^#+\s*/, "").trim()}
                      </p>
                    );
                  }
                  if (line.startsWith("-")) {
                    return (
                      <div key={idx} className="flex gap-2 pl-1">
                        <span style={{ color: T.gold }}>▸</span>
                        <p style={{ color: T.sub }}>{line.replace("-", "").trim()}</p>
                      </div>
                    );
                  }
                  if (/^\d+\./.test(line)) {
                    return (
                      <div key={idx} className="flex gap-2 pl-1">
                        <span className="tech-num font-black shrink-0" style={{ color: T.mint }}>{line.match(/^\d+/)?.[0]}.</span>
                        <p style={{ color: T.sub }}>{line.replace(/^\d+\./, "").trim()}</p>
                      </div>
                    );
                  }
                  return <p key={idx} style={{ color: T.sub }}>{line}</p>;
                })}
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.34 }}
            className="tech-panel p-4 order-3">
            <QRCodePanel theme="tech" />
          </motion.div>
        </div>
      </div>

      {/* ── 下钻侧边弹层 ───────────────────────────────── */}
      <AnimatePresence>
        {showDrillModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-end"
            style={{ background: "rgba(2,10,16,0.72)", backdropFilter: "blur(6px)" }}>
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPRING}
              className="tech-modal-glass w-full max-w-lg h-full flex flex-col">
              <div className="px-5 py-4 flex items-center justify-between shrink-0"
                style={{ borderBottom: "1px solid rgba(64,224,255,0.22)" }}>
                <div>
                  <h3 className="font-black text-[15px] tracking-wider" style={{ color: "#eafaff", textShadow: "0 0 14px rgba(92,236,255,0.45)" }}>
                    对话下钻分析：{selectedSentimentLabel}
                  </h3>
                  <p className="text-[10px] mt-1" style={{ color: T.faint }}>查看真实游客历史对话片段</p>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowDrillModal(false)}
                  className="tech-icon-halo w-8 h-8 cursor-pointer">
                  <X className="w-4 h-4" style={{ color: T.cyan }} />
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 tech-scroll">
                {loadingLogs ? (
                  Array.from({ length: 4 }).map((_, i) => <div key={i} className="tech-skeleton h-24" />)
                ) : drillDownLogs.length === 0 ? (
                  <div className="text-center py-14 text-[11px]" style={{ color: T.faint }}>
                    暂无该情感倾向的对话记录
                  </div>
                ) : (
                  drillDownLogs.map((log) => (
                    <div key={log.id} className="p-3.5 space-y-2.5"
                      style={{ background: "rgba(9,40,54,0.55)", border: "1px solid rgba(64,224,255,0.18)" }}>
                      <div className="flex items-center justify-between text-[10px]" style={{ color: T.faint }}>
                        <span>用户ID: {log.userId?.slice(0, 8) || "游客"}</span>
                        <span className="tech-num">{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[10px] font-black px-1.5 h-4 flex items-center shrink-0"
                          style={{ background: "rgba(255,200,87,0.16)", color: T.gold }}>问</span>
                        <p className="text-[11.5px] font-semibold" style={{ color: T.text }}>{log.question}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[10px] font-black px-1.5 h-4 flex items-center shrink-0"
                          style={{ background: "rgba(61,253,192,0.16)", color: T.mint }}>答</span>
                        <p className="text-[11.5px] leading-relaxed" style={{ color: T.sub }}>{log.answer}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
