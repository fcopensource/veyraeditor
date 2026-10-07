import type {MetadataRoute} from 'next';
import {DESCRIPTION,PRODUCT_NAME} from '@/lib/site';

export default function manifest():MetadataRoute.Manifest{
  return {
    name:PRODUCT_NAME,short_name:'Veyra',description:DESCRIPTION,
    start_url:'/',display:'standalone',background_color:'#06080d',theme_color:'#06080d',
    icons:[{src:'/logo-512.png',sizes:'512x512',type:'image/png'},{src:'/apple-icon.png',sizes:'180x180',type:'image/png'}],
  };
}
