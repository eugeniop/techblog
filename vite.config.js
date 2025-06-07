import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import generatePostsPlugin from './vite.plugins.generatePosts.js'

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/techblog/' : '/',
  plugins: [
    generatePostsPlugin(),
    react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
})
