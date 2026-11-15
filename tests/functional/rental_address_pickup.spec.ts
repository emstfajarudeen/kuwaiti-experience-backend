import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import { loginAdmin } from '../helpers/admin_auth.js'

const DAY = 24 * 60 * 60 * 1000
const base = '/api/v2'

/** Pins: Salmiya and Jahra areas; a spot inside each. */
const SALMIYA = { lat: 29.3375, lng: 48.0761 }
const JAHRA = { lat: 29.3375, lng: 47.6581 }
const NEAR_SALMIYA = { lat: 29.34, lng: 48.07 }
const NEAR_JAHRA = { lat: 29.34, lng: 47.66 }

async function staff() {
  await db.table('users').insert({
    full_name: 'Test Admin',
    email: 'staff@example.com',
    password: await hash.make('a-very-long-test-password'),
    role: 'admin',
    active: true,
    created_at: new Date(),
  })
  return loginAdmin('staff@example.com', 'a-very-long-test-password')
}

/** Props of a server-rendered Inertia page. */
function page(response: { text(): string }) {
  const match = response
    .text()
    .match(/<script data-page="[^"]+" type="application\/json">([^<]+)<\/script>/)
  if (!match) throw new Error('Expected an Inertia page')
  return JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')).props as Record<
    string,
    any
  >
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

function period(startDays = 3, days = 2) {
  const pickup = new Date(Date.now() + startDays * DAY)
  pickup.setUTCSeconds(0, 0)
  return {
    pickup_at: pickup.toISOString(),
    return_at: new Date(pickup.getTime() + days * DAY).toISOString(),
  }
}

/** Two providers, each with a branch and a with-driver car; one does not serve Jahra. */
async function setup() {
  const now = new Date()
  const [place] = await db
    .table('rental_places')
    .insert({ name_en: 'Kuwait City', active: true, sort_order: 1, created_at: now })
  const provider = async (name: string, lat: number, lng: number) => {
    const [providerId] = await db
      .table('rental_providers')
      .insert({ name_en: name, active: true, created_at: now })
    const [branch] = await db.table('rental_locations').insert({
      provider_id: providerId,
      place_id: place,
      name_en: `${name} branch`,
      latitude: lat,
      longitude: lng,
      active: true,
      sort_order: 1,
      created_at: now,
    })
    const [vehicleId] = await db.table('rental_vehicles').insert({
      provider_id: providerId,
      name_en: `${name} sedan`,
      make: 'Toyota',
      model: 'Camry',
      vehicle_type: 'sedan',
      transmission: 'automatic',
      fuel_type: 'petrol',
      seats: 5,
      daily_rate: '12.500',
      with_driver_available: true,
      driver_daily_rate: '8.000',
      quantity: 2,
      status: 'published',
      published_at: new Date(Date.now() - 60000),
      created_at: now,
    })
    await db
      .table('rental_vehicle_locations')
      .insert({ vehicle_id: vehicleId, location_id: branch })
    return { providerId: Number(providerId), vehicleId: Number(vehicleId), branch: Number(branch) }
  }
  const everywhere = await provider('Gulf Rent', 29.37, 47.98)
  const cityOnly = await provider('City Cars', 29.33, 48.05)
  const [salmiya] = await db.table('rental_service_areas').insert({
    name_en: 'Salmiya',
    name_ar: 'السالمية',
    latitude: SALMIYA.lat,
    longitude: SALMIYA.lng,
    active: true,
    sort_order: 1,
    created_at: now,
  })
  const [jahra] = await db.table('rental_service_areas').insert({
    name_en: 'Jahra',
    latitude: JAHRA.lat,
    longitude: JAHRA.lng,
    active: true,
    sort_order: 2,
    created_at: now,
  })
  await db
    .table('rental_provider_excluded_areas')
    .insert({ provider_id: cityOnly.providerId, area_id: jahra })
  return {
    place: Number(place),
    everywhere,
    cityOnly,
    salmiya: Number(salmiya),
    jahra: Number(jahra),
  }
}

test.group('Rental pickup at the customer address', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
    return testUtils.db().truncate()
  })

  test('search hides providers that do not serve the area', async ({ client, assert }) => {
    const ids = await setup()
    const search = (spot: { lat: number; lng: number }, extra = '') =>
      client.get(
        `${base}/rentals/vehicles?with_driver=true&pickup_lat=${spot.lat}&pickup_lng=${spot.lng}${extra}`
      )

    const salmiya = await search(NEAR_SALMIYA)
    salmiya.assertStatus(200)
    assert.sameMembers(
      salmiya.body().data.map((row: any) => row.id),
      [ids.everywhere.vehicleId, ids.cityOnly.vehicleId]
    )
    assert.deepEqual(salmiya.body().meta.pickup_area, { id: ids.salmiya, name: 'Salmiya' })

    const jahra = await search(NEAR_JAHRA)
    assert.deepEqual(
      jahra.body().data.map((row: any) => row.id),
      [ids.everywhere.vehicleId]
    )

    const arabic = await search(NEAR_SALMIYA).header('Accept-Language', 'ar')
    assert.equal(arabic.body().meta.pickup_area.name, 'السالمية')

    // Address pickup is only with a driver.
    const selfDrive = await client.get(
      `${base}/rentals/vehicles?pickup_lat=${NEAR_SALMIYA.lat}&pickup_lng=${NEAR_SALMIYA.lng}`
    )
    selfDrive.assertStatus(422)
    assert.equal(selfDrive.body().error.code, 'ADDRESS_PICKUP_NEEDS_DRIVER')

    // Outside Kuwait, and inside Kuwait but far from every area pin.
    const abroad = await search({ lat: 25.2, lng: 55.27 })
    abroad.assertStatus(422)
    assert.equal(abroad.body().error.code, 'OUTSIDE_SERVICE_AREA')
    const desert = await search({ lat: 28.6, lng: 46.6 })
    assert.equal(desert.body().error.code, 'OUTSIDE_SERVICE_AREA')

    const both = await search(NEAR_SALMIYA, `&pickup_location_id=${ids.place}`)
    both.assertStatus(422)
    const half = await client.get(`${base}/rentals/vehicles?with_driver=true&pickup_lat=29.3`)
    half.assertStatus(422)
  })

  test('books a map address with a driver and shows it everywhere', async ({ client, assert }) => {
    const ids = await setup()
    const user = await customer()
    const window = period()
    const body = {
      vehicle_id: ids.cityOnly.vehicleId,
      ...window,
      with_driver: true,
      pickup_name: 'Block 5, Street 12, Salmiya',
      pickup_lat: NEAR_SALMIYA.lat,
      pickup_lng: NEAR_SALMIYA.lng,
    }
    const created = await client
      .post(`${base}/customer/me/rental-bookings`)
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'address-key-1')
      .json(body)
    created.assertStatus(201)
    const booking = created.body().data
    assert.deepEqual(booking.pickup, {
      type: 'address',
      address: 'Block 5, Street 12, Salmiya',
      latitude: NEAR_SALMIYA.lat,
      longitude: NEAR_SALMIYA.lng,
      area: { id: ids.salmiya, name: 'Salmiya' },
    })
    // The driver sets off from the provider's branch.
    assert.equal(booking.pickup_location.name, 'Kuwait City')
    const row = await db.from('rental_bookings').where('id', booking.id).firstOrFail()
    assert.equal(row.pickup_type, 'address')
    assert.equal(row.pickup_location_id, ids.cityOnly.branch)
    assert.equal(Number(row.pickup_area_id), ids.salmiya)

    // A retry with the same key replays; a different address with that key conflicts.
    const replay = await client
      .post(`${base}/customer/me/rental-bookings`)
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'address-key-1')
      .json(body)
    replay.assertStatus(200)
    assert.equal(replay.body().data.id, booking.id)
    const conflict = await client
      .post(`${base}/customer/me/rental-bookings`)
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'address-key-1')
      .json({ ...body, pickup_name: 'Somewhere else' })
    conflict.assertStatus(409)

    const shown = await client
      .get(`${base}/customer/me/rental-bookings/${booking.id}`)
      .header('Authorization', user.token)
    assert.equal(shown.body().data.pickup.type, 'address')

    // Branch bookings say so.
    const branchBooking = await client
      .post(`${base}/customer/me/rental-bookings`)
      .header('Authorization', user.token)
      .header('Idempotency-Key', 'branch-key-1')
      .json({ vehicle_id: ids.everywhere.vehicleId, pickup_location_id: ids.place, ...window })
    branchBooking.assertStatus(201)
    assert.equal(branchBooking.body().data.pickup.type, 'branch')
    assert.isNull(branchBooking.body().data.pickup.address)

    // The CMS booking page shows the address and a map link.
    const admin = await staff()
    const cmsPage = await client
      .get(`/admin/rentals/bookings/${booking.id}`)
      .cookie('admin_access', admin.accessToken)
    const props = page(cmsPage).booking
    assert.equal(props.pickup_address.address, 'Block 5, Street 12, Salmiya')
    assert.equal(props.pickup_address.area, 'Salmiya')
    assert.include(props.pickup_address.map_url, `${NEAR_SALMIYA.lat},${NEAR_SALMIYA.lng}`)
  })

  test('books a saved address; refuses the wrong combinations', async ({ client, assert }) => {
    const ids = await setup()
    const user = await customer()
    const other = await customer()
    const window = period()
    const [saved] = await db.table('customer_saved_addresses').insert({
      customer_id: user.id,
      label: 'Home',
      address: 'Block 3, Jahra',
      latitude: NEAR_JAHRA.lat,
      longitude: NEAR_JAHRA.lng,
      notes: 'Blue gate',
      created_at: new Date(),
    })
    let n = 0
    const book = (who: { token: string }, extra: Record<string, unknown>) =>
      client
        .post(`${base}/customer/me/rental-bookings`)
        .header('Authorization', who.token)
        .header('Idempotency-Key', `saved-key-${++n}`)
        .json({ ...window, with_driver: true, ...extra })

    const ok = await book(user, {
      vehicle_id: ids.everywhere.vehicleId,
      pickup_saved_address_id: saved,
    })
    ok.assertStatus(201)
    assert.equal(ok.body().data.pickup.address, 'Block 3, Jahra · Blue gate')
    assert.equal(ok.body().data.pickup.area.name, 'Jahra')

    // City Cars does not serve Jahra.
    const excluded = await book(user, {
      vehicle_id: ids.cityOnly.vehicleId,
      pickup_saved_address_id: saved,
    })
    excluded.assertStatus(422)
    assert.equal(excluded.body().error.code, 'OUTSIDE_SERVICE_AREA')

    // Someone else's saved address.
    const stranger = await book(other, {
      vehicle_id: ids.everywhere.vehicleId,
      pickup_saved_address_id: saved,
    })
    stranger.assertStatus(422)

    const selfDrive = await book(user, {
      vehicle_id: ids.everywhere.vehicleId,
      with_driver: false,
      pickup_name: 'Salmiya',
      pickup_lat: NEAR_SALMIYA.lat,
      pickup_lng: NEAR_SALMIYA.lng,
    })
    assert.equal(selfDrive.body().error.code, 'ADDRESS_PICKUP_NEEDS_DRIVER')

    const both = await book(user, {
      vehicle_id: ids.everywhere.vehicleId,
      pickup_location_id: ids.place,
      pickup_saved_address_id: saved,
    })
    both.assertStatus(422)

    const nothing = await book(user, { vehicle_id: ids.everywhere.vehicleId })
    nothing.assertStatus(422)
    assert.property(nothing.body().error.fields ?? {}, 'pickup_location_id')

    const noName = await book(user, {
      vehicle_id: ids.everywhere.vehicleId,
      pickup_lat: NEAR_SALMIYA.lat,
      pickup_lng: NEAR_SALMIYA.lng,
    })
    noName.assertStatus(422)
    assert.property(noName.body().error.fields ?? {}, 'pickup_name')
  })

  test('the quote checks the address too', async ({ client, assert }) => {
    const ids = await setup()
    const window = period()
    const quote = (vehicleId: number, spot: { lat: number; lng: number }) =>
      client.get(
        `${base}/rentals/vehicles/${vehicleId}/quote?with_driver=true&pickup_at=${encodeURIComponent(window.pickup_at)}&return_at=${encodeURIComponent(window.return_at)}&pickup_lat=${spot.lat}&pickup_lng=${spot.lng}`
      )
    const ok = await quote(ids.cityOnly.vehicleId, NEAR_SALMIYA)
    ok.assertStatus(200)
    assert.equal(ok.body().data.pickup_type, 'address')
    assert.equal(ok.body().data.pickup_area.name, 'Salmiya')
    const refused = await quote(ids.cityOnly.vehicleId, NEAR_JAHRA)
    refused.assertStatus(422)
    assert.equal(refused.body().error.code, 'OUTSIDE_SERVICE_AREA')
  })

  test('without any areas every address in Kuwait is accepted', async ({ client, assert }) => {
    const ids = await setup()
    await db.from('rental_service_areas').delete()
    const result = await client.get(
      `${base}/rentals/vehicles?with_driver=true&pickup_lat=${NEAR_JAHRA.lat}&pickup_lng=${NEAR_JAHRA.lng}`
    )
    result.assertStatus(200)
    assert.lengthOf(result.body().data, 2)
    assert.isNull(result.body().meta.pickup_area)
    void ids
  })

  test('CMS manages areas and the areas a provider does not serve', async ({ client, assert }) => {
    const ids = await setup()
    const admin = await staff()
    const created = await client
      .post('/admin/rentals/service-areas')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ nameEn: 'Hawally', latitude: '29.33', longitude: '48.03', active: 'true' })
    assert.equal(created.header('location'), '/admin/rentals/service-areas')
    const hawally = await db.from('rental_service_areas').where('name_en', 'Hawally').firstOrFail()

    const outside = await client
      .post('/admin/rentals/service-areas')
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ nameEn: 'Dubai', latitude: '25.2', longitude: '55.27', active: 'true' })
    assert.equal(outside.header('location'), '/admin/rentals/service-areas/new')

    const list = await client
      .get('/admin/rentals/service-areas')
      .cookie('admin_access', admin.accessToken)
    assert.lengthOf(page(list).rows, 3)

    // Saving the provider form replaces its excluded areas.
    const saved = await client
      .post(`/admin/rentals/providers/${ids.cityOnly.providerId}/save`)
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({
        nameEn: 'City Cars',
        active: 'true',
        excludedAreasSent: '1',
        excludedAreaIds: [String(ids.salmiya), String(hawally.id)],
      })
    assert.equal(saved.header('location'), '/admin/rentals/providers')
    const excluded = await db
      .from('rental_provider_excluded_areas')
      .where('provider_id', ids.cityOnly.providerId)
      .orderBy('area_id')
    assert.deepEqual(
      excluded.map((row) => Number(row.area_id)),
      [ids.salmiya, Number(hawally.id)].sort((a, b) => a - b)
    )

    // A post without the field leaves the choice alone.
    await client
      .post(`/admin/rentals/providers/${ids.cityOnly.providerId}/save`)
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
      .form({ nameEn: 'City Cars', active: 'true' })
    const still = await db
      .from('rental_provider_excluded_areas')
      .where('provider_id', ids.cityOnly.providerId)
    assert.lengthOf(still, 2)

    const form = await client
      .get(`/admin/rentals/providers/${ids.cityOnly.providerId}/edit`)
      .cookie('admin_access', admin.accessToken)
    assert.sameMembers(page(form).excludedAreaIds, [ids.salmiya, Number(hawally.id)])
    assert.lengthOf(page(form).areaOptions, 3)

    // Deleting an area removes the providers' choices for it.
    await client
      .post(`/admin/rentals/service-areas/${hawally.id}/delete`)
      .redirects(0)
      .withCsrfToken()
      .cookie('admin_access', admin.accessToken)
    const after = await db
      .from('rental_provider_excluded_areas')
      .where('provider_id', ids.cityOnly.providerId)
    assert.lengthOf(after, 1)
  })
})
