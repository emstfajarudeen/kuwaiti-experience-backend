import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'

const base = '/api/v2/customer/me/saved-addresses'
const payload = {
  label: 'Home',
  address: 'Block 2, Street 10, Building 5, Kuwait City',
  latitude: 29.3759,
  longitude: 47.9774,
  notes: 'Apartment 12, second floor',
}

async function customer() {
  const [id] = await db.table('customers').insert({
    phone_e164: `+965${randomInt(10000000, 99999999)}`,
    first_name: 'Mariam',
    last_name: 'Al-Khaled',
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  const token = `ca_${randomBytes(48).toString('base64url')}`
  await db.table('customer_sessions').insert({
    id: randomUUID(),
    customer_id: id,
    access_token_hash: createHash('sha256').update(token).digest('hex'),
    access_expires_at: new Date(Date.now() + 900000),
    authenticated_at: new Date(),
    expires_at: new Date(Date.now() + 86400000),
    created_at: new Date(),
  })
  return { id: Number(id), token: `Bearer ${token}` }
}

test.group('Customer saved addresses', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    return testUtils.db().withGlobalTransaction()
  })

  test('creates, reads, updates and deletes one canonical address resource', async ({
    client,
    assert,
  }) => {
    const user = await customer()
    const created = await client.post(base).header('Authorization', user.token).json(payload)
    created.assertStatus(201)
    const address = created.body().data
    assert.equal(address.customer_id, user.id)
    assert.deepEqual(
      Object.keys(address).sort(),
      [
        'id',
        'customer_id',
        'label',
        'address',
        'latitude',
        'longitude',
        'notes',
        'created_at',
        'updated_at',
      ].sort()
    )
    assert.strictEqual(address.latitude, payload.latitude)
    assert.strictEqual(address.longitude, payload.longitude)
    const detail = await client.get(`${base}/${address.id}`).header('Authorization', user.token)
    detail.assertStatus(200)
    assert.deepEqual(detail.body().data, address)
    const listed = await client.get(base).header('Authorization', user.token)
    listed.assertStatus(200)
    assert.deepEqual(listed.body().data, [address])
    assert.equal(listed.body().meta.total, 1)
    const updated = await client
      .put(`${base}/${address.id}`)
      .header('Authorization', user.token)
      .json({ label: 'Work', latitude: 0, longitude: 0, notes: null })
    updated.assertStatus(200)
    assert.equal(updated.body().data.label, 'Work')
    assert.strictEqual(updated.body().data.latitude, 0)
    assert.strictEqual(updated.body().data.longitude, 0)
    assert.isNull(updated.body().data.notes)
    assert.equal(updated.body().data.address, payload.address)
    assert.equal(updated.body().data.created_at, address.created_at)
    assert.isString(updated.body().data.updated_at)
    const removed = await client.delete(`${base}/${address.id}`).header('Authorization', user.token)
    removed.assertStatus(204)
    const empty = await client.get(base).header('Authorization', user.token)
    assert.deepEqual(empty.body().data, [])
    assert.equal(empty.body().meta.total, 0)
    const gone = await client.get(`${base}/${address.id}`).header('Authorization', user.token)
    gone.assertStatus(404)
  })

  test('enforces ownership for every read/write and paginates only the current account', async ({
    client,
    assert,
  }) => {
    const a = await customer()
    const b = await customer()
    const first = await client
      .post(base)
      .header('Authorization', a.token)
      .json({ ...payload, customer_id: b.id })
    first.assertStatus(201)
    assert.equal(first.body().data.customer_id, a.id)
    const id = first.body().data.id
    const second = await client
      .post(base)
      .header('Authorization', a.token)
      .json({ ...payload, label: 'Work' })
    second.assertStatus(201)
    const page = await client.get(`${base}?page=1&per_page=1`).header('Authorization', a.token)
    page.assertStatus(200)
    assert.equal(page.body().data[0].id, second.body().data.id)
    assert.equal(page.body().meta.total, 2)
    assert.equal(page.body().meta.last_page, 2)
    const next = await client.get(`${base}?page=2&per_page=1`).header('Authorization', a.token)
    assert.equal(next.body().data[0].id, id)
    const empty = await client.get(base).header('Authorization', b.token)
    assert.equal(empty.body().meta.total, 0)
    const hidden = await client.get(`${base}/${id}`).header('Authorization', b.token)
    hidden.assertStatus(404)
    const forbiddenUpdate = await client
      .put(`${base}/${id}`)
      .header('Authorization', b.token)
      .json({ label: 'Other' })
    forbiddenUpdate.assertStatus(404)
    const forbiddenDelete = await client.delete(`${base}/${id}`).header('Authorization', b.token)
    forbiddenDelete.assertStatus(404)
    const unchangedAddress = await db.from('customer_saved_addresses').where('id', id).first()
    assert.equal(unchangedAddress.label, 'Home')
    const deletedAccount = await client
      .delete('/api/v2/customer/me')
      .header('Authorization', a.token)
    deletedAccount.assertStatus(204)
    assert.isNull(await db.from('customer_saved_addresses').where('customer_id', a.id).first())
  })

  test('requires authentication and validates fields and pagination', async ({
    client,
    assert,
  }) => {
    for (const request of [
      client.get(base),
      client.get(`${base}/1`),
      client.post(base).json(payload),
      client.put(`${base}/1`).json({ label: 'Work' }),
      client.delete(`${base}/1`),
    ]) {
      const response = await request
      response.assertStatus(401)
    }
    const user = await customer()
    for (const invalid of [
      { ...payload, label: '   ' },
      { ...payload, address: '' },
      { ...payload, latitude: 91 },
      { ...payload, longitude: -181 },
      { ...payload, latitude: null },
      { ...payload, longitude: undefined },
      { ...payload, notes: 'x'.repeat(501) },
    ]) {
      const response = await client.post(base).header('Authorization', user.token).json(invalid)
      response.assertStatus(422)
    }
    const count = await db.from('customer_saved_addresses').count('* as total').first()
    assert.equal(Number(count?.total), 0)
    const created = await client.post(base).header('Authorization', user.token).json(payload)
    const id = created.body().data.id
    const unchanged = await client
      .put(`${base}/${id}`)
      .header('Authorization', user.token)
      .json({})
    unchanged.assertStatus(422)
    const invalid = await client.get(`${base}?page=0`).header('Authorization', user.token)
    invalid.assertStatus(422)
    const notAnId = await client.get(`${base}/abc`).header('Authorization', user.token)
    notAnId.assertStatus(404)
  })
})
