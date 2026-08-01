import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#1e3a8a",
          600: "#1e40af",
          700: "#1d4ed8",
          800: "#1e3a8a",
          900: "#172554",
        },
        accent: {
          50:  "#fffbeb",
          light: "#fef3c7",
          DEFAULT: "#f59e0b",
          dark:  "#d97706",
          700: "#b45309",
        },
        glow: {
          DEFAULT: "#6366f1",
          light: "#818cf8",
          dark: "#4338ca",
        },
        surface: {
          DEFAULT: "#f8fafc",
          card:    "#ffffff",
          border:  "#e2e8f0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "sans-serif"],
        mono:  ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        modal:"0 20px 60px -10px rgb(0 0 0 / 0.25)",
        soft: "0 8px 30px -8px rgb(30 58 138 / 0.15)",
        glow: "0 0 40px -8px rgb(99 102 241 / 0.45)",
        "glow-amber": "0 0 40px -8px rgb(245 158 11 / 0.5)",
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -40px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.95)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        blob: "blob 12s infinite ease-in-out",
        "blob-slow": "blob 18s infinite ease-in-out",
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
