import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Der ligger en package-lock.json i hjemmemappen; uden denne linje leder Turbopack der.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
