import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'
import type { InferDriveDisks } from '@adonisjs/drive/types'
import env from '#start/env'

const uploadPath = env.get('NODE_ENV') === 'test' ? 'storage/test-uploads' : 'storage/uploads'

const driveConfig = defineConfig({
  default: 'local',
  services: {
    local: services.fs({
      location: app.makePath(uploadPath),
      serveFiles: false,
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
