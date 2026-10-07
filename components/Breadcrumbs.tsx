import {absolute,jsonLd} from '@/lib/site';

/** BreadcrumbList structured data so search results show "veyraeditor.com › Download" style paths. */
export function Breadcrumbs({items}:{items:{name:string;path:string}[]}){
  const data={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{name:'Home',path:'/'},...items].map((item,index)=>({'@type':'ListItem',position:index+1,name:item.name,item:absolute(item.path)}))};
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(data)}}/>;
}
