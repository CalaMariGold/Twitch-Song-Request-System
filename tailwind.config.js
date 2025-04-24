/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
	],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // CalaMariGold Brand Colors
        brand: {
          pink: {
            DEFAULT: '#FF69B4', // Hot Pink
            light: '#FFB6C1',   // Light Pink
            dark: '#C71585',    // Medium Violet Red (deeper pink)
            neon: '#FF1493',    // Deep Pink (Neon-ish)
            glow: '#FF1493',    // Color for glow effects
          },
          purple: {
            DEFAULT: '#9370DB', // Medium Purple
            light: '#E6E6FA',   // Lavender
            dark: '#483D8B',    // Dark Slate Blue (deep purple)
            deep: '#2d0f5a',    // Very dark purple for backgrounds
            neon: '#DA70D6',    // Orchid (Neon-ish Purple)
            glow: '#DA70D6',    // Color for glow effects
          },
          black: '#0a0a0a',      // Near black for base
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      // Add custom box shadows for neon glow effects
      boxShadow: {
        'glow-pink': '0 0 15px 3px rgba(255, 20, 147, 0.6)', // Neon Pink Glow
        'glow-purple': '0 0 15px 3px rgba(218, 112, 214, 0.6)', // Neon Purple Glow
        'glow-pink-sm': '0 0 8px 1px rgba(255, 20, 147, 0.5)',
        'glow-purple-sm': '0 0 8px 1px rgba(218, 112, 214, 0.5)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'], // Keep Inter as base sans-serif
        display: ['var(--font-berkshire-swash)', 'cursive'], // Add Berkshire Swash as display
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} 