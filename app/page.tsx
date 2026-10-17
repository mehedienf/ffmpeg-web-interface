"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
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
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TabId = "convert" | "trim" | "compress" | "extract";
type Resolution = "1080p" | "720p" | "480p";
type AudioBitrate = "128k" | "192k" | "320k";
type OutputFormat =
  | "mp4"
  | "webm"
  | "mkv"
  | "mp3"
  | "wav"
  | "aac"
  | "gif";

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
const AUDIO_FORMATS: OutputFormat[] = ["mp3", "wav", "aac"];
const ALL_FORMATS: OutputFormat[] = [...VIDEO_FORMATS, ...AUDIO_FORMATS];
const AUDIO_ONLY_FORMATS: OutputFormat[] = ["mp3", "wav"];
const RESOLUTIONS: Resolution[] = ["1080p", "720p", "480p"];
const BITRATES: AudioBitrate[] = ["128k", "192k", "320k"];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "convert", label: "Format Converter", icon: <Film size={16} /> },
  { id: "trim", label: "Trimmer / Cutter", icon: <Scissors size={16} /> },
  { id: "compress", label: "Compressor", icon: <Minimize2 size={16} /> },
  { id: "extract", label: "Audio Extractor", icon: <Music size={16} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast component
// ─────────────────────────────────────────────────────────────────────────────
function ToastBar({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium transition-all
            ${t.type === "success" ? "bg-emerald-600 text-white" : ""}
            ${t.type === "error" ? "bg-red-600 text-white" : ""}
            ${t.type === "info" ? "bg-blue-600 text-white" : ""}
          `}
        >
          {t.type === "success" && <CheckCircle size={16} className="mt-0.5 shrink-0" />}
          {t.type === "error" && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Uploader
// ─────────────────────────────────────────────────────────────────────────────
function FileUploader({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      previewUrl.current = url;
      setLocalPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setLocalPreview(null);
    }
  }, [file]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors
          ${dragging
            ? "border-violet-400 bg-violet-500/10"
            : "border-zinc-600 hover:border-violet-500 hover:bg-violet-500/5"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-violet-500/20 p-4">
            <Upload size={28} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-200">
              Drag &amp; drop your file here
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              or <span className="text-violet-400 underline">browse files</span>
              &nbsp;· Video &amp; Audio supported
            </p>
          </div>
        </div>
      </div>

      {file && (
        <div className="rounded-xl bg-zinc-800/60 border border-zinc-700 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/20 p-2">
              {isAudioFile(file) ? (
                <FileAudio size={18} className="text-violet-400" />
              ) : (
                <FileVideo size={18} className="text-violet-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">{file.name}</p>
              <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onFile(null as unknown as File); }}
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {localPreview && (
            <div className="rounded-lg overflow-hidden bg-black">
              {isAudioFile(file) ? (
                <audio
                  src={localPreview}
                  controls
                  className="w-full h-10"
                />
              ) : (
                <video
                  src={localPreview}
                  controls
                  className="w-full max-h-48 object-contain"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Command Preview
// ─────────────────────────────────────────────────────────────────────────────
function CommandPreview({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
          <Terminal size={13} />
          <span>FFmpeg Command Preview</span>
        </div>
        <button
          onClick={copy}
          className="text-xs text-zinc-400 hover:text-violet-400 transition-colors font-mono"
        >
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
          <p className="text-xs text-zinc-400">
            Your file is ready · auto-expires in 15 minutes
          </p>
        </div>
      </div>

      <a
        href={result.downloadUrl}
        download={result.filename}
        className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-3 px-6 transition-colors"
      >
        <Download size={18} />
        Download {result.outputFormat.toUpperCase()} File
      </a>

      <p className="text-center text-xs text-zinc-500 font-mono break-all">
        {result.filename}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Label + Select helper
// ─────────────────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
      {children}
    </label>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 focus:outline-none focus:border-violet-500 transition-colors"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Process Button
// ─────────────────────────────────────────────────────────────────────────────
function ProcessButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center gap-2 w-full rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 transition-colors"
    >
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          Processing…
        </>
      ) : (
        <>
          <Play size={18} />
          Start Processing
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("convert");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  // Per-tab state
  const [convertFormat, setConvertFormat] = useState<OutputFormat>("mp4");
  const [trimStart, setTrimStart] = useState("00:00:00");
  const [trimEnd, setTrimEnd] = useState("00:00:10");
  const [trimFastCopy, setTrimFastCopy] = useState(false);
  const [trimFormat, setTrimFormat] = useState<OutputFormat>("mp4");
  const [compressResolution, setCompressResolution] =
    useState<Resolution>("720p");
  const [compressCrf, setCompressCrf] = useState(23);
  const [extractFormat, setExtractFormat] = useState<"mp3" | "wav">("mp3");
  const [extractBitrate, setExtractBitrate] = useState<AudioBitrate>("192k");

  // ── Toast helpers ────────────────────────────────────────────────────────
  const addToast = useCallback(
    (type: Toast["type"], message: string) => {
      const id = ++toastCounter.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Reset result when tab or file changes ────────────────────────────────
  useEffect(() => {
    setResult(null);
  }, [activeTab, file]);

  // ── Live command builder ─────────────────────────────────────────────────
  const liveCommand = useCallback((): string => {
    const inputName = file?.name ?? "input.mp4";
    const base = `ffmpeg -i "${inputName}"`;

    if (activeTab === "convert") {
      if (convertFormat === "mp3")
        return `${base} -vn -acodec libmp3lame -b:a 192k "output.mp3"`;
      if (convertFormat === "aac")
        return `${base} -vn -acodec aac -b:a 192k "output.aac"`;
      if (convertFormat === "wav")
        return `${base} -vn -acodec pcm_s16le "output.wav"`;
      if (convertFormat === "gif")
        return `${base} -vf "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -an "output.gif"`;
      if (convertFormat === "webm")
        return `${base} -c:v libvpx-vp9 -c:a libopus "output.webm"`;
      if (convertFormat === "mkv")
        return `${base} -c:v libx264 -c:a aac "output.mkv"`;
      return `${base} -c:v libx264 -c:a aac "output.mp4"`;
    }

    if (activeTab === "trim") {
      const codecPart = trimFastCopy
        ? "-c copy"
        : "-c:v libx264 -c:a aac";
      const endPart = trimEnd
        ? ` -to "${trimEnd}"`
        : "";
      return `${base} -ss "${trimStart}"${endPart} ${codecPart} "output.${trimFormat}"`;
    }

    if (activeTab === "compress") {
      const sizeMap: Record<Resolution, string> = {
        "1080p": "1920x1080",
        "720p": "1280x720",
        "480p": "854x480",
      };
      const scalePart = ` -vf "scale=${sizeMap[compressResolution]}"`;
      return `${base}${scalePart} -c:v libx264 -crf ${compressCrf} -preset medium -c:a aac "output.mp4"`;
    }

    if (activeTab === "extract") {
      if (extractFormat === "wav")
        return `${base} -vn -acodec pcm_s16le "output.wav"`;
      return `${base} -vn -acodec libmp3lame -b:a ${extractBitrate} "output.mp3"`;
    }

    return `${base} "output.mp4"`;
  }, [
    activeTab,
    file,
    convertFormat,
    trimStart,
    trimEnd,
    trimFastCopy,
    trimFormat,
    compressResolution,
    compressCrf,
    extractFormat,
    extractBitrate,
  ]);

  // ── Process handler ──────────────────────────────────────────────────────
  const handleProcess = async () => {
    if (!file) {
      addToast("error", "Please select a file first.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("operation", activeTab);

      if (activeTab === "convert") {
        formData.append("outputFormat", convertFormat);
      } else if (activeTab === "trim") {
        formData.append("outputFormat", trimFormat);
        formData.append("startTime", trimStart);
        formData.append("endTime", trimEnd);
        formData.append("fastCopy", String(trimFastCopy));
      } else if (activeTab === "compress") {
        formData.append("outputFormat", "mp4");
        formData.append("resolution", compressResolution);
        formData.append("crf", String(compressCrf));
      } else if (activeTab === "extract") {
        formData.append("outputFormat", extractFormat);
        formData.append("audioBitrate", extractBitrate);
      }

      const res = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Unknown server error.");
      }

      setResult(data as ProcessResult);
      addToast("success", "Processing complete! Your file is ready.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Handle file clear ─────────────────────────────────────────────────────
  const handleFile = (f: File | null) => {
    setFile(f);
    setResult(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ToastBar toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-violet-600 p-2">
            <Film size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">
              FFmpeg Studio
            </h1>
            <p className="text-xs text-zinc-400 leading-none mt-0.5">
              Media Processing Suite
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Tab Bar */}
        <nav className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column — Uploader + Options */}
          <div className="space-y-6">
            {/* File Uploader */}
            <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-300">
                1. Upload File
              </h2>
              <FileUploader file={file} onFile={handleFile} />
            </section>

            {/* Operation Options */}
            <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-5">
              <h2 className="text-sm font-semibold text-zinc-300">
                2. Configure Options
              </h2>

              {/* ── Convert ── */}
              {activeTab === "convert" && (
                <div>
                  <FieldLabel>Output Format</FieldLabel>
                  <Select
                    value={convertFormat}
                    options={ALL_FORMATS}
                    onChange={setConvertFormat}
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    {["mp3", "wav", "aac"].includes(convertFormat)
                      ? "Audio-only output — video stream will be stripped."
                      : convertFormat === "gif"
                      ? "Animated GIF at 10 fps, 480px wide."
                      : `Video output using ${convertFormat === "webm" ? "VP9 + Opus" : "H.264 + AAC"}.`}
                  </p>
                </div>
              )}

              {/* ── Trim ── */}
              {activeTab === "trim" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Start Time</FieldLabel>
                      <input
                        type="text"
                        value={trimStart}
                        onChange={(e) => setTrimStart(e.target.value)}
                        placeholder="00:00:00"
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 font-mono focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <FieldLabel>End Time</FieldLabel>
                      <input
                        type="text"
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(e.target.value)}
                        placeholder="00:00:10"
                        className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 font-mono focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Output Format</FieldLabel>
                    <Select
                      value={trimFormat}
                      options={VIDEO_FORMATS.filter((f) => f !== "gif") as OutputFormat[]}
                      onChange={(v) => setTrimFormat(v as OutputFormat)}
                    />
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => setTrimFastCopy((p) => !p)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${trimFastCopy ? "bg-violet-600" : "bg-zinc-700"}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${trimFastCopy ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-200 font-medium">
                        Fast Stream Copy
                      </p>
                      <p className="text-xs text-zinc-500">
                        Uses <code className="text-zinc-400">-c copy</code> for instant
                        cutting (may have slight keyframe offset). Off = accurate
                        re-encode.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* ── Compress ── */}
              {activeTab === "compress" && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Resolution Preset</FieldLabel>
                    <div className="flex gap-2">
                      {RESOLUTIONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => setCompressResolution(r)}
                          className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition-colors
                            ${compressResolution === r
                              ? "bg-violet-600 border-violet-500 text-white"
                              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-violet-600"
                            }`}
                        >
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
                    <input
                      type="range"
                      min={18}
                      max={35}
                      value={compressCrf}
                      onChange={(e) => setCompressCrf(Number(e.target.value))}
                      className="w-full accent-violet-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-zinc-600 mt-1">
                      <span>18 — Best Quality</span>
                      <span>35 — Smallest Size</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500">
                    Output: MP4 (H.264, medium preset). Lower CRF = larger file
                    but better quality.
                  </p>
                </div>
              )}

              {/* ── Extract ── */}
              {activeTab === "extract" && (
                <div className="space-y-4">
                  <div>
                    <FieldLabel>Output Audio Format</FieldLabel>
                    <Select
                      value={extractFormat}
                      options={AUDIO_ONLY_FORMATS as ("mp3" | "wav")[]}
                      onChange={(v) => setExtractFormat(v as "mp3" | "wav")}
                    />
                  </div>

                  {extractFormat === "mp3" && (
                    <div>
                      <FieldLabel>Bitrate</FieldLabel>
                      <div className="flex gap-2">
                        {BITRATES.map((b) => (
                          <button
                            key={b}
                            onClick={() => setExtractBitrate(b)}
                            className={`flex-1 rounded-lg py-2 text-sm font-semibold border transition-colors
                              ${extractBitrate === b
                                ? "bg-violet-600 border-violet-500 text-white"
                                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-violet-600"
                              }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {extractFormat === "wav" && (
                    <p className="text-xs text-zinc-500">
                      WAV outputs uncompressed PCM audio — lossless but larger
                      file size.
                    </p>
                  )}
                </div>
              )}

              <ProcessButton
                onClick={handleProcess}
                loading={loading}
                disabled={!file}
              />
            </section>
          </div>

          {/* Right Column — Command Preview + Result */}
          <div className="space-y-6">
            {/* Live Command Preview */}
            <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-300">
                3. Live Command Preview
              </h2>
              <CommandPreview command={liveCommand()} />
            </section>

            {/* Result */}
            {result && (
              <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-zinc-300">
                  4. Download Result
                </h2>
                <ResultCard result={result} />
              </section>
            )}

            {/* How it works */}
            {!result && (
              <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
                <h2 className="text-sm font-semibold text-zinc-300 mb-3">
                  How It Works
                </h2>
                <ol className="space-y-3 text-sm text-zinc-400">
                  {[
                    "Upload your video or audio file using drag & drop.",
                    "Select an operation tab and configure options.",
                    "Click \u0022Start Processing\u0022 — your file is processed server-side with FFmpeg.",
                    "Download the output. Files auto-delete after 15 minutes.",
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
        <div className="max-w-5xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <span>FFmpeg Studio · Powered by Next.js &amp; fluent-ffmpeg</span>
          <span>Files auto-deleted after 15 minutes</span>
        </div>
      </footer>
    </div>
  );
}
