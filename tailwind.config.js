/** @type {import('tailwindcss').Config} */
// A light "survey chart" palette. The `deep` scale runs from page background (950) to borders (600)
// and `mist` is the text scale (100 = strongest), so component classes read the same as in a dark
// theme: bg-deep-900 is a card, text-mist-100 is primary text.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: {
          950: "#EDF1EE",
          900: "#FAFBF9",
          850: "#F3F6F3",
          800: "#E5EAE6",
          700: "#D0D8D3",
          600: "#AEB9B3",
        },
        mist: {
          100: "#0F1B1D",
          200: "#22343A",
          400: "#4F6167",
          500: "#687A80",
          600: "#8C9BA0",
        },
        beacon: {
          200: "#084A46",
          300: "#0B5F59",
          400: "#0F766E",
          500: "#14907F",
          600: "#1BA692",
        },
        jade: {
          400: "#15803D",
          500: "#16A34A",
          600: "#22C55E",
        },
        amber: {
          300: "#8A5A0A",
          400: "#B7791F",
          500: "#D69E2E",
        },
        ember: {
          400: "#B42318",
          500: "#D92D20",
          600: "#F04438",
        },
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "system-ui", "sans-serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sheet: "0 1px 0 0 rgba(255,255,255,0.9) inset, 0 1px 2px 0 rgba(15,27,29,0.06), 0 12px 28px -18px rgba(15,27,29,0.22)",
      },
      backgroundImage: {
        // Faint survey-chart grid behind the page.
        grain:
          "linear-gradient(to right, rgba(15,27,29,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,27,29,0.045) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
