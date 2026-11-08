import type { NextConfig } from "next";

// NOTE: secrets (EAZO_*, DATABASE_URL, ...) must be provided via environment
// variables (local .env / Netlify UI). Do NOT hardcode them here or inline
// them via the `env` option — Netlify secrets scanning fails the build when
// real values appear in repo files or bundled function output.

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Pull the local `@eazo/sdk` into Next's transpile graph.
  transpilePackages: ["@eazo/sdk"],
  // RFC1918 LAN ranges + localhost for `next dev` HMR over Wi-Fi.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
  ],
};

export default nextConfig;
