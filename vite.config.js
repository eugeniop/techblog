import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generatePostsPlugin from './vite.plugins.generatePosts.js'

import fs from 'fs'
import path from 'path'

const customDomain = 'blog.eugeniopace.org'

export default defineConfig({
  base: '/', // ✅ correct for custom domain
  plugins: [
    generatePostsPlugin(),
    react(),
    {
      name: 'gh-pages-extras',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist')

        // Create 404.html from index.html
        const indexPath = path.join(distDir, 'index.html')
        const notFoundPath = path.join(distDir, '404.html')
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath)
          console.log('✅ 404.html copied from index.html')
        } else {
          console.error('❌ index.html not found. 404.html not copied.')
        }

        // Create .nojekyll
        fs.writeFileSync(path.join(distDir, '.nojekyll'), '')
        console.log('✅ .nojekyll created')

        // Write CNAME
        if (customDomain) {
          fs.writeFileSync(path.join(distDir, 'CNAME'), customDomain)
          console.log(`✅ CNAME written: ${customDomain}`)
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
