import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Hostinger deploys .next/standalone (see scripts/hostinger-prepare.mjs).
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
