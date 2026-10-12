import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import env from '#start/env'

export default class AdminSeeder extends BaseSeeder {
  async run() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    const resetPassword = process.env.ADMIN_SEED_RESET_PASSWORD === 'true'
    if (!email) throw new Error('Set ADMIN_EMAIL before running AdminSeeder')
    const existing = await db.from('users').where('email', email).first()
    if (existing) {
      if (existing.role !== 'admin')
        throw new Error('The configured admin email belongs to a non-admin account')
      if (!resetPassword) return // Ordinary seeding never changes an existing credential.
    }
    if (resetPassword && env.get('NODE_ENV') === 'production') {
      throw new Error('Password reset through AdminSeeder is disabled in production')
    }
    const minLength = resetPassword ? 8 : 14
    if (!password || password.length < minLength) {
      throw new Error(`Set a unique ADMIN_PASSWORD of at least ${minLength} characters`)
    }
    const passwordHash = await hash.make(password)
    if (existing) {
      await db.transaction(async (trx) => {
        await trx.from('users').where('id', existing.id).update({
          password: passwordHash,
          must_change_password: true,
          updated_at: new Date(),
        })
        await trx
          .from('auth_sessions')
          .where('user_id', existing.id)
          .whereNull('revoked_at')
          .update({ revoked_at: new Date() })
      })
      return
    }
    await db.table('users').insert({
      full_name: 'Administrator',
      email,
      password: passwordHash,
      role: 'admin',
      active: true,
      must_change_password: true,
      created_at: new Date(),
      updated_at: new Date(),
    })
  }
}
