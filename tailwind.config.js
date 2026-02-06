/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // shadcn-vue 基础颜色（保留兼容性）
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // LazyAudio Dark Terminal 设计系统
        'la-bg-primary': 'var(--la-bg-primary)',
        'la-bg-surface': 'var(--la-bg-surface)',
        'la-bg-inset': 'var(--la-bg-inset)',
        'la-accent': 'var(--la-accent)',
        'la-accent-dim': 'var(--la-accent-dim)',
        'la-text-primary': 'var(--la-text-primary)',
        'la-text-secondary': 'var(--la-text-secondary)',
        'la-text-tertiary': 'var(--la-text-tertiary)',
        'la-text-muted': 'var(--la-text-muted)',
        'la-text-inverted': 'var(--la-text-inverted)',
        'la-recording-red': 'var(--la-recording-red)',
        'la-recording-red-dim': 'var(--la-recording-red-dim)',
        'la-ai-purple': 'var(--la-ai-purple)',
        'la-tier1-blue': 'var(--la-tier1-blue)',
        'la-tier2-green': 'var(--la-tier2-green)',
        'la-border': 'var(--la-border)',
        'la-divider': 'var(--la-divider)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        DEFAULT: '0.25rem',
        xl: '0.75rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      spacing: {
        xs: '0.25rem',    // 4px
        sm: '0.5rem',     // 8px
        md: '0.75rem',    // 12px
        lg: '1rem',       // 16px
        xl: '1.5rem',     // 24px
        '2xl': '2rem',    // 32px
        '3xl': '3rem',    // 48px
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'fade-in-up': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(10px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
        'recording-blink': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.3 },
        },
        'sidebar-expand': {
          from: { width: 0, opacity: 0 },
          to: { width: '340px', opacity: 1 },
        },
        'sidebar-collapse': {
          from: { width: '340px', opacity: 1 },
          to: { width: 0, opacity: 0 },
        },
        'float-appear': {
          from: { opacity: 0, transform: 'scale(0.95)' },
          to: { opacity: 1, transform: 'scale(1)' },
        },
        'float-disappear': {
          from: { opacity: 1, transform: 'scale(1)' },
          to: { opacity: 0, transform: 'scale(0.95)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ping: {
          '75%, 100%': { transform: 'scale(2)', opacity: 0 },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.2s ease-out',
        'slide-in': 'slide-in-from-bottom 0.3s ease-out',
        'recording-blink': 'recording-blink 1.5s ease-in-out infinite',
        'sidebar-expand': 'sidebar-expand 0.25s ease-in-out',
        'sidebar-collapse': 'sidebar-collapse 0.25s ease-in-out',
        'float-appear': 'float-appear 0.2s ease-out',
        'float-disappear': 'float-disappear 0.15s ease-in',
        'shimmer': 'shimmer 2s linear infinite',
        'ping': 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'skeleton-pulse': 'skeleton-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
