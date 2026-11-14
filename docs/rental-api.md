# Car rental API

Status: **implemented 5 November 2026** (App 2 Section 6). Inventory is managed in the CMS (**Rentals → Rental fleet**). The app charges only a **booking fee** through MyFatoorah. The rental amount is paid directly to the provider at pickup.

All paths are under `/api/v2`. Send `Accept-Language: en|ar` for localized names, insurance and rental terms. Money is a KWD string with three decimals (`"12.500"`). Times are ISO 8601 date-times with a time zone. Send Kuwait times as `+03:00`; responses are UTC (`Z`). Errors use the shared `{ error: { code, message, requestId, fields? } }` envelope. Machine-readable schemas are in [rental-openapi.json](rental-openapi.json), and the importable requests are in Postman folder **12A — Car rental**.

## 0. Response conventions

- Keys are snake_case. Flags are booleans, IDs are integers, timestamps are ISO strings, and money is a three-decimal KWD string.
- Lists return `data` plus `meta` with `page`, `per_page`, `total` and `last_page`.
- Image fields hold stored **keys** (`cover_image_key`, `logo_image_key`, `gallery[].storage_key`). Resolve each key through `meta.images[]`, which is `{ storage_key, url }` with the URL relative to the API origin. Keys without a URL are `null`.
- Booking responses include `meta.images` for the vehicle cover. Create, list, detail, cancel and verify use the same booking shape.

## 1. Flow

1. `GET /rentals/options`: filter values, pickup locations, the booking fee and the booking rules.
2. `GET /rentals/vehicles?pickup_at&return_at&pickup_location_id&with_driver&…`: vehicles free for the period, each with a `quote`.
3. `GET /rentals/vehicles/{id}?pickup_at&return_at&with_driver`: gallery, specs, mileage, insurance, `rental_terms`, provider, locations and `available`.
4. `POST /customer/me/rental-bookings` with an `Idempotency-Key` header creates a **pending_payment** booking. This holds one unit until `hold_expires_at`. Call it only when the customer taps the final **Pay** button, not when the summary or review screen opens: every call creates a booking record that the customer then sees in their history. For the summary screen use `GET /rentals/vehicles/{id}/quote` with `pickup_location_id`: it returns the price and the same place and branch-hours errors without booking anything.
5. `GET /customer/me/rental-bookings/{id}/payment-methods` lists methods (KNET, card, Apple Pay and others) from MyFatoorah.
6. `POST /customer/me/rental-bookings/{id}/payment` with `{ "payment_method_id": 1 }` returns `payment_url`. Open it in a web view.
7. MyFatoorah redirects to `callback_url` (`/api/v2/rentals/payments/callback?paymentId=…`). When the web view reaches that URL, close it and call `POST /customer/me/rental-bookings/{id}/payment/verify`. The booking becomes **confirmed** after the server verifies the payment with MyFatoorah.

### App checklist

- **Show API errors.** A search that fails (for example `422 INVALID_RENTAL_PERIOD` when the pickup is sooner than `min_lead_minutes`) must show `error.message`, not "No cars available".
- **Send times with a time zone.** `2026-11-20T10:00:00+03:00` is valid; `2026-11-20T10:00:00` is rejected. Branch hours are checked in Kuwait time.
- **Unpaid bookings in My bookings.** Show `pending_payment` as "Payment pending" with a countdown to `hold_expires_at`, a **Pay now** button (step 6) and a **Cancel** button. Show `expired` as "Not paid" under cancelled/past.
- **Reuse the same `Idempotency-Key`** when retrying the same checkout, so a double tap or a network retry does not create a second booking.

