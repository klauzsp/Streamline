import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["xlsx"],
  outputFileTracingIncludes: {
    "/api/migrations": [
      "./data/source/*.xlsx",
      "./data/output/*.xlsx",
      "./.generated/westvale-demo.json",
    ],
    "/api/migrations/*": ["./data/source/*.xlsx", "./data/output/*.xlsx"],
  },
};
export default config;
