import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { avatarConfigs } from "@/lib/db/schema/admin";
import { eq, desc } from "drizzle-orm";
import { XINGYUN_AVATAR_PRESET } from "@/lib/xingyun/preset";
import { XIAOMEI_AVATAR_PRESET } from "@/lib/xiaomei/preset";

// Live2D cartoon avatar presets
const DEFAULT_PRESETS = [
  {
    name: "HaruGreeter (Live2D)",
    avatarStyle: "live2d_HaruGreeter",
    voiceStyle: "lively",
    speechRate: 100,
    pitch: 100,
    greeting: "Hello, welcome! I am HaruGreeter, your Live2D guide. How can I help you today?",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/HaruGreeter/HaruGreeter.png"
  },
  {
    name: "Haru (Live2D)",
    avatarStyle: "live2d_Haru",
    voiceStyle: "lively",
    speechRate: 100,
    pitch: 100,
    greeting: "Hi, I am Haru! Nice to meet you. Let's start our journey!",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Haru/Haru.png"
  },
  {
    name: "Kei (Live2D)",
    avatarStyle: "live2d_Kei",
    voiceStyle: "professional",
    speechRate: 100,
    pitch: 90,
    greeting: "Hello, my name is Kei. I am here to assist you with a professional guide.",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Kei/Kei.png"
  },
  {
    name: "Chitose (Live2D)",
    avatarStyle: "live2d_Chitose",
    voiceStyle: "warm",
    speechRate: 100,
    pitch: 100,
    greeting: "Welcome! My name is Chitose. I will share the beautiful stories of this place.",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Chitose/Chitose.png"
  },
  {
    name: "Epsilon (Live2D)",
    avatarStyle: "live2d_Epsilon",
    voiceStyle: "professional",
    speechRate: 100,
    pitch: 100,
    greeting: "Greetings, I am Epsilon. I will guide you through our tour highlights.",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Epsilon/Epsilon.png"
  },
  {
    name: "Hibiki (Live2D)",
    avatarStyle: "live2d_Hibiki",
    voiceStyle: "lively",
    speechRate: 100,
    pitch: 105,
    greeting: "Hello! I am Hibiki. Let's explore all the amazing spots together!",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Hibiki/Hibiki.png"
  },
  {
    name: "Hiyori (Live2D)",
    avatarStyle: "live2d_Hiyori",
    voiceStyle: "warm",
    speechRate: 100,
    pitch: 105,
    greeting: "你好，我是日和！很高兴在这个美好的天气里遇见你，今天想听我介绍哪个景点呢？",
    isDefault: true,
    isActive: true,
    imageUrl: "/sentio/characters/free/Hiyori/Hiyori.png"
  },
  {
    name: "Izumi (Live2D)",
    avatarStyle: "live2d_Izumi",
    voiceStyle: "warm",
    speechRate: 100,
    pitch: 100,
    greeting: "Welcome, I am Izumi. Let's make this trip a wonderful memory.",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Izumi/Izumi.png"
  },
  {
    name: "Rice (Live2D)",
    avatarStyle: "live2d_Rice",
    voiceStyle: "lively",
    speechRate: 100,
    pitch: 100,
    greeting: "Hi there! I am Rice. Hope you enjoy the guide today!",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Rice/Rice.png"
  },
  {
    name: "Shizuku (Live2D)",
    avatarStyle: "live2d_Shizuku",
    voiceStyle: "warm",
    speechRate: 95,
    pitch: 95,
    greeting: "Hello, I am Shizuku. I will introduce you to the details of each spot.",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Shizuku/Shizuku.png"
  },
  {
    name: "Tsumiki (Live2D)",
    avatarStyle: "live2d_Tsumiki",
    voiceStyle: "lively",
    speechRate: 100,
    pitch: 100,
    greeting: "Welcome! I am Tsumiki. Let's start the digital human guide journey!",
    isDefault: false,
    isActive: true,
    imageUrl: "/sentio/characters/free/Tsumiki/Tsumiki.png"
  }
];

// 「诗仙」「小美」魔珐星云具身智能体排在首位；原有 Live2D 形象与能力完全保留
const STARCLOUD_PRESETS = [XINGYUN_AVATAR_PRESET, XIAOMEI_AVATAR_PRESET];
const ALL_PRESETS = [...STARCLOUD_PRESETS, ...DEFAULT_PRESETS];

/** 返回列表时始终把「诗仙」「小美」置顶，原有形象顺序保持不变 */
function withXingyunFirst<T extends { avatarStyle: string }>(list: T[]): T[] {
  const first: T[] = [];
  STARCLOUD_PRESETS.forEach((preset) => {
    first.push(...list.filter((item) => item.avatarStyle === preset.avatarStyle));
  });
  const rest = list.filter((item) => !STARCLOUD_PRESETS.some((preset) => preset.avatarStyle === item.avatarStyle));
  return [...first, ...rest];
}

// 已下线的形象名称，用于清理历史数据
const REMOVED_PRESET_NAMES = [
  "AI数字人",
  "职场专家",
  "元气甜妹",
  "古风女子",
  "韩系女神",
  "元气少年",
  "商业精英",
  "潮流酷哥",
  "阳光运动男",
  "儒雅书生",
  "Mao (Live2D)",
];

export async function GET() {
  try {
    let configs = await db.select().from(avatarConfigs).where(eq(avatarConfigs.isActive, true)).orderBy(desc(avatarConfigs.createdAt));
    
    const hasHiyoriDefault = configs.some(c => c.avatarStyle === "live2d_Hiyori" && c.isDefault);
    // 旧的真人照片形象已下线，命中则重建为纯 Live2D 预设
    const hasRemovedPresets = configs.some(c => REMOVED_PRESET_NAMES.includes(c.name));
    const hasXingyunPreset = configs.some(c => c.avatarStyle === XINGYUN_AVATAR_PRESET.avatarStyle);
    const hasXiaomeiPreset = configs.some(c => c.avatarStyle === XIAOMEI_AVATAR_PRESET.avatarStyle);
    // 「诗仙」「小美」缩略图等预设信息变更后，旧数据需按最新预设重建
    const hasStaleStarcloud = configs.some((c) => {
      const preset = STARCLOUD_PRESETS.find((p) => p.avatarStyle === c.avatarStyle);
      return preset ? c.imageUrl !== preset.imageUrl : false;
    });
    
    // Seed database if configurations are incomplete, outdated, using URL avatarStyle, or default is not Hiyori
    if (configs.length < ALL_PRESETS.length || !hasHiyoriDefault || hasRemovedPresets || !hasXingyunPreset || !hasXiaomeiPreset || hasStaleStarcloud || (configs[0] && configs[0].avatarStyle.startsWith("http"))) {
      await db.delete(avatarConfigs);
      await db.insert(avatarConfigs).values(ALL_PRESETS);
      configs = await db.select().from(avatarConfigs).where(eq(avatarConfigs.isActive, true)).orderBy(desc(avatarConfigs.createdAt));
    }
    
    return NextResponse.json(withXingyunFirst(configs));
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch avatars" }, { status: 500 });
  }
}
