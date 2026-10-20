import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const mysql = {
  client: 'mysql2' as const,
  connection: {
    host: env.get('DB_HOST'),
    port: env.get('DB_PORT'),
    user: env.get('DB_USER'),
    password: env.get('DB_PASSWORD'),
    database: env.get('DB_DATABASE'),
    charset: 'utf8mb4',
  },
  pool: { min: 0, max: 10 },
  migrations: {
    naturalSort: true,
    paths: ['database/migrations'],
    disableRollbacksInProduction: true,
  },
  debug: app.inDev && env.get('DB_DEBUG'),
}

export default defineConfig({
  connection: 'mysql',
  connections: {
    mysql,
    // Advisory locks are connection-scoped. Keep test migration DDL on one
    // connection, while application/concurrency tests retain the normal pool.
    ...(env.get('NODE_ENV') === 'test'
      ? { test_migrations: { ...mysql, pool: { min: 0, max: 1 } } }
      : {}),
  },
})
