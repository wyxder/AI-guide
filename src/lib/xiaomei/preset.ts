/**
 * 魔珐星云「小美」数字人预设。
 *
 * 小美与「诗仙」各自对应星云控制台上独立的驱动应用（独立 App ID / App Secret），
 * 因此这里单独定义形象标识与预设信息，不改动原有形象列表与能力。
 */

export const XIAOMEI_AVATAR_STYLE = "xingyun_xiaomei";

export const XIAOMEI_AVATAR_IMAGE = "/images/小美.png";

export const XIAOMEI_AVATAR_PRESET = {
  name: "小美 · 星云智能体",
  avatarStyle: XIAOMEI_AVATAR_STYLE,
  voiceStyle: "warm",
  speechRate: 100,
  pitch: 100,
  greeting: "你好呀，我是小美！景区路线、景点故事、拍照识景都可以交给我，想去哪儿逛逛？",
  isDefault: false,
  isActive: true,
  imageUrl: XIAOMEI_AVATAR_IMAGE,
};

export function isXiaomeiAvatarStyle(style?: string | null): boolean {
  return style === XIAOMEI_AVATAR_STYLE;
}
