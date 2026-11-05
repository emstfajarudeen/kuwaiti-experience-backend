import vine from '@vinejs/vine'

export const createRentalBookingValidator = vine.compile(
  vine.object({
    vehicle_id: vine.number().withoutDecimals().positive(),
    pickup_at: vine.string().trim().maxLength(40),
    return_at: vine.string().trim().maxLength(40),
    pickup_location_id: vine.number().withoutDecimals().positive(),
    return_location_id: vine.number().withoutDecimals().positive().optional(),
    with_driver: vine.boolean().optional(),
    notes: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export const cancelRentalBookingValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export const startRentalPaymentValidator = vine.compile(
  vine.object({
    payment_method_id: vine.number().withoutDecimals().positive(),
  })
)

const money = () =>
  vine
    .string()
    .trim()
    .regex(/^\d{1,7}(\.\d{1,3})?$/)

const optionalText = (max: number) => vine.string().trim().maxLength(max).nullable()

export const rentalLocationValidator = vine.compile(
  vine.object({
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: optionalText(160),
    address: optionalText(500),
    latitude: vine.number().range([-90, 90]).nullable(),
    longitude: vine.number().range([-180, 180]).nullable(),
    active: vine.boolean(),
    sortOrder: vine.number().withoutDecimals().range([0, 9999]),
  })
)

export const rentalProviderValidator = vine.compile(
  vine.object({
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: optionalText(160),
    phone: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable(),
    email: vine.string().trim().email().maxLength(254).nullable(),
    address: optionalText(500),
    active: vine.boolean(),
  })
)

export const rentalVehicleValidator = vine.compile(
  vine.object({
    providerId: vine.number().withoutDecimals().positive(),
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: optionalText(160),
    make: vine.string().trim().minLength(1).maxLength(80),
    model: vine.string().trim().minLength(1).maxLength(80),
    year: vine.number().withoutDecimals().range([1980, 2100]).nullable(),
    vehicleType: vine.enum(['sedan', 'suv', 'hatchback', 'luxury', 'sports', 'van', 'pickup']),
    transmission: vine.enum(['automatic', 'manual']),
    fuelType: vine.enum(['petrol', 'diesel', 'hybrid', 'electric']),
    seats: vine.number().withoutDecimals().range([1, 60]),
    doors: vine.number().withoutDecimals().range([1, 10]).nullable(),
    bags: vine.number().withoutDecimals().range([0, 20]).nullable(),
    mileageLimitKm: vine.number().withoutDecimals().range([1, 100000]).nullable(),
    dailyRate: money(),
    depositAmount: money(),
    withDriverAvailable: vine.boolean(),
    driverDailyRate: money().nullable(),
    minDriverAge: vine.number().withoutDecimals().range([18, 99]),
    quantity: vine.number().withoutDecimals().range([1, 500]),
    insuranceEn: optionalText(5000),
    insuranceAr: optionalText(5000),
    termsEn: optionalText(10000),
    termsAr: optionalText(10000),
    locationIds: vine.array(vine.number().withoutDecimals().positive()).maxLength(200),
  })
)

export const rentalBlockValidator = vine.compile(
  vine.object({
    startsAt: vine.string().trim().maxLength(40),
    endsAt: vine.string().trim().maxLength(40),
    reason: optionalText(200),
  })
)

export const rentalSettingsValidator = vine.compile(
  vine.object({
    bookingFee: money(),
    holdMinutes: vine.number().withoutDecimals().range([5, 120]),
    minLeadMinutes: vine.number().withoutDecimals().range([0, 10080]),
    maxRentalDays: vine.number().withoutDecimals().range([1, 365]),
    cancellationCutoffHours: vine.number().withoutDecimals().range([0, 720]),
  })
)
