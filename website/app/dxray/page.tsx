import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,BadgeCheck,BookOpen,ExternalLink,Bot,FileText,Github,HeartPulse,Lightbulb,Lock,Package,ScanSearch,Sparkles,Terminal,Wrench} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd} from '@/lib/site';
import {CopyCommand} from '../veyra-snap/CopyCommand';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';
import '../veyra-snap/veyra-snap.css';
import './dxray.css';

const PYPI='https://pypi.org/project/dxray/';
const SOURCE='https://github.com/fcopensource/veyraeditor/tree/main/python/dxray';
const FROM_GITHUB='pip install "git+https://github.com/fcopensource/veyraeditor#subdirectory=python/dxray"';
const VERSION='1.0.0';

/** The version on PyPI, or null before it's published. Checked hourly, so the page switches to PyPI by itself. */
async function pypiVersion():Promise<string|null>{
  try{
    const res=await fetch('https://pypi.org/pypi/dxray/json',{next:{revalidate:3600},signal:AbortSignal.timeout(5000)});
    if(!res.ok)return null;
    const data=await res.json() as {info?:{version?:string}};
    return data.info?.version||null;
  }catch{return null;}
}

export const revalidate=3600;

export const metadata:Metadata={
  title:'dxray: An X-ray for Your Data (Python, pandas)',
  description:'One line tells you what’s wrong with a dataset and what stands out in it, in plain English. dxray finds data problems with the exact pandas fix, ranks the insights, cleans safely, writes a shareable report, and gets your data ready for AI. Free, MIT.',
  keywords:['pandas data profiling','exploratory data analysis python','automated eda','data quality python','data cleaning pandas','pandas insights','dataframe report','llm data analysis','ask questions about data','pip install dxray'],
  alternates:{canonical:'/dxray'},
  openGraph:{url:'/dxray',title:'dxray: an X-ray for your data',description:'One line finds what’s wrong with a dataset and what stands out, in plain English. Free and open source.',images:[{url:'/dxray-report.jpg',width:1280,height:1450,alt:'The dxray report: a health score and insight cards with charts'}]},
};

const FEATURES=[
  {icon:ScanSearch,title:'What each column really is',copy:'Not just object and int64: money stored as text, dates stored as text, yes/no columns, IDs, emails, categories, free text and constants.'},
  {icon:Wrench,title:'Every problem, with its fix',copy:'Missing values (including "N/A" and "-" hiding as text), duplicates, repeated IDs, one category spelled three ways, outliers, sentinels like -999. Each comes with the pandas line that fixes it.'},
  {icon:Lightbulb,title:'What stands out, ranked',copy:'What drives the column you care about, the groups that differ, trends and the biggest jumps and drops, 80/20 concentration, and averages that lie. Best first.'},
  {icon:HeartPulse,title:'A health score',copy:'A number from 0 to 100, so you can see at a glance whether the data is ready to use.'},
  {icon:Sparkles,title:'Clean it, safely',copy:'dx.clean() makes only mechanical fixes and lists every one. It never drops outliers or fills gaps: those are your decisions. Your DataFrame is left untouched.'},
  {icon:FileText,title:'A report you can share',copy:'Rich output in Jupyter, one self-contained HTML page with charts, Markdown for a pull request, or JSON for code.'},
  {icon:Bot,title:'Made for AI',copy:'dx.for_llm() describes your data in a few thousand tokens instead of a million rows. dx.ask() sends that description to Claude and answers in plain English.'},
  {icon:Terminal,title:'From the command line',copy:'dxray sales.csv for a report, --clean to save a cleaned copy, --html, --json, --llm or --ask. CSV, Excel, Parquet and JSON.'},
  {icon:Lock,title:'Private and light',copy:'Everything runs on your machine; only dx.ask() sends anything, and only the description. Needs just pandas and numpy. Python 3.9+.'},
];

const FAQ=[
  {q:'What is dxray for?',a:'The first twenty minutes of every analysis: df.info(), describe(), value_counts() and squinting, before you know whether the data can be trusted or where the story is. dxray does that pass in one line and writes it in sentences.'},
  {q:'How is it different from a profiling report?',a:'Profilers list statistics for every column and leave the reading to you. dxray tells you what matters: the problems, with the exact code to fix each one, and the findings, ranked, in plain English.'},
  {q:'Does it change my data?',a:'No. dx.scan() only reads. dx.clean() returns a new, cleaned copy and a log of every change, and only makes mechanical fixes such as numbers stored as text and duplicate rows.'},
  {q:'Does my data leave my computer?',a:'Not unless you call dx.ask(). Then only dxray’s description of the data (schema, statistics, a few sample rows, problems and findings) goes to the Anthropic API, never the whole table.'},
  {q:'How big a dataset can it handle?',a:'Columns are profiled on every row. The relationship and trend analysis uses a 200,000-row random sample, so a million-row table still takes seconds.'},
  {q:'Which Python versions?',a:'Python 3.9 to 3.14 on Windows, macOS and Linux, with pandas 1.5 or newer. dx.ask() needs Python 3.10 or newer, like the Anthropic SDK.'},
  {q:'Is it free?',a:'Yes. dxray is free and open source under the MIT license, with no account and no telemetry. It’s made by FlightCoders, the team behind the Veyra editor.'},
];

