import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps:{
      entries: ["d3-time-format"],
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src')
      },
    },
  plugins: [react()],
})
