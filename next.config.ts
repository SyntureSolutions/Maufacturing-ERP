import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Other devices on the local network (e.g. a phone or another PC) may open the dev server at this address
  allowedDevOrigins: ['192.168.1.52'],
};

export default nextConfig;
