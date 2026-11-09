"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Volume2, VolumeX,
  History, X, ChevronUp, ChevronDown, Camera, Sparkles,
  Image as ImageIcon, User, Plus, Check, Phone, Video, VideoOff
} from "lucide-react";
import { request } from "@/lib/api/request";
import { useSearchParams } from "next/navigation";
import { SatisfactionModal } from "@/components/ui/SatisfactionModal";
import { DigitalAvatar, type AvatarState } from "@/components/ui/DigitalAvatar";
import { AvatarSelectorModal } from "@/components/ui/AvatarSelectorModal";
import { CameraRecognize } from "@/components/ui/CameraRecognize";
import { VoiceCallDock, VideoCallPreview } from "@/components/ui/VoiceCallDock";
import { toast } from "sonner";
import {
  interruptXingyun,
  speakWithXingyun,
  stopXingyunASR,
  subscribeXingyunConversation,
  subscribeXingyunVoiceStart,
} from "@/lib/xingyun/agent";
import { isXingyunAvatarStyle, XINGYUN_AVATAR_STYLE } from "@/lib/xingyun/preset";
import { isXiaomeiAvatarStyle } from "@/lib/xiaomei/preset";
import { speakWithXiaomei } from "@/lib/xiaomei/agent";
import {
  DEFAULT_VOICE_ID,
  resolveVoiceOption,
  type VoiceOption,
  VOICE_OPTIONS,
} from "@/lib/voice/presets";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };
interface Message { role: "user" | "assistant"; content: string; timestamp: string }

const QUICK_PROMPTS = [
  "历史典故", "门票价格", "游览路线",
  "避堵推荐", "特色小吃", "拍照打卡",
];

const BG_PRESETS = [
  { id: "beijing", label: "北京", url: "/background/北京.webp" },
  { id: "hangzhou", label: "杭州", url: "/background/杭州.webp" },
  { id: "pavilion", label: "山景", url: "/images/spots/10024.webp" },
  { id: "chongqing", label: "重庆", url: "/background/重庆.webp" },
];

/**
 * 将浏览器录音（webm/mp4 等）转成 16kHz 单声道 16bit WAV，
 * 以兼容 SiliconFlow TeleAI/TeleSpeechASR 的音频格式要求。
 */
async function convertRecordingToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const channels = decoded.numberOfChannels;
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(decoded.getChannelData(c));

  // 裁掉首尾静音：缩短上传体积，同时避免 ASR 把长静音当成有效音频
  const mono = data[0];
  const TRIM_THRESHOLD = 0.012;
  let firstVoice = 0;
  let lastVoice = mono.length - 1;
  while (firstVoice < mono.length && Math.abs(mono[firstVoice]) < TRIM_THRESHOLD) firstVoice++;
  while (lastVoice > firstVoice && Math.abs(mono[lastVoice]) < TRIM_THRESHOLD) lastVoice--;
  const padSamples = Math.floor(decoded.sampleRate * 0.12);
  const startSample = Math.max(0, firstVoice - padSamples);
  const endSample = Math.min(mono.length - 1, lastVoice + padSamples);

  const length = Math.max(1, Math.floor(((endSample - startSample) / decoded.sampleRate) * targetRate));
  const out = new Float32Array(length);
  const ratio = decoded.sampleRate / targetRate;

  for (let i = 0; i < length; i++) {
    const pos = startSample + i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, decoded.length - 1);
    const frac = pos - i0;
    let sample = 0;
    for (let c = 0; c < channels; c++) {
      sample += data[c][i0] * (1 - frac) + data[c][i1] * frac;
    }
    out[i] = sample / channels;
  }

  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, out.length * 2, true);

  let offset = 44;
  for (let i = 0; i < out.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, out[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function getVoiceForOption(opt: VoiceOption): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const isZh = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase();
    return l.includes("zh") || l.includes("cn");
  };

  const zhVoices = voices.filter(isZh);
  if (zhVoices.length === 0) return voices[0] || null;

  // 0. Prioritize High-Quality Natural / Online Sweet Female Voices (Edge/Chrome/Safari)
  if (opt.gender === "female") {
    const naturalFemale = zhVoices.find((v) => {
      const n = v.name.toLowerCase();
      return (
        (n.includes("natural") || n.includes("online") || n.includes("google") || n.includes("premium")) &&
        (n.includes("xiaoxiao") || n.includes("xiaoyi") || n.includes("yaoyao") || n.includes("tingting") || n.includes("female") || n.includes("女"))
      );
    });
    if (naturalFemale) return naturalFemale;
  }

  // 1. Keyword match
  for (const kw of opt.keywords) {
    const match = zhVoices.find((v) => v.name.toLowerCase().includes(kw.toLowerCase()));
    if (match) return match;
  }

  // 2. Female gender fallback with sweet voice preference
  if (opt.gender === "female") {
    const femaleFallback = zhVoices.find((v) => {
      const n = v.name.toLowerCase();
      return (
        n.includes("xiaoxiao") || n.includes("xiaoyi") || n.includes("yaoyao") ||
        n.includes("ting-ting") || n.includes("mei-jia") || n.includes("sin-ji") ||
        n.includes("female") || n.includes("女") || n.includes("google")
      );
    });
    if (femaleFallback) return femaleFallback;
  } else {
    const maleFallback = zhVoices.find((v) => {
      const n = v.name.toLowerCase();
      return (
        n.includes("yunxi") || n.includes("yunjian") || n.includes("yunyang") ||
        n.includes("kangkang") || n.includes("male") || n.includes("男")
      );
    });
    if (maleFallback) return maleFallback;
  }

  return zhVoices[0];
}

const PERSONAS_FEMALE = [
  { id: "female_hanfu", label: "汉服古风 · 小玉", desc: "典雅端庄，文旅专属" },
  { id: "female_student", label: "青春校花 · 晓彤", desc: "阳光活力，温柔知性" },
  { id: "female_business", label: "职场丽人 · 雅琪", desc: "端庄大方，干练成熟" },
  { id: "female_anchor", label: "甜美主播 · 诗诗", desc: "亲切活泼，古灵精怪" },
  { id: "female_princess", label: "异域公主 · 迪丽", desc: "高贵神秘，风情万种" }
];

const PERSONAS_MALE = [
  { id: "male_scholar", label: "儒雅书生 · 子轩", desc: "温文尔雅，满腹经纶" },
  { id: "male_student", label: "帅气校草 · 宇航", desc: "朝气蓬勃，充满活力" },
  { id: "male_business", label: "商业精英 · 伟祺", desc: "睿智沉稳，专业干练" },
  { id: "male_anchor", label: "幽默主播 · 强哥", desc: "风趣幽默，极具亲和力" },
  { id: "male_cool", label: "潮流酷哥 · 阿杰", desc: "时尚前卫，极具个性" }
];

const PERSONAS = [...PERSONAS_FEMALE, ...PERSONAS_MALE];

function detectEmotion(text: string): AvatarState {
  const match = text.match(/\[情感[:：]\s*(愉快|高兴|开心|温和|伤感|抱歉|紧张|思考)\]/);
  if (match) {
    const emo = match[1];
    if (/愉快|高兴|开心/.test(emo)) return "happy";
    if (/伤感|抱歉|紧张/.test(emo)) return "concerned";
    if (/思考/.test(emo)) return "thinking";
  }
  if (/欢迎|很高兴|精彩|美丽|推荐|惊喜/.test(text)) return "happy";
  if (/抱歉|对不起|无法|不知道|暂时/.test(text)) return "concerned";
  if (text.length > 40) return "speaking";
  return "idle";
}

function initMsg(spotName?: string | null): Message {
  return {
    role: "assistant",
    content: spotName
      ? `您好！我已为您准备好「${spotName}」的详细讲解，想了解历史渊源、文化典故还是游览小贴士？`
      : "您好！我是旅行家小玉，右上角可以切换背景，数字人形象，声音风格，随时为您解答景区一切问题！",
    timestamp: "刚刚",
  };
}

