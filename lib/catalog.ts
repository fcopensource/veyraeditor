import 'server-only';
import {APPS,EXTENSIONS,GROUPS,type Group,type Product} from './products';

/**
 * The live list of Veyra extensions. The shared catalog at flightcoders.com/api/catalog (fed by the VS Code
 * Marketplace, with edits from the FlightCoders admin) is merged with the hand-written entries in products.ts:
 *  - an extension with a page here keeps its own copy, plus any name, line or group an admin changed;
 *  - a newly published extension with no page yet appears automatically, with a page at /extensions/<slug>;
 *  - anything an admin hid is left out;
 *  - if the catalog can't be reached, products.ts is used as it is.
 * Refreshed every ten minutes, so publishing an extension is all it takes for it to appear here.
 */
const CATALOG_URL = process.env.CATALOG_URL || 'https://flightcoders.com/api/catalog';
/** How often to check it, in seconds (ten minutes unless CATALOG_REVALIDATE says otherwise). */
const REVALIDATE = Number(process.env.CATALOG_REVALIDATE) || 600;

export type Remote = {
  id: string; slug: string; name: string; line: string; group: string; icon: string; version: string | null; installs: number | null;
  published: boolean; marketplace: string; page: string; hasPage: boolean; featured: boolean; isNew: boolean; order: number; platform: string;
  released: string | null; custom?: { name?: string; line?: string; group?: string };
};
type CatalogResponse = { version: number; extensions: Remote[]; hidden?: string[] };

async function fetchCatalog(): Promise<CatalogResponse | null> {
  try {
    const response = await fetch(CATALOG_URL, { next: { revalidate: REVALIDATE, tags: ['catalog'] }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json() as CatalogResponse;
    return data?.version === 1 && Array.isArray(data.extensions) ? data : null;
  } catch { return null; }
}

const isGroup = (g: string | undefined): g is Group => !!g && (GROUPS as string[]).includes(g);

export type Live = { extensions: Product[]; newest: Set<string>; remote: Map<string, Remote>; live: boolean };

export async function getLiveProducts(): Promise<Live> {
  const data = await fetchCatalog();
  if (!data) {
    const newest = new Set([...EXTENSIONS].sort((a, b) => b.order - a.order).slice(0, 5).map(p => p.href));
    return { extensions: EXTENSIONS, newest, remote: new Map(), live: false };
  }
  const hidden = new Set((data.hidden ?? []).map(slug => `/${slug}`));
  const local = new Map(EXTENSIONS.map(p => [p.href, p]));
  const remote = new Map<string, Remote>();
  const list: Product[] = [];
  for (const r of data.extensions) {
    const own = local.get(`/${r.slug}`);
    if (own) {
      remote.set(own.href, r);
      list.push({ ...own, name: r.custom?.name ?? own.name, title: r.custom?.name ?? own.title, copy: r.custom?.line ?? own.copy,
        group: isGroup(r.custom?.group) ? r.custom.group : own.group, order: r.order });
    } else {
      const href = `/extensions/${r.slug}`;
      remote.set(href, r);
      list.push({ href, icon: r.icon, name: r.name, title: r.name, copy: r.line, summary: r.line, cta: `Explore ${r.name}`, tone: 'auto',
        group: isGroup(r.group) ? r.group : 'Project', order: r.order, platform: r.platform, updated: r.released?.slice(0, 10) });
    }
  }
  // Ours that the catalog doesn't know yet (and nobody hid) stay listed.
  for (const p of EXTENSIONS) if (!remote.has(p.href) && !hidden.has(p.href)) list.push(p);
  // The catalog's order: featured first, then newest first.
  const rank = new Map(data.extensions.map((r, i) => [r.slug, i]));
  const slugOf = (p: Product) => p.href.replace(/^\/(extensions\/)?/, '');
  list.sort((a, b) => (rank.get(slugOf(a)) ?? -1) - (rank.get(slugOf(b)) ?? -1));
  const newest = new Set(data.extensions.filter(r => r.isNew).map(r => (local.has(`/${r.slug}`) ? `/${r.slug}` : `/extensions/${r.slug}`)));
  return { extensions: list, newest, remote, live: true };
}

/** The extensions grouped for the Products menu, in GROUPS order. */
export async function liveExtensionGroups() {
  const { extensions } = await getLiveProducts();
  return GROUPS.map(group => ({ group, items: extensions.filter(p => p.group === group) })).filter(g => g.items.length);
}

/** Every product page, for the menu's "current page" highlight and the sitemap. */
export async function liveProductPaths() {
  const { extensions } = await getLiveProducts();
  return [...APPS, ...extensions].map(p => p.href);
}

/** A few other extensions to suggest on an extension's page: the same group first, then the newest. */
export async function liveRelated(href: string, count = 4): Promise<Product[]> {
  const { extensions } = await getLiveProducts();
  const self = extensions.find(p => p.href === href);
  const others = extensions.filter(p => p.href !== href);
  const byNewest = (a: Product, b: Product) => b.order - a.order;
  return [...others.filter(p => p.group === self?.group).sort(byNewest), ...others.filter(p => p.group !== self?.group).sort(byNewest)].slice(0, count);
}
