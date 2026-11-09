"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, Smartphone, Copy, MessageCircle } from "lucide-react";

interface PaymentQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number | string;
  title?: string;
  itemLabel?: string;
  description?: string;
}

/**
 * 通用扫码支付弹窗：使用 public/image/支付.png 作为收款二维码。
 * 会员订阅 / 积分充值 均可复用。
 */
export function PaymentQrModal({
  isOpen,
  onClose,
  amount,
  title = "扫码支付",
  itemLabel,
  description = "请使用微信或支付宝扫一扫完成支付",
}: PaymentQrModalProps) {
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => setNotice(false));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const handleConfirm = () => {
    // 支付完成后由客服发放卡密，不在此处直接标记支付成功
    setNotice(true);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-lg"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative z-10 w-full max-w-[352px] rounded-[30px] overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(160deg,#171310 0%,#0F0D0A 55%,#15120C 100%)",
              border: "1px solid rgba(210,160,83,0.35)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.65), 0 0 40px rgba(210,160,83,0.12)",
            }}
          >
            {/* 顶部光晕装饰 */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl opacity-40"
              style={{ background: "radial-gradient(circle,#D2A053 0%,transparent 70%)" }} />

            {/* Header */}
            <div className="relative flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(210,160,83,0.16)", border: "1px solid rgba(210,160,83,0.35)" }}>
                  <Smartphone className="w-4 h-4 text-[#E8C06A]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-white leading-tight" style={{ fontFamily: "var(--font-noto-serif)" }}>
                    {title}
                  </h3>
                  <p className="text-[10px] text-[#D2A053]/80 tracking-[0.18em] uppercase mt-0.5">Secure Payment</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Amount */}
            <div className="relative px-6 pt-1 pb-4 text-center">
              <p className="text-[10px] text-white/45 tracking-wider">支付金额</p>
              <div className="flex items-end justify-center gap-1 mt-1">
                <span className="text-sm font-bold text-[#D2A053] mb-2">￥</span>
                <span className="text-[40px] leading-none font-black text-white tabular-nums" style={{ fontFamily: "var(--font-noto-serif)" }}>
                  {amount}
                </span>
              </div>
              {itemLabel && (
                <span className="inline-flex items-center mt-3 px-3 py-1 rounded-full text-[10px] font-bold text-[#F3D79B]"
                  style={{ background: "rgba(210,160,83,0.14)", border: "1px solid rgba(210,160,83,0.3)" }}>
                  {itemLabel}
                </span>
              )}
            </div>

            {/* QR Code */}
            <div className="relative px-6 pb-1">
              <div className="relative mx-auto w-[224px]">
                {/* 四角装饰 */}
                {[
                  "left-0 top-0 border-l-2 border-t-2 rounded-tl-xl",
                  "right-0 top-0 border-r-2 border-t-2 rounded-tr-xl",
                  "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-xl",
                  "right-0 bottom-0 border-r-2 border-b-2 rounded-br-xl",
                ].map((pos, i) => (
                  <span key={i} className={`absolute w-5 h-5 border-[#D2A053] ${pos}`} style={{ margin: 6 }} />
                ))}

                <div className="relative w-[224px] h-[224px] bg-white rounded-2xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden">
                  <Image
                    src="/image/支付.png"
                    alt="支付二维码"
                    width={224}
                    height={224}
                    className="w-full h-full object-contain"
                    priority
                    unoptimized
                  />
                </div>
              </div>

              <p className="text-center text-[11px] text-white/55 mt-4 leading-relaxed">{description}</p>
              <div className="flex items-center justify-center gap-4 mt-2.5">
                <span className="flex items-center gap-1.5 text-[10px] text-white/45">
                  <span className="w-4 h-4 rounded-md bg-[#09BB07] flex items-center justify-center text-[9px]">微</span>
                  微信扫一扫
                </span>
                <span className="w-px h-3 bg-white/15" />
                <span className="flex items-center gap-1.5 text-[10px] text-white/45">
                  <span className="w-4 h-4 rounded-md bg-[#1677FF] flex items-center justify-center text-[9px]">支</span>
                  支付宝扫一扫
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-4">
              {notice ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: "rgba(210,160,83,0.12)",
                    border: "1.5px dashed rgba(210,160,83,0.55)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[12px] font-black text-[#F3D79B]">
                    <MessageCircle className="w-4 h-4" />
                    请添加微信获取卡密充值
                  </div>
                  <p className="text-[10.5px] text-white/60 leading-relaxed mt-1.5">
                    支付完成后请联系微信号，向客服提供支付截图领取卡密，再回到「积分充值」输入卡密兑换。
                  </p>
                  <div className="mt-2.5 flex items-center justify-between rounded-xl px-3 py-2"
                    style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(210,160,83,0.3)" }}>
                    <span className="text-[13px] font-black text-white tracking-wide font-mono">wyx200265</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText("wyx200265");
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#F3D79B] hover:text-white transition-colors cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> 复制
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirm}
                  className="w-full py-3.5 rounded-2xl text-[13px] font-black text-[#2A2118] flex items-center justify-center gap-2 cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg,#F3D79B 0%,#D2A053 45%,#B8843A 100%)",
                    boxShadow: "0 10px 26px rgba(210,160,83,0.32)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4" /> 我已完成支付
                </motion.button>
              )}
              <p className="text-center text-[9.5px] text-white/30 mt-2.5">卡密充值 · 安全可靠 · 客服微信 wyx200265</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
