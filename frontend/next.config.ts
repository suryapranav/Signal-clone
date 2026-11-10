import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser tests build into their own folder so they never clash with a
  // running `next dev` (see playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
