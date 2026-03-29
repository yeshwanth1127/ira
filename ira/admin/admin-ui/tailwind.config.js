/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ira: {
          bg: "#000000",
          surface: "#0a0a0a",
          border: "#2e2e2e",
          muted: "#8e8e93",
          text: "#e8e8ed",
          accent: "#32d74b",
          error: "#ff453a",
          brand: "#32d74b",
          warn: "#ff9f0a",
        },
      },
      fontFamily: {
        sans: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
