import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generatePostsPlugin from './vite.plugins.generatePosts.js'

import fs from 'fs'
import path from 'path'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/techblog/' : '/',
  plugins: [
    generatePostsPlugin(),
    react()
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
  },
  // ✅ SPA fallback: copy index.html to 404.html
  async closeBundle() {
    const indexPath = path.resolve(__dirname, 'dist/index.html')
    const notFoundPath = path.resolve(__dirname, 'dist/404.html')
    try {
      fs.copyFileSync(indexPath, notFoundPath)
      console.log('✅ Copied index.html to 404.html')
    } catch (err) {
      console.error('❌ Failed to copy 404.html:', err)
    }
  },
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
