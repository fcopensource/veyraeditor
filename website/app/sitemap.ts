import type {MetadataRoute} from 'next';
import {latestRelease} from '@/lib/releases';
import {absolute} from '@/lib/site';

export const revalidate=3600;

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const release=await latestRelease();
  const updated=release?.publishedAt?new Date(release.publishedAt):new Date();
  return [
    {url:absolute('/'),lastModified:updated,changeFrequency:'weekly',priority:1},
    {url:absolute('/download'),lastModified:updated,changeFrequency:'weekly',priority:0.9},
    {url:absolute('/changelog'),lastModified:updated,changeFrequency:'weekly',priority:0.7},
    {url:absolute('/register'),changeFrequency:'monthly',priority:0.4},
    {url:absolute('/privacy'),changeFrequency:'yearly',priority:0.2},
    {url:absolute('/terms'),changeFrequency:'yearly',priority:0.2},
  ];
}
