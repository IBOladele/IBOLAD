import type { CollectionEntry } from 'astro:content';
import readingTime from 'reading-time';

export const sortPosts = (posts: CollectionEntry<'blog'>[]) => {
  return posts.sort((a, b) => {
    return new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime();
  });
};

export const getReadingMinutes = (body: string) => {
  const stats = readingTime(body);
  return Math.max(1, Math.round(stats.minutes));
};

export const getPillars = (posts: CollectionEntry<'blog'>[]) => {
  const pillars = new Set<string>();
  posts.forEach((post) => pillars.add(post.data.pillar));
  return Array.from(pillars).sort();
};

export const getActivePillar = (value: string | null, pillars: string[]) => {
  if (!value) return 'All';
  const match = pillars.find((pillar) => pillar.toLowerCase() === value.toLowerCase());
  return match ?? 'All';
};
