import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#ecedf2",
          200: "#d5d8e2",
          300: "#b0b6c8",
          400: "#848da6",
          500: "#656e89",
          600: "#505770",
          700: "#41475b",
          800: "#383d4d",
          900: "#323644",
          950: "#12141b",
        },
        brand: {
          50: "#eefdf6",
          100: "#d6f9e9",
          200: "#b0f1d6",
          300: "#79e4bd",
          400: "#3fcf9f",
          500: "#1cb587",
          600: "#10936e",
          700: "#0e765b",
          800: "#0f5d49",
          900: "#0e4c3e",
          950: "#032b23",
        },
        flare: {
          400: "#f7a1c4",
          500: "#ef7dab",
          600: "#dd5b90",
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(255 255 255 / 0.06), 0 18px 60px -18px rgb(28 181 135 / 0.45)",
        panel: "0 1px 2px rgb(16 18 27 / 0.06), 0 12px 32px -12px rgb(16 18 27 / 0.18)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        aurora: {
          "0%,100%": { transform: "translate3d(-5%, -5%, 0) scale(1)" },
          "50%": { transform: "translate3d(5%, 5%, 0) scale(1.1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        aurora: "aurora 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
