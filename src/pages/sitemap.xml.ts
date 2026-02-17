import { getCollection } from 'astro:content';
import { SITE } from '@/consts';
import { sortPosts } from '@/utils/content';

const staticPages = ['/', '/about', '/blog', '/principles'];

const buildUrlEntry = (loc: string, lastmod?: Date) => {
  const lastmodTag = lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : '';
  return `<url><loc>${loc}</loc>${lastmodTag}</url>`;
};

export async function GET() {
  const posts = sortPosts(await getCollection('blog', ({ data }) => !data.draft));

  const urls = [
    ...staticPages.map((page) => buildUrlEntry(new URL(page, SITE.url).toString())),
    ...posts.map((post) =>
      buildUrlEntry(
        new URL(`/blog/${post.slug}/`, SITE.url).toString(),
        post.data.updatedDate ?? post.data.pubDate
      )
    )
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8'
    }
  });
}
