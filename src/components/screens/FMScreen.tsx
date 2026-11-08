"use client";

import { useRouter } from "next/navigation";
import { FmExperience } from "@/components/ui/FmExperience";

/** /fm 独立页：复用与首页弹层相同的「完整体验」界面 */
export function FMScreen() {
  const router = useRouter();
  return <FmExperience variant="page" onBack={() => router.push("/home")} />;
}
