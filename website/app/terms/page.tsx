import type {Metadata} from 'next';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={title:'Terms of Use',description:'Terms for using the Veyra website and the open-source Veyra Studio code editor.',alternates:{canonical:'/terms'}};

export default function Terms(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>Terms of Use</h1><p>Last updated 7 October 2026</p></div>
    <h2>The software</h2>
    <p>Veyra Studio is open-source software released under the <a href="https://github.com/fcopensource/veyraeditor/blob/main/LICENSE">MIT License</a>. You may use, copy, modify and distribute it under that license.</p>
    <h2>Preview status</h2>
    <p>Veyra is a preview. It is provided “as is”, without warranty of any kind. Keep backups and use version control for work that matters. We are not liable for loss of data or other damages arising from use of the software, to the extent permitted by law.</p>
    <h2>Third-party services</h2>
    <p>Features such as AI providers, GitHub and package registries are operated by third parties under their own terms and pricing. You are responsible for your use of them and for any charges from providers you connect.</p>
    <h2>Accounts</h2>
    <ul>
      <li>Provide accurate information and keep your password secure.</li>
      <li>Do not misuse the website, for example by attempting to gain unauthorised access or by automated abuse.</li>
      <li>We may suspend accounts that violate these terms. You may delete your account at any time.</li>
    </ul>
    <h2>Changes</h2>
    <p>We may update these terms as Veyra evolves. Material changes will be noted on this page.</p>
    <h2>Contact</h2>
    <p><a href="https://github.com/fcopensource/veyraeditor/issues">github.com/fcopensource/veyraeditor/issues</a></p>
  </article></main><Footer/></>;
}
