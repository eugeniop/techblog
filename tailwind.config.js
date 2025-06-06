import typography from '@tailwindcss/typography'

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            img: {
              display: 'block',
              marginLeft: 'auto',
              marginRight: 'auto',
              maxWidth: '25%',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            },
            table: {
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '1em',
              marginBottom: '1em',
            },
            thead: {
              borderBottomWidth: '2px',
              borderBottomColor: '#ccc',
            },
            th: {
              textAlign: 'left',
              padding: '0.5em',
              borderBottom: '1px solid #ddd',
              backgroundColor: '#f9f9f9',
            },
            td: {
              padding: '0.5em',
              borderBottom: '1px solid #eee',
              backgroundColor: '#fff',
            },
          },
        },
      },
    },
  },
  plugins: [typography],
}
