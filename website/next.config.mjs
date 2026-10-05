/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export: the build writes a plain site to out/ that any host can serve.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
