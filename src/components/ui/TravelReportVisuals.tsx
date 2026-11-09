"use client";

/**
 * 「我的 - 旅行报告」视觉组件：
 * - TravelFootprintMap：全国地图足迹（GeoJSON 省级轮廓 + 到访省份高亮 + 城市光点）
 * - TravelRadarChart：纯 SVG 雷达图，无第三方图表依赖
 */
import { useEffect, useMemo, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CHINA_GEO_URL = "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json";

const MAP_W = 640;
const MAP_H = 470;

/** 城市 → 省级行政区名称（与 GeoJSON properties.name 对齐） */
export const PROVINCE_BY_CITY: Record<string, string> = {
  北京: "北京市", 天津: "天津市", 上海: "上海市", 重庆: "重庆市",
  石家庄: "河北省", 太原: "山西省", 呼和浩特: "内蒙古自治区",
  沈阳: "辽宁省", 长春: "吉林省", 哈尔滨: "黑龙江省",
  南京: "江苏省", 苏州: "江苏省", 杭州: "浙江省", 合肥: "安徽省",
  福州: "福建省", 厦门: "福建省", 南昌: "江西省", 济南: "山东省", 青岛: "山东省",
  郑州: "河南省", 洛阳: "河南省", 开封: "河南省", 武汉: "湖北省",
  长沙: "湖南省", 张家界: "湖南省", 广州: "广东省", 深圳: "广东省",
  南宁: "广西壮族自治区", 桂林: "广西壮族自治区", 海口: "海南省", 三亚: "海南省",
  成都: "四川省", 贵阳: "贵州省", 昆明: "云南省", 大理: "云南省", 丽江: "云南省",
  拉萨: "西藏自治区", 西安: "陕西省", 兰州: "甘肃省", 敦煌: "甘肃省",
  西宁: "青海省", 银川: "宁夏回族自治区", 乌鲁木齐: "新疆维吾尔自治区",
};

/** 城市经纬度（用于地图光点） */
const CITY_COORDS: Record<string, [number, number]> = {
  北京: [116.4, 39.9], 天津: [117.2, 39.13], 上海: [121.47, 31.23], 重庆: [106.55, 29.56],
  石家庄: [114.51, 38.04], 太原: [112.55, 37.87], 呼和浩特: [111.75, 40.84],
  沈阳: [123.43, 41.8], 长春: [125.32, 43.82], 哈尔滨: [126.53, 45.8],
  南京: [118.8, 32.06], 苏州: [120.62, 31.32], 杭州: [120.15, 30.27], 合肥: [117.23, 31.82],
  福州: [119.3, 26.08], 厦门: [118.09, 24.48], 南昌: [115.86, 28.68], 济南: [117.12, 36.65],
  青岛: [120.38, 36.07], 郑州: [113.63, 34.75], 洛阳: [112.45, 34.62], 武汉: [114.3, 30.59],
  长沙: [112.94, 28.23], 张家界: [110.48, 29.12], 广州: [113.26, 23.13], 深圳: [114.06, 22.55],
  南宁: [108.37, 22.82], 桂林: [110.29, 25.27], 三亚: [109.51, 18.25],
  成都: [104.07, 30.67], 贵阳: [106.63, 26.65], 昆明: [102.83, 24.88], 大理: [100.27, 25.61],
  拉萨: [91.14, 29.65], 西安: [108.94, 34.34], 兰州: [103.83, 36.06], 敦煌: [94.66, 40.14],
  西宁: [101.78, 36.62], 银川: [106.23, 38.49], 乌鲁木齐: [87.62, 43.82],
};

const project = (lng: number, lat: number): [number, number] => [
  8 + ((lng - 73) / (136 - 73)) * (MAP_W - 16),
  10 + ((54 - lat) / (54 - 17)) * (MAP_H - 20),
];

interface GeoFeature {
  properties?: { name?: string };
  geometry?: { type: string; coordinates: any } | null;
}

const featureToPath = (feature: GeoFeature): string => {
  const geometry = feature.geometry;
  if (!geometry) return "";
  const polygons: number[][][][] =
    geometry.type === "MultiPolygon" ? (geometry.coordinates as number[][][][]) : [geometry.coordinates as number[][][]];
  let d = "";
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring || ring.length < 3) continue;
      ring.forEach((point, index) => {
        const [x, y] = project(point[0], point[1]);
        d += `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      d += "Z";
    }
  }
  return d;
};

export function TravelFootprintMap({
  visitedProvinces,
  visitedCities,
}: {
  visitedProvinces: string[];
  visitedCities: string[];
}) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(CHINA_GEO_URL)
      .then((res) => res.json())
      .then((data) => {
        if (alive && Array.isArray(data?.features)) setFeatures(data.features);
        else if (alive) setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const shapes = useMemo(
    () =>
      (features || []).map((feature) => ({
        name: feature.properties?.name || "",
        d: featureToPath(feature),
      })),
    [features]
  );

  const visitedSet = useMemo(() => new Set(visitedProvinces), [visitedProvinces]);
  const cityDots = useMemo(
    () => visitedCities.filter((city) => CITY_COORDS[city]).slice(0, 6),
    [visitedCities]
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-[radial-gradient(120%_120%_at_15%_0%,#0F2C4C_0%,#0A1826_55%,#070F18_100%)]">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
          <h4 className="text-[13px] font-extrabold tracking-wide text-white">全国旅行足迹地图</h4>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-sky-200/70">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-sky-400" />已到访
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm bg-white/15" />待探索
          </span>
        </div>
      </div>

      <div className="relative px-2 pb-2">
        {failed ? (
          <div className="flex h-[210px] flex-col items-center justify-center gap-2 text-sky-200/70">
            <span className="text-3xl">🗺️</span>
            <p className="text-xs font-bold">地图资源加载失败</p>
            <p className="text-[10px]">已点亮的足迹：{visitedProvinces.length ? visitedProvinces.join(" · ") : "暂无"}</p>
          </div>
        ) : (
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full" role="img" aria-label="全国旅行足迹地图">
            <defs>
              <linearGradient id="visited-province" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
              <filter id="province-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {!features && (
              <text x={MAP_W / 2} y={MAP_H / 2} textAnchor="middle" fill="rgba(186,230,253,0.55)" fontSize="13">
                足迹地图加载中…
              </text>
            )}

            {shapes.map((shape) => {
              const active = visitedSet.has(shape.name);
              return (
                <path
                  key={shape.name}
                  d={shape.d}
                  fill={active ? "url(#visited-province)" : "rgba(255,255,255,0.07)"}
                  stroke={active ? "rgba(224,242,254,0.85)" : "rgba(125,211,252,0.22)"}
                  strokeWidth={active ? 1.2 : 0.7}
                  filter={active ? "url(#province-glow)" : undefined}
                  opacity={active ? 0.95 : 1}
                />
              );
            })}

            {cityDots.map((city) => {
              const [lng, lat] = CITY_COORDS[city];
              const [x, y] = project(lng, lat);
              return (
                <g key={city}>
                  <circle cx={x} cy={y} r={7} fill="rgba(250,204,21,0.18)" />
                  <circle cx={x} cy={y} r={3.2} fill="#FACC15" stroke="#0B1220" strokeWidth={1} />
                  <text x={x + 5} y={y - 5} fontSize="9.5" fontWeight="700" fill="#FDE68A">
                    {city}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="border-t border-white/5 px-4 py-2 text-[10px] font-medium text-sky-200/60">
        已点亮 <span className="font-black text-sky-300">{visitedProvinces.length}</span> 个省级行政区 ·{" "}
        <span className="font-black text-sky-300">{visitedCities.length}</span> 座城市
      </div>
    </div>
  );
}

export function TravelRadarChart({ values }: { values: { label: string; value: number }[] }) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = 78;
  const total = values.length || 5;

  const point = (index: number, ratio: number): [number, number] => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
  };

  const polygon = (ratio: number) =>
    values.map((_, index) => point(index, ratio).map((n) => n.toFixed(1)).join(",")).join(" ");

  const dataPolygon = values
    .map((item, index) => point(index, Math.max(0.12, Math.min(1, item.value / 100))).map((n) => n.toFixed(1)).join(","))
    .join(" ");

  return (
    <div className="rounded-2xl border border-indigo-400/20 bg-[radial-gradient(120%_120%_at_80%_0%,#1B2350_0%,#0C1428_60%,#070D18_100%)] p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h4 className="text-[13px] font-extrabold tracking-wide text-white">旅行偏好雷达</h4>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">
          AI 画像
        </span>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full">
        <defs>
          <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#818CF8" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <polygon
            key={ratio}
            points={polygon(ratio)}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth={0.8}
          />
        ))}
        {values.map((_, index) => {
          const [x, y] = point(index, 1);
          return <line key={index} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(148,163,184,0.16)" strokeWidth={0.8} />;
        })}

        <polygon points={dataPolygon} fill="url(#radar-fill)" stroke="#38BDF8" strokeWidth={1.6} />
        {values.map((item, index) => {
          const [x, y] = point(index, Math.max(0.12, Math.min(1, item.value / 100)));
          return <circle key={item.label} cx={x} cy={y} r={2.6} fill="#E0F2FE" stroke="#0EA5E9" strokeWidth={1} />;
        })}

        {values.map((item, index) => {
          const [x, y] = point(index, 1.28);
          return (
            <g key={item.label}>
              <text
                x={x}
                y={y}
                textAnchor={x > cx + 4 ? "start" : x < cx - 4 ? "end" : "middle"}
                fontSize="9.5"
                fontWeight="700"
                fill="rgba(224,242,254,0.9)"
              >
                {item.label}
              </text>
              <text
                x={x}
                y={y + 11}
                textAnchor={x > cx + 4 ? "start" : x < cx - 4 ? "end" : "middle"}
                fontSize="8.5"
                fontWeight="800"
                fill="#67E8F9"
              >
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
