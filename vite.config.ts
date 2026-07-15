import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: true, // This makes Vite listen on all available network interfaces
    // Alternatively, you can specify a specific IP address:
    // host: '192.168.1.100',
    // Fixed at 3001: freight-compare-frontend's TransporterSignupPage iframes
    // this app at a hardcoded http://localhost:3001 URL. strictPort makes that
    // assumption fail loudly instead of silently drifting to another port.
    port: 3001,
    strictPort: true,
  },
});
