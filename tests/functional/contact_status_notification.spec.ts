import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { updateContact } from '../../app/services/contact_request_service.js'

async function staff() {
  const [id] = await db.table('users').insert({
    full_name: 'Staff',
    email: 'staff-notify@example.com',
    password: 'x',
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return Number(id)
}

async function seed(customerId: number | null) {
  const [id] = await db.table('contact_requests').insert({
    customer_id: customerId,
    full_name: 'Mariam',
    email: 'm@example.com',
    message: 'Hello',
    status: 'new',
    created_at: new Date(),
  })
  return Number(id)
}

test.group('Contact status notifications', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('notifies the customer once when staff move the request forward', async ({ assert }) => {
    const [customerId] = await db.table('customers').insert({
      phone_e164: '+96590000001',
      first_name: 'Mariam',
      last_name: 'Al-Khaled',
      email: 'm1@example.com',
      phone_verified_at: new Date(),
      created_at: new Date(),
    })
    const actor = await staff()
    const id = await seed(Number(customerId))
    await updateContact(id, 'in_progress', actor)
    await updateContact(id, 'in_progress', actor)
    await updateContact(id, 'resolved', actor)
    const rows = await db.from('customer_notifications').where('customer_id', Number(customerId))
    assert.lengthOf(rows, 2)
    assert.equal(rows[0].type, 'contact_request_update')
  })

  test('does nothing for guest requests or a reset to new', async ({ assert }) => {
    const actor = await staff()
    const id = await seed(null)
    await updateContact(id, 'resolved', actor)
    await updateContact(id, 'new', actor)
    assert.lengthOf(await db.from('customer_notifications'), 0)
  })
})
