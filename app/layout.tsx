import type {Metadata} from 'next';
import './globals.css';
import './pages.css';
import './cinematic.css';
import './code-experience.css';
export const metadata:Metadata={title:{default:'Veyra — The intelligent local code editor',template:'%s · Veyra'},description:'A fast, beautiful, local-first desktop code editor with integrated AI, GitHub and terminal workflows.',metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'https://veyra.sh'),openGraph:{title:'Veyra Studio',description:'Build beyond the ordinary.',images:['/veyra.png']}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
