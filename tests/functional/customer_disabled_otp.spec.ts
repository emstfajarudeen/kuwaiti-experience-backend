import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { setTestSmsSender } from '../../app/services/customer_sms_service.js'

const base = '/api/v2/customer'
const phone = '+96590000777'
const sent: string[] = []

test.group('Deactivated customers and OTP', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    sent.length = 0
    setTestSmsSender(async (to) => {
      sent.push(to)
    })
    return testUtils.db().withGlobalTransaction()
  })
  group.each.teardown(() => setTestSmsSender())

  test('does not send an SMS to a deactivated customer', async ({ client, assert }) => {
    await db.table('customers').insert({
      phone_e164: phone,
      first_name: 'Off',
      last_name: 'User',
      phone_verified_at: new Date(),
      active: false,
      created_at: new Date(),
    })
    const response = await client.post(`${base}/auth/otp`).json({ phone_e164: phone })
    response.assertStatus(403)
    assert.equal(response.body().error.code, 'ACCOUNT_DISABLED')
    assert.lengthOf(sent, 0)
  })

  test('still sends an SMS to an active customer', async ({ client, assert }) => {
    await db.table('customers').insert({
      phone_e164: phone,
      first_name: 'On',
      last_name: 'User',
      phone_verified_at: new Date(),
      created_at: new Date(),
    })
    const response = await client.post(`${base}/auth/otp`).json({ phone_e164: phone })
    response.assertStatus(202)
    assert.deepEqual(sent, [phone])
  })
})
