/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Suggestion type accents — match the mockup
        type: {
          question: "#f59e0b",   // orange
          talking:  "#a78bfa",   // purple
          answer:   "#4ade80",   // green
          factcheck:"#facc15",   // yellow
          clarify:  "#60a5fa",   // blue
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
