"use client";

/**
 * 伴游FM 全局播放器（模块级单例）
 *
 * 设计目标：点击即响、不等待。
 * 1. 页面挂载后后台并行预取全部本地 mp3 并转成 blob URL，播放时零网络请求；
 * 2. 单个常驻 HTMLAudioElement，切歌不重新创建，避免解码/握手开销；
 * 3. 若预取尚未完成，直接回退到同源静态 URL 边下边播，同样毫秒级出声；
 * 4. 通过 useSyncExternalStore 让首页歌单与 /fm 详情页共享同一播放状态。
 */
import { useEffect, useSyncExternalStore } from "react";
import { FM_TRACKS, FM_TRACK_MAP } from "./fm-tracks";

export interface FmPlayerState {
  currentId: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  /** 已完成本地预缓存的曲目 id */
  bufferedIds: string[];
  error: string | null;
}

const INITIAL_STATE: FmPlayerState = {
  currentId: null,
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.85,
  bufferedIds: [],
  error: null,
};

let state: FmPlayerState = INITIAL_STATE;
const listeners = new Set<() => void>();
const blobUrls: Record<string, string> = {};
let audio: HTMLAudioElement | null = null;
let queue: string[] = FM_TRACKS.map((t) => t.id);
let prefetchStarted = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function set(patch: Partial<FmPlayerState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot() {
  return state;
}

/** 把一个曲目的全部字节预先拉到内存，播放时无需再等网络 */
function startPrefetch() {
  if (prefetchStarted || typeof window === "undefined") return;
  prefetchStarted = true;

  FM_TRACKS.forEach(async (track) => {
    try {
      const res = await fetch(track.audio, { cache: "force-cache" });
      if (!res.ok) return;
      const blob = await res.blob();
      blobUrls[track.id] = URL.createObjectURL(blob);
      if (!state.bufferedIds.includes(track.id)) {
        set({ bufferedIds: [...state.bufferedIds, track.id] });
      }
    } catch {
      // 预取失败不影响播放：playTrack 会直接使用静态 URL
    }
  });
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;

  const el = new Audio();
  el.preload = "auto";
  el.volume = state.volume;

  el.addEventListener("timeupdate", () => set({ progress: el.currentTime }));
  el.addEventListener("loadedmetadata", () =>
    set({ duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0 })
  );
  el.addEventListener("play", () => set({ isPlaying: true, error: null }));
  el.addEventListener("pause", () => set({ isPlaying: false }));
  el.addEventListener("ended", () => {
    set({ isPlaying: false, progress: 0 });
    nextTrack();
  });
  el.addEventListener("error", () => set({ isPlaying: false, error: "音频加载失败，请重试" }));

  audio = el;
  startPrefetch();
  return el;
}

/** 订阅播放状态；同时触发一次全局预取（组件挂载后） */
export function useFmPlayer(): FmPlayerState {
  useEffect(() => {
    ensureAudio();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 只启动后台预取、不订阅状态；供首页常驻挂载，避免 timeupdate 触发整页重渲染 */
export function useFmPrefetch() {
  useEffect(() => {
    ensureAudio();
  }, []);
}

export function playFmTrack(id: string) {
  const el = ensureAudio();
  const track = FM_TRACK_MAP[id];
  if (!el || !track) return;

  const src = blobUrls[id] || track.audio;
  const isSameTrack = state.currentId === id;

  if (!isSameTrack) {
    el.src = src;
    el.load();
    set({
      currentId: id,
      progress: 0,
      duration: track.duration,
      error: null,
    });
  }

  const p = el.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      // blob 偶发失效时回退到同源静态文件重试一次
      if (src !== track.audio) {
        el.src = track.audio;
        el.play().catch(() => set({ isPlaying: false, error: "播放失败，请点击重试" }));
      } else {
        set({ isPlaying: false, error: "播放失败，请点击重试" });
      }
    });
  }
}

export function toggleFmPlay() {
  const el = ensureAudio();
  if (!el) return;
  if (!state.currentId) {
    playFmTrack(queue[0] || FM_TRACKS[0].id);
    return;
  }
  if (state.isPlaying) {
    el.pause();
  } else {
    playFmTrack(state.currentId);
  }
}

/** 点击歌单卡片：当前曲目再点即暂停，其余曲目直接播放 */
export function toggleFmTrack(id: string) {
  if (state.currentId === id && state.isPlaying) {
    audio?.pause();
  } else {
    playFmTrack(id);
  }
}

export function nextFmTrack() {
  const current = state.currentId ?? queue[0];
  const i = Math.max(0, queue.indexOf(current));
  playFmTrack(queue[(i + 1) % queue.length] || FM_TRACKS[0].id);
}

function nextTrack() {
  nextFmTrack();
}

export function prevFmTrack() {
  if (state.progress > 3 && audio) {
    audio.currentTime = 0;
    set({ progress: 0 });
    return;
  }
  const current = state.currentId ?? queue[0];
  const i = Math.max(0, queue.indexOf(current));
  playFmTrack(queue[(i - 1 + queue.length) % queue.length] || FM_TRACKS[0].id);
}

export function seekFm(sec: number) {
  if (!audio) return;
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(Math.max(0, sec), audio.duration);
  }
  set({ progress: sec });
}

export function setFmVolume(v: number) {
  const vol = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = vol;
  set({ volume: vol });
}

/** /fm 页面按用户选择的兴趣设定自动连播顺序 */
export function setFmQueue(ids: string[]) {
  const valid = ids.filter((id) => FM_TRACK_MAP[id]);
  if (valid.length) queue = valid;
}

export function pauseFm() {
  audio?.pause();
}
