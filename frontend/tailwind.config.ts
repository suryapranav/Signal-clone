import type { Config } from "tailwindcss";

// Every color is a CSS variable defined in globals.css, so light/dark themes
// switch by changing variables only. Names follow Signal Desktop's roles.
const token = (name: string) => `var(--${name})`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: token("rail"),
        pane: token("pane"),
        chat: token("chat"),
        line: token("line"),
        hover: token("hover"),
        selected: token("selected"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        field: token("field"),
        "bubble-in": token("bubble-in"),
        accent: token("accent"),
        "accent-hover": token("accent-hover"),
        danger: token("danger"),
        surface: token("surface"),
        toast: token("toast"),
        "toast-ink": token("toast-ink"),
        online: token("online"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // Signal Desktop type scale
        "body-sm": ["12px", "16px"],
        body: ["14px", "20px"],
        "body-lg": ["15px", "20px"],
        title: ["20px", "26px"],
      },
      boxShadow: {
        pop: "0 0 0 1px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.16)",
      },
      keyframes: {
        "typing-dot": {
          "0%, 60%, 100%": { opacity: "0.3", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-2px)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "flash": {
          "0%, 100%": { backgroundColor: "transparent" },
          "30%": { backgroundColor: "var(--hover)" },
        },
      },
      animation: {
        "typing-dot": "typing-dot 1.2s infinite ease-in-out",
        "toast-in": "toast-in 160ms ease-out",
        "pop-in": "pop-in 120ms ease-out",
        flash: "flash 1.4s ease-in-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
