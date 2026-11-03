import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { listCustomers, setCustomerActive } from '../../app/services/customer_management_service.js'

async function seed() {
  const [staffId] = await db.table('users').insert({
    full_name: 'Staff',
    email: 'staff-active@example.com',
    password: 'x',
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  const [customerId] = await db.table('customers').insert({
    phone_e164: '+96590000009',
    first_name: 'Mariam',
    last_name: 'Al-Khaled',
    email: 'active@example.com',
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  return { staffId: Number(staffId), customerId: Number(customerId) }
}

test.group('Customer activation', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('new customers are active and deactivation revokes sessions', async ({ assert }) => {
    const { staffId, customerId } = await seed()
    assert.isTrue((await listCustomers('', 1)).rows[0].active)
    await db.table('customer_sessions').insert({
      id: '11111111-1111-4111-8111-111111111111',
      customer_id: customerId,
      access_token_hash: 'a'.repeat(64),
      access_expires_at: new Date(Date.now() + 60_000),
      authenticated_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(),
    })
    await setCustomerActive(customerId, false, staffId)
    assert.isFalse((await listCustomers('', 1)).rows[0].active)
    const session = await db.from('customer_sessions').where('customer_id', customerId).first()
    assert.isNotNull(session.revoked_at)
    await setCustomerActive(customerId, false, staffId) // no-op, no duplicate audit
    await setCustomerActive(customerId, true, staffId)
    assert.isTrue((await listCustomers('', 1)).rows[0].active)
    const logs = await db
      .from('audit_logs')
      .whereIn('action', ['customer.deactivated', 'customer.activated'])
    assert.lengthOf(logs, 2)
  })

  test('unknown customer is rejected', async ({ assert }) => {
    const { staffId } = await seed()
    await assert.rejects(() => setCustomerActive(9999, false, staffId), 'App user not found')
  })
})
