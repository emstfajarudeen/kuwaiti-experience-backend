import { createHash, randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'

const base = '/api/v2'
let sequence = 0

async function signedInCustomer() {
  const n = ++sequence
  const [id] = await db.table('customers').insert({
    phone_e164: `+9655300${String(n).padStart(4, '0')}`,
    first_name: 'Saver',
    last_name: `User${n}`,
    phone_verified_at: new Date(),
    created_at: new Date(),
  })
  const token = `ca_${randomUUID().replaceAll('-', '').padEnd(64, 'x')}`
  await db.table('customer_sessions').insert({
    id: randomUUID(),
    customer_id: id,
    access_token_hash: createHash('sha256').update(token).digest('hex'),
    access_expires_at: new Date(Date.now() + 3600_000),
    authenticated_at: new Date(),
    expires_at: new Date(Date.now() + 86_400_000),
    created_at: new Date(),
  })
  return { id: Number(id), auth: `Bearer ${token}` }
}

async function vehicles() {
  const now = new Date()
  const [providerId] = await db
    .table('rental_providers')
    .insert({ name_en: 'Gulf Rent', active: true, created_at: now })
  const vehicle = (name: string, extra: Record<string, unknown> = {}) => ({
    provider_id: providerId,
    name_en: name,
    make: 'Toyota',
    model: name,
    vehicle_type: 'sedan',
    transmission: 'automatic',
    fuel_type: 'petrol',
    seats: 5,
    daily_rate: '12.500',
    quantity: 1,
    status: 'published',
    published_at: new Date(Date.now() - 60000),
    created_at: now,
    ...extra,
  })
  const [camry] = await db.table('rental_vehicles').insert(vehicle('Camry'))
  const [corolla] = await db.table('rental_vehicles').insert(vehicle('Corolla'))
  const [draft] = await db
    .table('rental_vehicles')
    .insert(vehicle('Draft', { status: 'draft', published_at: null }))
  return { camry: Number(camry), corolla: Number(corolla), draft: Number(draft) }
}

test.group('Saved rental vehicles', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    return testUtils.db().truncate()
  })

  test('save, list, flag and unsave a vehicle', async ({ client, assert }) => {
    const ids = await vehicles()
    const me = await signedInCustomer()
    const other = await signedInCustomer()

    const saved = await client
      .put(`${base}/customer/me/saved-vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    saved.assertStatus(200)
    assert.equal(saved.body().data.vehicle_id, ids.camry)
    assert.isTrue(saved.body().data.is_saved)

    // Saving twice keeps a single row.
    const again = await client
      .put(`${base}/customer/me/saved-vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    again.assertStatus(200)
    assert.equal(again.body().data.saved_at, saved.body().data.saved_at)
    const rows = await db.from('customer_saved_rental_vehicles').count('* as total').first()
    assert.equal(Number(rows.total), 1)

    const list = await client
      .get(`${base}/customer/me/saved-vehicles`)
      .header('Authorization', me.auth)
    list.assertStatus(200)
    assert.deepEqual(
      list.body().data.map((row: any) => row.id),
      [ids.camry]
    )
    assert.isTrue(list.body().data[0].is_saved)
    assert.equal(list.body().meta.total, 1)

    // The search and detail tell each customer what they saved; guests see false.
    const search = await client.get(`${base}/rentals/vehicles`).header('Authorization', me.auth)
    const flags = new Map(search.body().data.map((row: any) => [row.id, row.is_saved]))
    assert.isTrue(flags.get(ids.camry))
    assert.isFalse(flags.get(ids.corolla))
    const detail = await client
      .get(`${base}/rentals/vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    assert.isTrue(detail.body().data.is_saved)
    const guest = await client.get(`${base}/rentals/vehicles/${ids.camry}`)
    assert.isFalse(guest.body().data.is_saved)
    const stranger = await client
      .get(`${base}/rentals/vehicles/${ids.camry}`)
      .header('Authorization', other.auth)
    assert.isFalse(stranger.body().data.is_saved)
    const strangerList = await client
      .get(`${base}/customer/me/saved-vehicles`)
      .header('Authorization', other.auth)
    assert.lengthOf(strangerList.body().data, 0)

    const removed = await client
      .delete(`${base}/customer/me/saved-vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    removed.assertStatus(204)
    // Removing again is harmless.
    const removedAgain = await client
      .delete(`${base}/customer/me/saved-vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    removedAgain.assertStatus(204)
    const after = await client
      .get(`${base}/rentals/vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    assert.isFalse(after.body().data.is_saved)
  })

  test('hidden or missing vehicles cannot be saved and drop out of the list', async ({
    client,
    assert,
  }) => {
    const ids = await vehicles()
    const me = await signedInCustomer()

    const draft = await client
      .put(`${base}/customer/me/saved-vehicles/${ids.draft}`)
      .header('Authorization', me.auth)
    draft.assertStatus(404)
    const missing = await client
      .put(`${base}/customer/me/saved-vehicles/999999`)
      .header('Authorization', me.auth)
    missing.assertStatus(404)
    const guest = await client.put(`${base}/customer/me/saved-vehicles/${ids.camry}`)
    guest.assertStatus(401)

    await client
      .put(`${base}/customer/me/saved-vehicles/${ids.camry}`)
      .header('Authorization', me.auth)
    await client
      .put(`${base}/customer/me/saved-vehicles/${ids.corolla}`)
      .header('Authorization', me.auth)
    await db.from('rental_vehicles').where('id', ids.camry).update({ status: 'draft' })

    const list = await client
      .get(`${base}/customer/me/saved-vehicles`)
      .header('Authorization', me.auth)
    assert.deepEqual(
      list.body().data.map((row: any) => row.id),
      [ids.corolla]
    )
    assert.equal(list.body().meta.total, 1)

    // Deleting the vehicle removes the saved row with it.
    await db.from('rental_vehicles').where('id', ids.corolla).delete()
    const rows = await db
      .from('customer_saved_rental_vehicles')
      .where('vehicle_id', ids.corolla)
      .count('* as total')
      .first()
    assert.equal(Number(rows.total), 0)
  })
})
