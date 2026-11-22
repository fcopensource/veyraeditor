import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,Ban,BookOpen,Camera,CheckCheck,FileCode2,Gauge,Github,Layers,Package,ShieldCheck,Wand2} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd} from '@/lib/site';
import {CopyCommand} from './CopyCommand';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';
import './veyra-snap.css';

const PYPI='https://pypi.org/project/veyra-snap/';
const SOURCE='https://github.com/fcopensource/veyraeditor/tree/main/python/veyra-snap';
const FROM_GITHUB='pip install "git+https://github.com/fcopensource/veyraeditor#subdirectory=python/veyra-snap"';
const VERSION='1.0.0';

/** The version on PyPI, or null before it's published. Checked hourly, so the page switches to PyPI by itself. */
async function pypiVersion():Promise<string|null>{
  try{
    const res=await fetch('https://pypi.org/pypi/veyra-snap/json',{next:{revalidate:3600},signal:AbortSignal.timeout(5000)});
    if(!res.ok)return null;
    const data=await res.json() as {info?:{version?:string}};
    return data.info?.version||null;
  }catch{return null;}
}

export const revalidate=3600;

export const metadata:Metadata={
  title:'veyra-snap: Generate pytest Tests From Real Runs (Python)',
  description:'Run your Python code, get pytest tests. veyra-snap records what your functions are given and what they return or raise, and writes those real calls as readable regression tests. Free, MIT, no dependencies.',
  keywords:['generate pytest tests','automatic unit tests python','pytest test generator','snapshot testing python','regression tests','characterization tests','golden master testing','legacy code tests','python testing tool','pip install veyra-snap'],
  alternates:{canonical:'/veyra-snap'},
  openGraph:{url:'/veyra-snap',title:'veyra-snap: run your code, get pytest tests',description:'Records real function calls and writes them as pytest regression tests. Free and open source.',images:[{url:'/veyra-snap-icon.png',width:256,height:256,alt:'veyra-snap icon: a viewfinder around a check mark'}]},
};

const FEATURES=[
  {icon:Wand2,title:'No code changes',copy:'Run your script or module with veyra-snap run. It watches the functions in your project while your program does what it always does.'},
  {icon:CheckCheck,title:'Every value double-checked',copy:'Each argument and result is written as Python source and rebuilt to make sure it comes back the same, type for type, before it goes in a test.'},
  {icon:Ban,title:'No flaky tests',copy:'If the same arguments ever give a different result (time, randomness, a database), the function gets no tests. Functions that only return None are skipped too.'},
  {icon:AlertTriangle,title:'Errors, too',copy:'Calls that raise become tests that expect that exception with that exact message, so a changed error is caught as well.'},
  {icon:FileCode2,title:'Tests you can read',copy:'Plain parametrized pytest, one test per function, each case named after its call. Review it, commit it, edit what looks wrong.'},
  {icon:Layers,title:'Your code only',copy:'The standard library, your installed packages, virtual environments and your tests are never recorded.'},
  {icon:Gauge,title:'Fast',copy:'On Python 3.12+ it uses sys.monitoring: library code costs nothing, and a function stops being watched once it has 25 cases. Hot loops stay fast.'},
  {icon:Camera,title:'Record more any time',copy:'Every run adds new cases to .veyra-snap/ and veyra-snap write regenerates the files. It never touches a test file it didn’t write.'},
  {icon:ShieldCheck,title:'Free, local, no dependencies',copy:'Pure Python, MIT licensed, nothing sent anywhere. Python 3.9 to 3.14 on Windows, macOS and Linux.'},
];

const TYPES=['None','bool','int','float','str','bytes','list','tuple','dict','set','Decimal','Fraction','datetime','date','timedelta','UUID','Enum','dataclasses','NamedTuple'];

const FAQ=[
  {q:'What is veyra-snap for?',a:'Getting a safety net fast. Code without tests, a refactor you’re nervous about, a library whose behaviour you want to lock down: run it once under veyra-snap and you have regression tests for what it does today.'},
  {q:'Do the tests prove my code is correct?',a:'No. They record what your code does now, bugs included, so you notice when that changes. Read them, and fix what looks wrong; they’re a starting point you own.'},
  {q:'Do I have to change my code?',a:'No. veyra-snap run app.py (or run -m yourpackage) records everything. If you prefer, mark chosen functions with @snap, or record a block with "with recording():".'},
  {q:'What about values it can’t write, like open files or database connections?',a:'Those calls are left out, and veyra-snap tells you which ones and why. Everything that does go in a test has been rebuilt from its source and compared first.'},
  {q:'Which Python versions?',a:'Python 3.9 to 3.14. On 3.12+ recording uses sys.monitoring and records raised errors automatically; on 3.9 to 3.11 it uses sys.settrace, and errors are recorded for functions marked with @snap.'},
  {q:'Is it free?',a:'Yes. veyra-snap is free and open source under the MIT license, with no account and no telemetry. It’s made by FlightCoders, the team behind the Veyra editor.'},
];

