import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base matters: the page is served from a subpath of GitHub Pages, and the
// default of '/' 404s every asset.
export default defineConfig({
  base: '/motions/editor/',
  plugins: [react(), tailwindcss()],
})
