// Plain-object JS config: Hostinger reads it on every Next.js version and adds `output: "standalone"` itself.
/** @type {import('next').NextConfig} */
const config = {
  images: { remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com" }] },
};
export default config;
