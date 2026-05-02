import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { openaiApiPlugin } from './openai-api-plugin.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.OPENAI_API_KEY || ''
  const model = env.OPENAI_MODEL || 'gpt-4o-mini'

  return {
    plugins: [
      react(),
      openaiApiPlugin({ apiKey, model }),
    ],
  }
})
