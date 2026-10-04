import type {NextConfig} from 'next';
const config:NextConfig={output:'standalone',outputFileTracingRoot:process.cwd(),images:{remotePatterns:[{protocol:'https',hostname:'avatars.githubusercontent.com'}]}};
export default config;