export default async function VeyraSnapPage(){
  const published=await pypiVersion();
  const version=published||VERSION;
  const install=published?'pip install veyra-snap':FROM_GITHUB;
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'veyra-snap',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/veyra-snap'),image:absolute('/veyra-snap-icon.png'),softwareVersion:version,
    downloadUrl:published?PYPI:SOURCE,programmingLanguage:'Python',license:'https://opensource.org/licenses/MIT',
    description:'A free Python library that records real function calls and writes them as pytest regression tests.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'FlightCoders',url:'https://flightcoders.com'},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'veyra-snap',path:'/veyra-snap'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page snap-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/veyra-snap-icon.png" width={148} height={148} alt="veyra-snap icon" priority/></div>
        <span className="live-kicker"><i/>NEW · PYTHON LIBRARY</span>
        <h1>veyra-<em>snap</em></h1>
        <p className="live-tagline">Run your code. Get pytest tests.</p>
        <p className="live-intro">veyra-snap watches your program run, records what each of your functions was given and what it returned or raised, and writes those real calls as ready-to-run pytest tests. A safety net for code without tests, in one command.</p>
        <CopyCommand command={install}/>
        {!published&&<p className="snap-status"><i/>Coming to PyPI as <code>pip install veyra-snap</code>. Until then, install it from GitHub with the command above.</p>}
        <div className="live-actions">
          {published?<a className="primary" href={PYPI}><Package size={16}/>View on PyPI</a>:<a className="primary" href={SOURCE}><Github size={16}/>Source on GitHub</a>}
          <a className="secondary" href="#how"><BookOpen size={16}/>How it works</a>
        </div>
        <p className="live-micro">v{version} · Free · MIT · Python 3.9+ · No dependencies · Windows, macOS, Linux</p>
      </section>

      <section className="snap-term" aria-label="A terminal session: veyra-snap run, veyra-snap write, then pytest passing">
        <div className="live-bar"><span/><span/><span/><b>terminal: the example shop</b></div>
        <pre>
<span className="p">$</span> <span className="c">veyra-snap run app.py</span>          <span className="m"># use your program as usual</span>{'\n'}
<span className="b">◆ veyra-snap</span>  recorded <span className="c">38</span> calls in <span className="c">8</span> functions, <span className="ok">27 new cases</span>{'\n'}
{'  '}shop.cart.discount      <span className="n">5 cases</span>  <span className="d">(1 raise)</span>{'\n'}
{'  '}shop.cart.line_total    <span className="n">3 cases</span>{'\n'}
{'  '}shop.cart.price         <span className="n">6 cases</span>  <span className="d">(2 raises)</span>{'\n'}
{'  '}shop.cart.subtotal      <span className="n">4 cases</span>{'\n'}
{'  '}shop.text.new_order_id  <span className="n">1 case</span>  <span className="w">changes between calls: no tests</span>{'\n'}
{'  '}shop.text.order_number  <span className="n">4 cases</span>{'\n'}
{'  '}shop.text.slugify       <span className="n">3 cases</span>{'\n'}
<span className="w">  ! shop.text.write_receipt: 4 calls left out</span> <span className="d">(an argument: StringIO values can&apos;t be written as source)</span>{'\n'}
{'\n'}
<span className="p">$</span> <span className="c">veyra-snap write</span>{'\n'}
{'  '}<span className="ok">✓</span> tests/test_snap_shop_cart.py  <span className="n">18 cases</span> <span className="d">in 6 tests</span>{'\n'}
{'  '}<span className="ok">✓</span> tests/test_snap_shop_text.py  <span className="n">7 cases</span> <span className="d">in 2 tests</span>{'\n'}
<span className="b">◆ veyra-snap</span>  wrote <span className="c">25</span> test cases. Run them: <span className="c">pytest</span>{'\n'}
{'\n'}
<span className="p">$</span> <span className="c">pytest</span>{'\n'}
<span className="ok">25 passed</span> in 0.05s
        </pre>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>A test suite from one run.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>WHAT YOU GET</span><h2>Plain pytest you can read.</h2></header>
        <p className="live-note">This is part of what veyra-snap wrote for the example shop. Change how discounts round, and these tests fail.</p>
        <div className="snap-code"><div className="live-bar"><span/><span/><span/><b>tests/test_snap_shop_cart.py</b></div>
          <pre>
<span className="d">@pytest.mark.parametrize</span>({'\n'}
{'    '}<span className="s">&quot;args, kwargs, expected&quot;</span>,{'\n'}
{'    '}[{'\n'}
{'        '}pytest.param((decimal.Decimal(<span className="s">&apos;24.00&apos;</span>), <span className="k">None</span>), {'{}'}, decimal.Decimal(<span className="s">&apos;0&apos;</span>), id=<span className="s">&quot;discount(decimal.Decimal(&apos;24.00&apos;), None)&quot;</span>),{'\n'}
{'        '}pytest.param((decimal.Decimal(<span className="s">&apos;38.00&apos;</span>), <span className="s">&apos;welcome10&apos;</span>), {'{}'}, decimal.Decimal(<span className="s">&apos;3.80&apos;</span>), id=<span className="s">&quot;discount(decimal.Decimal(&apos;38.00&apos;), &apos;welcome10&apos;)&quot;</span>),{'\n'}
{'        '}pytest.param((decimal.Decimal(<span className="s">&apos;64.50&apos;</span>), <span className="s">&apos;VIP25&apos;</span>), {'{}'}, decimal.Decimal(<span className="s">&apos;16.13&apos;</span>), id=<span className="s">&quot;discount(decimal.Decimal(&apos;64.50&apos;), &apos;VIP25&apos;)&quot;</span>),{'\n'}
{'    '}],{'\n'}
){'\n'}
<span className="k">def</span> <span className="f">test_discount</span>(args, kwargs, expected):{'\n'}
{'    '}<span className="k">assert</span> shop.cart.discount(*args, **kwargs) == expected{'\n'}
{'\n'}
{'\n'}
<span className="d">@pytest.mark.parametrize</span>({'\n'}
{'    '}<span className="s">&quot;args, kwargs, error, message&quot;</span>,{'\n'}
{'    '}[{'\n'}
{'        '}pytest.param((decimal.Decimal(<span className="s">&apos;24.00&apos;</span>), <span className="s">&apos;FREEBIE&apos;</span>), {'{}'}, ValueError, <span className="s">&quot;unknown coupon &apos;FREEBIE&apos;&quot;</span>, id=<span className="s">&quot;discount(decimal.Decimal(&apos;24.00&apos;), &apos;FREEBIE&apos;)&quot;</span>),{'\n'}
{'    '}],{'\n'}
){'\n'}
<span className="k">def</span> <span className="f">test_discount_raises</span>(args, kwargs, error, message):{'\n'}
{'    '}<span className="k">with</span> pytest.raises(error) <span className="k">as</span> caught:{'\n'}
{'        '}shop.cart.discount(*args, **kwargs){'\n'}
{'    '}<span className="k">assert</span> str(caught.value) == message
          </pre>
        </div>
      </section>

      <section className="content-section" id="how">
        <header><span>HOW IT WORKS</span><h2>Record. Check. Write.</h2></header>
        <ol className="live-steps">
          <li><b>1</b><h3>Record</h3><p><code>veyra-snap run app.py</code> runs your program and notes what each function in your project was given, and what it returned or raised.</p></li>
          <li><b>2</b><h3>Check</h3><p>Every value is rebuilt from source and compared. Values that can&apos;t be, and functions that change between calls, are left out, with the reason shown.</p></li>
          <li><b>3</b><h3>Write</h3><p><code>veyra-snap write</code> turns the recordings into <code>tests/test_snap_&lt;module&gt;.py</code>. Run <code>pytest</code>, and commit the tests.</p></li>
        </ol>
        <div className="snap-two">
          <article><h3>Or from your code</h3><p>Record a block with <code>with recording():</code>, or mark the functions you care about with <code>@snap</code>. <code>@snap</code> costs nothing in normal runs; it records under <code>veyra-snap run</code>, inside <code>recording()</code>, or with <code>VEYRA_SNAP=1</code>.</p></article>
          <article><h3>Values it can write</h3><p>Nested any way you like:</p><ul className="snap-types">{TYPES.map(t=><li key={t}>{t}</li>)}</ul></article>
        </div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li>Install it{published?' from PyPI':' (it’s coming to PyPI; until then, straight from GitHub)'}:<CopyCommand command={install}/></li>
            <li>In your project, run your program with <code>veyra-snap run app.py</code>, or <code>veyra-snap run -m yourpackage</code>.</li>
            <li>Run <code>veyra-snap write</code>, then <code>pytest</code>.</li>
          </ol>
          <p className="live-note">The source, docs and changelog are <a href={SOURCE}>on GitHub</a>. For JavaScript, try <Link href="/live-values">Veyra Live Values</Link>, which shows console.log values next to your code, and <Link href="/blast-radius">Veyra Blast Radius</Link>, which runs only the tests your change affects.</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>commands</small>
          <b>veyra-snap run app.py</b> <i>▸ record</i><br/>
          <b>veyra-snap write</b> <i>▸ tests/</i><br/>
          <b>veyra-snap show --cases</b> <i>▸ what&apos;s recorded</i><br/>
          <b>veyra-snap clear</b> <i>▸ start over</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Python debugging, Live Server and Search Everywhere built in."/>
    </div></main><Footer/></>;
}

