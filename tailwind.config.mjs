import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-ink': 'var(--color-accent-ink)',
        'code-bg': 'var(--color-code-bg)',
        'code-ink': 'var(--color-code-ink)'
      },
      fontFamily: {
        sans: ['"Titillium Web"', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif']
      },
      letterSpacing: {
        tightish: '-0.01em'
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme('colors.ink'),
            fontFamily: theme('fontFamily.serif').join(', '),
            lineHeight: '1.8',
            maxWidth: '72ch',
            '--tw-prose-body': theme('colors.ink'),
            '--tw-prose-headings': theme('colors.ink'),
            '--tw-prose-links': theme('colors.accent'),
            '--tw-prose-bold': theme('colors.ink'),
            '--tw-prose-counters': theme('colors.muted'),
            '--tw-prose-bullets': theme('colors.muted'),
            '--tw-prose-hr': theme('colors.border'),
            '--tw-prose-quotes': theme('colors.ink'),
            '--tw-prose-quote-borders': theme('colors.border'),
            '--tw-prose-captions': theme('colors.muted'),
            '--tw-prose-code': theme('colors.ink'),
            '--tw-prose-pre-code': theme('colors.code-ink'),
            '--tw-prose-pre-bg': theme('colors.code-bg')
          }
        },
        invert: {
          css: {
            '--tw-prose-body': theme('colors.ink'),
            '--tw-prose-headings': theme('colors.ink'),
            '--tw-prose-links': theme('colors.accent'),
            '--tw-prose-bold': theme('colors.ink'),
            '--tw-prose-counters': theme('colors.muted'),
            '--tw-prose-bullets': theme('colors.muted'),
            '--tw-prose-hr': theme('colors.border'),
            '--tw-prose-quotes': theme('colors.ink'),
            '--tw-prose-quote-borders': theme('colors.border'),
            '--tw-prose-captions': theme('colors.muted'),
            '--tw-prose-code': theme('colors.ink'),
            '--tw-prose-pre-code': theme('colors.code-ink'),
            '--tw-prose-pre-bg': theme('colors.code-bg')
          }
        }
      })
    }
  },
  plugins: [typography]
};
