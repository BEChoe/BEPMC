/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 기존 public 정적 파일 및 API 지원
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/index.html',
      },
    ];
  },
};

module.exports = nextConfig;
