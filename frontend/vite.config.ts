import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 로컬 개발 시 '/api' 요청을 백엔드(FastAPI, :8000)로 프록시
    // 프로덕션에서는 VITE_API_URL 환경변수로 Render 백엔드를 직접 호출한다.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
