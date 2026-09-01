import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium for PDF rendering must not be traced/bundled by Next — it ships
  // its own binary and is loaded at runtime in the /documents/[id]/pdf route.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
