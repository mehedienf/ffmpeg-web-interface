# klipr — Web-based Media Processing Studio

**klipr** is a production-ready, full-stack web application for media processing built with Next.js (App Router), Tailwind CSS, Lucide Icons, and FFmpeg.

## Core Features
- **Format Converter:** Convert videos and audio between MP4, WebM, MKV, MP3, WAV, AAC, and GIF.
- **Video Trimmer / Cutter:** High-precision video trimming with fast stream-copy option.
- **Video Compressor:** Resolution scaling presets (1080p, 720p, 480p) with CRF 18–35 control.
- **Audio Extractor:** Extract audio tracks directly into high-bitrate MP3 or lossless WAV.
- **Live Command Preview:** Real-time FFmpeg CLI command generation as options change.
- **Dual-Phase Upload & Processing:** Immediate drag-and-drop file upload with progress bar followed by fast background processing.
- **cPanel & Shared Hosting Optimized:** Tailored thread limits (`-threads 2`), memory-safe presets (`-preset veryfast`), and automatic binary resolution.

## Getting Started

```bash
npm run dev
# or
npm run build
npm start
```

## cPanel deployment

Use Node.js 20 (20.9 or newer within the Node 20 series) in cPanel. Upload
Linux-compatible executable binaries manually to `bin/ffmpeg` and `bin/ffprobe`,
then run:

```bash
bash deploy.sh
```

The deployment script uses `npm ci --omit=dev` and does not download or install
an FFmpeg npm package. Both binaries must be present and executable before the
application is started.
