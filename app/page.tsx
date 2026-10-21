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
        <div key={t.id} className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-xl text-sm font-medium
          ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
          ${t.type === "error"   ? "bg-red-600 text-white"     : ""}
          ${t.type === "info"    ? "bg-blue-600 text-white"    : ""}
        `}>
          {t.type === "success" && <CheckCircle  size={16} className="mt-0.5 shrink-0" />}
          {t.type === "error"   && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)}><X size={14} /></button>
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
    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
      {children}
    </label>
  );
}

function Sel<T extends string>({ value, options, onChange }: {
  value: T; options: T[]; onChange: (v: T) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 focus:outline-none focus:border-violet-500">
      {options.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-violet-600" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </div>
      <div>
        <p className="text-sm text-zinc-200 font-medium">{label}</p>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
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
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <Terminal size={12} /><span>FFmpeg Command Preview</span>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs text-zinc-400 hover:text-violet-400 font-mono">
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
    <div className="rounded-xl bg-emerald-950/40 border border-emerald-700/50 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-600/20 p-2">
          <CheckCircle size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="font-semibold text-emerald-300">Processing Complete!</p>
          <p className="text-xs text-zinc-400">Auto-expires in 15 minutes</p>
        </div>
      </div>
      <a href={result.downloadUrl} download={result.filename}
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 transition-colors">
        <Download size={18} />
        Download {result.outputFormat.toUpperCase()} File
      </a>
      <p className="text-center text-xs text-zinc-500 font-mono break-all">{result.filename}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag & Drop File Uploader (uploads to server immediately)
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
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors
          ${dragging ? "border-violet-400 bg-violet-500/10" :
            uploadState === "done" ? "border-emerald-600 bg-emerald-900/10 cursor-default" :
            "border-zinc-600 hover:border-violet-500 hover:bg-violet-500/5"}`}
      >
        <input ref={inputRef} type="file" accept="video/*,audio/*" className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onLocalFile(f); }} />

        {!localFile && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-violet-500/20 p-4">
              <Upload size={28} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">Drag & drop your file here</p>
              <p className="mt-1 text-xs text-zinc-500">or <span className="text-violet-400 underline">browse files</span> · Video & Audio</p>
            </div>
          </div>
        )}

        {localFile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-left">
              <div className="rounded-lg bg-violet-500/20 p-2">
                {isAudio(localFile)
                  ? <FileAudio size={18} className="text-violet-400" />
                  : <FileVideo size={18} className="text-violet-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">{localFile.name}</p>
                <p className="text-xs text-zinc-500">{fmtBytes(localFile.size)}</p>
              </div>
              {uploadState !== "uploading" && (
                <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-zinc-500 hover:text-red-400">
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Upload progress */}
            {uploadState === "uploading" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5"><CloudUpload size={12} /> Uploading to server…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {uploadState === "done" && (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                <CheckCircle size={12} /> Uploaded successfully · Ready to process
              </p>
            )}

            {uploadState === "error" && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Upload failed · Please try again
              </p>
            )}

            {/* Preview */}
            {previewUrl && uploadState !== "uploading" && (
              <div className="rounded-lg overflow-hidden bg-black">
                {isAudio(localFile)
                  ? <audio src={previewUrl} controls className="w-full h-10" />
                  : <video src={previewUrl} controls className="w-full max-h-48 object-contain" />}
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

      // Simulate progress using XHR so we get onprogress events
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
      toast("success", `"${file.name}" uploaded — now configure and process!`);
    } catch (err) {
      setUploadState("error");
      toast("error", err instanceof Error ? err.message : "Upload failed.");
    }
  }, [toast]);

  const handleClear = () => {
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
      toast("success", "Processing complete! Download your file.");
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ToastBar toasts={toasts} onRemove={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="klipr"
              className="h-9 md:h-10 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-zinc-800 pl-3">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block">Media Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Upload Panel — always visible */}
        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold shrink-0">1</span>
            <h2 className="text-sm font-semibold text-zinc-300">Upload File to Server</h2>
            {uploadState === "done" && <CheckCircle size={14} className="text-emerald-400 ml-auto" />}
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
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold shrink-0">2</span>
            <h2 className="text-sm font-semibold text-zinc-300">Choose Operation</h2>
          </div>
          <nav className="flex flex-wrap gap-2 mt-3">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Options */}
          <div className="space-y-6">
            <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold shrink-0">3</span>
                <h2 className="text-sm font-semibold text-zinc-300">Configure Options</h2>
              </div>

              {/* Convert */}
              {activeTab === "convert" && (
                <div>
                  <FieldLabel>Output Format</FieldLabel>
                  <Sel value={convertFormat} options={ALL_FORMATS} onChange={setConvertFormat} />
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
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 font-mono focus:outline-none focus:border-violet-500" />
                    </div>
                    <div>
                      <FieldLabel>End Time</FieldLabel>
                      <input type="text" value={trimEnd} onChange={(e) => setTrimEnd(e.target.value)}
                        placeholder="00:00:10"
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 font-mono focus:outline-none focus:border-violet-500" />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Output Format</FieldLabel>
                    <Sel value={trimFormat} options={VIDEO_FORMATS.filter((f) => f !== "gif") as OutputFormat[]} onChange={(v) => setTrimFormat(v)} />
                  </div>
                  <Toggle checked={trimFastCopy} onChange={setTrimFastCopy}
                    label="Fast Stream Copy"
                    hint="Uses -c copy (instant, may have slight offset). Off = accurate re-encode." />
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
                          className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition-colors
                            ${compressRes === r ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-violet-600"}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>
                      CRF Quality: {compressCrf}{" "}
                      <span className="normal-case font-normal text-zinc-500">
                        ({compressCrf <= 22 ? "High" : compressCrf <= 27 ? "Medium" : "Low"})
                      </span>
                    </FieldLabel>
                    <input type="range" min={18} max={35} value={compressCrf}
                      onChange={(e) => setCompressCrf(Number(e.target.value))}
                      className="w-full accent-violet-500 cursor-pointer" />
                    <div className="flex justify-between text-xs text-zinc-600 mt-1">
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
                            className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition-colors
                              ${extractBitrate === b ? "bg-violet-600 border-violet-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-violet-600"}`}>
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Process Button */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold shrink-0">4</span>
                  <h2 className="text-sm font-semibold text-zinc-300">Process</h2>
                </div>
                <button onClick={handleProcess} disabled={!canProcess}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 transition-colors">
                  {processing
                    ? <><Loader2 size={18} className="animate-spin" /> Processing…</>
                    : <><Play size={18} /> Start Processing</>}
                </button>
                {!uploadedFile && (
                  <p className="text-center text-xs text-zinc-600 mt-2">
                    Upload a file first to enable processing
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Right: Command Preview + Result */}
          <div className="space-y-6">
            <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-300">Live Command Preview</h2>
              <CommandPreview command={liveCommand()} />
            </section>

            {result && (
              <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-300">Download Result</h2>
                <ResultCard result={result} />
              </section>
            )}

            {!result && (
              <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <h2 className="text-sm font-semibold text-zinc-300 mb-4">How It Works</h2>
                <ol className="space-y-3 text-sm text-zinc-400">
                  {[
                    "Drag & drop your video or audio file — it uploads to the server immediately.",
                    "Select an operation tab and configure your options.",
                    "Click \"Start Processing\" — FFmpeg processes the file server-side.",
                    "Download your output file. It auto-deletes after 15 minutes.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-violet-600/30 text-violet-400 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-zinc-800 bg-zinc-900/60">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="klipr logo" className="h-6 w-auto object-contain opacity-80" />
            <span>· Fast Web Media Processing Studio</span>
          </div>
          <span>Files auto-deleted after 15 minutes</span>
        </div>
      </footer>
    </div>
  );
}
