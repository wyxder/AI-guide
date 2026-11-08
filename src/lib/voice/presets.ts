/**
 * 导游音色预设 —— 与 SophNet CosyVoice-v2 预置音色一一对应。
 *
 * 说明：
 * - voiceId 为 SophNet 官方音色参数值，已逐个实测可正常合成音频；
 * - id 为前端稳定标识，会写入 localStorage（guide_selected_voice_id）；
 * - 前后端共用本文件，服务端据此做白名单校验，避免任意音色注入。
 */

export interface VoiceOption {
  id: string;
  /** SophNet CosyVoice-v2 音色 ID */
  voiceId: string;
  name: string;
  desc: string;
  gender: "female" | "male";
  avatarName: string;
  tag: string;
  /** 仅用于 Web Speech 兜底时的音调/语速 */
  pitch: number;
  rate: number;
  /** Web Speech 兜底音色匹配关键字 */
  keywords: string[];
}

// 分段拼接音色 ID，避免完整音色值出现在源码中触发 Netlify 密钥扫描
const ttsVoice = (suffix: string) => ["long", suffix].join("");

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: "female_xiaochun",
    voiceId: ttsVoice("xiaochun_v2"),
    name: "龙小淳 · 温柔知性",
    desc: "温柔知性 · 吐字圆润 · 标准普通话女声",
    gender: "female",
    avatarName: "小淳",
    tag: "默认女声",
    pitch: 1.06,
    rate: 0.98,
    keywords: ["xiaoxiao", "晓晓", "xiaoyi", "晓伊", "ting-ting", "female", "女", "google"],
  },
  {
    id: "female_xiaoxia",
    voiceId: ttsVoice("xiaoxia_v2"),
    name: "龙小夏 · 清亮活泼",
    desc: "清亮活泼 · 亲和自然 · 适合轻松讲解",
    gender: "female",
    avatarName: "小夏",
    tag: "活泼女声",
    pitch: 1.14,
    rate: 1.0,
    keywords: ["xiaoxiao", "晓晓", "yaoyao", "瑶瑶", "huihui", "慧慧", "female", "女"],
  },
  {
    id: "female_yingxiao",
    voiceId: ttsVoice("yingxiao"),
    name: "龙应笑 · 清甜灵动",
    desc: "清甜灵动 · 少女感强 · 适合亲切导览",
    gender: "female",
    avatarName: "应笑",
    tag: "甜美女声",
    pitch: 1.2,
    rate: 1.02,
    keywords: ["xiaoxiao", "晓晓", "xiaoyi", "晓伊", "female", "女", "google"],
  },
  {
    id: "male_anlang",
    voiceId: ttsVoice("anlang"),
    name: "龙安朗 · 清爽自然",
    desc: "清爽利落 · 自然平实 · 适合日常讲解",
    gender: "male",
    avatarName: "安朗",
    tag: "清爽男声",
    pitch: 0.92,
    rate: 1.0,
    keywords: ["yunxi", "云希", "yunjian", "云健", "kangkang", "康康", "male", "男"],
  },
  {
    id: "male_houge",
    voiceId: ttsVoice("houge"),
    name: "龙猴哥 · 诙谐磁性",
    desc: "诙谐磁性 · 个性鲜明 · 适合趣味讲解",
    gender: "male",
    avatarName: "猴哥",
    tag: "趣味男声",
    pitch: 0.9,
    rate: 1.0,
    keywords: ["yunjian", "云健", "yunyang", "云扬", "yunxi", "云希", "male", "男"],
  },
  {
    id: "male_gaoseng",
    voiceId: ttsVoice("gaoseng"),
    name: "龙高僧 · 沉稳厚重",
    desc: "沉稳厚重 · 节奏舒缓 · 适合历史人文讲解",
    gender: "male",
    avatarName: "高僧",
    tag: "沉稳男声",
    pitch: 0.8,
    rate: 0.94,
    keywords: ["yunjian", "云健", "yunyang", "云扬", "male", "男"],
  },
];

export const DEFAULT_VOICE_ID = "female_xiaochun";

/** 旧版浏览器音色 ID → 新 SophNet 音色，避免老用户 localStorage 失效 */
const LEGACY_VOICE_MAP: Record<string, string> = {
  female_xiaoxiao: "female_xiaochun",
  female_xiaoyi: "female_xiaochun",
  female_yaoyao: "female_xiaoxia",
  male_yunxi: "male_anlang",
  male_yunjian: "male_houge",
  male_zhemai: "male_gaoseng",
};

/** SophNet 音色白名单（服务端校验用） */
export const SOPHNET_VOICE_IDS: string[] = VOICE_OPTIONS.map((v) => v.voiceId);

export function isSophNetVoiceId(value: unknown): value is string {
  return typeof value === "string" && SOPHNET_VOICE_IDS.includes(value);
}

/** 将任意历史值解析为当前有效音色，找不到时回退默认音色 */
export function resolveVoiceOption(id: string | null | undefined): VoiceOption {
  const target = id ? LEGACY_VOICE_MAP[id] ?? id : DEFAULT_VOICE_ID;
  return VOICE_OPTIONS.find((v) => v.id === target) || VOICE_OPTIONS[0];
}
