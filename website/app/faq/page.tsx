import type {Metadata} from 'next';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';
import {FAQ_GROUPS,GITHUB_URL,absolute,jsonLd} from '@/lib/site';

export const metadata:Metadata={
  title:'FAQ: Veyra Code Editor Questions Answered',
  description:'Answers about Veyra: is it free, which languages and AI providers it supports, ESLint and Prettier, VS Code extensions, privacy, API keys, updates and installing on Windows, macOS and Linux.',
  alternates:{canonical:'/faq'},
  openGraph:{url:'/faq',title:'Veyra FAQ'},
};

export default function Faq(){
  const data={'@context':'https://schema.org','@type':'FAQPage','@id':absolute('/faq'),
    mainEntity:FAQ_GROUPS.flatMap(group=>group.items).map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};
  return <ContentPage path="/faq" crumb="FAQ" kicker="FAQ" title="Questions, answered."
    intro={<>Everything people ask about Veyra. Can&apos;t find yours? <a href={GITHUB_URL+'/issues'} style={{color:'var(--mint)'}}>Ask on GitHub</a>.</>}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(data)}}/>
    <div className="faq-groups content-section">
      {FAQ_GROUPS.map((group,g)=><section key={group.title} aria-labelledby={'faq-'+g}>
        <h2 id={'faq-'+g}>{group.title}</h2>
        {group.items.map((item,i)=><details key={item.q} open={g===0&&i===0}><summary>{item.q}</summary><p>{item.a}</p></details>)}
      </section>)}
    </div>
    <ClosingCTA/>
  </ContentPage>;
}
