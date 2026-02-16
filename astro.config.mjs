import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://iboladele.com',
  integrations: [tailwind(), mdx(), sitemap()],
  vite: {
    resolve: {
      alias: {
        '@': resolve(rootDir, 'src')
      }
    }
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      }
    }
  }
});
