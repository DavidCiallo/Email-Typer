import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import path from 'node:path';

export default defineConfig({
  html: {
    title: 'Email System',
  },
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './client/index.tsx',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3300',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://127.0.0.1:3300',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
