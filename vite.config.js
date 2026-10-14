import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages は https://ryouy.github.io/UoA_admin_stats/ 配下で公開される。
  base: process.env.GITHUB_ACTIONS ? '/UoA_admin_stats/' : '/',
});
