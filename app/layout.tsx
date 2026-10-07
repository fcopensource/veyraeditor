import type {Metadata,Viewport} from 'next';
import {DM_Mono,Manrope} from 'next/font/google';
import './globals.css';
import './pages.css';
import './cinematic.css';
import './landing.css';
import './site.css';
import {latestRelease} from '@/lib/releases';
import {ALT_NAMES,DESCRIPTION,GITHUB_URL,KEYWORDS,PRODUCT_NAME,SITE_NAME,SITE_URL,TAGLINE,absolute,jsonLd} from '@/lib/site';

// Self-hosted fonts: no render-blocking request to Google Fonts, and no layout shift while they load.
const sans=Manrope({subsets:['latin'],variable:'--font-sans',display:'swap'});
const mono=DM_Mono({subsets:['latin'],weight:['400','500'],variable:'--font-mono',display:'swap'});

export const metadata:Metadata={
  metadataBase:new URL(SITE_URL),
  title:{default:`Veyra: Free AI Code Editor for Windows, Mac & Linux`,template:'%s | Veyra Code Editor'},
  description:DESCRIPTION,
  applicationName:PRODUCT_NAME,
  keywords:KEYWORDS,
  authors:[{name:'Veyra',url:SITE_URL}],
  creator:'Veyra',publisher:'Veyra',
  category:'technology',
  openGraph:{type:'website',siteName:PRODUCT_NAME,url:SITE_URL,title:`Veyra: ${TAGLINE}`,description:DESCRIPTION,locale:'en_US'},
  twitter:{card:'summary_large_image',title:`Veyra: ${TAGLINE}`,description:DESCRIPTION},
  robots:{index:true,follow:true,googleBot:{index:true,follow:true,'max-image-preview':'large','max-snippet':-1,'max-video-preview':-1}},
  verification:{
    google:process.env.GOOGLE_SITE_VERIFICATION||undefined,
    other:process.env.BING_SITE_VERIFICATION?{'msvalidate.01':process.env.BING_SITE_VERIFICATION}:undefined,
  },
  formatDetection:{telephone:false},
};
export const viewport:Viewport={themeColor:'#06080d',colorScheme:'dark',width:'device-width',initialScale:1};

export default async function RootLayout({children}:{children:React.ReactNode}){
  const release=await latestRelease();
  // Structured data: who publishes Veyra, what the site is called, and what the software is.
  const graph={
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'Organization','@id':absolute('/#organization'),name:SITE_NAME,alternateName:ALT_NAMES,url:SITE_URL,logo:{'@type':'ImageObject',url:absolute('/logo-512.png'),width:512,height:512},sameAs:[GITHUB_URL]},
      {'@type':'WebSite','@id':absolute('/#website'),name:SITE_NAME,alternateName:ALT_NAMES,url:SITE_URL,description:DESCRIPTION,publisher:{'@id':absolute('/#organization')},inLanguage:'en'},
      {'@type':'SoftwareApplication','@id':absolute('/#software'),name:PRODUCT_NAME,alternateName:ALT_NAMES,url:SITE_URL,description:DESCRIPTION,
        applicationCategory:'DeveloperApplication',applicationSubCategory:'Code editor',operatingSystem:'Windows 10, Windows 11, macOS 11+, Linux',
        ...(release?.version?{softwareVersion:release.version,datePublished:release.publishedAt}:{}),
        downloadUrl:absolute('/download'),installUrl:absolute('/download'),releaseNotes:absolute('/changelog'),
        image:absolute('/opengraph-image'),screenshot:absolute('/editor.png'),license:'https://opensource.org/licenses/MIT',isAccessibleForFree:true,
        offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@id':absolute('/#organization')},
        featureList:['AI assistant with Claude, OpenAI, Gemini and Ollama','AI inline code completions','Project-wide IntelliSense','Built-in Git with diffs and branches','Integrated terminal','Signed automatic updates']},
    ],
  };
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}>
    <body>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(graph)}}/>
      {children}
    </body>
  </html>;
}
