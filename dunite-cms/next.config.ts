import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 
     Vercel handles the build root automatically. 
     Manual tracing root can cause ENOENT errors in nested structures.
  */
};

export default nextConfig;
