/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Suggestion type accents — match the mockup
        type: {
          question: "#facc15",   // yellow
          talking:  "#60a5fa",   // blue
          answer:   "#4ade80",   // green
          factcheck:"#a78bfa",   // purple
          clarify:  "#f59e0b",   // orange
        },
        panel: {
          DEFAULT: "#0f1115",
          border:  "#1f2329",
          soft:    "#151820",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
