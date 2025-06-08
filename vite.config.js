import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generatePostsPlugin from './vite.plugins.generatePosts.js'

import fs from 'fs'
import path from 'path'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/' : '/',
  plugins: [
    generatePostsPlugin(),
    react(),
    {
      name: 'copy-404',
      closeBundle() {
        const indexPath = path.resolve(__dirname, 'dist/index.html')
        const notFoundPath = path.resolve(__dirname, 'dist/404.html')

        try {
          if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, notFoundPath)
            console.log('✅ 404.html copied from index.html')
          } else {
            console.error('❌ index.html not found. 404.html not copied.')
          }
        } catch (err) {
          console.error('❌ Error copying 404.html:', err)
        }
      }
    }
  ],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  }
})


// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// import generatePostsPlugin from './vite.plugins.generatePosts.js'

// export default defineConfig({
//   base: process.env.NODE_ENV === 'production' ? '/techblog/' : '/',
//   plugins: [
//     generatePostsPlugin(),
//     react()],
//   define: {
//     global: 'window',
//   },
//   resolve: {
//     alias: {
//       buffer: 'buffer',
//     },
//   },
// })
