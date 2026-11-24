import {NavMenu} from './NavMenu';
import {liveFeaturedExtensions,liveProductPaths} from '@/lib/catalog';

/** The site menu: the apps, the Python libraries and a few featured extensions from the live catalog. */
export async function Nav(){
  const [{featured,total},productPaths]=await Promise.all([liveFeaturedExtensions(),liveProductPaths()]);
  return <NavMenu featured={featured} total={total} productPaths={productPaths}/>;
}
