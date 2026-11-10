import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import drive from '@adonisjs/drive/services/main'
import sharp from 'sharp'
import { syncPermissions } from '../../app/services/permission_sync_service.js'

const DAY = 24 * 60 * 60 * 1000

const providers = [
  { key: 'gulf', en: 'Gulf Car Rental', ar: 'الخليج لتأجير السيارات', phone: '+96522001122' },
  { key: 'desert', en: 'Desert Wheels', ar: 'عجلات الصحراء', phone: '+96522003344' },
]

const locations = [
  {
    key: 'airport',
    en: 'Kuwait International Airport',
    ar: 'مطار الكويت الدولي',
    subtitle: 'Farwaniya · Arrivals, Terminal 4',
    lat: 29.2266,
    lng: 47.9689,
  },
  {
    key: 'city',
    en: 'Kuwait City – Sharq',
    ar: 'مدينة الكويت – شرق',
    subtitle: 'Kuwait City · Main entrance',
    lat: 29.3759,
    lng: 47.9774,
  },
  {
    key: 'salmiya',
    en: 'Salmiya',
    ar: 'السالمية',
    subtitle: 'Salmiya · Gulf Road',
    lat: 29.3345,
    lng: 48.0764,
  },
]

type Seed = {
  slug: string
  provider: string
  en: string
  ar: string
  make: string
  model: string
  year: number
  type: string
  gearbox: string
  fuel: string
  seats: number
  rate: string
  deposit: string
  driverRate: string | null
  quantity: number
  hue: string
}

const vehicles: Seed[] = [
  {
    slug: 'camry',
    provider: 'gulf',
    en: 'Toyota Camry',
    ar: 'تويوتا كامري',
    make: 'Toyota',
    model: 'Camry',
    year: 2025,
    type: 'sedan',
    gearbox: 'automatic',
    fuel: 'petrol',
    seats: 5,
    rate: '12.500',
    deposit: '50.000',
    driverRate: '8.000',
    quantity: 2,
    hue: '#1f3b5c',
  },
  {
    slug: 'yaris',
    provider: 'gulf',
    en: 'Toyota Yaris',
    ar: 'تويوتا يارس',
    make: 'Toyota',
    model: 'Yaris',
    year: 2024,
    type: 'hatchback',
    gearbox: 'manual',
    fuel: 'petrol',
    seats: 5,
    rate: '8.000',
    deposit: '30.000',
    driverRate: null,
    quantity: 3,
    hue: '#3b5c1f',
  },
  {
    slug: 'patrol',
    provider: 'desert',
    en: 'Nissan Patrol',
    ar: 'نيسان باترول',
    make: 'Nissan',
    model: 'Patrol',
    year: 2025,
    type: 'suv',
    gearbox: 'automatic',
    fuel: 'petrol',
    seats: 7,
    rate: '28.000',
    deposit: '120.000',
    driverRate: '12.000',
    quantity: 1,
    hue: '#5c3b1f',
  },
  {
    slug: 'tahoe',
    provider: 'desert',
    en: 'Chevrolet Tahoe',
    ar: 'شفروليه تاهو',
    make: 'Chevrolet',
    model: 'Tahoe',
    year: 2024,
    type: 'suv',
    gearbox: 'automatic',
    fuel: 'petrol',
    seats: 7,
    rate: '24.000',
    deposit: '100.000',
    driverRate: '12.000',
    quantity: 2,
    hue: '#4a1f5c',
  },
  {
    slug: 's-class',
    provider: 'gulf',
    en: 'Mercedes S-Class',
    ar: 'مرسيدس إس كلاس',
    make: 'Mercedes-Benz',
    model: 'S 500',
    year: 2025,
    type: 'luxury',
    gearbox: 'automatic',
    fuel: 'petrol',
    seats: 5,
    rate: '65.000',
    deposit: '300.000',
    driverRate: '20.000',
    quantity: 1,
    hue: '#222222',
  },
  {
    slug: 'tesla-3',
    provider: 'desert',
    en: 'Tesla Model 3',
    ar: 'تسلا موديل 3',
    make: 'Tesla',
    model: 'Model 3',
    year: 2025,
    type: 'sedan',
    gearbox: 'automatic',
    fuel: 'electric',
    seats: 5,
    rate: '22.000',
    deposit: '80.000',
    driverRate: null,
    quantity: 1,
    hue: '#5c1f2b',
  },
]

async function placeholder(name: string, hue: string) {
  const key = `demo-rental-${name}.webp`
  if (await drive.use('local').exists(key)) return key
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${hue}"/><text x="600" y="420" font-family="Arial" font-size="64" fill="#ffffff" text-anchor="middle">${name}</text></svg>`
  await drive.use('local').put(key, await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer())
  return key
}

/**
 * Local-only sample data for the rental flow. Idempotent: rerunning updates the
 * same records by name. Also syncs the RBAC permission catalogue.
 */
