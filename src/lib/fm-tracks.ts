/**
 * 伴游FM 曲目元数据
 * 音频与封面均为本地静态资源（public/audio/fm、public/images/fm），
 * 由 scripts/gen_fm_assets.py 生成，运行时无任何网络 / TTS 依赖。
 */
export interface FmTrack {
  id: string;
  title: string;
  en: string;
  subtitle: string;
  artist: string;
  cover: string;
  audio: string;
  /** 秒，用于列表展示；真实时长以 loadedmetadata 为准 */
  duration: number;
  accent: string;
  text: string;
}

export const FM_TRACKS: FmTrack[] = [
  {
    id: "heritage",
    title: "锦绣蜀韵",
    en: "BROCADE OF SHU",
    subtitle: "指尖上的蜀绣 · 巴蜀锦绣非遗传奇",
    artist: "伴游FM · 非遗特辑",
    cover: "/images/fm/heritage.svg",
    audio: "/audio/fm/heritage.mp3",
    duration: 28,
    accent: "#C9795A",
    text: "蜀绣，又名“川绣”，是中国四大名绣之一，有着两千多年的历史。它以软缎和彩丝为主要原料，结合巴蜀独特的风土人情，形成了细腻针法与亮丽色彩的完美平衡。今天，跟随伴游FM的叙事声波，一起走进锦江两岸的刺绣工坊，聆听细针穿过软缎的沙沙声。",
  },
  {
    id: "celebrities",
    title: "草堂听雨",
    en: "RAIN AT THE COTTAGE",
    subtitle: "草堂留后世 · 诗圣杜甫的蜀中岁月",
    artist: "伴游FM · 城市名人",
    cover: "/images/fm/celebrities.svg",
    audio: "/audio/fm/celebrities.mp3",
    duration: 32,
    accent: "#6E8F80",
    text: "杜甫，字子美，唐代伟大的现实主义诗人。安史之乱爆发后，他流落至成都，在浣花溪畔营造了一间茅屋，这便是名扬千古的杜甫草堂。在此期间，他创作了《春夜喜雨》《蜀相》等无数脍炙人口的经典诗篇。",
  },
  {
    id: "history",
    title: "古蜀回响",
    en: "ECHOES OF ANCIENT SHU",
    subtitle: "蜀地千年史 · 古蜀国与蓉城起源",
    artist: "伴游FM · 历史典故",
    cover: "/images/fm/history.svg",
    audio: "/audio/fm/history.mp3",
    duration: 35,
    accent: "#9C7840",
    text: "成都，简称“蓉”，是一座有着三千余年建城史的历史文化名城。从宝墩遗址到金沙文明，古蜀先民在这片肥沃的盆地创造了璀璨的青铜文明。西周时期，建都者“一年成邑，二年成都”，城名与城址千百年来从未更改。",
  },
  {
    id: "food",
    title: "烟火成都",
    en: "FLAVORS OF CHENGDU",
    subtitle: "舌尖上的麻辣 · 川菜与火锅进化史",
    artist: "伴游FM · 美食起源",
    cover: "/images/fm/food.svg",
    audio: "/audio/fm/food.mp3",
    duration: 23,
    accent: "#D97A3C",
    text: "川菜作为中国四大菜系之一，以“一菜一格，百菜百味”闻名天下。今天川菜标志性的辣椒，其实是在明末清初才传入巴蜀的。成都火锅更是码头文化的缩影，这一餐麻辣的背后，是巴蜀人民对生活的热烈期望。",
  },
  {
    id: "life",
    title: "盖碗茶香",
    en: "TEA HOUSE HOURS",
    subtitle: "老茶馆慢时光 · 盖碗茶里的生活美学",
    artist: "伴游FM · 市井生活",
    cover: "/images/fm/life.svg",
    audio: "/audio/fm/life.mp3",
    duration: 29,
    accent: "#A8A079",
    text: "在成都，有一种生活美学叫“喝盖碗茶”。走进街角的老茶馆，一把竹椅，一张矮木桌，三两好友，一坐就是一下午。茶馆不仅是喝茶的地方，更是一个社交、调解纠纷、甚至进行商业谈判的公共场所。",
  },
  {
    id: "landmarks",
    title: "巷陌慢行",
    en: "WANDERING THE LANES",
    subtitle: "宽窄巷子 · 老成都的院落生活缩影",
    artist: "伴游FM · 城市地标",
    cover: "/images/fm/landmarks.svg",
    audio: "/audio/fm/landmarks.mp3",
    duration: 27,
    accent: "#6F8C99",
    text: "宽窄巷子是成都极具代表性的历史文化保护区，由宽巷子、窄巷子和井巷子平行排列组成。这里原本是清代少城遗留的兵丁胡同，如今完整保留了清末民初的四合院落风貌。青砖黛瓦之间，是古典与现代的交融。",
  },
  {
    id: "legends",
    title: "神鸟逐日",
    en: "SUN BIRD IN FLIGHT",
    subtitle: "金沙神鸟 · 太阳神鸟的飞翔传说",
    artist: "伴游FM · 民间传说",
    cover: "/images/fm/legends.svg",
    audio: "/audio/fm/legends.mp3",
    duration: 24,
    accent: "#C99342",
    text: "在成都金沙遗址出土的“太阳神鸟”金饰，是一件震惊世界的国宝级文物。极薄的金箔上镂空刻画着四只首尾相接、逆时针飞翔的神鸟，环绕着十二道光芒旋转的太阳，寓意着四季轮回与对光明的无限向往。",
  },
];

export const FM_TRACK_MAP: Record<string, FmTrack> = Object.fromEntries(
  FM_TRACKS.map((t) => [t.id, t])
);

export function formatFmTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "00:00";
  const s = Math.floor(secs);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