export function QAScreen() {
  const searchParams = useSearchParams();
  const spotName = searchParams.get("name");

  const [messages, setMessages] = useState<Message[]>([initMsg(spotName)]);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    setIsDesktop(media.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [recording, setRecording] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const voiceStartingRef = useRef(false);
  // 语音识别提示统一使用固定 id，保证界面上同时只存在一条提示
  const VOICE_TOAST_ID = "guide-voice-status";

  useEffect(() => {
    if (!recording) {
      setRecordSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  // 语音播报默认开启，用户可手动关闭
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  // 语音通话（微信风格全屏通话界面），通话中隐藏输入区
  const [inCall, setInCall] = useState(false);
  // 视频聊天开关：默认开启（通话中显示摄像头小窗），可点击关闭
  const [videoChatEnabled, setVideoChatEnabled] = useState(true);
  const [subtitle, setSubtitle] = useState(initMsg(spotName).content);
  const satisfactionShownRef = useRef(false);
  const mobileBottomRef = useRef<HTMLDivElement>(null);
  const desktopBottomRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (mobileBottomRef.current) {
      mobileBottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
    }
    if (desktopBottomRef.current) {
      desktopBottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
    if (desktopScrollRef.current) {
      desktopScrollRef.current.scrollTop = desktopScrollRef.current.scrollHeight;
    }
  };

  // Audio playback and recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // 通话录音（静音自动结束 + SiliconFlow TeleSpeechASR）
  const callSessionRef = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    ctx?: AudioContext;
    raf: number;
    stopped: boolean;
  } | null>(null);
  const abortVoiceRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 星云「语音真正开始播放」标记 + 无声兜底定时器（仅小美使用）
  const xingyunVoiceStartedRef = useRef(false);
  const xingyunSilentTimerRef = useRef<number | null>(null);

  const clearXingyunSilentTimer = () => {
    if (xingyunSilentTimerRef.current !== null) {
      window.clearTimeout(xingyunSilentTimerRef.current);
      xingyunSilentTimerRef.current = null;
    }
  };

  const stopAudio = () => {
    clearXingyunSilentTimer();
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
      audioRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch (e) {}
    try {
      const { Live2dManager } = require("@/lib/live2d/live2dManager");
      Live2dManager.getInstance().stopAudio();
    } catch (e) {}
    interruptXingyun();
    setIsSynthesizing(false);
    setAvatarState("idle");
  };

  // Avatar config state (Default to Hiyori Live2D to avoid any loading screen flicker/delay)
  const [avatarConfig, setAvatarConfig] = useState<any>({
    name: "Hiyori (Live2D)",
    avatarStyle: "live2d_Hiyori",
    voiceStyle: "warm",
    speechRate: 100,
    pitch: 105,
    greeting: "你好，我是日和！很高兴在这个美好的天气里遇见你，今天想听我介绍哪个景点呢？",
    isDefault: true,
    isActive: true,
    imageUrl: "/sentio/characters/free/Hiyori/Hiyori.png"
  });

  // Background selection state
  const [bgImage, setBgImage] = useState<string>("/background/北京.webp");
  const [showBgMenu, setShowBgMenu] = useState(false);
  // 移动端键盘高度（visualViewport 收窄量）
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(inset > 140 ? vv.height : 0);
    };
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // 音色选择状态：默认 SophNet CosyVoice-v2 的龙小淳（温柔知性女声）
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return resolveVoiceOption(localStorage.getItem("guide_selected_voice_id")).id;
    }
    return DEFAULT_VOICE_ID;
  });
  const [showVoiceMenu, setShowVoiceMenu] = useState<boolean>(false);

  const selectVoice = (opt: VoiceOption) => {
    setSelectedVoiceId(opt.id);
    try {
      localStorage.setItem("guide_selected_voice_id", opt.id);
    } catch {}
    setTtsEnabled(true);
    setShowVoiceMenu(false);
    toast.success(`已切换音色为「${opt.name}」`);
    // 用户主动切换音色即视为开启播报，强制试听一次
    speak(`您好！我是${opt.avatarName}，很高兴为您服务！`, true);
  };

  // Persona selection state（默认展示「诗仙·李白」，导游界面与语音通话共用）
  const [selectedStyle, setSelectedStyle] = useState<string>(XINGYUN_AVATAR_STYLE);
  // 用户是否主动切换过形象：未切换时始终保持默认「诗仙·李白」
  const userPickedAvatarRef = useRef(false);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [allAvatars, setAllAvatars] = useState<any[]>([]);
  const [customAvatars, setCustomAvatars] = useState<any[]>([]);

  // 魔珐星云形象（诗仙 / 小美）：渲染、播报与状态同步均走星云 SDK
  const isXiaomeiAvatar = isXiaomeiAvatarStyle(selectedStyle);
  const isStarcloudAvatar = isXingyunAvatarStyle(selectedStyle) || isXiaomeiAvatar;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarUploadRef = useRef<HTMLInputElement>(null);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBgImage(event.target.result as string);
          toast.success("背景上传成功！");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const loadAvatars = () => {
    request("/api/qa/avatars")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAllAvatars(data);
          const defaultAvatar = data.find((a) => a.isDefault);
          if (defaultAvatar && userPickedAvatarRef.current) {
            setSelectedStyle(defaultAvatar.avatarStyle);
            setAvatarConfig(defaultAvatar);
          }
        }
      })
      .catch((e) => console.error("Failed to load avatars", e));
  };

  const triggerHaptic = (ms = 10) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(ms); } catch {}
    }
  };

  useEffect(() => {
    loadAvatars();
    try {
      const resolvedVoice = resolveVoiceOption(localStorage.getItem("guide_selected_voice_id"));
      setSelectedVoiceId(resolvedVoice.id);
      localStorage.setItem("guide_selected_voice_id", resolvedVoice.id);
    } catch {}
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    // Preload background images into browser memory for 0ms background switching
    BG_PRESETS.forEach((bg) => {
      if (bg.url) {
        const img = new Image();
        img.src = bg.url;
      }
    });
    try {
      const stored = localStorage.getItem("custom_avatars");
      if (stored) {
        setCustomAvatars(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const selectAvatar = (styleUrlOrId: string) => {
    userPickedAvatarRef.current = true;
    setSelectedStyle(styleUrlOrId);
    const found = [...allAvatars, ...customAvatars].find((a) => a.avatarStyle === styleUrlOrId);
    if (found) {
      setAvatarConfig(found);
    } else {
      setAvatarConfig({
        avatarStyle: styleUrlOrId,
        voiceStyle: "warm",
        speechRate: 100,
        pitch: 100,
      });
    }
  };

  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const toastId = toast.loading("正在上传您的分身形象...");
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        const name = prompt("请输入您分身形象的名称：", `分身形象 #${customAvatars.length + 1}`) || `分身形象 #${customAvatars.length + 1}`;
        const newAvatar = {
          id: -Date.now(),
          name,
          avatarStyle: data.url,
          imageUrl: data.url,
          voiceStyle: "warm",
          speechRate: 100,
          pitch: 100,
        };
        const updated = [newAvatar, ...customAvatars];
        setCustomAvatars(updated);
        localStorage.setItem("custom_avatars", JSON.stringify(updated));
        selectAvatar(data.url);
        toast.success("分身生成并启用成功！");
      } else {
        toast.error(data.error || "上传失败");
      }
    } catch {
      toast.error("网络故障，上传失败");
    } finally {
      toast.dismiss(toastId);
    }
  };

  // Active avatar config sync
  // Active avatar config sync：仅同步音色等元数据，形象默认固定为「诗仙·李白」，不被服务端默认值覆盖
  useEffect(() => {
    if (!avatarConfig?.avatarStyle) return;
    if (!userPickedAvatarRef.current) return;
    setSelectedStyle(avatarConfig.avatarStyle);
  }, [avatarConfig]);

  useEffect(() => {
    request("/api/qa/avatar-active")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.avatarStyle && userPickedAvatarRef.current) {
          setAvatarConfig(d);
        }
      })
      .catch((e) => console.error("Failed to load active avatar config", e));
  }, []);

  // 「诗仙 / 小美」播报状态同步：星云对话/播报状态驱动原有头像状态机
  useEffect(() => {
    if (!isStarcloudAvatar) return;
    return subscribeXingyunConversation((state) => {
      if (state === "asking") {
        setAvatarState("thinking");
      } else if (state === "speaking" || state === "speaking-directly") {
        setAvatarState("speaking");
      } else if (state === "idle" || state === "completed" || state === "interrupted" || state === "failed") {
        setAvatarState("idle");
      }
    });
  }, [isStarcloudAvatar]);

  // 语音输入统一走「本地录音 + 服务端 ASR」，切换形象时结束可能残留的星云识别，避免占用麦克风
  useEffect(() => {
    return () => {
      setRecording(false);
      stopXingyunASR();
    };
  }, [isStarcloudAvatar]);

  // 星云播报是否真的发出了声音：用于「小美无 TTS」时的本地语音兜底
  useEffect(() => {
    if (!isStarcloudAvatar) return;
    return subscribeXingyunVoiceStart(() => {
      xingyunVoiceStartedRef.current = true;
      if (xingyunSilentTimerRef.current !== null) {
        window.clearTimeout(xingyunSilentTimerRef.current);
        xingyunSilentTimerRef.current = null;
      }
    });
  }, [isStarcloudAvatar]);

  // 卸载时清理无声兜底定时器，避免离开页面后继续播放语音
  useEffect(() => () => {
    if (xingyunSilentTimerRef.current !== null) {
      window.clearTimeout(xingyunSilentTimerRef.current);
      xingyunSilentTimerRef.current = null;
    }
  }, []);

  const [avatarWidth, setAvatarWidth] = useState(450); // Default to a wider layout (450px)
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      if (newWidth >= 300 && newWidth <= 650) {
        setAvatarWidth(newWidth);
      }
    }
  }, []);

  function handleMouseUp() {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleMouseMove]);

  /* ── 语音通话（微信风格）── */
  const startCall = () => {
    triggerHaptic(20);
    setShowBgMenu(false);
    setShowVoiceMenu(false);
    setShowPersonaMenu(false);
    // 仅在进入语音通话时自动开启摄像头小窗
    setVideoChatEnabled(true);
    setInCall(true);
  };

  const endCall = () => {
    stopAudio();
    abortVoiceRef.current = true;
    if (callSessionRef.current) {
      try { callSessionRef.current.recorder.stop(); } catch { cleanupCallSession(); }
    }
    setRecording(false);
    setRecognizing(false);
    setInCall(false);
  };

  const callGreeting = () => {
    const name = isXiaomeiAvatar ? "小美" : isStarcloudAvatar ? "诗仙·李白" : "旅行家小玉";
    speak(`您好，我是${name}，很高兴和您通话！想了解景区什么问题，直接说就行～`, true);
  };

  const handleNewChat = async () => {
    stopAudio();
    // Save current conversation to history if user has messages
    if (messages.length > 1) {
      try {
        const userMsg = messages.find((m) => m.role === "user")?.content || "导览问答";
        const title = spotName ? `[${spotName}] ${userMsg.slice(0, 18)}` : userMsg.slice(0, 22);
        const newRecord = {
          id: Date.now(),
          title,
          updatedAt: new Date().toISOString(),
          messages: [...messages],
        };

        const existingStr = localStorage.getItem("guide_chat_history_sessions");
        const existingArr = existingStr ? JSON.parse(existingStr) : [];
        const updated = [newRecord, ...existingArr.filter((s: any) => s.title !== title)];
        localStorage.setItem("guide_chat_history_sessions", JSON.stringify(updated.slice(0, 30)));

        request("/api/qa/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }).catch(() => {});
      } catch (e) {
        console.error("Failed to save chat session to history", e);
      }
    }

    try {
      await request("/api/qa/chat", { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete chat session", e);
    }
    setMessages([initMsg(spotName)]);
    setSubtitle(initMsg(spotName).content);
    setChatExpanded(true);
    toast.success("已开启新对话，旧对话已归档存至历史记录");
  };

  useEffect(() => {
    scrollToBottom("auto");
    const t1 = setTimeout(() => scrollToBottom("smooth"), 80);
    const t2 = setTimeout(() => scrollToBottom("smooth"), 250);
    const t3 = setTimeout(() => scrollToBottom("smooth"), 450);
    const t4 = setTimeout(() => scrollToBottom("smooth"), 650);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [messages, chatExpanded]);

  const initialWelcomeFiredRef = useRef(false);
  useEffect(() => {
    if (initialWelcomeFiredRef.current) return;
    initialWelcomeFiredRef.current = true;
    const welcomeText = spotName
      ? `您好！我已为您准备好「${spotName}」的详细讲解，想了解历史渊源、文化典故还是游览小贴士？`
      : "您好！我是旅行家小玉，右上角可以切换背景，数字人形象，声音风格，随时为您解答景区一切问题！";
    // 默认静音：用户首次点击界面时，仅播放一次开场白；后续回复不再自动合成语音
    const playOpeningOnce = () => {
      window.removeEventListener("pointerdown", playOpeningOnce);
      speak(welcomeText, true);
    };
    window.addEventListener("pointerdown", playOpeningOnce);
    return () => window.removeEventListener("pointerdown", playOpeningOnce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotName]);

  useEffect(() => {
    if (loading) {
      setTimeout(() => setAvatarState("thinking"), 0);
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || last.role === "user") {
      setTimeout(() => setAvatarState("idle"), 0);
      return;
    }
    const s = detectEmotion(last.content);
    // Mouth movement should ONLY be turned on by audio playback, not text bubble appearance
    const stateToApply = s === "speaking" ? "idle" : s;
    setTimeout(() => setAvatarState(stateToApply), 0);
    const t = setTimeout(() => setAvatarState("idle"), 6000);
    return () => clearTimeout(t);
  }, [loading, messages]);

  /** Web Speech API 兜底：仅在服务端 SophNet 合成失败时使用 */
  const speakWithWebSpeech = (text: string, currentOpt: VoiceOption) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSynthesizing(false);
      setAvatarState("idle");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [text];
      let idx = 0;

      const speakSentence = () => {
        if (idx >= sentences.length) {
          setIsSynthesizing(false);
          setAvatarState("idle");
          try {
            const { Live2dManager } = require("@/lib/live2d/live2dManager");
            Live2dManager.getInstance().setSpeaking(false);
          } catch (e) {}
          return;
        }
        const utter = new SpeechSynthesisUtterance(sentences[idx]);
        utter.lang = "zh-CN";

        const voiceObj = getVoiceForOption(currentOpt);
        if (voiceObj) {
          utter.voice = voiceObj;
        }

        utter.rate = (avatarConfig?.speechRate || Math.round(currentOpt.rate * 100)) / 100;
        utter.pitch = currentOpt.pitch;
        utter.volume = 1.0;

        utter.onstart = () => {
          setIsSynthesizing(false);
          setAvatarState("speaking");
          try {
            const { Live2dManager } = require("@/lib/live2d/live2dManager");
            Live2dManager.getInstance().setSpeaking(true);
            Live2dManager.getInstance().triggerSpeakMotion();
          } catch (e) {}
        };
        utter.onend = () => {
          idx++;
          speakSentence();
        };
        utter.onerror = () => {
          idx++;
          speakSentence();
        };

        window.speechSynthesis.speak(utter);
      };

      speakSentence();
    } catch (err) {
      setIsSynthesizing(false);
      setAvatarState("idle");
    }
  };

  /** 播放服务端合成的音频：Live2D 走音频队列，普通形象走 Audio 元素 */
  const playServerAudio = async (blob: Blob) => {
    const isLive2D = avatarConfig?.avatarStyle?.startsWith("live2d_");

    if (isLive2D) {
      const arrayBuffer = await blob.arrayBuffer();
      const { Live2dManager } = require("@/lib/live2d/live2dManager");
      const manager = Live2dManager.getInstance();
      manager.onAudioStarted = () => {
        setIsSynthesizing(false);
        setAvatarState("speaking");
        manager.setSpeaking(true);
        manager.triggerSpeakMotion();
      };
      manager.onAudioEnded = () => {
        setAvatarState("idle");
        manager.setSpeaking(false);
      };
      manager.pushAudioQueue(arrayBuffer);
      return;
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 1.0;
    audioRef.current = audio;
    audio.onplay = () => {
      setIsSynthesizing(false);
      setAvatarState("speaking");
      try {
        const { Live2dManager } = require("@/lib/live2d/live2dManager");
        Live2dManager.getInstance().setSpeaking(true);
        Live2dManager.getInstance().triggerSpeakMotion();
      } catch (e) {}
    };
    audio.onended = () => {
      setAvatarState("idle");
      try {
        const { Live2dManager } = require("@/lib/live2d/live2dManager");
        Live2dManager.getInstance().setSpeaking(false);
      } catch (e) {}
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setAvatarState("idle");
      try {
        const { Live2dManager } = require("@/lib/live2d/live2dManager");
        Live2dManager.getInstance().setSpeaking(false);
      } catch (e) {}
      URL.revokeObjectURL(url);
    };
    await audio.play();
  };

  /** 项目自有语音链路：SophNet CosyVoice-v2，失败回退浏览器 Web Speech */
  const playLocalSpeech = async (cleanedText: string) => {
    setIsSynthesizing(true);
    const currentOpt = resolveVoiceOption(selectedVoiceId);

    try {
      const res = await request("/api/qa/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanedText.slice(0, 400),
          voice: currentOpt.voiceId,
          voiceStyle: currentOpt.gender === "female" ? "warm" : "professional",
          speechRate: avatarConfig?.speechRate || 100,
          pitch: avatarConfig?.pitch || 100,
          ttsConfig: avatarConfig?.settings?.tts,
        }),
      });

      if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);

      // 服务端最终兜底返回 1 秒 WAV 提示音，视为失败并改用浏览器语音，避免"切换无声"
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("wav")) throw new Error("TTS returned fallback wav");

      const blob = await res.blob();
      if (blob.size < 1000) throw new Error("TTS returned empty audio");

      await playServerAudio(blob);
      return;
    } catch (err) {
      console.warn("SophNet TTS unavailable, falling back to Web Speech:", err);
      speakWithWebSpeech(cleanedText, currentOpt);
    }
  };

  /**
   * 星云播报「无声」兜底：星云 speak 只是把文本交给服务端，
   * 若该驱动应用（小美）没有配置语音合成，服务端会静默返回，表现为"切换后没声音"。
   * 这里在超时内没有收到「语音开始播放」事件时，改用项目自有 TTS 保证有声。
   */
  const armXingyunSilentFallback = (cleanedText: string, profile: "shixian" | "xiaomei") => {
    clearXingyunSilentTimer();
    xingyunVoiceStartedRef.current = false;
    xingyunSilentTimerRef.current = window.setTimeout(() => {
      xingyunSilentTimerRef.current = null;
      if (xingyunVoiceStartedRef.current) return;
      // 先打断星云这条静默的播报，避免与本地语音叠加
      interruptXingyun(profile);
      void playLocalSpeech(cleanedText);
    }, 3000);
  };

  const speak = async (text: string, force = false) => {
    // 默认静音：AI 回复仅文本返回，不调用语音合成，保证低时延；通话中始终开启语音
    if (!ttsEnabled && !force && !inCall) return;
    stopAudio();

    const cleanedText = text.replace(/\[情感[:：][^\]]+\]/g, "").trim();
    if (!cleanedText) return;

    // 诗仙 / 小美（魔珐星云具身智能体）：优先使用星云内置语音与 3D 动作播报，未就绪时回退原有 TTS 链路
    if (isStarcloudAvatar) {
      const xingyunProfile = isXiaomeiAvatar ? "xiaomei" as const : "shixian" as const;
      const spoken = isXiaomeiAvatar ? speakWithXiaomei(cleanedText) : speakWithXingyun(cleanedText, xingyunProfile);
      if (spoken) {
        setIsSynthesizing(false);
        setAvatarState("speaking");
        if (isXiaomeiAvatar) armXingyunSilentFallback(cleanedText, xingyunProfile);
        return;
      }
    }

    await playLocalSpeech(cleanedText);
  };

  /* ── 通话语音输入：SiliconFlow TeleSpeechASR + 静音自动结束 ── */
  const cleanupCallSession = () => {
    const session = callSessionRef.current;
    if (!session) return;
    cancelAnimationFrame(session.raf);
    try { session.ctx?.close(); } catch {}
    session.stream.getTracks().forEach((track) => track.stop());
    callSessionRef.current = null;
    mediaRecorderRef.current = null;
  };

  const finishCallRecording = () => {
    const session = callSessionRef.current;
    if (!session || session.stopped) return;
    session.stopped = true;
    cancelAnimationFrame(session.raf);
    setRecording(false);
    try { session.recorder.stop(); } catch { cleanupCallSession(); }
  };

  const startCallRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("当前浏览器不支持语音输入", { id: VOICE_TOAST_ID, duration: 2600 });
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.error("Mic access denied:", err);
      toast.error("麦克风权限获取失败，请检查浏览器设置", { id: VOICE_TOAST_ID, duration: 3000 });
      return;
    }

    stopAudio();
    abortVoiceRef.current = false;

    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    // 低码率 opus：体积更小、上传更快，16k 单声道足够 ASR 使用
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32000,
    });
    audioChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      cleanupCallSession();
      setRecording(false);
      if (abortVoiceRef.current) {
        abortVoiceRef.current = false;
        return;
      }

      const rawBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
      if (rawBlob.size < 1200) {
        toast.error("未检测到有效语音，请再说一次", { id: VOICE_TOAST_ID, duration: 2400 });
        return;
      }

      setRecognizing(true);
      let wavBlob: Blob | null = null;
      try {
        wavBlob = await convertRecordingToWav(rawBlob);
      } catch (err) {
        console.warn("WAV convert failed, fallback to raw recording:", err);
      }
      const uploadBlob = wavBlob || rawBlob;
      try {
        const formData = new FormData();
        const rawExt = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        formData.append("file", uploadBlob, wavBlob ? "voice.wav" : `voice.${rawExt}`);
        const res = await request("/api/siliconflow/asr", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        const text = String(data?.text || "").trim();
        if (text) {
          setInput("");
          sendMessage(text);
        } else {
          toast.error("没有听清，请再说一次", { id: VOICE_TOAST_ID, duration: 2400 });
        }
      } catch (err) {
        console.error("SiliconFlow ASR failed:", err);
        toast.error("语音识别失败，请重试", { id: VOICE_TOAST_ID, duration: 2400 });
      } finally {
        setRecognizing(false);
      }
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setRecording(true);

    // 静音检测：说完约 0.75 秒自动结束并上传识别，最长 12 秒
    let raf = 0;
    let ctx: AudioContext | undefined;
    let speechStarted = false;
    let silenceSince = 0;
    let speechFrames = 0;
    let noiseFloor = 0;
    const startedAt = performance.now();
    const SILENCE_MS = 750;
    const MAX_MS = 12000;
    const NO_SPEECH_MS = 8000;

    try {
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);

      const tick = () => {
        const session = callSessionRef.current;
        if (!session || session.stopped) return;
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const now = performance.now();

        // 自适应底噪：快速跟随下降（安静环境），缓慢上升（避免人声被当成底噪）
        noiseFloor = noiseFloor === 0
          ? rms
          : rms < noiseFloor
            ? noiseFloor * 0.9 + rms * 0.1
            : noiseFloor * 0.995 + 0.00005;
        const threshold = speechStarted
          ? Math.max(0.008, noiseFloor * 1.8)
          : Math.max(0.012, noiseFloor * 2.4);

        if (rms > threshold) {
          speechFrames = Math.min(speechFrames + 1, 4);
        } else {
          speechFrames = Math.max(speechFrames - 1, 0);
        }

        if (speechFrames >= 2) {
          speechStarted = true;
          silenceSince = 0;
        } else if (speechStarted && !silenceSince) {
          silenceSince = now;
        }

        if ((silenceSince && now - silenceSince >= SILENCE_MS) || now - startedAt >= MAX_MS) {
          finishCallRecording();
          return;
        }
        if (!speechStarted && now - startedAt >= NO_SPEECH_MS) {
          finishCallRecording();
          return;
        }
        if (session) session.raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      // 无 AudioContext 时退化为手动点击结束
    }

    callSessionRef.current = { recorder, stream, ctx, raf, stopped: false };
  };

  const toggleRecording = async () => {
    // 识别中或快速连点时不重复启动
    if (voiceStartingRef.current || recognizing) return;
    voiceStartingRef.current = true;
    window.setTimeout(() => { voiceStartingRef.current = false; }, 400);

    if (recording) {
      finishCallRecording();
      return;
    }

    // 所有形象统一走本地录音 + 服务端 ASR：灵敏度、静音判定与延迟都可控，
    // 同时先停掉星云 SDK 自带识别，避免抢占麦克风导致「一直聆听却识别不到」
    if (isStarcloudAvatar) {
      const xingyunProfile = isXiaomeiAvatar ? "xiaomei" as const : "shixian" as const;
      // 仅在数字人正在播报时打断，避免无谓地打断渲染管线造成瞬时丢帧
      if (avatarState === "speaking") interruptXingyun(xingyunProfile);
      stopXingyunASR(xingyunProfile);
    }
    await startCallRecording();
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;
    stopAudio();
    const ts = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const updated = [...messages, { role: "user" as const, content: question, timestamp: ts }];
    setMessages(updated); setInput(""); setLoading(true); setChatExpanded(true);

    const aiTs = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    // Placeholder for streaming answer
    setMessages((prev) => [...prev, { role: "assistant" as const, content: "", timestamp: aiTs }]);

    try {
      const history = updated.slice(1).map((m) => ({ role: m.role, content: m.content }));
      const res = await request("/api/qa/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, stream: true, agentConfig: avatarConfig?.settings?.agent, spotName }),
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = "";
      let lastUpdateTime = 0;

      const updateUIBatch = (force = false) => {
        const now = Date.now();
        if (force || now - lastUpdateTime >= 35) {
          lastUpdateTime = now;
          const clean = fullAnswer.replace(/\[情感[:：]\s*[^\]]+\]/g, "").trim();
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], content: clean };
            return copy;
          });
          setSubtitle(clean);
          if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
          if (desktopScrollRef.current) desktopScrollRef.current.scrollTop = desktopScrollRef.current.scrollHeight;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const { delta } = JSON.parse(payload);
            if (delta) {
              fullAnswer += delta;
              updateUIBatch(false);
            }
          } catch { /* ignore parse errors */ }
        }
      }

      updateUIBatch(true);
      setLoading(false);

      // Speak the complete concise answer smoothly ONLY after text bubble finishes generating
      const cleanFull = fullAnswer.replace(/\[情感[:：]\s*[^\]]+\]/g, "").trim();
      if (cleanFull) {
        speak(cleanFull);
      }

      // Satisfaction modal disabled per user request
    } catch {
      // Fallback to non-streaming
      try {
        const history = updated.slice(1).map((m) => ({ role: m.role, content: m.content }));
        const res2 = await request("/api/qa/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history, agentConfig: avatarConfig?.settings?.agent }),
        });
        const data = await res2.json();
        const answerRaw = data.answer || "抱歉，暂时无法回答。";
        const answer = answerRaw.replace(/\[情感[:：]\s*[^\]]+\]/g, "").trim();
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: answer };
          return copy;
        });
        setSubtitle(answer);
        speak(answer);
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: "小玉现在有些忙，请稍候再试。" };
          return copy;
        });
      }
    } finally { setLoading(false); }
  };

  // Camera recognition → inject into conversation as multimodal context
  const handleCameraRecognized = (subject: string, story: string) => {
    setShowCamera(false);
    const question = `我拍到了「${subject}」，请给我讲讲它的更多历史和文化内涵。`;
    // Pre-fill context: tell AI what was identified so it can expand
    sendMessage(question);
    toast.success(`已识别「${subject}」，正在小玉讲解中…`);
  };

  // AvatarSelectorModal takes care of selection dialog now

  /* ── Message list (shared between mobile & desktop) ── */
  const renderMessageList = (
    isMobileImmersive = false,
    bottomRefToUse?: React.RefObject<HTMLDivElement | null>,
    textSize: "sm" | "md" = "md"
  ) => (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0 }}
          className={`flex gap-2 items-end ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center shadow-md"
            style={{ border: isMobileImmersive ? "1.5px solid rgba(255,255,255,0.25)" : "1.5px solid #E6E2D8" }}>
            {msg.role === "assistant" ? (
              <img
                src="https://gips3.baidu.com/it/u=2273134228,3411241180&fm=3074&app=3074&f=PNG?w=2048&h=2048"
                alt="AI导游小玉"
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-black rounded-full"
                style={{ background: "linear-gradient(135deg,#4B9EFF,#2563EB)", color: "white" }}>
                我
              </div>
            )}
          </div>
          {/* Bubble */}
          <div className={`flex flex-col gap-0.5 max-w-[76%] ${msg.role === "user" ? "items-end" : ""}`}>
            <div className={`px-4 py-3 leading-relaxed ${textSize === "sm" ? "text-[11.5px]" : "text-[15px]"}`}
              style={isMobileImmersive ? {
                borderRadius: msg.role === "assistant" ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                background: msg.role === "assistant"
                  ? "linear-gradient(135deg, rgba(255,100,160,0.82) 0%, rgba(180,60,220,0.82) 100%)"
                  : "linear-gradient(135deg, rgba(59,130,246,0.92) 0%, rgba(37,99,235,0.92) 100%)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: msg.role === "assistant"
                  ? "1px solid rgba(255,120,180,0.35)"
                  : "1px solid rgba(96,165,250,0.35)",
                color: "white",
                boxShadow: msg.role === "assistant"
                  ? "0 4px 20px rgba(220,60,180,0.25)"
                  : "0 4px 20px rgba(37,99,235,0.3)",
              } : {
                borderRadius: msg.role === "assistant" ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                background: msg.role === "assistant" ? "white" : "linear-gradient(135deg,#4F6F52,#3A5240)",
                border: msg.role === "assistant" ? "1px solid #E6E2D8" : "none",
                color: msg.role === "assistant" ? "#1E2522" : "white",
                boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
              }}>
              {msg.role === "assistant" && !msg.content.trim() ? (
                <span className="flex items-center gap-1.5 py-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.55, delay: i * 0.14, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{ background: isMobileImmersive ? "rgba(255,255,255,0.9)" : "#4F6F52" }} />
                  ))}
                </span>
              ) : (
                msg.content.replace(/\[情感[:：]\s*[^\]]+\]/g, "").trim()
              )}
            </div>
            <span className="text-[9px] font-mono px-1" style={{ color: isMobileImmersive ? "rgba(255,255,255,0.4)" : "#B8B4AC" }}>{msg.timestamp}</span>
          </div>
        </motion.div>
      ))}
      <div ref={bottomRefToUse} />
    </div>
  );

  /* ── 语音识别状态条（全局仅一条，替代重复提示） ── */
  const renderVoiceStatus = (dark = false) => (
    <AnimatePresence>
      {recording && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="flex items-center gap-2 mb-2 px-1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span
            className="text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
            style={{ color: dark ? "rgba(255,255,255,0.88)" : "#4F6F52" }}
          >
            正在聆听 · {String(Math.floor(recordSeconds / 60)).padStart(2, "0")}:{String(recordSeconds % 60).padStart(2, "0")}
          </span>
          <div
            className="flex-1 h-[3px] rounded-full overflow-hidden"
            style={{ background: dark ? "rgba(255,255,255,0.16)" : "#E6E2D8" }}
          >
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${Math.min(100, (recordSeconds / 15) * 100)}%` }}
              transition={{ ease: "linear", duration: 0.9 }}
              style={{ background: "linear-gradient(90deg,#34D399,#FBBF24,#F472B6,#8B5CF6)" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  /* ── Input bar (shared) ── */
  const renderInputBar = (dark = false) => (
    <div>
      {renderVoiceStatus(dark)}
      <div className={`flex items-center gap-2`}>
      {/* Camera */}
      <motion.button type="button" whileTap={{ scale: 0.84 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCamera(true); }}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-md transition-all hover:brightness-105"
        style={{
          background: "linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)",
          boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
          border: "1.5px solid rgba(255, 255, 255, 0.25)",
          color: "white",
        }}>
        <Camera className="w-4 h-4" />
      </motion.button>

      {/* 语音通话 — 取代原语音输入按钮位置 */}
      <motion.button type="button" whileTap={{ scale: 0.84 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); startCall(); }}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative shadow-md transition-all hover:brightness-105"
        style={{
          background: "linear-gradient(135deg,#34C759,#0E8A4F)",
          boxShadow: "0 2px 8px rgba(52,199,89,0.34)",
          border: "1.5px solid rgba(255, 255, 255, 0.25)",
          color: "white",
        }}>
        <motion.span
          animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
          className="flex items-center"
        >
          <Phone className="w-4 h-4" />
        </motion.span>
      </motion.button>

      {/* Text input */}
      <div className="flex-1 flex items-center px-3.5 py-2.5 rounded-2xl"
        style={{
          background: dark ? "rgba(255,255,255,0.1)" : "#F5F0E8",
          border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "#E6E2D8"}`,
          minHeight: 44,
        }}>
        <input type="text" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder={recording ? "正在聆听…" : "向小玉提问…"}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: dark ? "rgba(255,255,255,0.9)" : "#1E2522", fontSize: 16 }} />
      </div>

      {/* Send */}
      <AnimatePresence mode="wait">
        {input.trim() ? (
          <motion.button key="send"
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }} whileTap={{ scale: 0.84 }}
            onClick={() => sendMessage(input)}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg,#4F6F52,#3A5240)",
              boxShadow: "0 3px 12px rgba(79,111,82,0.38)",
            }}>
            <Send className="w-4 h-4 text-white" />
          </motion.button>
        ) : <div key="gap" className="w-10 h-10 flex-shrink-0" />}
      </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {/* ══════════════════════════════════════════════
          MOBILE — full-screen immersive (hidden on md+)
          ══════════════════════════════════════════════ */}
      <div className="flex flex-col md:hidden transition-all duration-500 overflow-hidden"
        style={{
          // 键盘弹出时按可视视口高度收窄，避免输入区被键盘顶起后数字人遮挡内容
          height: keyboardHeight > 0
            ? `${keyboardHeight}px`
            : "calc(100svh - 56px - env(safe-area-inset-bottom, 0px))",
          background: bgImage
            ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(${bgImage})`
            : "linear-gradient(180deg,#131C18 0%,#1A2520 45%,#0E1710 100%)",
          backgroundSize: bgImage ? "cover" : undefined,
          backgroundPosition: bgImage ? "center" : undefined,
        }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0 relative z-[70] pointer-events-auto"
          style={{ paddingTop: "calc(env(safe-area-inset-top,44px) + 24px)" }}>
          <div className="flex items-center gap-2">
            <motion.div animate={{ backgroundColor: (loading || isSynthesizing) ? "#D2A053" : "#34C759" }}
              className="w-2 h-2 rounded-full" />
            <span className="text-[11px] font-medium" style={{ color: (loading || isSynthesizing) ? "#D2A053" : "rgba(255,255,255,0.75)" }}>
              {loading ? "正在思考回答…" : (isSynthesizing ? "正在合成语音播放" : (avatarState === "speaking" ? "正在语音伴游解说中..." : (ttsEnabled ? "旅行家Pro导览官 · 在线" : "语音播报已关闭 · 在线")))}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2.5 relative z-[60]">
            <div className="flex gap-2 relative z-30">
            <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); triggerHaptic(); setShowBgMenu(!showBgMenu); setShowPersonaMenu(false); }}
              title="切换背景"
              className="w-8 h-8 rounded-full flex items-center justify-center animate-fade-in cursor-pointer pointer-events-auto"
              style={{ background: "rgba(255,255,255,0.08)", color: showBgMenu ? "#D2A053" : "rgba(255,255,255,0.6)" }}>
              <ImageIcon className="w-3.5 h-3.5" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); triggerHaptic(); setShowPersonaMenu(true); setShowBgMenu(false); }}
              title="切换分身形象"
              className="w-8 h-8 rounded-full flex items-center justify-center animate-fade-in cursor-pointer pointer-events-auto"
              style={{ background: "rgba(255,255,255,0.08)", color: showPersonaMenu ? "#D2A053" : "rgba(255,255,255,0.6)" }}>
              <User className="w-3.5 h-3.5" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); triggerHaptic(); setShowVoiceMenu(!showVoiceMenu); setShowBgMenu(false); setShowPersonaMenu(false); }}
              title="声音选择与音色切换"
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer pointer-events-auto"
              style={{ background: "rgba(255,255,255,0.08)", color: showVoiceMenu || ttsEnabled ? "#D2A053" : "rgba(255,255,255,0.3)" }}>
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); triggerHaptic(); setShowHistory(true); }}
              title="历史对话"
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer pointer-events-auto"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
              <History className="w-3.5 h-3.5" />
            </motion.button>
          </div>

          {/* Voice Dropdown Menu */}
          {showVoiceMenu && (
            <div className="absolute right-0 top-12 z-[80] w-64 rounded-2xl p-3.5 border border-white/15 backdrop-blur-2xl bg-black/90 shadow-2xl space-y-3 pointer-events-auto text-white">
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-[#D2A053]" />
                  <span className="text-xs font-bold tracking-wide">切换导游音色</span>
                </div>
                <button onClick={() => setShowVoiceMenu(false)} className="text-white/40 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>

              {/* Voice On/Off Toggle Bar */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-[11px] text-white/70">语音播报开关</span>
                <button
                  onClick={() => {
                    if (ttsEnabled) {
                      window.speechSynthesis?.cancel();
                      stopAudio();
                      setIsSynthesizing(false);
                      setAvatarState("idle");
                    }
                    setTtsEnabled(!ttsEnabled);
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                    ttsEnabled ? "bg-[#D2A053] text-black shadow-sm" : "bg-white/10 text-white/40"
                  }`}
                >
                  {ttsEnabled ? "已开启" : "已关闭"}
                </button>
              </div>

              {/* Voice Options List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5 scrollbar-none">
                {VOICE_OPTIONS.map((opt) => {
                  const isSelected = selectedVoiceId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => selectVoice(opt)}
                      className={`w-full p-2 rounded-xl text-left transition-all border flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-[#D2A053] bg-[#D2A053]/25 text-white shadow-md"
                          : "border-white/5 bg-white/5 text-white/80 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold">{opt.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            opt.gender === "female" ? "bg-pink-500/20 text-pink-300 border border-pink-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}>
                            {opt.tag}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50">{opt.desc}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[#D2A053] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={(e) => { e.stopPropagation(); triggerHaptic(); handleNewChat(); }}
            className="px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg border border-white/20 select-none animate-fade-in cursor-pointer pointer-events-auto"
            style={{
              background: "linear-gradient(135deg, #D2A053 0%, #B8843A 100%)",
              boxShadow: "0 4px 14px rgba(210, 160, 83, 0.4)",
              color: "white",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[11px] font-black tracking-wider">新建聊天</span>
          </motion.button>

          {/* 视频聊天开关 — 仅在语音通话界面显示 */}
          {inCall && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={(e) => {
              e.stopPropagation();
              setVideoChatEnabled((v) => !v);
            }}
            className="px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg border select-none animate-fade-in cursor-pointer pointer-events-auto"
            style={{
              background: videoChatEnabled
                ? "linear-gradient(135deg,#5AB2FF 0%,#2563EB 100%)"
                : "rgba(255,255,255,0.14)",
              borderColor: videoChatEnabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.22)",
              boxShadow: videoChatEnabled ? "0 4px 14px rgba(37,99,235,0.42)" : "none",
              color: "white",
            }}
          >
            {videoChatEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-black tracking-wider">
              视频聊天{videoChatEnabled ? "" : "（已关）"}
            </span>
          </motion.button>
          )}

            {/* Background Dropdown Menu */}
            {showBgMenu && (
              <div className="absolute right-0 top-12 z-[70] w-56 rounded-2xl p-3 border border-white/10 backdrop-blur-xl bg-black/80 shadow-2xl space-y-2.5 pointer-events-auto">
                <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
                  <span className="text-xs font-semibold text-white/90">切换景点背景</span>
                  <button onClick={() => setShowBgMenu(false)} className="text-white/40 hover:text-white cursor-pointer"><X className="w-3 h-3" /></button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {BG_PRESETS.map((bg) => (
                    <button key={bg.id} onClick={() => { setBgImage(bg.url); setShowBgMenu(false); }}
                      className="p-1.5 rounded-lg text-left text-[11px] font-medium transition-all border text-white hover:bg-white/10 cursor-pointer"
                      style={{
                        borderColor: (bgImage === bg.url) ? "#D2A053" : "transparent",
                        background: (bgImage === bg.url) ? "rgba(210,160,83,0.25)" : "rgba(255,255,255,0.05)"
                      }}>
                      <div className="truncate">{bg.label}</div>
                    </button>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-white/10">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full py-1.5 rounded-lg text-center text-[11px] font-semibold text-black bg-[#D2A053] hover:bg-[#b8843a] transition-colors cursor-pointer">
                    上传自定义背景
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Avatar zone：对话展开时收缩上移，避免数字人遮挡气泡与输入区 */}
        <div className={`flex-1 flex flex-col items-center justify-center px-4 relative min-h-0 pb-36 transition-all duration-300 pointer-events-none ${isStarcloudAvatar ? "z-[45]" : ""}`}
          style={{
            transform: chatExpanded && messages.length > 1 ? "translateY(-8%) scale(0.78)" : undefined,
            transformOrigin: "center 40%",
          }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%,rgba(79,111,82,0.12) 0%,transparent 70%)" }} />
          {spotName && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-[11px]"
              style={{ background: "rgba(210,160,83,0.12)", border: "1px solid rgba(210,160,83,0.28)", color: "#D2A053" }}>
              <Sparkles className="w-3 h-3" />当前聚焦：<strong>{spotName}</strong>
            </motion.div>
          )}
          {!isDesktop && <DigitalAvatar state={avatarState} size="hero" audioElement={audioRef.current} avatarStyle={selectedStyle} />}

          {/* 摄像头小窗：仅在语音通话中自动开启（导览界面不请求摄像头权限） */}
          {inCall && videoChatEnabled && (
            <VideoCallPreview active width={72} height={128} className="top-2 right-2" />
          )}
        </div>

        {/* Chat drawer — fully transparent, no background mask */}
        <motion.div
          animate={{ height: chatExpanded ? "42vh" : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          style={{ bottom: inCall ? 180 : 128 }}
          className="overflow-hidden absolute left-3 right-3 z-30 rounded-t-2xl pointer-events-auto">
          <div ref={mobileScrollRef} className="h-full overflow-y-auto px-4 py-3"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 86%, transparent 100%)",
            }}>
            {renderMessageList(true, mobileBottomRef, "sm")}
          </div>
        </motion.div>

        {/* Input zone — 通话中隐藏快捷提问与输入框，原位替换为通话控制面板 */}
        {inCall ? (
          <div className="flex-shrink-0 px-3 pb-[56px] pt-2 relative z-[60]">
            <VoiceCallDock
              recording={recording}
              recognizing={recognizing}
              recordSeconds={recordSeconds}
              onTalkToggle={toggleRecording}
              onHangUp={endCall}
              onConnect={callGreeting}
            />
          </div>
        ) : (
        <div className="flex-shrink-0 px-3 pb-8 pt-2 relative z-[60]">
          {/* Quick prompts */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none mb-2.5 px-1">
            {["历史典故", "门票价格", "游览路线", "避堵推荐", "特色小吃", "拍照打卡"].map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.94 }}
                onClick={() => sendMessage(p)}
                className="flex-shrink-0 text-[11px] px-3.5 py-1.5 rounded-full transition-colors"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "rgba(255,255,255,0.9)"
                }}
              >
                {p}
              </motion.button>
            ))}
          </div>
          {/* 语音识别状态条：仅一条，替换原来重复的顶部提示 */}
          {renderVoiceStatus(true)}
          {/* Input row: [Camera] [语音通话] [Input pill] [Send/Camera] */}
          <div className="flex items-center gap-2.5">
            {/* Camera button — left of 语音通话 */}
            <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowCamera(true); }}
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg transition-all hover:brightness-105"
              style={{
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                boxShadow: "0 4px 14px rgba(217, 119, 6, 0.4)",
                border: "1.5px solid rgba(255,255,255,0.25)",
              }}>
              <Camera className="w-5 h-5 text-white" />
            </motion.button>

            {/* 语音通话 — 取代原语音输入按钮位置 */}
            <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); startCall(); }}
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative shadow-lg transition-all hover:brightness-105"
              style={{
                background: "linear-gradient(135deg,#34C759 0%,#0E8A4F 100%)",
                boxShadow: "0 4px 14px rgba(52,199,89,0.42)",
                border: "1.5px solid rgba(255,255,255,0.25)",
              }}>
              <motion.span
                animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
                className="flex items-center"
              >
                <Phone className="w-5 h-5 text-white" />
              </motion.span>
            </motion.button>

            {/* Text input pill */}
            <div className="flex-1 flex items-center px-4 py-3 rounded-full"
              style={{
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.28)",
                minHeight: 48,
              }}>
              <input type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                placeholder={recording ? "正在聆听…" : "想聊点什么…"}
                className="flex-1 bg-transparent outline-none"
                style={{ color: "rgba(255,255,255,0.95)", fontSize: 15, caretColor: "white" }} />
            </div>

            {/* Send button */}
            <AnimatePresence mode="wait">
              {input.trim() ? (
                <motion.button key="send"
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }} whileTap={{ scale: 0.84 }}
                  onClick={() => sendMessage(input)}
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg,rgba(255,255,255,0.9),rgba(220,220,220,0.9))",
                    boxShadow: "0 4px 16px rgba(255,255,255,0.25)",
                  }}>
                  <Send className="w-4.5 h-4.5" style={{ color: "#1A2520" }} />
                </motion.button>
              ) : (
                <div key="gap" className="w-12 h-12 flex-shrink-0" />
              )}
            </AnimatePresence>
          </div>
        </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          DESKTOP — two-column layout (hidden on mobile)
          ══════════════════════════════════════════════ */}
      <div className="hidden md:flex h-svh overflow-hidden"
        style={{ background: "#FAF8F5" }}>

        {/* Left: Digital human panel */}
        <div ref={panelRef} className="flex flex-col items-center justify-center flex-shrink-0 relative select-none transition-all duration-500"
          style={{
            width: avatarWidth,
            background: bgImage
              ? `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url(${bgImage})`
              : "linear-gradient(180deg,#1E2C28 0%,#121815 55%,#0E1710 100%)",
            backgroundSize: bgImage ? "cover" : undefined,
            backgroundPosition: bgImage ? "center" : undefined,
            borderRight: "1px solid rgba(255,255,255,0.07)",
          }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: bgImage ? "none" : "radial-gradient(ellipse 80% 60% at 50% 35%,rgba(79,111,82,0.14) 0%,transparent 70%)" }} />

          {/* Desktop Left Panel Floating Controls */}
          <div className="absolute top-8 left-4 right-4 flex justify-between items-center z-[60] pointer-events-auto">
            <div className="text-[11px] font-medium tracking-wide bg-black/40 backdrop-blur px-3 py-1 rounded-full border border-white/10 flex items-center gap-2" style={{ color: (loading || isSynthesizing) ? "#D2A053" : "rgba(255,255,255,0.75)" }}>
              <span className={`w-2 h-2 rounded-full ${(loading || isSynthesizing) ? "bg-[#D2A053] animate-ping" : "bg-[#34C759]"}`} />
              <span>{loading ? "正在思考回答…" : (isSynthesizing ? "正在合成语音播放" : (avatarState === "speaking" ? "正在语音伴游解说中..." : (ttsEnabled ? "旅行家Pro导览官 · 在线" : "语音播报已关闭 · 在线")))}</span>
            </div>
            <div className="flex gap-2 relative z-30 pointer-events-auto">
              <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setShowBgMenu(!showBgMenu); setShowPersonaMenu(false); }}
                title="切换景点背景"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 transition-colors border border-white/10 cursor-pointer pointer-events-auto"
                style={{ color: showBgMenu ? "#D2A053" : "rgba(255,255,255,0.75)" }}>
                <ImageIcon className="w-3.5 h-3.5" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setShowPersonaMenu(true); setShowBgMenu(false); }}
                title="切换分身形象"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 transition-colors border border-white/10 cursor-pointer pointer-events-auto"
                style={{ color: showPersonaMenu ? "#D2A053" : "rgba(255,255,255,0.75)" }}>
                <User className="w-3.5 h-3.5" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setShowVoiceMenu(!showVoiceMenu); setShowBgMenu(false); setShowPersonaMenu(false); }}
                title="声音选择与音色切换"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 transition-colors border border-white/10 cursor-pointer pointer-events-auto"
                style={{ color: showVoiceMenu || ttsEnabled ? "#D2A053" : "rgba(255,255,255,0.3)" }}>
                {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
                title="历史对话"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 transition-colors border border-white/10 cursor-pointer pointer-events-auto"
                style={{ color: "rgba(255,255,255,0.75)" }}>
                <History className="w-3.5 h-3.5" />
              </motion.button>

              {/* Background Dropdown Menu */}
              {showBgMenu && (
                <div className="absolute right-0 top-10 z-[70] w-56 rounded-2xl p-3 border border-white/10 backdrop-blur-xl bg-black/80 shadow-2xl space-y-2.5 pointer-events-auto">
                  <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
                    <span className="text-xs font-semibold text-white/90">切换景点背景</span>
                    <button onClick={() => setShowBgMenu(false)} className="text-white/40 hover:text-white cursor-pointer"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                    {BG_PRESETS.map((bg) => (
                      <button key={bg.id} onClick={() => { setBgImage(bg.url); setShowBgMenu(false); }}
                        className="p-1.5 rounded-lg text-left text-[11px] font-medium transition-all border text-white hover:bg-white/10 cursor-pointer"
                        style={{
                          borderColor: (bgImage === bg.url) ? "#D2A053" : "transparent",
                          background: (bgImage === bg.url) ? "rgba(210,160,83,0.25)" : "rgba(255,255,255,0.05)"
                        }}>
                        <div className="truncate">{bg.label}</div>
                      </button>
                    ))}
                  </div>
                  <div className="pt-1.5 border-t border-white/10">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 rounded-lg text-center text-[11px] font-semibold text-black bg-[#D2A053] hover:bg-[#b8843a] transition-colors cursor-pointer">
                      上传自定义背景
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#4F6F52]/40 active:bg-[#4F6F52] transition-colors z-20 group"
            onMouseDown={handleMouseDown}
          >
            {/* Visual drag indicator */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-8 bg-white/20 group-hover:bg-white/50 rounded transition-colors" />
          </div>

          <div className="relative z-10 flex flex-col items-center px-6 w-full animate-fade-in">
            {isDesktop && <DigitalAvatar state={avatarState} size="desktop-hero" audioElement={audioRef.current} avatarStyle={selectedStyle} />}

            {/* 摄像头小窗：仅在语音通话中自动开启（导览界面不请求摄像头权限） */}
            {inCall && videoChatEnabled && (
              <VideoCallPreview active width={84} height={150} className="top-[100px] right-3" />
            )}

            {spotName && (
              <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
                style={{ background: "rgba(210,160,83,0.12)", border: "1px solid rgba(210,160,83,0.28)", color: "#D2A053" }}>
                <Sparkles className="w-3 h-3" />聚焦：{spotName}
              </div>
            )}

            {/* TTS + history controls */}
            <div className="mt-5 flex gap-2 justify-center">
              <motion.button whileTap={{ scale: 0.88 }}
                onClick={() => { setShowVoiceMenu(!showVoiceMenu); setShowBgMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "#D2A053", border: "1px solid rgba(255,255,255,0.1)" }}>
                <Volume2 className="w-3.5 h-3.5" />
                声音选择
              </motion.button>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => setShowHistory(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <History className="w-3.5 h-3.5" />历史
              </motion.button>
            </div>
          </div>
        </div>

        {/* Right: Chat panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid #E6E2D8", background: "rgba(250,248,245,0.98)" }}>
            <div className="flex items-center gap-4">
              <div>
                <h2 className="font-bold text-base" style={{ fontFamily: "var(--font-noto-serif)", color: "#1E2522" }}>
                  智能导览问答
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: "#8F9F8F" }}>
                  可语音提问 · 多轮对话 · 知识库实时检索
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D5E5DC] text-[#4F6F52] hover:bg-[#EBF3EE] text-xs font-black transition-all cursor-pointer shadow-sm bg-white"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建聊天
                </button>
                {inCall && (
                <button
                  onClick={() => {
                    setVideoChatEnabled((v) => !v);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition-all cursor-pointer shadow-sm"
                  style={
                    videoChatEnabled
                      ? { borderColor: "#BFD9FF", color: "#1D63D6", background: "#EFF6FF" }
                      : { borderColor: "#E2E5E3", color: "#8A9690", background: "#FFFFFF" }
                  }
                >
                  {videoChatEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  视频聊天{videoChatEnabled ? "" : "（已关）"}
                </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.div animate={{ backgroundColor: loading ? "#D2A053" : "#34C759" }}
                className="w-2 h-2 rounded-full" />
              <span className="text-[11px]" style={{ color: loading ? "#D2A053" : "#4F6F52" }}>
                {loading ? "思考中" : "在线"}
              </span>
            </div>
          </div>

          {/* Messages — same immersive bubble style as mobile */}
          <div ref={desktopScrollRef} className="flex-1 overflow-y-auto px-6 py-4"
            style={{
              background: "#FAF8F5",
              maskImage: "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)",
            }}>
            {renderMessageList(true, desktopBottomRef, "md")}
          </div>

          {/* Input — 通话中隐藏快捷提问与输入框，原位替换为通话控制面板 */}
          {inCall ? (
            <div className="px-6 py-4 flex-shrink-0"
              style={{ borderTop: "1px solid #E6E2D8", background: "rgba(250,248,245,0.98)" }}>
              <VoiceCallDock
                recording={recording}
                recognizing={recognizing}
                recordSeconds={recordSeconds}
                onTalkToggle={toggleRecording}
                onHangUp={endCall}
                onConnect={callGreeting}
              />
            </div>
          ) : (
          <div className="px-6 py-4 flex-shrink-0"
            style={{ borderTop: "1px solid #E6E2D8", background: "rgba(250,248,245,0.98)" }}>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none mb-3 px-1 py-0.5">
              {["历史典故", "门票价格", "游览路线", "避堵推荐", "特色小吃", "拍照打卡"].map((p) => (
                <motion.button
                  key={p}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => sendMessage(p)}
                  className="flex-shrink-0 text-[11px] px-3.5 py-1.5 rounded-full transition-all border text-zinc-600 hover:text-[#4F6F52] hover:border-[#4F6F52] bg-white border-neutral-200 shadow-sm whitespace-nowrap"
                >
                  {p}
                </motion.button>
              ))}
            </div>
            {renderInputBar()}
          </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <input type="file" ref={fileInputRef} onChange={handleBgUpload} accept="image/*" className="hidden" />
      <input type="file" ref={avatarUploadRef} onChange={handleCustomAvatarUpload} accept="image/*,video/*" className="hidden" />

      {/* 应用内拍照识别（语音输入按钮旁的相机图标直接唤起） */}
      <AnimatePresence>
        {showCamera && (
          <CameraRecognize
            currentSpot={spotName || undefined}
            autoStartCamera
            onClose={() => setShowCamera(false)}
            onRecognized={handleCameraRecognized}
          />
        )}
      </AnimatePresence>

      {/* Voice Selection Dropdown Menu - Centered Screen Modal */}
      <AnimatePresence>
        {showVoiceMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-auto"
            style={{ background: "rgba(0,0,0,0.68)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowVoiceMenu(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-md rounded-3xl p-6 border border-white/20 bg-[#16201B] shadow-2xl space-y-4 text-white pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#D2A053]/20 flex items-center justify-center border border-[#D2A053]/30">
                    <Volume2 className="w-5 h-5 text-[#D2A053]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold tracking-wide" style={{ fontFamily: "var(--font-noto-serif)" }}>
                      导游声音选择与音色设置
                    </h3>
                    <p className="text-[11px] text-white/50">支持实时试听与声音音色自由切换</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVoiceMenu(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/60 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Voice On/Off Toggle Bar */}
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/90">语音播报功能</span>
                  <span className="text-[10px] text-white/40">关闭后仅显示文本不发声</span>
                </div>
                <button
                  onClick={() => {
                    if (ttsEnabled) {
                      window.speechSynthesis?.cancel();
                      stopAudio();
                      setIsSynthesizing(false);
                      setAvatarState("idle");
                    }
                    setTtsEnabled(!ttsEnabled);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    ttsEnabled ? "bg-[#D2A053] text-black shadow-md" : "bg-white/10 text-white/40"
                  }`}
                >
                  {ttsEnabled ? "已开启语音" : "已关闭"}
                </button>
              </div>

              {/* Voice Options List */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-none">
                {VOICE_OPTIONS.map((opt) => {
                  const isSelected = selectedVoiceId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => selectVoice(opt)}
                      className={`w-full p-3.5 rounded-2xl text-left transition-all border flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-[#D2A053] bg-[#D2A053]/25 text-white shadow-lg ring-1 ring-[#D2A053]/50"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{opt.name}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              opt.gender === "female"
                                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {opt.tag}
                          </span>
                        </div>
                        <span className="text-xs text-white/50">{opt.desc}</span>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-[#D2A053] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            onClose={() => setShowHistory(false)}
            onResume={(msgs) => {
              setShowHistory(false);
              setMessages(msgs);
              setChatExpanded(true);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSatisfaction && (
          <SatisfactionModal onClose={() => setShowSatisfaction(false)}
            onSubmit={async (rating, comment) => {
              try {
                await request("/api/qa/feedback", {
                  method: "POST",
                  body: JSON.stringify({ rating, comment })
                });
                toast.success("感谢您的评价！");
              } catch {
                toast.error("评价提交失败，请稍后再试。");
              }
              setShowSatisfaction(false);
            }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPersonaMenu && (
          <AvatarSelectorModal
            onClose={() => setShowPersonaMenu(false)}
            allAvatars={allAvatars}
            customAvatars={customAvatars}
            selectedStyle={selectedStyle}
            onSelect={selectAvatar}
            onUploadClick={() => avatarUploadRef.current?.click()}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function HistorySheet({
  onClose,
  onResume,
}: {
  onClose: () => void;
  onResume: (msgs: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>) => void;
}) {
  const [sessions, setSessions] = useState<
    Array<{ id: number; title: string; updatedAt: string; messages: Array<{ role: "user" | "assistant"; content: string; timestamp: string }> }>
  >([]);
  const [ld, setLd] = useState(true);

  const loadHistory = async () => {
    setLd(true);
    let localItems: any[] = [];
    try {
      const stored = localStorage.getItem("guide_chat_history_sessions");
      if (stored) localItems = JSON.parse(stored);
    } catch (e) {}

    try {
      const r = await request("/api/qa/sessions");
      const remoteData = await r.json();
      if (Array.isArray(remoteData) && remoteData.length > 0) {
        const mergedMap = new Map();
        [...localItems, ...remoteData].forEach((item) => {
          if (item && (item.id || item.title)) {
            mergedMap.set(item.id || item.title, item);
          }
        });
        setSessions(Array.from(mergedMap.values()));
      } else {
        setSessions(localItems);
      }
    } catch {
      setSessions(localItems);
    } finally {
      setLd(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const clearHistory = () => {
    try {
      localStorage.removeItem("guide_chat_history_sessions");
    } catch {}
    setSessions([]);
    toast.success("历史记录已清空");
  };

  const lastMsg = (msgs: Array<{ role: string; content: string }>) =>
    msgs.filter((m) => m.role === "user").slice(-1)[0]?.content || "（包含问答解说）";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex flex-col justify-end pointer-events-auto"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring" as const, stiffness: 300, damping: 35 }}
        className="rounded-t-3xl p-6 space-y-4 overflow-y-auto border-t border-white/10"
        style={{ background: "#16201B", maxHeight: "75vh" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#D2A053]" />
            <h3 className="font-bold text-base text-white" style={{ fontFamily: "var(--font-noto-serif)" }}>
              历史对话记录
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {sessions.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                清空历史
              </button>
            )}
            <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} className="text-white/50 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {ld ? (
          <div className="space-y-3 py-4">
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm text-white/50">暂无历史对话记录</p>
            <p className="text-xs text-white/30 mt-1">点击「新建聊天」时会自动归档上一次对话</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-0.5">
            {sessions.map((s) => (
              <motion.div
                key={s.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (s.messages && s.messages.length > 0) {
                    onResume(s.messages as any);
                    toast.success(`已载入历史对话：「${s.title}」`);
                  } else {
                    toast.info("该会话为空");
                  }
                }}
                className="p-3.5 rounded-2xl cursor-pointer transition-all border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#D2A053]/40"
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm font-bold truncate text-white">{s.title}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D2A053]/20 text-[#D2A053] font-mono flex-shrink-0">
                    {(s.messages ?? []).length} 条消息
                  </span>
                </div>
                <p className="text-xs mt-1.5 truncate text-white/60">{lastMsg(s.messages ?? [])}</p>
                <div className="flex justify-between items-center mt-2 pt-1.5 border-t border-white/5 text-[10px] text-white/35 font-mono">
                  <span>{new Date(s.updatedAt || Date.now()).toLocaleString("zh-CN")}</span>
                  <span className="text-[#D2A053]">点击载入对话 ➔</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
