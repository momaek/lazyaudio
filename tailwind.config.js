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
        // shadcn/ui 基础颜色（保留兼容性）
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
        
        // LazyAudio V2 设计系统颜色
        'brand-primary': '#0c6a41',
        'primary-bright': '#2DD4BF',
        'primary-light': '#0D9488',
        'teal-vibrant': '#14ffec',
        'teal-mute': '#14b8a6',
        
        // 浅色主题
        'background-light': '#F9FAFB',
        'surface-light': '#FFFFFF',
        'surface-secondary': '#F1F5F9',
        'border-light': '#E5E7EB',
        'text-main': '#1F2937',
        'text-strong': '#111827',
        'text-muted': '#6B7280',
        'text-muted-strong': '#4B5563',
        
        // 深色主题
        'background-dark': '#0a0f0d',
        'background-dark-alt': '#0c0f0e',
        'background-dark-soft': '#121416',
        'background-dark-ink': '#0B0B0B',
        'surface-dark': '#161e1b',
        'surface-dark-alt': '#1c2622',
        'surface-dark-ink': '#141414',
        'border-dark': '#293831',
        'border-dark-ink': '#262626',
        'text-white': '#FFFFFF',
        'text-muted-dark': '#9db8ad',
        'text-dim-dark': '#A1A1AA',
        
        // 语义化颜色
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        recording: '#EF4444',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Noto Sans', 'sans-serif'],
        sans: ['Noto Sans', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
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
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        DEFAULT: '0 4px 6px rgba(0,0,0,0.1)',
        md: '0 4px 6px rgba(0,0,0,0.1)',
        lg: '0 10px 15px rgba(0,0,0,0.1)',
        xl: '0 20px 25px rgba(0,0,0,0.1)',
        '2xl': '0 25px 50px rgba(0,0,0,0.25)',
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
        'slide-in-from-bottom': {
          from: { transform: 'translateY(10px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 },
        },
        'pulse-recording': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        breathe: {
          '0%, 100%': { opacity: 0.4, transform: 'scale(0.9)' },
          '50%': { opacity: 1, transform: 'scale(1.1)' },
        },
        waveMove: {
          '0%': { strokeDashoffset: 200 },
          '100%': { strokeDashoffset: 0 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ping: {
          '75%, 100%': { transform: 'scale(2)', opacity: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in-from-bottom 0.3s ease-out',
        'pulse-recording': 'pulse-recording 1.5s ease-in-out infinite',
        'breathe': 'breathe 2s ease-in-out infinite',
        'wave-move': 'waveMove 3s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'ping': 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