export default class RentalSeeder extends BaseSeeder {
  async run() {
    if (process.env.NODE_ENV === 'production')
      throw new Error('RentalSeeder is disabled in production')
    await syncPermissions()
    const now = new Date()

    await db
      .table('rental_settings')
      .insert({
        id: 1,
        booking_fee: '3.000',
        hold_minutes: 15,
        min_lead_minutes: 120,
        max_rental_days: 30,
        cancellation_cutoff_hours: 24,
        updated_at: now,
      })
      .onConflict('id')
      .ignore()

    const providerIds = new Map<string, number>()
    for (const item of providers) {
      const existing = await db.from('rental_providers').where('name_en', item.en).first()
      if (existing) {
        providerIds.set(item.key, Number(existing.id))
        continue
      }
      const [id] = await db.table('rental_providers').insert({
        name_en: item.en,
        name_ar: item.ar,
        phone_e164: item.phone,
        email: `${item.key}@example.com`,
        address: 'Kuwait',
        active: true,
        created_at: now,
      })
      providerIds.set(item.key, Number(id))
    }

    // Every provider gets the three sample branches. The airport branch is open 24 hours; the
    // others open 9:00–13:00 and 16:00–22:00, and are closed on Fridays.
    // Pickup places: the shared list the app shows.
    const placeIds = new Map<string, number>()
    for (const [index, item] of locations.entries()) {
      const existing = await db.from('rental_places').where('name_en', item.en).first()
      if (existing) {
        placeIds.set(item.key, Number(existing.id))
        continue
      }
      const [id] = await db.table('rental_places').insert({
        name_en: item.en,
        name_ar: item.ar,
        subtitle_en: item.subtitle,
        latitude: item.lat,
        longitude: item.lng,
        active: true,
        sort_order: index,
        created_at: now,
      })
      placeIds.set(item.key, Number(id))
    }

    const branchIds = new Map<string, number[]>()
    for (const provider of providers) {
      const providerId = providerIds.get(provider.key)!
      const ids: number[] = []
      for (const [index, item] of locations.entries()) {
        const existing = await db
          .from('rental_locations')
          .where({ name_en: item.en, provider_id: providerId })
          .first()
        if (existing) {
          if (!existing.place_id)
            await db
              .from('rental_locations')
              .where('id', existing.id)
              .update({ place_id: placeIds.get(item.key) })
          ids.push(Number(existing.id))
          continue
        }
        const [id] = await db.table('rental_locations').insert({
          provider_id: providerId,
          place_id: placeIds.get(item.key),
          name_en: item.en,
          name_ar: item.ar,
          address: item.en,
          latitude: item.lat,
          longitude: item.lng,
          phone_e164: provider.phone,
          hours_enabled: true,
          active: true,
          sort_order: index,
          created_at: now,
        })
        const hours =
          item.key === 'airport'
            ? [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
                weekday,
                opens_at: '00:00',
                closes_at: '24:00',
              }))
            : [0, 1, 2, 3, 4, 6].flatMap((weekday) => [
                { weekday, opens_at: '09:00', closes_at: '13:00' },
                { weekday, opens_at: '16:00', closes_at: '22:00' },
              ])
        await db
          .table('rental_location_hours')
          .multiInsert(hours.map((row) => ({ ...row, location_id: id })))
        ids.push(Number(id))
      }
      branchIds.set(provider.key, ids)
    }

    const vehicleIds = new Map<string, number>()
    const insuranceOption = await db.from('rental_insurance_options').orderBy('sort_order').first()
    for (const item of vehicles) {
      const existing = await db.from('rental_vehicles').where('name_en', item.en).first()
      if (existing) {
        vehicleIds.set(item.slug, Number(existing.id))
        continue
      }
      const cover = await placeholder(item.slug, item.hue)
      const gallery = [
        await placeholder(`${item.slug}-interior`, '#334155'),
        await placeholder(`${item.slug}-side`, '#475569'),
      ]
      const [id] = await db.table('rental_vehicles').insert({
        provider_id: providerIds.get(item.provider),
        name_en: item.en,
        name_ar: item.ar,
        make: item.make,
        model: item.model,
        year: item.year,
        vehicle_type: item.type,
        transmission: item.gearbox,
        fuel_type: item.fuel,
        seats: item.seats,
        doors: item.seats > 5 ? 5 : 4,
        bags: 3,
        mileage_limit_km: item.type === 'luxury' ? null : 300,
        extra_km_rate: item.type === 'luxury' ? null : '0.120',
        daily_rate: item.rate,
        with_driver_available: item.driverRate !== null,
        driver_daily_rate: item.driverRate,
        quantity: item.quantity,
        insurance_option_id: insuranceOption?.id ?? null,
        cover_image_key: cover,
        status: 'published',
        published_at: now,
        created_at: now,
      })
      vehicleIds.set(item.slug, Number(id))
      const age = item.type === 'luxury' ? 25 : 21
      const deposit = Number(item.deposit)
      await db.table('rental_vehicle_terms').multiInsert(
        [
          { label_en: `${age}+ age`, label_ar: `العمر ${age}+` },
          { label_en: 'Free cancellation', label_ar: 'إلغاء مجاني' },
          { label_en: `KD ${deposit} deposit`, label_ar: `تأمين ${deposit} د.ك` },
          {
            label_en: 'Licence and civil ID at pickup',
            label_ar: 'الرخصة والبطاقة المدنية عند الاستلام',
          },
          { label_en: 'Return with the same fuel level', label_ar: 'الإرجاع بنفس مستوى الوقود' },
          { label_en: 'No smoking', label_ar: 'ممنوع التدخين' },
        ].map((term, sort_order) => ({ vehicle_id: id, ...term, sort_order, created_at: now }))
      )
      await db.table('rental_vehicle_images').multiInsert(
        gallery.map((storage_key, sort_order) => ({
          vehicle_id: id,
          storage_key,
          sort_order,
          created_at: now,
        }))
      )
      await db
        .table('rental_vehicle_locations')
        .multiInsert(
          branchIds.get(item.provider)!.map((location_id) => ({ vehicle_id: id, location_id }))
        )
    }

    // A test customer with a confirmed and a cancelled booking, to try the CMS booking pages and refunds.
    let customer = await db.from('customers').where('phone_e164', '+96550000001').first()
    if (!customer) {
      await db.table('customers').insert({
        phone_e164: '+96550000001',
        first_name: 'Rental',
        last_name: 'Tester',
        email: 'rental.tester@example.com',
        phone_verified_at: now,
        created_at: now,
      })
      customer = await db.from('customers').where('phone_e164', '+96550000001').firstOrFail()
    }
    const camry = vehicleIds.get('camry')!
    const camryRow = await db.from('rental_vehicles').where('id', camry).firstOrFail()
    const provider = await db
      .from('rental_providers')
      .where('id', camryRow.provider_id)
      .firstOrFail()
    const place = await db
      .from('rental_locations')
      .where('id', branchIds.get('gulf')![0])
      .firstOrFail()
    const samples = [
      { reference: 'RN-SAMPLE01', status: 'confirmed', startDays: 5 },
      { reference: 'RN-SAMPLE02', status: 'cancelled', startDays: 12 },
    ]
    for (const sample of samples) {
      if (await db.from('rental_bookings').where('reference', sample.reference).first()) continue
      const pickup = new Date(Date.now() + sample.startDays * DAY)
      pickup.setUTCMinutes(0, 0, 0)
      const snapshotLocation = {
        id: Number(place.id),
        name_en: place.name_en,
        name_ar: place.name_ar,
        address: place.address,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
      }
      const camryTerms = await db
        .from('rental_vehicle_terms')
        .where('vehicle_id', camry)
        .orderBy('sort_order')
      const [bookingId] = await db.table('rental_bookings').insert({
        reference: sample.reference,
        customer_id: customer.id,
        vehicle_id: camry,
        provider_id: provider.id,
        pickup_location_id: place.id,
        return_location_id: place.id,
        pickup_at: pickup,
        return_at: new Date(pickup.getTime() + 3 * DAY),
        with_driver: false,
        days: 3,
        daily_rate: '12.500',
        driver_daily_rate: '0.000',
        rental_amount: '37.500',
        booking_fee: '3.000',
        currency: 'KWD',
        snapshot: JSON.stringify({
          vehicle: {
            id: camry,
            name_en: camryRow.name_en,
            name_ar: camryRow.name_ar,
            make: camryRow.make,
            model: camryRow.model,
            year: camryRow.year,
            vehicle_type: camryRow.vehicle_type,
            transmission: camryRow.transmission,
            seats: camryRow.seats,
            cover_image_key: camryRow.cover_image_key,
            mileage_limit_km: camryRow.mileage_limit_km,
            extra_km_rate: camryRow.extra_km_rate,
            insurance_en: 'Comprehensive (full cover)',
            insurance_ar: 'تأمين شامل',
            rental_terms: camryTerms.map((term) => ({
              label_en: term.label_en,
              label_ar: term.label_ar,
            })),
          },
          provider: {
            id: Number(provider.id),
            name_en: provider.name_en,
            name_ar: provider.name_ar,
            phone_e164: provider.phone_e164,
            email: null,
            address: provider.address,
          },
          pickup_location: snapshotLocation,
          return_location: snapshotLocation,
        }),
        status: sample.status,
        confirmed_at: now,
        cancelled_at: sample.status === 'cancelled' ? now : null,
        cancelled_by: sample.status === 'cancelled' ? 'customer' : null,
        idempotency_key: `seed-${sample.reference}`,
        request_hash: sample.reference.padEnd(64, '0'),
        created_at: now,
        updated_at: now,
      })
      await db.table('rental_payments').insert({
        booking_id: bookingId,
        gateway: 'myfatoorah',
        invoice_id: `SEED-${sample.reference}`,
        payment_id: `SEED-PAY-${sample.reference}`,
        payment_method: 'KNET',
        amount: '3.000',
        currency: 'KWD',
        status: 'paid',
        paid_at: now,
        created_at: now,
        updated_at: now,
      })
    }
  }
}
