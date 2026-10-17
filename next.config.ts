import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "fluent-ffmpeg",
    "ffmpeg-static",
    "@ffprobe-installer/ffprobe",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
