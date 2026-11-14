import {NavMenu} from './NavMenu';
import {liveExtensionGroups,liveProductPaths} from '@/lib/catalog';

/** The site menu, with the extensions from the live catalog. */
export async function Nav(){
  const [groups,productPaths]=await Promise.all([liveExtensionGroups(),liveProductPaths()]);
  return <NavMenu groups={groups} productPaths={productPaths}/>;
}