If the server sets `RENTAL_PAYMENT_RETURN_URL` (for example an app deep link), the callback redirects there with `status=paid|pending|unknown`, `booking_id` and `reference`.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/rentals/options` | – | Vehicle types, gearboxes, sorts, locations, `booking_fee`, `min_lead_minutes`, `max_rental_days`, `hold_minutes`, `cancellation_cutoff_hours` |
| GET | `/rentals/locations` | – | Pickup places for the location picker (shared list; each provider has a branch there) |
| GET | `/rentals/vehicles` | – | Search (see filters below), paginated `page`/`per_page` (max 50) |
| GET | `/rentals/vehicles/{id}` | – | Detail; with a period it includes `quote` and `available` |
| GET | `/rentals/vehicles/{id}/quote` | – | Price for the summary screen; creates nothing. `pickup_at`, `return_at` required; `with_driver`, `pickup_location_id` optional. With `pickup_location_id` it runs the booking's place and branch-hours checks (`422 INVALID_LOCATION`, `422 BRANCH_CLOSED`) and returns `pickup_location` (place with `branch`), otherwise `pickup_location: null` |
| POST | `/customer/me/rental-bookings` | customer | Reserve (hold) a vehicle |
| GET | `/customer/me/rental-bookings` | customer | History; `status=active,past,cancelled` or raw statuses |
| GET | `/customer/me/rental-bookings/{id}` | customer | Detail (owner only; others get 404) |
| POST | `/customer/me/rental-bookings/{id}/cancel` | customer | `{ "reason"?: string }` |
| GET | `/customer/me/rental-bookings/{id}/payment-methods` | customer | MyFatoorah methods for the fee |
| POST | `/customer/me/rental-bookings/{id}/payment` | customer | Start payment, returns `payment_url` |
| POST | `/customer/me/rental-bookings/{id}/payment/verify` | customer | Pull status from MyFatoorah, returns the booking |
| GET | `/rentals/payments/callback` | – | Browser redirect target (MyFatoorah `CallBackUrl`/`ErrorUrl`) |
| POST | `/rentals/payments/webhook` | – | MyFatoorah webhook (configure in the MyFatoorah portal) |
| GET | `/rentals/vehicles/{id}/reviews` | – | Published reviews of a vehicle with `meta.rating` (average, count, distribution) |
| GET | `/rentals/providers/{id}/reviews` | – | Published reviews of all vehicles of a provider |
| PUT | `/customer/me/rental-bookings/{id}/review` | customer | Create or edit my review: `{ "rating": 1-5, "comment"?: string }` |
| DELETE | `/customer/me/rental-bookings/{id}/review` | customer | Delete my review (204) |
| GET | `/customer/me/saved-vehicles` | customer | My saved vehicles, newest saved first; `page`/`per_page`. Unpublished vehicles are left out |
| PUT | `/customer/me/saved-vehicles/{id}` | customer | Save a vehicle (200, `data: { vehicle_id, is_saved, saved_at }`); saving again is a no-op; 404 if not published |
| DELETE | `/customer/me/saved-vehicles/{id}` | customer | Remove a saved vehicle (204, also when not saved) |

**Saved flag:** every vehicle card in search, detail and the saved list has `is_saved`. Search and detail don't require login, but send the customer bearer token there too, otherwise `is_saved` is always `false`.

**Search filters:** `pickup_at` + `return_at` (both or neither), `pickup_location_id`, `with_driver=true` (vehicles offered with a driver; the quote then includes the driver rate). Without it the search is self-drive and excludes driver-only vehicles. `vehicle_type` (comma list of `code`s from `/rentals/options` `vehicle_types`; the list is managed in the CMS, so never hard-code it), `transmission` (`automatic,manual`), `seats_min`, `sort` (`recommended`, `price_asc`, `price_desc`, `newest`). With a period, the search returns only vehicles that have a free unit.

**Create booking body:**

```json
{
  "vehicle_id": 12,
  "pickup_at": "2026-11-20T10:00:00+03:00",
  "return_at": "2026-11-23T10:00:00+03:00",
  "pickup_location_id": 1,
  "with_driver": false,
  "notes": "Child seat please"
}
```

`Idempotency-Key` is required: 8–80 characters of letters, digits, `-` and `_`. Generate one per checkout attempt and reuse it on retries. A replay returns `200` with the same booking. The same key with a different body returns `409 IDEMPOTENCY_CONFLICT`. `return_location_id` is optional and must match the pickup location.

## 3. Pricing

`days` = each started 24 hours, minimum 1. `rental_amount` = `days × (daily_rate + driver_daily_rate when with_driver)`. `pay_now` = `booking_fee`, charged in the app. `pay_at_pickup` = `rental_amount`, paid to the provider. Each booking stores a snapshot of the amounts and of the vehicle, provider, mileage, insurance and rental terms, so later catalogue edits do not change it.

### Pickup places, branches and working hours

- `GET /rentals/locations` returns the **pickup places** for the "Select pickup location" screen: `{ id, name, address, latitude, longitude }`, where `address` is the second line (for example "Kuwait City · Main entrance"). It is one shared list; each rental provider has its own branch at a place. Send a place `id` as `pickup_location_id` / `return_location_id`.
- Search with `pickup_location_id` returns cars from every provider that has a branch at that place. With a period, it only returns cars whose branch is open at the pickup time.
- **The car is returned at the pickup place.** `return_location_id` is optional; if sent it must equal `pickup_location_id`, otherwise `422 INVALID_LOCATION`. The return time is checked against the same branch's hours.
- Vehicle detail `locations` lists the places where this car can be picked up. Each item is the place plus `branch: { id, name, address, phone_e164, working_hours, closed_dates }` for that provider. Use `branch.working_hours` and `branch.closed_dates` to grey out times in the date/time pickers.
- `working_hours`: `null` means no fixed hours. Otherwise 7 items, Sunday first: `{ weekday, day, open_24h, closed, shifts: [{ opens, closes }] }` with up to two shifts, times `HH:MM` in Kuwait time. `closed_dates`: upcoming `[{ starts_on, ends_on, reason }]`, inclusive.
- Booking returns `422 BRANCH_CLOSED` when the pickup or return time is outside the branch's hours or on a closed date. The booking's `pickup_location` / `return_location` show the place name with the branch address and `phone_e164`.

### Rental mode and insurance

- `rental_mode`: `self_drive`, `with_driver` or `both`, with the matching flags `self_drive_available` and `with_driver_available`. For `both`, show a driver choice; for `with_driver`, always book with `with_driver: true` (quotes for these vehicles already include the driver rate).
- `insurance`: the vehicle's insurance cover as a short localized label (for example “Comprehensive (full cover)”), or `null`. The options are managed in the CMS.
- `vehicle_type`: `{ code, label }`. Types are managed in the CMS; read the current list from `/rentals/options`.

### Mileage and rental terms

- **Mileage card:** `mileage_limit_km` (km per day, `null` = unlimited), `unlimited_mileage`, and `extra_km_rate` (KWD per km over the limit, or `null`). Show for example “250 km / day · Extra km at KD 0.120”. The extra-km charge is collected by the provider, not by the app.
- **Rental terms:** `rental_terms` is an ordered list of `{ label }` items, for example `21+ age`, `KD 100 deposit`, `Free cancellation`, `No smoking`. Show them as chips in the order received. Staff manage them per vehicle in the CMS (English and Arabic); labels are localized by `Accept-Language`. Minimum age and deposit are no longer separate fields: they are written as terms.

## 4. Booking statuses

| Status | Meaning | Suggested app label |
| --- | --- | --- |
| `pending_payment` | Reserved; pay before `hold_expires_at` (payment start extends the hold once) | Payment pending (countdown, Pay now, Cancel) |
| `confirmed` | Fee paid and verified; show the provider phone and the licence/ID reminder | Confirmed |
| `completed` | Marked by staff or the provider after the rental | Completed |
| `cancelled` | By customer (`pending_payment` anytime, `confirmed` until `cancellation_cutoff_hours` before pickup) or by staff | Cancelled |
| `expired` | Hold ran out unpaid | Not paid |
| `refund_required` | The fee was paid but the booking could not be confirmed (car taken after the hold expired, or already cancelled). Staff refund it from the CMS | Refund in progress |

The booking fee is **not refunded automatically** when a customer cancels. Staff can refund it from the CMS booking page. A confirmed booking creates an inbox/push notification of type `rental_booking_confirmed` with `action_data: { type, booking_id, reference }`.

Common errors: `409 VEHICLE_UNAVAILABLE`, `409 TOO_MANY_PENDING_BOOKINGS` (max 3 unpaid holds), `409 BOOKING_NOT_PAYABLE`, `409 ALREADY_PAID`, `409 IDEMPOTENCY_CONFLICT`, `422 VALIDATION_ERROR` (see `fields`), `409 CANCELLATION_WINDOW_CLOSED`, `409 REVIEW_NOT_ALLOWED`, `422 INVALID_RENTAL_PERIOD`, `422 INVALID_LOCATION`, `422 BRANCH_CLOSED` (pickup or return time outside the branch's working hours or on a closed date), `422 DRIVER_NOT_AVAILABLE` (vehicle is self-drive only), `422 DRIVER_REQUIRED` (vehicle is only rented with a driver; send `with_driver: true`), `503 PAYMENTS_NOT_CONFIGURED`, `502 PAYMENT_GATEWAY_ERROR`.

### Driver (with-driver bookings)

- Each booking response has `driver`: `null`, or `{ id, name, phone_e164, photo_image_key, assigned_at }` once the provider assigns a driver to a confirmed with-driver booking. Self-drive bookings always have `driver: null`.
- Show the driver card (photo, name, call button when `phone_e164` is set) on the booking detail. While `with_driver` is `true` and `driver` is `null`, show "Driver to be assigned".
- `photo_image_key` resolves through `meta.images`, like the vehicle cover.
- Assigning or changing the driver sends an inbox/push notification of type `rental_driver_assigned` with `action_data: { type: "rental_booking", booking_id, reference }`. Open the booking and refresh it.

## 5. Reviews and ratings

- One review per booking, by the booking's customer, once the rental has ended: status `completed`, or `confirmed` and past `return_at`. Before that the API returns `409 REVIEW_NOT_ALLOWED`. Other customers get `404`.
- `PUT` creates (201) or edits (200) the review. `rating` is an integer 1–5; `comment` is optional, up to 1000 characters.
- Each booking response has `review` (the customer's own review or `null`) and `can_review`.
- Vehicle cards and details have `rating` and `provider.rating`: `{ average, count }`, where `average` is one decimal or `null` with no reviews. Only published reviews count.
- Public lists show `author_name` as first name and last initial, newest first.
- Staff can hide or delete reviews in the CMS (**Rentals → Rental reviews**). A hidden review stays visible to its author with `status: "hidden"`, but is removed from public lists and averages.

## 6. Provider emails

When a booking is confirmed, the provider gets an email with the reference, customer name and phone, vehicle, pickup and return times and locations, driver option, the amount to collect at pickup, the mileage limit and extra-km rate, the rental terms and the customer's notes. Cancelling a confirmed booking (by the customer, by staff, or through a refund) sends a cancellation email. Emails go to the provider's email address in the CMS through Resend. Each attempt is logged on the CMS booking page with its result, and staff can send it again from there. Delivery problems never block the booking.

## 7. Server setup

- Run all migrations up to `1760000000035_rental_documents_and_drivers` (`node ace migration:run --force`).
- Set `RESEND_API_KEY` and `RENTAL_EMAIL_FROM` (a sender on a domain verified in Resend, for example `Kuwaiti Experience <bookings@example.com>`). `RENTAL_EMAIL_REPLY_TO` is optional. Without them, provider emails are logged as not sent. Add an email address to each provider in the CMS.
- Set `MYFATOORAH_API_KEY` and `MYFATOORAH_BASE_URL`. The default is the test URL `https://apitest.myfatoorah.com`; Kuwait live is `https://api.myfatoorah.com`. `APP_API_BASE_URL` (or `APP_URL`) must be publicly reachable for the payment callback.
- In the MyFatoorah portal, point the webhook at `https://<api-origin>/api/v2/rentals/payments/webhook`. Webhooks only trigger a status pull from the MyFatoorah API, so webhook signatures are not relied on.
- In the CMS, add providers, locations and vehicles, then publish the vehicles. Set the booking fee and rules under **Rental fleet → Settings**. Grant staff the `rentals.*`, `rental_bookings.*` and `rental_reviews.*` permissions.

## 8. Not included yet

Provider notification by SMS, review photos or replies, a unified cab and rental history envelope, and native Apple Pay or embedded payment (Apple Pay here runs through the MyFatoorah hosted page).
