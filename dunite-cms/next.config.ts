import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Parent directories may carry extra lockfiles; pin Turbopack root to this app.
const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: appDir,
  turbopack: {
    root: appDir,
  },
};

export default nextConfig;
