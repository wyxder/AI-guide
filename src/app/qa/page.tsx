import { Suspense } from "react";
import { QAScreen } from "@/components/screens/QAScreen";

export default function QAPage() {
  return (
    <>
      {/* 首屏关键资源预加载：背景、默认形象缩略图、「诗仙」「小美」缩略图，消除切换卡顿 */}
      <link rel="preload" as="image" href="/background/北京.webp" fetchPriority="high" />
      <link rel="preload" as="image" href="/sentio/characters/free/Hiyori/thumb.webp" />
      <link rel="preload" as="image" href="/images/李白.png" />
      <link rel="preload" as="image" href="/images/小美.png" />
      <link rel="preconnect" href="https://nebula-agent.xingyun3d.com" crossOrigin="" />
      <Suspense fallback={<div className="min-h-svh" style={{ background: "#FAF8F5" }} />}>
        <QAScreen />
      </Suspense>
    </>
  );
}
