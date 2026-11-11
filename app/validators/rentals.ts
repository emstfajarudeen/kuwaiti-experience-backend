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

const shift = vine.object({
  opens: vine.string().trim().maxLength(5),
  closes: vine.string().trim().maxLength(5),
})

export const rentalPlaceValidator = vine.compile(
  vine.object({
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: optionalText(160),
    subtitleEn: optionalText(200),
    subtitleAr: optionalText(200),
    latitude: vine.number().range([-90, 90]).nullable(),
    longitude: vine.number().range([-180, 180]).nullable(),
    active: vine.boolean(),
    sortOrder: vine.number().withoutDecimals().range([0, 9999]),
  })
)

export const rentalLocationValidator = vine.compile(
  vine.object({
    providerId: vine.number().withoutDecimals().positive(),
    placeId: vine.number().withoutDecimals().positive(),
    phone: vine
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/)
      .nullable(),
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: optionalText(160),
    address: optionalText(500),
    latitude: vine.number().range([-90, 90]).nullable(),
    longitude: vine.number().range([-180, 180]).nullable(),
    active: vine.boolean(),
    sortOrder: vine.number().withoutDecimals().range([0, 9999]),
  })
)

/** Working hours and closed dates of one branch. */
export const rentalBranchHoursValidator = vine.compile(
  vine.object({
    hoursEnabled: vine.boolean(),
    schedule: vine
      .array(
        vine.object({
          mode: vine.enum(['closed', 'open24', 'shifts']),
          shifts: vine.array(shift).maxLength(2),
        })
      )
      .fixedLength(7),
    closures: vine
      .array(
        vine.object({
          startsOn: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endsOn: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          reason: vine.string().trim().maxLength(200).nullable(),
        })
      )
      .maxLength(50),
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
    vehicleType: vine.string().trim().minLength(1).maxLength(60),
    transmission: vine.enum(['automatic', 'manual']),
    fuelType: vine.enum(['petrol', 'diesel', 'hybrid', 'electric']),
    seats: vine.number().withoutDecimals().range([1, 60]),
    doors: vine.number().withoutDecimals().range([1, 10]).nullable(),
    bags: vine.number().withoutDecimals().range([0, 20]).nullable(),
    mileageLimitKm: vine.number().withoutDecimals().range([1, 100000]).nullable(),
    extraKmRate: money().nullable(),
    dailyRate: money(),
    rentalMode: vine.enum(['self_drive', 'with_driver', 'both']),
    driverDailyRate: money().nullable(),
    quantity: vine.number().withoutDecimals().range([1, 500]),
    insuranceOptionId: vine.number().withoutDecimals().positive().nullable(),
    terms: vine
      .array(
        vine.object({
          labelEn: vine.string().trim().minLength(1).maxLength(200),
          labelAr: optionalText(200),
        })
      )
      .maxLength(20),
    locationIds: vine.array(vine.number().withoutDecimals().positive()).maxLength(200),
  })
)

export const rentalReviewValidator = vine.compile(
  vine.object({
    rating: vine.number().withoutDecimals().range([1, 5]),
    comment: vine.string().trim().maxLength(1000).nullable().optional(),
  })
)

/** A new vehicle type or insurance option added from the vehicle form. */
export const rentalOptionValidator = vine.compile(
  vine.object({
    nameEn: vine.string().trim().minLength(1).maxLength(80),
    nameAr: optionalText(80).optional(),
  })
)

export const rentalSettingsValidator = vine.compile(
  vine.object({
    bookingFee: money(),
    holdMinutes: vine.number().withoutDecimals().range([5, 120]),
    minLeadMinutes: vine.number().withoutDecimals().range([0, 10080]),
    maxRentalDays: vine.number().withoutDecimals().range([1, 365]),
    // Hidden in the CMS until the app offers customer cancellation; omitted keeps the stored value.
    cancellationCutoffHours: vine.number().withoutDecimals().range([0, 720]).nullable().optional(),
  })
)
