/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: { 900: "#1b1f23", 800: "#24292e", 700: "#2f353b", 600: "#444c56" },
        brand: { 50: "#f0fdf4", 100: "#dcfce7", 500: "#22a455", 600: "#16a34a", 700: "#15803d" },
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
