/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  // The only file in public/ is MSW's worker script: a build without the mock does not ship it
  publicDir: loadEnv(mode, process.cwd(), 'VITE_').VITE_API_MOCK === 'true' ? 'public' : false,
  plugins: [
    // Must come before react()
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // React and TanStack in their own chunks: they change less often than app code, so
        // browsers keep them cached across deploys. (Rolldown's form of Rollup's manualChunks.)
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/shared/lib/test/setup.ts'],
    // Keeps Playwright specs in e2e/ out of Vitest
    include: ['src/**/*.test.{ts,tsx}'],
    env: {
      VITE_API_URL: 'http://localhost/api/v1',
      VITE_API_MOCK: 'false',
    },
  },
}))
