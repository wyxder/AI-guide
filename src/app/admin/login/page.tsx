"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, Mail, ArrowLeft } from "lucide-react";
import { auth } from "@eazo/sdk";
import { toast } from "sonner";
import Image from "next/image";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (email === "wyxcode@qq.com" && password === "123456") {
        localStorage.setItem("eazo.session", JSON.stringify({
          isMock: true,
          userId: "admin",
          email: email,
        }));
        toast.success("管理员登录成功");
        window.location.href = "/admin";
      } else {
        await auth.loginWithEmailPassword(email, password);
        toast.success("管理员登录成功");
        window.location.href = "/admin";
      }
    } catch (err: any) {
      toast.error(err?.message || "管理员验证失败，请检查账号密码");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tech-screen min-h-svh w-full flex items-center justify-center px-4 relative overflow-hidden">
      
      {/* Decorative background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#D2A053]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#5CECFF]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Centered Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md bg-[#081E2A]/92 border border-[#1A4F62] rounded-3xl p-8 shadow-2xl relative backdrop-blur-md"
      >
        {/* Back button */}
        <button
          onClick={() => router.push("/home")}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-xs font-semibold text-[#7FA9BE] hover:text-[#DDF4FF] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 返回主页
        </button>

        {/* Brand Logo Header */}
        <div className="text-center space-y-3 mt-4 mb-8">
          <div className="w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 shadow-md shadow-[#5CECFF]/10 relative border border-[#1A4F62] mx-auto">
            <Image
              src="/image/logo.webp"
              alt="Logo"
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#EAFAFF] tracking-tight" style={{ fontFamily: "var(--font-noto-serif)", textShadow: "0 0 16px rgba(92,236,255,0.4)" }}>
              运营管理后台登录
            </h2>
            <p className="text-xs text-[#7FA9BE] mt-1 font-medium">请验证管理员账号以继续访问后台</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#A8CFE0]">管理账号</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-[#4E7F94]" />
              <input
                type="email"
                required
                placeholder="wyxcode@qq.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0B2534] focus:bg-[#0E2E3E] border border-[#1A4F62] focus:border-[#5CECFF] text-sm text-[#DDF4FF] pl-10 pr-4 py-3 rounded-xl focus:outline-none transition-all placeholder:text-[#4E7F94]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#A8CFE0]">登录密码</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-[#4E7F94]" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0B2534] focus:bg-[#0E2E3E] border border-[#1A4F62] focus:border-[#5CECFF] text-sm text-[#DDF4FF] pl-10 pr-4 py-3 rounded-xl focus:outline-none transition-all placeholder:text-[#4E7F94]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-[#032029] bg-gradient-to-r from-[#9DF7FF] to-[#17B6D6] hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(92,236,255,0.35)] mt-6"
          >
            {loading ? "正在验证身份..." : "安全登录后台"}
          </button>
        </form>

        {/* Test Account Quick Login Section */}
        <div className="mt-6 pt-5 border-t border-[#1A4F62] bg-[#0B2534] p-4 rounded-2xl border border-dashed border-[#D2A053]/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-[#FFC857] uppercase tracking-wider">🔑 测试演示管理员账号</span>
            <span className="text-[10px] font-bold text-[#3DFDC0] bg-[rgba(61,253,192,0.12)] px-2 py-0.5 rounded-full border border-[rgba(61,253,192,0.3)]">免密体验</span>
          </div>
          <div className="space-y-1 text-xs font-mono text-[#A8CFE0] bg-[#081E2A] p-2.5 rounded-xl border border-[#1A4F62] mb-3">
            <div className="flex justify-between">
              <span className="text-[#7FA9BE]">账号：</span>
              <span className="font-bold text-[#DDF4FF]">wyxcode@qq.com</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7FA9BE]">密码：</span>
              <span className="font-bold text-[#DDF4FF]">123456</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail("wyxcode@qq.com");
              setPassword("123456");
              setLoading(true);
              localStorage.setItem("eazo.session", JSON.stringify({
                isMock: true,
                userId: "admin",
                email: "wyxcode@qq.com",
              }));
              toast.success("测试管理员账号一键填充，登录成功！");
              setTimeout(() => {
                window.location.href = "/admin";
              }, 400);
            }}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D2A053] to-[#B8843A] hover:from-[#e0ae60] hover:to-[#c49045] text-white text-xs font-extrabold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            ⚡ 一键登录测试账号 (wyxcode@qq.com)
          </button>
        </div>
      </motion.div>
    </div>
  );
}
