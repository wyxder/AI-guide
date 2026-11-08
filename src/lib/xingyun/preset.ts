/**
 * 魔珐星云「诗仙」数字人预设。
 *
 * 该预设位于原有 Live2D 形象列表首位，原有形象与其能力保持不变；
 * 选中所属 avatarStyle 时，前端改用魔珐星云具身智能体 SDK 渲染与播报。
 */

export const XINGYUN_AVATAR_STYLE = "xingyun_shixian";

export const XINGYUN_AVATAR_IMAGE = "/xingyun/shixian.webp";

export const XINGYUN_AVATAR_PRESET = {
  name: "诗仙 · 李白",
  avatarStyle: XINGYUN_AVATAR_STYLE,
  voiceStyle: "warm",
  speechRate: 100,
  pitch: 100,
  greeting: "你好，我是诗仙李白。山河万里皆可入诗，愿与君同游此地。",
  isDefault: false,
  isActive: true,
  imageUrl: XINGYUN_AVATAR_IMAGE,
};

export function isXingyunAvatarStyle(style?: string | null): boolean {
  return style === XINGYUN_AVATAR_STYLE;
}
