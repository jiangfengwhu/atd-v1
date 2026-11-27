/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        canvas: '#F8FAFC',
      },
      boxShadow: {
        soft: '0 8px 24px rgba(15, 23, 42, 0.06)',
        card: '0 1px 3px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
