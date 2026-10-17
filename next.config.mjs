/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'fluent-ffmpeg',
    'ffmpeg-static',
    '@ffprobe-installer/ffprobe',
  ],
};

export default nextConfig;

