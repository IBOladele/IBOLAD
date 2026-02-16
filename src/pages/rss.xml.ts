import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '@/consts';
import { sortPosts } from '@/utils/content';

export async function GET(context) {
  const posts = sortPosts(await getCollection('blog', ({ data }) => !data.draft));

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.slug}/`
    })),
    customData: '<language>en-us</language>'
  });
}
