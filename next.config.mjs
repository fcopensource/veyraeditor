// Plain-object JS config: Hostinger reads it on every Next.js version and adds `output: "standalone"` itself.
/** @type {import('next').NextConfig} */
const config = {
  // Hostinger's Next.js image-optimizer route can stall indefinitely. The
  // website's own images are production-ready, so serve them directly.
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
};
export default config;
