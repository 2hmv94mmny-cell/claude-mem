/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // The shop lives in a subfolder of a larger repository; build from this folder.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
