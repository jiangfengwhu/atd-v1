/** @type {import('tailwindcss').Config} */
export default {
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
        canvas: '#FAF8F5',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(24, 24, 27, 0.05)',
        card: '0 4px 20px rgba(24, 24, 27, 0.04)',
      },
    },
  },
  plugins: [],
};
