/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        raised: 'rgb(var(--color-raised) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        control: 'rgb(var(--color-control) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
        brand: 'rgb(var(--color-brand) / <alpha-value>)',
        'brand-hover': 'rgb(var(--color-brand-hover) / <alpha-value>)',
        'brand-solid': 'rgb(var(--color-brand-solid) / <alpha-value>)',
        'brand-solid-hover': 'rgb(var(--color-brand-solid-hover) / <alpha-value>)',
        'brand-soft': 'rgb(var(--color-brand-soft) / <alpha-value>)',
        'on-brand': 'rgb(var(--color-on-brand) / <alpha-value>)',
        hero: 'rgb(var(--color-hero) / <alpha-value>)',
        'on-hero': 'rgb(var(--color-on-hero) / <alpha-value>)',
        'hero-muted': 'rgb(var(--color-hero-muted) / <alpha-value>)',
        'hero-accent': 'rgb(var(--color-hero-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        'success-solid': 'rgb(var(--color-success-solid) / <alpha-value>)',
        'success-solid-hover': 'rgb(var(--color-success-solid-hover) / <alpha-value>)',
        'success-soft': 'rgb(var(--color-success-soft) / <alpha-value>)',
        'success-text': 'rgb(var(--color-success-text) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--color-danger-soft) / <alpha-value>)',
        'danger-text': 'rgb(var(--color-danger-text) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-soft': 'rgb(var(--color-warning-soft) / <alpha-value>)',
        'warning-text': 'rgb(var(--color-warning-text) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 32, 51, 0.04), 0 12px 32px rgba(23, 32, 51, 0.06)',
        nav: '0 -8px 30px rgba(23, 32, 51, 0.08)'
      }
    }
  },
  plugins: []
}
