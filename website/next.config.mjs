// Plain-object JS config: Hostinger reads it on every Next.js version and adds `output: "standalone"` itself.
/** Security headers for every response. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];
/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  // Hostinger's Next.js image-optimizer route can stall indefinitely. The
  // website's own images are production-ready, so serve them directly.
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Images and fonts in public/ change rarely: let browsers keep them for a week.
      { source: "/:all*(png|webp|svg|jpg|jpeg|ico|woff2)", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};
export default config;
