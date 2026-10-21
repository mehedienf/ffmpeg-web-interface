"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  DragEvent,
  ChangeEvent,
} from "react";
import {
  Upload,
  Film,
  Scissors,
  Minimize2,
  Music,
  Terminal,
  Download,
  X,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileVideo,
  FileAudio,
  Play,
  CloudUpload,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TabId = "convert" | "trim" | "compress" | "extract";
type Resolution = "1080p" | "720p" | "480p";
type AudioBitrate = "128k" | "192k" | "320k";
type OutputFormat = "mp4" | "webm" | "mkv" | "mp3" | "wav" | "aac" | "gif";
type UploadState = "idle" | "uploading" | "done" | "error";

interface UploadedFile {
  fileId: string;
  filename: string;
  originalName: string;
  size: number;
}

interface ProcessResult {
  downloadUrl: string;
  filename: string;
  outputFormat: string;
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const VIDEO_FORMATS: OutputFormat[] = ["mp4", "webm", "mkv", "gif"];
const ALL_FORMATS: OutputFormat[] = ["mp4", "webm", "mkv", "mp3", "wav", "aac", "gif"];
const AUDIO_ONLY_FORMATS: OutputFormat[] = ["mp3", "wav"];
const RESOLUTIONS: Resolution[] = ["1080p", "720p", "480p"];
const BITRATES: AudioBitrate[] = ["128k", "192k", "320k"];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "convert",  label: "Format Converter", icon: <Film size={15} /> },
  { id: "trim",     label: "Trimmer / Cutter",  icon: <Scissors size={15} /> },
  { id: "compress", label: "Compressor",        icon: <Minimize2 size={15} /> },
  { id: "extract",  label: "Audio Extractor",   icon: <Music size={15} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtBytes(b: number) {
  if (!b) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${+(b / Math.pow(k, i)).toFixed(2)} ${s[i]}`;
}
function isAudio(f: File) { return f.type.startsWith("audio/"); }

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
function ToastBar({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium border
          ${t.type === "success" ? "bg-emerald-600 text-white border-emerald-700" : ""}
          ${t.type === "error"   ? "bg-rose-600 text-white border-rose-700"       : ""}
          ${t.type === "info"    ? "bg-indigo-600 text-white border-indigo-700"   : ""}
        `}>
          {t.type === "success" && <CheckCircle  size={16} className="mt-0.5 shrink-0" />}
          {t.type === "error"   && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-80 hover:opacity-100 transition-opacity"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Label helpers
// ─────────────────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
      {children}
    </label>
  );
}

function Sel<T extends string>({ value, options, onChange }: {
  value: T; options: T[]; onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-xl bg-[#faf5f2] border-0 text-stone-900 text-sm px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#f05523] shadow-none transition-all font-medium cursor-pointer">
      {options.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-[#f05523]" : "bg-[#d9c8bd]"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-none transition-transform ${checked ? "translate-x-5" : ""}`} />
      </div>
      <div>
        <p className="text-sm text-stone-800 font-medium">{label}</p>
        {hint && <p className="text-xs text-stone-500">{hint}</p>}
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Preview
// ─────────────────────────────────────────────────────────────────────────────
function CommandPreview({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl bg-stone-900 overflow-hidden shadow-none border-0">
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-950/80">
        <div className="flex items-center gap-2 text-xs text-stone-400 font-mono">
          <Terminal size={13} className="text-[#f05523]" />
          <span>FFmpeg Command Preview</span>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs text-stone-400 hover:text-stone-200 font-mono transition-colors">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <code className="text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">
          {command}
        </code>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Card
// ─────────────────────────────────────────────────────────────────────────────
function ResultCard({ result }: { result: ProcessResult }) {
  return (
    <div className="rounded-2xl bg-[#faf5f2] p-6 space-y-4 shadow-none border-0">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-100 text-emerald-700 p-2">
          <CheckCircle size={22} className="text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-emerald-950 text-base">Processing Complete!</p>
          <p className="text-xs text-emerald-700">Output is ready · Auto-expires after 15 minutes of inactivity</p>
        </div>
      </div>
      <a href={result.downloadUrl} download={result.filename}
        className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-3.5 px-6 shadow-none border-0 transition-all">
        <Download size={18} />
        Download {result.outputFormat.toUpperCase()} File
      </a>
      <p className="text-center text-xs text-stone-500 font-mono break-all">{result.filename}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag & Drop File Uploader
// ─────────────────────────────────────────────────────────────────────────────
function FileUploader({
  uploadState,
  uploadedFile,
  localFile,
  uploadProgress,
  onLocalFile,
  onClear,
}: {
  uploadState: UploadState;
  uploadedFile: UploadedFile | null;
  localFile: File | null;
  uploadProgress: number;
  onLocalFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!localFile) { setPreviewUrl(null); return; }
    const u = URL.createObjectURL(localFile);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [localFile]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onLocalFile(f);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => { if (!localFile) inputRef.current?.click(); }}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all shadow-none
          ${dragging ? "border-[#f05523] bg-[#faf5f2]" :
            uploadState === "done" ? "border-emerald-500/50 bg-[#faf5f2] cursor-default" :
            "border-[#d9c8bd] hover:border-[#f05523]/70 bg-[#faf5f2]"}`}
      >
        <input ref={inputRef} type="file" accept="video/*,audio/*" className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onLocalFile(f); }} />

        {!localFile && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-[#ded0c5] p-4 text-[#f05523]">
              <Upload size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-800">Drag & drop your file here</p>
              <p className="mt-1 text-xs text-stone-500">
                or <span className="text-[#f05523] underline font-medium">browse files</span> · Video & Audio supported
              </p>
            </div>
          </div>
        )}

        {localFile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-left bg-[#ded0c5] rounded-xl p-3 shadow-none border-0">
              <div className="rounded-lg bg-[#faf5f2] p-2.5 text-[#f05523]">
                {isAudio(localFile) ? <FileAudio size={20} /> : <FileVideo size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-stone-800">{localFile.name}</p>
                <p className="text-xs text-stone-500">{fmtBytes(localFile.size)}</p>
              </div>
              {uploadState !== "uploading" && (
                <button onClick={(e) => { e.stopPropagation(); onClear(); }}
                  className="text-stone-400 hover:text-rose-600 transition-colors p-1">
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Upload progress */}
            {uploadState === "uploading" && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
                  <span className="flex items-center gap-1.5 text-[#f05523]">
                    <CloudUpload size={14} /> Uploading to server…
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-[#d9c8bd] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#f05523] to-[#e11d48] rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {uploadState === "done" && (
              <p className="text-xs text-emerald-700 font-medium flex items-center justify-center gap-1.5 pt-1">
                <CheckCircle size={14} className="text-emerald-600" /> Uploaded successfully · Ready to process
              </p>
            )}

            {uploadState === "error" && (
              <p className="text-xs text-rose-600 font-medium flex items-center justify-center gap-1.5 pt-1">
                <AlertTriangle size={14} /> Upload failed · Please try again
              </p>
            )}

            {/* Preview */}
            {previewUrl && uploadState !== "uploading" && (
              <div className="rounded-xl overflow-hidden bg-stone-900 shadow-none border-0">
                {isAudio(localFile)
                  ? <audio src={previewUrl} controls className="w-full h-11" />
                  : <video src={previewUrl} controls className="w-full max-h-52 object-contain" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("convert");

  // Upload state
  const [localFile, setLocalFile]       = useState<File | null>(null);
  const [uploadState, setUploadState]   = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);

  // Process state
  const [processing, setProcessing] = useState(false);
  const [result, setResult]         = useState<ProcessResult | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Inactivity tracking
  const lastActiveRef = useRef<number>(Date.now());

  // Operation options
  const [convertFormat, setConvertFormat]   = useState<OutputFormat>("mp4");
  const [trimStart, setTrimStart]           = useState("00:00:00");
  const [trimEnd, setTrimEnd]               = useState("00:00:10");
  const [trimFastCopy, setTrimFastCopy]     = useState(false);
  const [trimFormat, setTrimFormat]         = useState<OutputFormat>("mp4");
  const [compressRes, setCompressRes]       = useState<Resolution>("720p");
  const [compressCrf, setCompressCrf]       = useState(23);
  const [extractFormat, setExtractFormat]   = useState<"mp3" | "wav">("mp3");
  const [extractBitrate, setExtractBitrate] = useState<AudioBitrate>("192k");

  // Toast helpers
  const toast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastId.current;
    setToasts((p) => [...p, { id, type, message }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);

  useEffect(() => { setResult(null); }, [activeTab]);

  // Keep-alive for active users and auto-cleanup after 15m inactivity
  useEffect(() => {
    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

    const updateActivity = () => {
      lastActiveRef.current = Date.now();
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    const interval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActiveRef.current;

      // If user has been inactive for 15+ minutes, auto-expire files in UI
      if (idleTime >= INACTIVITY_LIMIT_MS) {
        if (uploadedFile || result) {
          setLocalFile(null);
          setUploadedFile(null);
          setUploadState("idle");
          setUploadProgress(0);
          setResult(null);
          toast("info", "Files auto-deleted after 15 minutes of inactivity.");
        }
        return;
      }

      // If active and has files on server, send keep-alive to refresh server storage timestamps
      if (uploadedFile?.filename || result?.filename) {
        fetch("/api/keep-alive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadFilename: uploadedFile?.filename,
            outputFilename: result?.filename,
          }),
        }).catch(() => {});
      }
    }, 45 * 1000); // Check every 45s

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      clearInterval(interval);
    };
  }, [uploadedFile, result, toast]);

  // ── Step 1: Upload file when dropped/selected ────────────────────────────
  const handleLocalFile = useCallback(async (file: File) => {
    setLocalFile(file);
    setUploadedFile(null);
    setResult(null);
    setUploadState("uploading");
    setUploadProgress(0);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const uploaded: UploadedFile = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as UploadedFile);
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed: HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(fd);
      });

      setUploadedFile(uploaded);
      setUploadState("done");
      setUploadProgress(100);
      toast("success", `"${file.name}" uploaded — ready to configure and process.`);
    } catch (err) {
      setUploadState("error");
      toast("error", err instanceof Error ? err.message : "Upload failed.");
    }
  }, [toast]);

  const handleClear = () => {
    if (uploadedFile?.filename) {
      fetch(`/api/upload?filename=${encodeURIComponent(uploadedFile.filename)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setLocalFile(null);
    setUploadedFile(null);
    setUploadState("idle");
    setUploadProgress(0);
    setResult(null);
  };

  // ── Step 2: Process ──────────────────────────────────────────────────────
  const handleProcess = async () => {
    if (!uploadedFile) { toast("error", "Please upload a file first."); return; }

    setProcessing(true);
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        fileId:       uploadedFile.fileId,
        filename:     uploadedFile.filename,
        operation:    activeTab,
        outputFormat: activeTab === "convert"  ? convertFormat
                    : activeTab === "trim"     ? trimFormat
                    : activeTab === "compress" ? "mp4"
                    :                            extractFormat,
      };

      if (activeTab === "trim") {
        payload.startTime = trimStart;
        payload.endTime   = trimEnd;
        payload.fastCopy  = trimFastCopy;
      }
      if (activeTab === "compress") {
        payload.resolution = compressRes;
        payload.crf        = compressCrf;
      }
      if (activeTab === "extract") {
        payload.audioBitrate = extractBitrate;
      }

      const res  = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown server error.");

      setResult(data as ProcessResult);
      toast("success", "Processing complete! Your download is ready.");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setProcessing(false);
    }
  };

  // ── Live command preview ─────────────────────────────────────────────────
  const liveCommand = useCallback(() => {
    const i = localFile?.name ?? "input.mp4";
    const base = `ffmpeg -threads 2 -i "${i}"`;

    if (activeTab === "convert") {
      if (convertFormat === "mp3") return `${base} -vn -c:a libmp3lame -b:a 192k "output.mp3"`;
      if (convertFormat === "aac") return `${base} -vn -c:a aac -b:a 192k "output.aac"`;
      if (convertFormat === "wav") return `${base} -vn -c:a pcm_s16le "output.wav"`;
      if (convertFormat === "gif") return `${base} -vf "fps=10,scale=-2:480:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -an "output.gif"`;
      if (convertFormat === "webm") return `${base} -c:v libvpx-vp9 -threads 2 -crf 30 -b:v 0 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a libopus "output.webm"`;
      return `${base} -c:v libx264 -threads 2 -crf 23 -preset veryfast -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a aac -b:a 128k -ar 44100 -movflags +faststart "output.mp4"`;
    }
    if (activeTab === "trim") {
      const codec = trimFastCopy ? "-c copy -avoid_negative_ts make_zero"
        : "-c:v libx264 -threads 2 -preset veryfast -pix_fmt yuv420p -vf \"scale=trunc(iw/2)*2:trunc(ih/2)*2\" -c:a aac -b:a 128k -ar 44100 -movflags +faststart";
      return `${base} -ss "${trimStart}" -t "${trimEnd}" ${codec} "output.${trimFormat}"`;
    }
    if (activeTab === "compress") {
      const scales: Record<Resolution, string> = {
        "1080p": "scale=-2:1080",
        "720p":  "scale=-2:720",
        "480p":  "scale=-2:480",
      };
      return `${base} -c:v libx264 -threads 2 -crf ${compressCrf} -preset veryfast -pix_fmt yuv420p -vf "${scales[compressRes]}" -c:a aac -b:a 128k -ar 44100 -movflags +faststart "output.mp4"`;
    }
    if (activeTab === "extract") {
      if (extractFormat === "wav") return `${base} -vn -c:a pcm_s16le "output.wav"`;
      return `${base} -vn -c:a libmp3lame -b:a ${extractBitrate} "output.mp3"`;
    }
    return base;
  }, [activeTab, localFile, convertFormat, trimStart, trimEnd, trimFastCopy, trimFormat, compressRes, compressCrf, extractFormat, extractBitrate]);

  const canProcess = uploadState === "done" && !!uploadedFile && !processing;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#faf5f2] text-stone-800">
      <ToastBar toasts={toasts} onRemove={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      {/* Header */}
      <header className="border-0 bg-[#faf5f2]/90 backdrop-blur sticky top-0 z-30 shadow-none">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="klipr"
              className="h-9 md:h-10 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-[#d9c8bd] pl-3">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">Media Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-700 bg-[#ded0c5] px-3 py-1.5 rounded-full shadow-none border-0">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Upload Panel */}
        <section className="rounded-2xl bg-[#ded0c5] p-6 space-y-4 shadow-none border-0">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white text-xs font-bold shrink-0 shadow-none">1</span>
            <h2 className="text-sm font-semibold text-stone-800">Upload File to Server</h2>
            {uploadState === "done" && <CheckCircle size={15} className="text-emerald-600 ml-auto" />}
          </div>
          <FileUploader
            uploadState={uploadState}
            uploadedFile={uploadedFile}
            localFile={localFile}
            uploadProgress={uploadProgress}
            onLocalFile={handleLocalFile}
            onClear={handleClear}
          />
        </section>

        {/* Tab Bar */}
        <div>
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white text-xs font-bold shrink-0 shadow-none">2</span>
            <h2 className="text-sm font-semibold text-stone-800">Choose Operation</h2>
          </div>
          <nav className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all shadow-none border-0
                  ${activeTab === tab.id
                    ? "bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white"
                    : "bg-[#ded0c5] text-stone-700 hover:text-stone-950 hover:bg-[#d5c4b8]"}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Options */}
          <div className="space-y-6">
            <section className="rounded-2xl bg-[#ded0c5] p-6 space-y-5 shadow-none border-0">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white text-xs font-bold shrink-0 shadow-none">3</span>
                <h2 className="text-sm font-semibold text-stone-800">Configure Options</h2>
              </div>

              {/* Convert */}
              {activeTab === "convert" && (
                <div>
                  <FieldLabel>Output Format</FieldLabel>
                  <Sel value={convertFormat} options={ALL_FORMATS} onChange={setConvertFormat} />
                  <p className="mt-2 text-xs text-stone-500">
                    {["mp3", "wav", "aac"].includes(convertFormat)
                      ? "Audio-only output — video stream will be stripped."
                      : convertFormat === "gif"
                      ? "Animated GIF with high-quality palette."
                      : `Video output encoded with ${convertFormat === "webm" ? "VP9 + Opus" : "H.264 + AAC"}.`}
                  </p>
                </div>
              )}

              {/* Trim */}
              {activeTab === "trim" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Start Time</FieldLabel>
                      <input type="text" value={trimStart} onChange={(e) => setTrimStart(e.target.value)}
                        placeholder="00:00:00"
                        className="w-full rounded-xl bg-[#faf5f2] border-0 text-stone-900 text-sm px-3.5 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-[#f05523] shadow-none transition-all" />
                    </div>
                    <div>
                      <FieldLabel>End Time</FieldLabel>
                      <input type="text" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)}
                        placeholder="00:00:10"
                        className="w-full rounded-xl bg-[#faf5f2] border-0 text-stone-900 text-sm px-3.5 py-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-[#f05523] shadow-none transition-all" />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Output Format</FieldLabel>
                    <Sel value={trimFormat} options={VIDEO_FORMATS.filter((f) => f !== "gif") as OutputFormat[]} onChange={(v) => setTrimFormat(v)} />
                  </div>
                  <Toggle checked={trimFastCopy} onChange={setTrimFastCopy}
                    label="Fast Stream Copy"
                    hint="Uses -c copy (instant cutting without re-encoding). Off = accurate re-encode." />
                </div>
              )}

              {/* Compress */}
              {activeTab === "compress" && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Resolution Preset</FieldLabel>
                    <div className="flex gap-2">
                      {RESOLUTIONS.map((r) => (
                        <button key={r} onClick={() => setCompressRes(r)}
                          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all shadow-none border-0
                            ${compressRes === r
                              ? "bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white"
                              : "bg-[#faf5f2] text-stone-700 hover:text-stone-950 hover:bg-[#ded0c5]"}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>
                      CRF Quality: {compressCrf}{" "}
                      <span className="normal-case font-normal text-stone-500">
                        ({compressCrf <= 22 ? "High Quality" : compressCrf <= 27 ? "Balanced" : "Smaller Size"})
                      </span>
                    </FieldLabel>
                    <input type="range" min={18} max={35} value={compressCrf}
                      onChange={(e) => setCompressCrf(Number(e.target.value))}
                      className="w-full accent-[#f05523] cursor-pointer" />
                    <div className="flex justify-between text-xs text-stone-500 mt-1">
                      <span>18 — Best Quality</span><span>35 — Smallest Size</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Extract */}
              {activeTab === "extract" && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Output Audio Format</FieldLabel>
                    <Sel value={extractFormat} options={AUDIO_ONLY_FORMATS as ("mp3"|"wav")[]} onChange={(v) => setExtractFormat(v as "mp3"|"wav")} />
                  </div>
                  {extractFormat === "mp3" && (
                    <div>
                      <FieldLabel>Bitrate</FieldLabel>
                      <div className="flex gap-2">
                        {BITRATES.map((b) => (
                          <button key={b} onClick={() => setExtractBitrate(b)}
                            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all shadow-none border-0
                              ${extractBitrate === b
                                ? "bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white"
                                : "bg-[#faf5f2] text-stone-700 hover:text-stone-950 hover:bg-[#ded0c5]"}`}>
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Process Button */}
              <div className="pt-2">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-[#f05523] to-[#e11d48] text-white text-xs font-bold shrink-0 shadow-none">4</span>
                  <h2 className="text-sm font-semibold text-stone-800">Process</h2>
                </div>
                <button onClick={handleProcess} disabled={!canProcess}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#f05523] to-[#e11d48] hover:opacity-95 active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 shadow-none border-0 transition-all cursor-pointer">
                  {processing
                    ? <><Loader2 size={18} className="animate-spin" /> Processing…</>
                    : <><Play size={18} /> Start Processing</>}
                </button>
                {!uploadedFile && (
                  <p className="text-center text-xs text-stone-500 mt-2">
                    Upload a file first to enable processing
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Right: Command Preview + Result */}
          <div className="space-y-6">
            <section className="rounded-2xl bg-[#ded0c5] p-6 space-y-4 shadow-none border-0">
              <h2 className="text-sm font-semibold text-stone-800">Live Command Preview</h2>
              <CommandPreview command={liveCommand()} />
            </section>

            {result && (
              <section className="rounded-2xl bg-[#ded0c5] p-6 space-y-4 shadow-none border-0">
                <h2 className="text-sm font-semibold text-stone-800">Download Result</h2>
                <ResultCard result={result} />
              </section>
            )}

            {!result && (
              <section className="rounded-2xl bg-[#ded0c5] p-6 shadow-none border-0">
                <h2 className="text-sm font-semibold text-stone-800 mb-4">How It Works</h2>
                <ol className="space-y-3.5 text-sm text-stone-700">
                  {[
                    "Drag & drop your video or audio file — it uploads to the server immediately.",
                    "Select an operation tab and configure your options.",
                    "Click \"Start Processing\" — FFmpeg processes the file server-side.",
                    "Download your output file. Auto-deleted after 15 minutes of inactivity.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-[#faf5f2] text-[#f05523] flex items-center justify-center text-xs font-bold mt-0.5 shadow-none border-0">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-16 border-0 bg-[#faf5f2] shadow-none">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500 font-medium">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="klipr logo" className="h-6 w-auto object-contain opacity-85" />
            <span>· Fast Web Media Processing Studio</span>
          </div>
          <span>Files auto-deleted after 15 minutes of inactivity</span>
        </div>
      </footer>
    </div>
  );
}
