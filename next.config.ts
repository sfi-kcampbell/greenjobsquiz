import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Nothing but the embed may be framed by other sites (clickjacking).
        // /embed/* sets its own frame-ancestors in src/proxy.ts.
        source: "/((?!embed/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