export default async function DxrayPage(){
  const published=await pypiVersion();
  const version=published||VERSION;
  const install=published?'pip install dxray':FROM_GITHUB;
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'dxray',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/dxray'),image:absolute('/dxray-icon.png'),softwareVersion:version,
    downloadUrl:published?PYPI:SOURCE,programmingLanguage:'Python',license:'https://opensource.org/licenses/MIT',
    description:'A free Python library that finds what’s wrong with a dataset and what stands out in it, in plain English.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'FlightCoders',url:'https://flightcoders.com'},sameAs:[PYPI,SOURCE],
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'dxray',path:'/dxray'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page snap-page dx-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/dxray-icon.png" width={148} height={148} alt="dxray icon: a scan line across a table" priority/></div>
        <span className="live-kicker"><i/>NEW · PYTHON DATA LIBRARY</span>
        <h1>dx<em>ray</em></h1>
        <p className="live-tagline">An X-ray for your data.</p>
        <p className="live-intro">One line tells you what&apos;s wrong with a dataset and what stands out in it, in plain English, with the pandas code that fixes each problem. Then clean it, share a report, or ask Claude about it.</p>
        <CopyCommand command={install}/>
        {published&&<a className="dx-pypi" href={PYPI} target="_blank" rel="noopener"><img src="/brand/platforms/python.svg" width={18} height={18} alt=""/><span><small><BadgeCheck size={12}/>Official package on PyPI · by FlightCoders</small><b>https://pypi.org/project/dxray/</b></span><ExternalLink size={15}/></a>}
        {!published&&<p className="snap-status"><i/>Coming to PyPI as <code>pip install dxray</code>. Until then, install it from GitHub with the command above.</p>}
        <div className="live-actions">
          {published?<a className="primary" href={PYPI}><Package size={16}/>View on PyPI</a>:<a className="primary" href={SOURCE}><Github size={16}/>Source on GitHub</a>}
          <a className="secondary" href="#report"><BookOpen size={16}/>See a report</a>
        </div>
        <p className="live-micro">v{version} · Free · MIT · Python 3.9+ · pandas and numpy only · Windows, macOS, Linux</p>
      </section>

      <section className="snap-term" aria-label="dx.scan on an orders table: the findings and the data problems with their fixes">
        <div className="live-bar"><span/><span/><span/><b>python: orders.csv</b></div>
        <pre>
<span className="p">&gt;&gt;&gt;</span> <span className="c">import dxray as dx</span>{'\n'}
<span className="p">&gt;&gt;&gt;</span> <span className="c">dx.scan(df, target=&quot;revenue&quot;)</span>{'\n'}
<span className="b">◆ dxray</span>  orders.csv  <span className="c">4,040</span> rows × <span className="c">13</span> columns. Health <span className="w">53/100</span>: 12 issues, 16 insights.{'\n'}
{'\n'}
<span className="c">What stands out</span>{'\n'}
{'  '}<span className="ok">→</span> What drives &apos;revenue&apos;: &apos;ad_spend&apos;, &apos;price&apos;, &apos;tier&apos;.{'\n'}
{'  '}<span className="ok">→</span> &apos;price&apos; differs a lot by &apos;tier&apos;: &apos;Premium&apos; averages 221, <span className="n">5.2×</span> &apos;Basic&apos; (42.4).{'\n'}
{'  '}<span className="ok">→</span> Total &apos;revenue&apos; rose <span className="n">122%</span> from 2026-01 to 2026-12 (by month).{'\n'}
{'  '}<span className="ok">→</span> Total &apos;revenue&apos; dropped <span className="n">61%</span> in 2026-03 (vs 2026-02), the biggest fall of any month.{'\n'}
{'  '}<span className="ok">→</span> The top 20% of &apos;customer&apos; values (68 of 338) account for <span className="n">83%</span> of total &apos;revenue&apos;.{'\n'}
{'\n'}
<span className="c">Data problems</span>{'\n'}
{'  '}<span className="w">●</span> &apos;price&apos; holds numbers stored as text (like &apos;$46.25&apos;, &apos;$95.54&apos;), so you can&apos;t sum or average it.{'\n'}
{'  '}<span className="w">●</span> &apos;region&apos; spells the same value different ways (like &apos;NORTH&apos;, &apos;North&apos;, &apos;north&apos;).{'\n'}
{'       '}<span className="d">fix:</span> <span className="m">df[&apos;region&apos;] = df[&apos;region&apos;].str.strip().str.title()</span>{'\n'}
{'  '}<span className="w">●</span> 40 rows (1.0%) are exact duplicates of another row.{'\n'}
{'       '}<span className="d">fix:</span> <span className="m">df = df.drop_duplicates()</span>
        </pre>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>The first twenty minutes, in one line.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section" id="report">
        <header><span>A REPORT YOU CAN SHARE</span><h2>One page, with charts.</h2></header>
        <p className="live-note"><code>report.to_html(&quot;report.html&quot;)</code> writes a single self-contained page: email it, attach it, open it anywhere. In Jupyter, the report shows like this on its own.</p>
        <figure className="dx-shot">
          <Image src="/dxray-report.jpg" width={1280} height={1450} sizes="(max-width: 900px) 100vw, 880px" alt="The dxray HTML report for orders.csv: a health score of 53, and insight cards with charts: what drives revenue, price by tier, revenue rising through the year, the March drop, and the top customers bringing 83% of revenue"/>
        </figure>
      </section>

      <section className="content-section">
        <header><span>CLEAN AND ASK</span><h2>Fix it. Then ask it anything.</h2></header>
        <div className="snap-two">
          <article>
            <h3>Clean it, safely</h3>
            <div className="snap-code"><pre>
<span className="n">clean_df</span>, log = dx.<span className="f">clean</span>(df){'\n'}
<span className="k">print</span>(log){'\n'}
<span className="cm"># dxray cleaned 4,040 rows → 4,000 rows, 7 changes</span>{'\n'}
<span className="cm">#   ✓ &apos;order_date&apos;: dates stored as text are now dates</span>{'\n'}
<span className="cm">#   ✓ &apos;price&apos;: numbers stored as text are now numbers</span>{'\n'}
<span className="cm">#   ✓ Dropped 40 duplicate rows</span>
            </pre></div>
            <p>Only mechanical fixes, every one listed. Outliers and gaps are reported, never touched.</p>
          </article>
          <article>
            <h3>Made for AI</h3>
            <div className="snap-code"><pre>
<span className="cm"># any model: a compact description, not a million rows</span>{'\n'}
prompt = dx.<span className="f">for_llm</span>(df, target=<span className="s">&quot;revenue&quot;</span>){'\n'}
{'\n'}
<span className="cm"># or ask Claude (pip install &quot;dxray[ai]&quot;)</span>{'\n'}
dx.<span className="f">ask</span>(df, <span className="s">&quot;Why did revenue drop in March?&quot;</span>)
            </pre></div>
            <p>Claude sees dxray&apos;s description of the data, not your rows. Follow-up questions reuse it, so they&apos;re faster and cheaper.</p>
          </article>
        </div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li>Install it{published?' from PyPI':' (it’s coming to PyPI; until then, straight from GitHub)'}:<CopyCommand command={install}/></li>
            <li>In a notebook or script: <code>import dxray as dx</code>, then <code>dx.scan(df)</code>.</li>
            <li>Or in a terminal: <code>dxray sales.csv --html report.html</code>.</li>
          </ol>
          <p className="live-note">{published&&<>The official package is <a href={PYPI}>pypi.org/project/dxray</a>, published by FlightCoders. </>}The source, docs and changelog are <a href={SOURCE}>on GitHub</a>. Also from us for Python: <Link href="/veyra-snap">veyra-snap</Link>, which turns a run of your code into pytest tests.</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>in python</small>
          <b>dx.scan(df)</b> <i>▸ problems and insights</i><br/>
          <b>dx.clean(df)</b> <i>▸ a safe, cleaned copy</i><br/>
          <b>dx.for_llm(df)</b> <i>▸ context for any AI</i><br/>
          <b>dx.ask(df, &quot;…&quot;)</b> <i>▸ answers from Claude</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>GOOD TO KNOW</span><h2>Honest by design.</h2></header>
        <div className="dx-notes">
          <p><AlertTriangle size={16}/><span><b>Correlation isn&apos;t cause.</b> dxray tells you what moves together and what differs; deciding why is still your job.</span></p>
          <p><AlertTriangle size={16}/><span><b>Trends can&apos;t be faked by typos.</b> They use the table&apos;s main date column, skip thin periods, and a few quantities of 9,999 won&apos;t make a trend.</span></p>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Python debugging, Live Server and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
