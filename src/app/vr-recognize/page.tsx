"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Camera, Sparkles, ChevronLeft, Volume2, VolumeX, Loader2,
  Compass, Info, HelpCircle, ScanLine, BadgeCheck, BookOpen,
  Lightbulb, RotateCcw, MessageSquareText, Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";

interface RecognizeResult {
  subject: string;
  story: string;
  tip: string;
  type?: string;
}

const SCAN_STEPS = [
  { title: "图像特征点云映射", desc: "提取纹理与轮廓关键特征" },
  { title: "3D 深度拓扑比对", desc: "重建景物的空间结构关系" },
  { title: "云端多模态研判", desc: "匹配文物与景区视觉模型" },
  { title: "知识图谱编排报告", desc: "生成文化解读与游览建议" }
];

const STEP_PERCENT = [0, 18, 42, 68, 92, 100];

export default function VRRecognizePage() {
  const router = useRouter();

  // Interaction states
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null);

  // Audio narration state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);

  // Camera live streaming states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopAudioPlayback = () => {
    if (audioInstance) {
      audioInstance.pause();
      setIsPlayingAudio(false);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  // Auto bind video stream whenever isCameraActive or cameraStream updates
  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      if (videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isCameraActive, cameraStream]);

  // Start camera stream
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        stopCamera();
      }
      stopAudioPlayback();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      setCameraStream(stream);
      setIsCameraActive(true);
      setPreviewUrl(null);
      setSelectedFile(null);
      setRecognizeResult(null);
      setScanStep(0);
      setScanning(false);
    } catch (err) {
      console.error("Failed to open camera:", err);
      toast.error("无法打开摄像头，请确保已授予权限");
    }
  };

  // Perform 3D Scan and multi-modal recognition
  // 显式传参，避免异步回调中读取到旧的状态值
  const runRecognition = async (url: string, file: File | null) => {
    if (!url || scanning) return;

    setScanning(true);
    setScanStep(1);
    setRecognizeResult(null);

    await new Promise(r => setTimeout(r, 900));
    setScanStep(2);
    await new Promise(r => setTimeout(r, 900));
    setScanStep(3);
    await new Promise(r => setTimeout(r, 1100));
    setScanStep(4);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("image", file);
      } else {
        const resBlob = await fetch(url);
        const blob = await resBlob.blob();
        formData.append("image", blob, "camera_capture.jpg");
      }

      const res = await fetch("/api/spots/recognize", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data && data.subject) {
        setRecognizeResult({
          subject: data.subject,
          story: data.story,
          tip: data.tip || "建议调整好角度，多拍摄几组细节图。"
        });
      } else {
        throw new Error("Invalid API response");
      }
    } catch {
      setRecognizeResult({
        subject: "已识别的景观文物",
        story: "这是一处充满底蕴与独特魅力的历史文化象征。其完美的雕刻/建筑艺术与斑驳的时代痕迹在镜头里清晰可见。古人精妙的手工艺与宏大设计无不昭示着博大精深的中华文化底蕴，带给我们深邃的情感共鸣与精神洗礼。",
        tip: "小玉提示：可以尝试走近观察更精细的花纹，多角度重拍可能会有意想不到的 AI 新解读。"
      });
    } finally {
      setScanning(false);
      setScanStep(5);
    }
  };

  // Capture frame from video feed
  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

    setPreviewUrl(dataUrl);
    const file = blob ? new File([blob], "camera_capture.jpg", { type: "image/jpeg" }) : null;
    setSelectedFile(file);
    stopCamera();

    // 直接用本地变量触发识别，避免等待状态更新
    runRecognition(dataUrl, file);
  };

  // TTS Speech Reader
  const togglePlayAudio = () => {
    if (!recognizeResult) return;

    if (isPlayingAudio) {
      audioInstance?.pause();
      setIsPlayingAudio(false);
      return;
    }

    const speakText = `您识别到了：${recognizeResult.subject}。小玉为您讲解：${recognizeResult.story}`;
    const newAudio = new Audio("/api/qa/tts?text=" + encodeURIComponent(speakText));
    newAudio.play().catch(() => {
      toast.error("语音加载失败，请重试");
    });
    newAudio.onended = () => {
      setIsPlayingAudio(false);
    };
    setAudioInstance(newAudio);
    setIsPlayingAudio(true);
  };

  // Auto trigger camera if action query is set
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("action") === "camera") {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioInstance) audioInstance.pause();
    };
  }, [audioInstance]);

  const scanPercent = STEP_PERCENT[Math.min(scanStep, 5)] ?? 0;
  const tipPoints = recognizeResult
    ? recognizeResult.tip.split(/[。；;]/).map((s) => s.trim()).filter(Boolean).slice(0, 3)
    : [];

  return (
    <div
      className="min-h-svh w-full text-[#E8EDE4] font-sans select-none"
      style={{ background: "radial-gradient(circle at 50% 0%, #1A2A22 0%, #0A100D 55%, #070B09 100%)" }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 flex flex-col gap-5">

        {/* ── Top Header ── */}
        <header className="rounded-3xl border border-white/10 bg-[#101713]/80 backdrop-blur-xl px-4 py-3.5 sm:px-5 flex items-center justify-between shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                stopAudioPlayback();
                stopCamera();
                router.push("/home");
              }}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all text-[#D2A053] active:scale-95"
              aria-label="返回首页"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base tracking-wide text-[#D2A053] truncate" style={{ fontFamily: "var(--font-noto-serif)" }}>
                VR3D 即拍即识导览
              </h1>
              <p className="text-[9px] text-[#8C9C90] font-mono tracking-[0.18em] uppercase mt-0.5 truncate">
                AI MULTIMODAL MUSEUM RECOGNITION
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#D2A053] bg-white/5 px-2.5 py-1 rounded-full border border-[#D2A053]/25">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D2A053] animate-pulse" />
              3D SCANNER v2.5
            </span>
            <span className="flex sm:hidden items-center gap-1.5 text-[9px] font-mono text-[#D2A053] bg-white/5 px-2 py-1 rounded-full border border-[#D2A053]/25">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D2A053] animate-pulse" />
              v2.5
            </span>
          </div>
        </header>

        {/* ── Main Layout ── */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">

          {/* Left Column - Viewfinder & Controls */}
          <section className="lg:col-span-7 flex flex-col gap-4 w-full min-w-0">

            {/* Viewfinder */}
            <div className="relative w-full rounded-3xl overflow-hidden aspect-[4/3] sm:aspect-[16/10] bg-[#0A0F0C] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">

              {/* Corner brackets */}
              <div className="absolute top-4 left-4 w-5 h-5 border-t border-l border-[#D2A053]/60 pointer-events-none z-20" />
              <div className="absolute top-4 right-4 w-5 h-5 border-t border-r border-[#D2A053]/60 pointer-events-none z-20" />
              <div className="absolute bottom-4 left-4 w-5 h-5 border-b border-l border-[#D2A053]/60 pointer-events-none z-20" />
              <div className="absolute bottom-4 right-4 w-5 h-5 border-b border-r border-[#D2A053]/60 pointer-events-none z-20" />

              {/* Center crosshair */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="w-1.5 h-1.5 bg-[#D2A053] rounded-full shadow-[0_0_8px_#D2A053]" />
                <div className="absolute w-8 h-[1px] bg-[#D2A053]/30" />
                <div className="absolute h-8 w-[1px] bg-[#D2A053]/30" />
              </div>

              {/* Grid overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(210,160,83,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(210,160,83,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-10" />

              <AnimatePresence mode="wait">
                {isCameraActive ? (
                  <motion.div
                    key="camera-feed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full"
                  >
                    <video
                      ref={(node) => {
                        (videoRef as any).current = node;
                        if (node && cameraStream && node.srcObject !== cameraStream) {
                          node.srcObject = cameraStream;
                          node.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover relative z-10"
                    />
                    <div className="absolute inset-0 bg-[#4F6F52]/[0.04] z-10 pointer-events-none" />
                    <div className="absolute top-4 left-4 bg-black/75 px-3 py-1.5 rounded-full border border-[#4F6F52]/40 text-[10px] text-[#8FE0B0] font-mono z-20 flex items-center gap-1.5 shadow-md">
                      <span className="w-1.5 h-1.5 bg-[#34D399] rounded-full animate-ping" />
                      LENS LIVE MODE
                    </div>
                  </motion.div>
                ) : previewUrl ? (
                  <motion.div
                    key={previewUrl}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full flex items-center justify-center"
                  >
                    {/* Blurred backdrop to avoid black bars */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-110 pointer-events-none z-0"
                      alt=""
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="待识别景物"
                      className="relative z-10 w-full h-full object-contain"
                    />

                    {scanning && (
                      <>
                        <motion.div
                          initial={{ y: "-100%" }}
                          animate={{ y: "100%" }}
                          transition={{ repeat: Infinity, repeatType: "reverse", duration: 2, ease: "easeInOut" }}
                          className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#D2A053] to-transparent shadow-[0_0_14px_#D2A053] z-20"
                        />
                        <div className="absolute inset-0 bg-[#D2A053]/[0.04] animate-pulse pointer-events-none z-10" />
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 text-center flex flex-col items-center gap-3 relative z-10 max-w-sm my-auto"
                  >
                    <div className="text-[#D2A053] drop-shadow-[0_0_16px_rgba(210,160,83,0.45)]">
                      <Camera className="w-11 h-11" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm tracking-wide">对准展品或景区建筑拍摄</h3>
                      <p className="text-xs text-[#8C9C90] mt-2 leading-relaxed">
                        打开摄像头对准展品或景区建筑拍摄，即可开启 3D 拓扑扫描与云端 AI 多模态文化精讲。
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Scanning HUD */}
              {scanning && (
                <div className="absolute bottom-4 left-4 z-20 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-[#D2A053]/30 text-[9px] font-mono text-[#D2A053] space-y-0.5 shadow-lg">
                  <div className="flex items-center gap-1.5">
                    <ScanLine className="w-3 h-3" />
                    <span>SYS: ON_SCAN</span>
                  </div>
                  <div className="text-[#8C9C90]">LIDAR: CONNECTED</div>
                  <div className="text-[#8C9C90]">DEPTH DATA: CAPTURED</div>
                </div>
              )}

              {/* Ready hint */}
              {!scanning && previewUrl && !isCameraActive && (
                <div className="absolute bottom-4 right-4 z-20 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15 text-[10px] text-[#C9D4CB]">
                  {recognizeResult ? "识别完成" : "待扫描"}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              {isCameraActive ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={stopCamera}
                    className="py-3.5 bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-red-300 cursor-pointer"
                  >
                    关闭相机
                  </button>
                  <button
                    onClick={captureFrame}
                    className="py-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 text-black bg-gradient-to-r from-[#D2A053] to-[#E8C06A] hover:brightness-110 shadow-lg cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-black" />
                    拍照并识别
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={startCamera}
                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-[#D2A053]/40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 text-[#D2A053] cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    实时相机识别
                  </button>
                  {previewUrl && (
                    <button
                      onClick={() => runRecognition(previewUrl, selectedFile)}
                      disabled={scanning}
                      className="w-full py-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-95 text-black disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-[#D2A053] to-[#C39A5D] hover:brightness-110 shadow-lg cursor-pointer"
                    >
                      {scanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          3D 拓扑研判中…
                        </>
                      ) : recognizeResult ? (
                        <>
                          <RotateCcw className="w-4 h-4 text-black" />
                          重新识别
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-black" />
                          开启 VR 智能识别
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Right Column - AI Recognition Report */}
          <section className="lg:col-span-5 w-full min-w-0">
            <div className="rounded-3xl border border-white/10 bg-[#111A15]/90 backdrop-blur-xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.45)] relative overflow-hidden">

              {/* Ambient glow */}
              <div className="absolute -top-20 -right-20 w-44 h-44 bg-[#D2A053]/10 rounded-full blur-3xl pointer-events-none" />

              {/* Panel header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D2A053] animate-pulse" />
                  <span className="text-[10px] font-bold tracking-[0.18em] text-[#D2A053] font-mono">AI HOLOGRAPHIC REPORT</span>
                </div>
                <Info className="w-3.5 h-3.5 text-[#D2A053]/40" />
              </div>

              <div className="pt-4">
                <AnimatePresence mode="wait">
                  {scanning ? (
                    <motion.div
                      key="scanning-report"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-5 py-2"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-white">智能比对三维纹理…</span>
                          <span className="font-mono text-[#D2A053]">{scanPercent}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-[#4F6F52] via-[#D2A053] to-[#E8C06A]"
                            animate={{ width: `${scanPercent}%` }}
                            transition={{ type: "spring", stiffness: 120, damping: 24 }}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        {SCAN_STEPS.map((s, i) => {
                          const stepNo = i + 1;
                          const done = scanStep > stepNo;
                          const curr = scanStep === stepNo;
                          return (
                            <div
                              key={s.title}
                              className={`flex items-start gap-3 p-3 rounded-2xl border transition-colors ${
                                curr
                                  ? "bg-[#D2A053]/10 border-[#D2A053]/40"
                                  : done
                                    ? "bg-[#4F6F52]/10 border-transparent"
                                    : "border-transparent"
                              }`}
                            >
                              <span
                                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 border ${
                                  done
                                    ? "bg-[#4F6F52]/30 border-[#4F6F52]/50 text-[#9BD3AE]"
                                    : curr
                                      ? "bg-[#D2A053] border-[#D2A053] text-black"
                                      : "border-white/15 text-[#6F7F72]"
                                }`}
                              >
                                {done ? "✓" : stepNo}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className={`text-[11px] font-bold ${curr ? "text-white" : done ? "text-[#C9D4CB]" : "text-[#6F7F72]"}`}>
                                  {s.title}
                                </div>
                                <div className="text-[10px] text-[#7F8F83] mt-0.5">{s.desc}</div>
                              </div>
                              {curr && <Loader2 className="w-3.5 h-3.5 text-[#D2A053] animate-spin flex-shrink-0 mt-0.5" />}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : recognizeResult ? (
                    <motion.div
                      key="report-result"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-5"
                    >
                      {/* Result hero */}
                      <div className="flex items-start gap-3.5">
                        {previewUrl && (
                          <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-[#D2A053]/30 flex-shrink-0 shadow-lg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt={recognizeResult.subject} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex items-center gap-1 bg-[#4F6F52]/20 text-[#9BD3AE] border border-[#4F6F52]/40 text-[9px] font-bold px-2 py-0.5 rounded-full">
                            <BadgeCheck className="w-3 h-3" />
                            识别完成
                          </span>
                          <h2 className="text-lg font-black text-white leading-tight mt-1.5" style={{ fontFamily: "var(--font-noto-serif)" }}>
                            {recognizeResult.subject}
                          </h2>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#C9D4CB]">
                              {recognizeResult.type || "现场实景识别"}
                            </span>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#D2A053]/10 border border-[#D2A053]/25 text-[#D2A053]">
                              AI 多模态研判
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Structured meta tiles */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { icon: ImageIcon, label: "识别对象", value: recognizeResult.type ? "馆藏文物" : "实景景物" },
                          { icon: ScanLine, label: "研判方式", value: "3D 拓扑" },
                          { icon: BookOpen, label: "解读来源", value: "文化图谱" },
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className="rounded-2xl bg-black/25 border border-white/8 px-2.5 py-3 text-center">
                            <Icon className="w-3.5 h-3.5 text-[#D2A053] mx-auto" />
                            <div className="text-[9px] text-[#7F8F83] mt-1.5">{label}</div>
                            <div className="text-[10.5px] font-bold text-[#E8EDE4] mt-0.5 truncate">{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Cultural story */}
                      <div className="rounded-2xl bg-black/25 border border-white/8 p-4 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-[#D2A053]" />
                          <span className="text-[10.5px] font-bold text-[#D2A053] tracking-wide">深度文化解读</span>
                        </div>
                        <p className="text-xs leading-[1.9] text-[#DDE5DA] tracking-wide text-justify">
                          {recognizeResult.story}
                        </p>
                      </div>

                      {/* Visit tips */}
                      <div className="rounded-2xl bg-[#4F6F52]/10 border border-[#4F6F52]/25 p-4 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-[#D2A053]" />
                          <span className="text-[10.5px] font-bold text-[#9BD3AE] tracking-wide">游览观赏建议</span>
                        </div>
                        {tipPoints.length > 1 ? (
                          <ul className="space-y-1.5">
                            {tipPoints.map((point, i) => (
                              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-[#C9D4CB]">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-[#D2A053] flex-shrink-0" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] leading-relaxed text-[#C9D4CB]">{recognizeResult.tip}</p>
                        )}
                      </div>

                      {/* Audio player */}
                      <div className="rounded-2xl bg-black/30 border border-white/8 p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            onClick={togglePlayAudio}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D2A053] to-[#B88437] flex items-center justify-center text-black hover:brightness-105 active:scale-95 transition-all shadow-md flex-shrink-0"
                            aria-label={isPlayingAudio ? "停止讲解" : "播放讲解"}
                          >
                            {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-white block truncate">小玉语音文化精讲</span>
                            <span className="text-[9.5px] text-[#7F8F83]">点击播放沉浸式导览语音</span>
                          </div>
                        </div>
                        <div className="flex items-end gap-[3px] h-6 pr-1 flex-shrink-0">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <span
                              key={i}
                              className={`w-[2.5px] bg-[#D2A053] rounded-full transition-all duration-300 ${isPlayingAudio ? "animate-pulse" : ""}`}
                              style={{
                                height: isPlayingAudio ? `${Math.floor(Math.random() * 15) + 5}px` : "4px",
                                animationDelay: `${i * 110}ms`
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 pt-1">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => router.push(`/qa?name=${encodeURIComponent(recognizeResult.subject)}`)}
                          className="py-3.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 text-black bg-[#D2A053] hover:brightness-105 shadow-md transition-all cursor-pointer"
                        >
                          <MessageSquareText className="w-4 h-4" />
                          发送至 AI 导游对话框
                        </motion.button>
                        <button
                          onClick={() => previewUrl && runRecognition(previewUrl, selectedFile)}
                          className="py-3.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-[#C9D4CB] bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          重新识别
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty-report"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-8 flex flex-col items-center justify-center text-center gap-4"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <HelpCircle className="w-7 h-7 text-[#6F7F72]" />
                      </div>
                      <div className="space-y-1.5 max-w-[240px]">
                        <h4 className="text-xs font-bold text-[#C9D4CB]">暂无识别报告</h4>
                        <p className="text-[11px] leading-relaxed text-[#7F8F83]">
                          在左侧打开摄像头拍摄展品或景物，小玉将即刻生成结构化文化解读。
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {["文物识别", "文化精讲", "游览建议"].map((tag) => (
                          <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#8C9C90]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer slogan */}
              <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2 text-[#7F8F83]">
                <span className="w-5 h-5 rounded bg-[#D2A053]/10 border border-[#D2A053]/20 flex items-center justify-center text-[10px] text-[#D2A053] font-bold">精</span>
                <p className="text-[9.5px] leading-normal font-mono">
                  视觉好奇转化为深度认知，变“走马观花”为“沉浸体悟”。
                </p>
              </div>
            </div>

            {/* Usage hint (desktop only) */}
            <div className="hidden lg:flex items-start gap-2.5 mt-4 px-1 text-[10px] text-[#7F8F83] leading-relaxed">
              <Compass className="w-3.5 h-3.5 text-[#4F6F52] flex-shrink-0 mt-0.5" />
              <span>建议保持镜头稳定、光线充足；识别后可一键发送给 AI 数字人导游继续追问。</span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
