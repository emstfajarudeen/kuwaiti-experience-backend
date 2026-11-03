import { defineConfig } from '@adonisjs/inertia'
import app from '@adonisjs/core/services/app'

export default defineConfig({
  rootView: 'inertia_layout',
  encryptHistory: true,
  ssr: {
    // Browser tests use client rendering; development and production render in-process.
    enabled: !app.inTest,
    entrypoint: 'inertia/ssr.tsx',
    pages: [
      'auth/login',
      'auth/forgot_password',
      'auth/reset_password',
      'auth/account',
      'users/index',
      'users/edit',
      'roles/index',
      'roles/show',
      'roles/edit',
      'errors/forbidden',
      'dashboard/overview',
      'activity_logs/index',
      'contacts/index',
      'contacts/show',
      'categories/index',
      'categories/edit',
      'category_types/index',
      'category_types/edit',
      'pages/index',
      'pages/edit',
      'places/index',
      'places/edit',
      'places/preview',
      'explore/place',
      'site/home',
      'site/settings',
      'site/app_config',
      'countries/index',
      'countries/edit',
      'customers/index',
    ],
  },
})
