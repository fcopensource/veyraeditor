import type {MetadataRoute} from 'next';
import {latestRelease} from '@/lib/releases';
import {absolute} from '@/lib/site';
import {allPosts} from '@/lib/blog';

export const revalidate=3600;

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const release=await latestRelease();
  const updated=release?.publishedAt?new Date(release.publishedAt):new Date();
  return [
    {url:absolute('/'),lastModified:updated,changeFrequency:'weekly',priority:1},
    {url:absolute('/download'),lastModified:updated,changeFrequency:'weekly',priority:0.9},
    {url:absolute('/features'),lastModified:updated,changeFrequency:'monthly',priority:0.9},
    {url:absolute('/extensions'),lastModified:updated,changeFrequency:'monthly',priority:0.8},
    {url:absolute('/live-server'),lastModified:updated,changeFrequency:'monthly',priority:0.8},
    {url:absolute('/port-manager'),lastModified:updated,changeFrequency:'monthly',priority:0.8},
    {url:absolute('/salesforce-studio'),lastModified:updated,changeFrequency:'monthly',priority:0.8},
    {url:absolute('/salesforce-studio/privacy'),lastModified:updated,changeFrequency:'yearly',priority:0.3},
    {url:absolute('/docs'),lastModified:updated,changeFrequency:'monthly',priority:0.8},
    {url:absolute('/vs-code-alternative'),changeFrequency:'monthly',priority:0.8},
    {url:absolute('/faq'),lastModified:updated,changeFrequency:'monthly',priority:0.7},
    {url:absolute('/changelog'),lastModified:updated,changeFrequency:'weekly',priority:0.7},
    {url:absolute('/roadmap'),lastModified:updated,changeFrequency:'monthly',priority:0.6},
    {url:absolute('/about'),changeFrequency:'yearly',priority:0.5},
    {url:absolute('/security'),changeFrequency:'monthly',priority:0.6},
    {url:absolute('/blog'),lastModified:new Date(allPosts()[0]?.date||Date.now()),changeFrequency:'weekly',priority:0.8},
    ...allPosts().map(post=>({url:absolute(`/blog/${post.slug}`),lastModified:new Date(post.updated+'T12:00:00Z'),changeFrequency:'monthly' as const,priority:0.7})),
    {url:absolute('/register'),changeFrequency:'monthly',priority:0.4},
    {url:absolute('/privacy'),changeFrequency:'yearly',priority:0.2},
    {url:absolute('/terms'),changeFrequency:'yearly',priority:0.2},
  ];
}
