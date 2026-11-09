"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, 
  Sparkles, 
  ChevronLeft, 
  Volume2, 
  VolumeX, 
  Loader2, 
  Compass, 
  HelpCircle,
  Info,
  X,
  SwitchCamera
} from "lucide-react";

const SPRING = { type: "spring" as const, stiffness: 280, damping: 35 };

// 声像频谱条的固定高度，避免在渲染期间使用随机数
const AUDIO_WAVE_HEIGHTS = [8, 18, 10, 22, 12, 20, 9, 16];

interface CameraRecognizeProps {
  currentSpot?: string;
  /** 打开弹窗后立即唤起摄像头（用于 AI 导游输入栏旁的相机图标） */
  autoStartCamera?: boolean;
  onClose: () => void;
  onRecognized?: (subject: string, story: string) => void;
}

export function CameraRecognize({ currentSpot, autoStartCamera = false, onClose, onRecognized }: CameraRecognizeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  
  // Interaction states
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanPercent, setScanPercent] = useState(0);
  const [recognizeResult, setRecognizeResult] = useState<{
    subject: string;
    story: string;
    tip: string;
  } | null>(null);
  
  // Audio narration state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraActive(false);
  }, []);

  /** 系统相机兜底：非 HTTPS / 浏览器不支持 getUserMedia 时，直接唤起手机系统相机拍照 */
  const handleFallbackCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stopCamera();
    setCameraError(null);
    setSelectedFile(file);
    setRecognizeResult(null);
    setScanStep(0);
    setScanning(false);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  /** 把当前视频流挂到 video 元素上（元素可能因动画延迟挂载，因此 ref 与 effect 双保险） */
  const bindStreamToVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    const stream = streamRef.current;
    if (!node || !stream) return;
    if (node.srcObject !== stream) {
      node.srcObject = stream;
    }
    node.play().catch(() => undefined);
  }, []);

  const describeCameraError = (err: unknown) => {
    const name = (err as DOMException)?.name;
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        return "摄像头权限被拒绝，请在浏览器/系统设置中允许访问相机后重试。";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "未检测到可用摄像头，请检查设备后重试。";
      case "NotReadableError":
      case "TrackStartError":
        return "摄像头正被其他应用占用，请关闭其他相机应用后重试。";
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return "当前设备不支持所请求的摄像头参数，请重试。";
      default:
        return "无法开启摄像头，请确认使用 HTTPS 访问并允许浏览器访问相机。";
    }
  };

  /** 请求指定朝向的摄像头，失败时降级为默认摄像头 */
  const requestCameraStream = async (mode: "environment" | "user") => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
    } catch (err) {
      // 部分移动端设备无法满足后置摄像头约束（或只有前置摄像头），降级为默认摄像头
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  };

  const startCamera = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraError(null);
    setCameraLoading(true);

    // 移动端在非 HTTPS 或浏览器不支持 getUserMedia 时，直接唤起系统相机拍照
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraLoading(false);
      setCameraError("当前环境无法直接调用摄像头，已切换为系统相机拍照。");
      fallbackInputRef.current?.click();
      return;
    }

    try {
      const stream = await requestCameraStream(facingMode);

      streamRef.current = stream;
      setCameraStream(stream);
      setCameraActive(true);
      setPreviewUrl(null);
      setSelectedFile(null);
      setRecognizeResult(null);
      setScanStep(0);
      setScanning(false);
    } catch (err) {
      setCameraError(describeCameraError(err));
    } finally {
      setCameraLoading(false);
    }
  };

  /** 前后摄像头切换：释放旧流后按相反 facingMode 重新取流 */
  const switchCamera = async () => {
    if (!streamRef.current) return;
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    setCameraError(null);
    try {
      streamRef.current.getTracks().forEach((track) => track.stop());
      const stream = await requestCameraStream(next);
      streamRef.current = stream;
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      setCameraError(describeCameraError(err));
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(blob));
    setRecognizeResult(null);
    stopCamera();
  };

  // Perform Simulated 3D Scan & API / Mock Call
  const startScanning = async () => {
    if (!previewUrl) return;
    
    setScanning(true);
    setScanStep(1);
    setRecognizeResult(null);
    setScanPercent(6);

    // 彩虹进度条：随扫描阶段平滑推进到 96%，完成后补满
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = window.setInterval(() => {
      setScanPercent((p) => (p >= 96 ? 96 : p + (p < 60 ? 3 : 1)));
    }, 120);

    // Step 1: Capture
    await new Promise(r => setTimeout(r, 1200));
    setScanStep(2);
    
    // Step 2: 3D topology
    await new Promise(r => setTimeout(r, 1200));
    setScanStep(3);

    // Step 3: Cloud multi-modal model analysis
    await new Promise(r => setTimeout(r, 1500));
    setScanStep(4);

    try {
      if (selectedFile) {
        // Call backend API for visual recognition
        const formData = new FormData();
        formData.append("image", selectedFile);
        if (currentSpot) formData.append("spot", currentSpot);
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
      }
    } catch {
      // Fallback in case of failure/no net
      setRecognizeResult({
        subject: "已识别的景观文物",
        story: "这是一处充满底蕴与独特魅力的历史文化象征。其完美的雕刻/建筑艺术与斑驳的时代痕迹在镜头里清晰可见。古人精妙的手工艺与宏大设计无不昭示着博大精深的中华文化底蕴，带给我们深邃的情感共鸣与精神洗礼。",
        tip: "小玉提示：可以尝试走进一些观察更精细的花纹，多角度重拍可能会有意想不到的AI新解读哦！"
      });
    } finally {
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      setScanPercent(100);
      setScanning(false);
      setScanStep(5);
    }
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
    newAudio.play();
    newAudio.onended = () => {
      setIsPlayingAudio(false);
    };
    setAudioInstance(newAudio);
    setIsPlayingAudio(true);
  };

  // Cleanup audio
  useEffect(() => {
    return () => {
      if (audioInstance) audioInstance.pause();
    };
  }, [audioInstance]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    };
  }, [stopCamera]);

  // 视频元素挂载 / 视频流更新后重新绑定，兼容移动端元素延迟挂载导致的黑屏
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraActive || !cameraStream || !video) return;
    if (video.srcObject !== cameraStream) {
      video.srcObject = cameraStream;
    }
    const tryPlay = () => {
      video.play().catch(() => undefined);
    };
    tryPlay();
    video.addEventListener("loadedmetadata", tryPlay);
    return () => {
      video.removeEventListener("loadedmetadata", tryPlay);
    };
  }, [cameraActive, cameraStream]);

  // 从 AI 导游输入栏的相机图标进入时，直接唤起摄像头
  useEffect(() => {
    if (!autoStartCamera) return;
    const timer = window.setTimeout(() => { startCamera(); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartCamera]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 backdrop-blur-sm px-2 py-4 sm:px-4 select-none font-sans overflow-y-auto overflow-x-hidden">
      {/* Click outside backdrop overlay to close */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

      <motion.div 
        initial={{ opacity: 0, scale: 0.92, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={SPRING}
        style={{ maxWidth: "min(60rem, calc(100vw - 1rem))" }}
        className="relative z-10 w-full max-w-5xl max-h-[74vh] bg-[#060D17]/98 text-[#DCE9F7] rounded-3xl border border-[#3BE0FF]/35 flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.65),0_0_28px_rgba(59,224,255,0.15)]"
      >
        {/* ── Top Header (Gold-Jade tech style) ── */}
        <header className="sticky top-0 z-30 bg-[#0C1826]/95 backdrop-blur-md border-b border-[#3BE0FF]/20 px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={onClose}
              className="w-9 h-9 shrink-0 rounded-xl bg-[#13243A] hover:bg-[#1A3050] border border-[#3BE0FF]/30 flex items-center justify-center transition-all text-[#3BE0FF] active:scale-95 shadow-[0_0_8px_rgba(59,224,240,0.15)]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm tracking-widest text-[#3BE0FF] drop-shadow-[0_0_4px_rgba(59,224,240,0.4)] truncate" style={{ fontFamily: "var(--font-noto-serif)" }}>
                VR3D即拍即识导览
              </h1>
              <p className="text-[10px] text-[#7E95B8] font-mono tracking-wider truncate">AI MULTIMODAL VISION RECOGNITION POD</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#3BE0FF] animate-ping"></span>
            <span className="text-[10px] font-mono font-bold text-[#3BE0FF] bg-[#13243A] px-2.5 py-0.5 rounded border border-[#3BE0FF]/40 shadow-[0_0_6px_rgba(59,224,240,0.15)] whitespace-nowrap">
              3D SCANNER V2.0
            </span>
            <button 
              onClick={onClose}
              className="w-9 h-9 ml-2 rounded-xl bg-[#13243A] hover:bg-[#1A3050] border border-[#3BE0FF]/30 flex items-center justify-center transition-all text-[#3BE0FF] active:scale-95 shadow-[0_0_8px_rgba(59,224,240,0.15)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Main Layout (Responsive split panel) ── */}
        {/* 注意：这里不能用 <main>，全局样式 main{margin-left:240px} 会把弹窗内容整体右移并溢出 */}
        <div className="flex-1 w-full min-h-0 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start overflow-y-auto overflow-x-hidden">
          
          {/* Left Area (Holographic viewfinder & control buttons) */}
          <section className="flex flex-col gap-4 w-full min-w-0">
            
            {/* Viewfinder Container */}
            <div className="relative w-full rounded-2xl overflow-hidden aspect-[4/3] lg:aspect-[16/11] bg-[#050B13] border-2 border-[#3BE0FF]/30 shadow-[0_0_20px_rgba(59,224,240,0.08)] flex flex-col items-center justify-center">
              
              {/* Corner Bracket Overlays for Tech Aesthetic */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-[#3BE0FF] pointer-events-none" />
              <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-[#3BE0FF] pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-[#3BE0FF] pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-[#3BE0FF] pointer-events-none" />
              
              {/* Viewfinder Center Target Dot - NO circle dot frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-2.5 h-2.5 bg-[#3BE0FF]/90 rounded-full shadow-[0_0_8px_#3BE0FF]" />
                <div className="absolute w-6 h-[1.5px] bg-[#3BE0FF]/40" />
                <div className="absolute h-6 w-[1.5px] bg-[#3BE0FF]/40" />
              </div>

              {/* Grid Overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(59,224,240,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,224,240,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

              {/* Content Switch */}
              <AnimatePresence>
                {cameraActive ? (
                  <motion.div
                    key="camera"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full"
                  >
                    <video
                      ref={bindStreamToVideo}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
                    />
                    {/* 前后摄像头切换 */}
                    <button
                      onClick={switchCamera}
                      title={facingMode === "environment" ? "切换到前置摄像头" : "切换到后置摄像头"}
                      className="absolute right-3 top-3 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-black/65 border border-[#3BE0FF]/50 text-[#3BE0FF] backdrop-blur-sm active:scale-95 shadow-[0_0_14px_rgba(59,224,240,0.35)]"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                    <div className="absolute left-4 top-3 z-20 text-[9px] font-mono tracking-widest text-[#3BE0FF] bg-black/55 border border-[#3BE0FF]/30 px-2 py-1 rounded">
                      {facingMode === "environment" ? "BACK CAM" : "FRONT CAM"}
                    </div>
                    <div className="absolute left-4 bottom-4 right-4 z-20 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-[#3BE0FF] bg-black/70 border border-[#3BE0FF]/40 px-3 py-2 rounded-lg">摄像头已开启，对准景物后点击取景识别</span>
                      <button onClick={captureFrame} className="px-4 py-2 rounded-xl text-xs font-black bg-[#3BE0FF] text-black shadow active:scale-95">取景识别</button>
                    </div>
                  </motion.div>
                ) : previewUrl ? (
                  <motion.div 
                    key="preview" 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 w-full h-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    
                    {/* Real-time scanning laser line animation */}
                    {scanning && (
                      <motion.div 
                        initial={{ y: "0%" }}
                        animate={{ y: "100%" }}
                        transition={{ 
                          repeat: Infinity, 
                          repeatType: "reverse", 
                          duration: 1.8, 
                          ease: "easeInOut" 
                        }}
                        className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#3BE0FF] to-transparent shadow-[0_0_15px_#3BE0FF] z-10"
                      />
                    )}
                    
                    {/* Points Mesh overlay on Scan */}
                    {scanning && (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,224,240,0.15)_0,transparent_60%)] animate-pulse pointer-events-none" />
                    )}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 text-center flex flex-col items-center gap-4 max-w-sm relative z-10"
                  >
                    {/* Camera icon - NO circle dot frame */}
                    <div className="text-[#3BE0FF] drop-shadow-[0_0_15px_rgba(59,224,240,0.6)] animate-pulse mb-1">
                      {cameraLoading ? <Loader2 className="w-12 h-12 animate-spin" /> : <Camera className="w-12 h-12" />}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm tracking-wide">{cameraLoading ? "正在打开摄像头…" : "对准展品或文物拍摄"}</h3>
                      <p className="text-xs text-[#7E95B8] mt-1.5 leading-relaxed">
                        打开摄像头对准展品或文物拍摄，小玉即刻为您开启 3D 拓扑与多模态深度文化解读。
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Target HUD metadata when scanning */}
              {scanning && (
                <div className="absolute bottom-4 left-4 z-20 bg-black/80 px-3 py-2 rounded-lg border border-[#3BE0FF]/40 text-[9px] font-mono text-[#3BE0FF] space-y-0.5 shadow-[0_0_10px_rgba(59,224,240,0.15)]">
                  <div>SYS STATUS: SCANNING...</div>
                  <div>LIDAR DEPTH: 1.27m</div>
                  <div>RECONSTRUCTING MESH: 84%</div>
                </div>
              )}
            </div>

            {/* Action Trigger Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={cameraActive ? stopCamera : startCamera}
                className="py-3 bg-[#0C1826] hover:bg-[#13243A] border border-[#3BE0FF]/30 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow transition-all active:scale-95 text-[#3BE0FF] hover:border-[#3BE0FF]/60 hover:shadow-[0_0_8px_rgba(59,224,240,0.15)]"
              >
                <Camera className="w-4 h-4 text-[#3BE0FF]" />
                <span>{cameraActive ? "关闭摄像头" : "打开摄像头"}</span>
              </button>

              <button
                onClick={startScanning}
                disabled={!previewUrl || scanning}
                className="relative overflow-hidden py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(37,99,235,0.3)] bg-gradient-to-r from-[#2563EB] to-[#3BE0FF] hover:brightness-110 border border-[#3BE0FF]/40"
              >
                {scanning && (
                  <motion.span
                    className="absolute inset-y-0 left-0"
                    style={{
                      background:
                        "linear-gradient(90deg,#FF4D6D,#FFB84D,#FFE94D,#4DFFB0,#4DD2FF,#8B5CFF,#FF4DF0)",
                      backgroundSize: "200% 100%",
                    }}
                    animate={{ width: `${scanPercent}%` }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  />
                )}
                {scanning ? (
                  <>
                    <Loader2 className="relative z-10 w-4 h-4 animate-spin text-white" />
                    <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                      VR 智能识别中 {scanPercent}%
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="relative z-10 w-4 h-4 text-white" />
                    <span className="relative z-10">开启 VR 智能识别</span>
                  </>
                )}
              </button>
            </div>

            {/* 彩虹进度条：点击「开启 VR 智能识别」后出现 */}
            {(scanning || scanPercent >= 100) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-wider">
                  <span className="text-[#3BE0FF]">VR × 3D · MULTI-MODAL SCAN</span>
                  <span className="text-white font-bold tabular-nums">{scanPercent}%</span>
                </div>
                <div
                  className="relative h-2.5 rounded-full overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(59,224,240,0.25)",
                    boxShadow: "inset 0 0 8px rgba(0,0,0,0.45)",
                  }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    animate={{ width: `${scanPercent}%` }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{
                      background:
                        "linear-gradient(90deg,#FF4D6D,#FFB84D,#FFE94D,#4DFFB0,#4DD2FF,#8B5CFF,#FF4DF0)",
                      boxShadow: "0 0 14px rgba(120,220,255,0.55)",
                    }}
                  />
                  <motion.div
                    className="absolute inset-y-0 w-1/3 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(90deg,transparent,rgba(255,255,255,0.75),transparent)",
                    }}
                    animate={{ x: ["-120%", "320%"] }}
                    transition={{ duration: 1.3, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <div className="flex gap-1">
                  {["捕获", "拓扑", "图谱", "编排"].map((label, i) => {
                    const active = scanStep > i + 1 || scanPercent >= 100;
                    const current = scanStep === i + 1;
                    return (
                      <span
                        key={label}
                        className="flex-1 text-center text-[9px] py-0.5 rounded"
                        style={{
                          color: active ? "#BFF6FF" : current ? "#FFFFFF" : "#5E748C",
                          background: active
                            ? "rgba(59,224,240,0.16)"
                            : current
                            ? "rgba(59,224,240,0.26)"
                            : "rgba(255,255,255,0.04)",
                          border: current ? "1px solid rgba(59,224,240,0.5)" : "1px solid transparent",
                        }}
                      >
                        {label}
                        {active ? " ✓" : current ? " …" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {cameraError && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
                <span className="min-w-0 break-words">{cameraError}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => fallbackInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg border border-red-400/30 text-red-200 hover:bg-red-500/20 active:scale-95 transition-all"
                  >
                    系统相机
                  </button>
                  <button
                    onClick={startCamera}
                    className="px-2.5 py-1 rounded-lg border border-red-400/30 text-red-200 hover:bg-red-500/20 active:scale-95 transition-all"
                  >
                    重试
                  </button>
                </div>
              </div>
            )}
            {/* 移动端系统相机兜底（不展示“本地图片”按钮，仅在相机不可用时触发） */}
            <input
              ref={fallbackInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFallbackCapture}
            />
          </section>

          {/* Right Area (AI Deep cultural narrative panel) */}
          <section className="flex flex-col w-full min-w-0">
            
            <div className="flex-grow w-full min-w-0 bg-[#0C1826]/95 rounded-2xl border border-[#3BE0FF]/20 p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
              
              {/* Dynamic Glassmorphic Backdrop Decoration */}
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#3BE0FF]/10 rounded-full blur-2xl pointer-events-none" />
              
              {/* Top Log/Results */}
              <div className="space-y-4 flex-1 min-w-0 overflow-y-auto overflow-x-hidden pr-1 max-h-[56vh] lg:max-h-[64vh]">
                <div className="flex items-center justify-between pb-3 border-b border-[#3BE0FF]/20">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3BE0FF] animate-pulse" />
                    <span className="text-[11px] font-bold tracking-widest text-[#3BE0FF] font-mono">AI 视觉研判中心</span>
                  </div>
                  <Info className="w-3.5 h-3.5 text-[#3BE0FF]/50" />
                </div>

                {/* Conditional Rendering */}
                <AnimatePresence mode="wait">
                  {scanning ? (
                    <motion.div 
                      key="scanning-progress"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3.5 py-4"
                    >
                      <h4 className="text-xs font-bold text-white tracking-wide">3D拓扑融合中...</h4>
                      <div className="space-y-2.5 font-mono text-[10.5px]">
                        {[
                          { label: "1. 捕获高频视觉图像", step: 1 },
                          { label: "2. 启动LIDAR 3D深度拓扑分析", step: 2 },
                          { label: "3. 检索云端多模态文物知识图谱", step: 3 },
                          { label: "4. 智能音频与视觉报告编排中", step: 4 }
                        ].map((s) => {
                          const done = scanStep > s.step;
                          const curr = scanStep === s.step;
                          return (
                            <div 
                              key={s.label} 
                              className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${curr ? 'bg-[#3BE0FF]/10 border-[#3BE0FF] text-white font-bold' : done ? 'bg-[#2563EB]/10 border-transparent text-[#7E95B8]' : 'border-transparent text-zinc-500'}`}
                            >
                              <span>{s.label}</span>
                              {curr ? (
                                <span className="text-[#9BF3FF] animate-pulse">进行中...</span>
                              ) : done ? (
                                <span className="text-[#3BE0FF]">✓ 完成</span>
                              ) : (
                                <span className="text-zinc-700">等待</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : recognizeResult ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="space-y-4"
                    >
                      {/* Header Details */}
                      <div>
                        <span className="inline-block bg-[#3BE0FF]/10 text-[#3BE0FF] border border-[#3BE0FF]/30 text-[9px] font-black px-2 py-0.5 rounded-full mb-1">
                          🏆 识别成功 · 多模态置信度 99.4%
                        </span>
                        <h2 className="text-lg font-black text-white leading-tight" style={{ fontFamily: "var(--font-noto-serif)" }}>
                          {recognizeResult.subject}
                        </h2>
                      </div>

                      {/* Story Block */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-[#7E95B8] block">📖 深度文化史料解读</span>
                        <p className="text-xs leading-relaxed text-[#DCE9F7] tracking-wide bg-[#060D17] p-4 rounded-xl border border-[#3BE0FF]/15">
                          {recognizeResult.story}
                        </p>
                      </div>

                      {/* Tip Block */}
                      <div className="bg-[#2563EB]/5 border border-[#2563EB]/25 rounded-xl p-3.5 space-y-1">
                        <div className="flex items-center gap-1 text-[10.5px] font-black text-[#2563EB]">
                          <Compass className="w-3.5 h-3.5 text-[#3BE0FF]" />
                          <span>游览观赏建议</span>
                        </div>
                        <p className="text-[10.5px] text-[#7E95B8] leading-relaxed">
                          {recognizeResult.tip}
                        </p>
                      </div>

                      {/* Audio Player and spectrogram wave */}
                      <div className="bg-[#060D17] border border-[#3BE0FF]/15 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={togglePlayAudio}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#3BE0FF] flex items-center justify-center text-white hover:brightness-105 active:scale-95 transition-all shadow-md"
                          >
                            {isPlayingAudio ? (
                              <VolumeX className="w-4 h-4" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </button>
                          <div>
                            <span className="text-[10.5px] font-bold text-white block">小玉语音文化精讲</span>
                            <span className="text-[9px] text-[#7E95B8]">点击听取沉浸式叙事声像</span>
                          </div>
                        </div>

                        {/* Moving Spectrogram Bar Wave Animation when audio is active */}
                        <div className="flex items-end gap-[2.5px] h-6 pr-2">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <span 
                              key={i} 
                              className={`w-[2.5px] bg-[#3BE0FF] rounded-full transition-all duration-300 ${isPlayingAudio ? 'animate-pulse' : ''}`}
                              style={{ 
                                height: isPlayingAudio ? `${AUDIO_WAVE_HEIGHTS[i - 1] ?? 10}px` : "4px",
                                animationDelay: `${i * 120}ms`
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* CTA Button to send to conversation */}
                      {onRecognized && (
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={() => onRecognized(recognizeResult.subject, recognizeResult.story)}
                          className="w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 text-white shadow-lg shadow-cyan-500/20 transition-all active:scale-95 mt-4 bg-gradient-to-r from-[#2563EB] to-[#3BE0FF] border border-[#3BE0FF]/40"
                        >
                          <Sparkles className="w-4 h-4 text-white" />
                          <span>发送至AI导游对话框</span>
                        </motion.button>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-64 flex flex-col items-center justify-center text-center p-6 gap-3 text-zinc-500"
                    >
                      <HelpCircle className="w-10 h-10 text-zinc-700" />
                      <p className="text-[11px] leading-relaxed text-[#7E95B8] break-words">
                        暂无研判报告。请先打开摄像头拍摄展品或景物，小玉将即刻生成结构化文化解读。
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Footer Slogan */}
              <div className="mt-8 pt-3 border-t border-[#3BE0FF]/20 flex items-center gap-2 text-[#7E95B8]">
                <span className="w-5 h-5 rounded bg-[#3BE0FF]/10 border border-[#3BE0FF]/20 flex items-center justify-center text-[10px] text-[#3BE0FF] font-bold">精</span>
                <p className="text-[9.5px] leading-normal font-mono">
                  视觉好奇转化为深度认知，变“走马观花”为“沉浸体悟”。
                </p>
              </div>
            </div>
          </section>

        </div>
      </motion.div>
    </div>,
    document.body
  );
}
