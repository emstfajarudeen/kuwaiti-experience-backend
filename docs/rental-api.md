# Car rental API

Status: **implemented 5 November 2026** (App 2 Section 6). Inventory is managed in the CMS (**Rentals → Rental fleet**). The app charges only a **booking fee** through MyFatoorah. The rental amount and deposit are paid directly to the provider at pickup.

All paths are under `/api/v2`. Send `Accept-Language: en|ar` for localized names, insurance and terms text. Money is a KWD string with three decimals (`"12.500"`). Times are ISO 8601 date-times with a time zone. Send Kuwait times as `+03:00`; responses are UTC (`Z`). Errors use the shared `{ error: { code, message, requestId, fields? } }` envelope.

## 1. Flow

1. `GET /rentals/options`: filter values, pickup locations, the booking fee and the booking rules.
2. `GET /rentals/vehicles?pickup_at&return_at&pickup_location_id&with_driver&…`: vehicles free for the period, each with a `quote`.
3. `GET /rentals/vehicles/{id}?pickup_at&return_at&with_driver`: gallery, specs, insurance, terms, provider, locations and `available`.
4. `POST /customer/me/rental-bookings` with an `Idempotency-Key` header creates a **pending_payment** booking. This holds one unit until `hold_expires_at`.
5. `GET /customer/me/rental-bookings/{id}/payment-methods` lists methods (KNET, card, Apple Pay and others) from MyFatoorah.
6. `POST /customer/me/rental-bookings/{id}/payment` with `{ "payment_method_id": 1 }` returns `payment_url`. Open it in a web view.
7. MyFatoorah redirects to `callback_url` (`/api/v2/rentals/payments/callback?paymentId=…`). When the web view reaches that URL, close it and call `POST /customer/me/rental-bookings/{id}/payment/verify`. The booking becomes **confirmed** after the server verifies the payment with MyFatoorah.

If the server sets `RENTAL_PAYMENT_RETURN_URL` (for example an app deep link), the callback redirects there with `status=paid|pending|unknown`, `booking_id` and `reference`.

## 2. Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/rentals/options` | – | Vehicle types, gearboxes, sorts, locations, `booking_fee`, `min_lead_minutes`, `max_rental_days`, `hold_minutes`, `cancellation_cutoff_hours` |
| GET | `/rentals/locations` | – | Active pickup/return locations |
| GET | `/rentals/vehicles` | – | Search (see filters below), paginated `page`/`per_page` (max 50) |
| GET | `/rentals/vehicles/{id}` | – | Detail; with a period it includes `quote` and `available` |
| GET | `/rentals/vehicles/{id}/quote` | – | `pickup_at`, `return_at` required; `with_driver` optional |
| POST | `/customer/me/rental-bookings` | customer | Reserve (hold) a vehicle |
| GET | `/customer/me/rental-bookings` | customer | History; `status=active,past,cancelled` or raw statuses |
| GET | `/customer/me/rental-bookings/{id}` | customer | Detail (owner only; others get 404) |
| POST | `/customer/me/rental-bookings/{id}/cancel` | customer | `{ "reason"?: string }` |
| GET | `/customer/me/rental-bookings/{id}/payment-methods` | customer | MyFatoorah methods for the fee |
| POST | `/customer/me/rental-bookings/{id}/payment` | customer | Start payment, returns `payment_url` |
| POST | `/customer/me/rental-bookings/{id}/payment/verify` | customer | Pull status from MyFatoorah, returns the booking |
| GET | `/rentals/payments/callback` | – | Browser redirect target (MyFatoorah `CallBackUrl`/`ErrorUrl`) |
| POST | `/rentals/payments/webhook` | – | MyFatoorah webhook (configure in the MyFatoorah portal) |

**Search filters:** `pickup_at` + `return_at` (both or neither), `pickup_location_id`, `with_driver=true` (only vehicles offered with a driver; the quote then includes the driver rate), `vehicle_type` (comma list: `sedan,suv,hatchback,luxury,sports,van,pickup`), `transmission` (`automatic,manual`), `seats_min`, `sort` (`recommended`, `price_asc`, `price_desc`, `newest`). With a period, the search returns only vehicles that have a free unit.

**Create booking body:**

```json
{
  "vehicle_id": 12,
  "pickup_at": "2026-11-20T10:00:00+03:00",
  "return_at": "2026-11-23T10:00:00+03:00",
  "pickup_location_id": 1,
  "return_location_id": 2,
  "with_driver": false,
  "notes": "Child seat please"
}
```

`Idempotency-Key` is required: 8–80 characters of letters, digits, `-` and `_`. Generate one per checkout attempt and reuse it on retries. A replay returns `200` with the same booking. The same key with a different body returns `409 IDEMPOTENCY_CONFLICT`. `return_location_id` defaults to the pickup location.

## 3. Pricing

`days` = each started 24 hours, minimum 1. `rental_amount` = `days × (daily_rate + driver_daily_rate when with_driver)`. `pay_now` = `booking_fee`, charged in the app. `pay_at_pickup` = `rental_amount`, paid to the provider. `deposit_amount` is held by the provider. Each booking stores a snapshot of the amounts and of the vehicle, provider and policy text, so later catalogue edits do not change it.

## 4. Booking statuses

| Status | Meaning |
| --- | --- |
| `pending_payment` | Reserved; pay before `hold_expires_at` (payment start extends the hold once) |
| `confirmed` | Fee paid and verified; show the provider phone and the licence/ID reminder |
| `completed` | Marked by staff after the rental |
| `cancelled` | By customer (`pending_payment` anytime, `confirmed` until `cancellation_cutoff_hours` before pickup) or by staff |
| `expired` | Hold ran out unpaid |
| `refund_required` | The fee was paid but the booking could not be confirmed (car taken after the hold expired, or already cancelled). Staff refund it from the CMS |

The booking fee is **not refunded automatically** when a customer cancels. Staff can refund it from the CMS booking page. A confirmed booking creates an inbox/push notification of type `rental_booking_confirmed` with `action_data: { type, booking_id, reference }`.

Common errors: `409 VEHICLE_UNAVAILABLE`, `409 TOO_MANY_PENDING_BOOKINGS` (max 3 unpaid holds), `409 BOOKING_NOT_PAYABLE`, `409 CANCELLATION_WINDOW_CLOSED`, `422 INVALID_RENTAL_PERIOD`, `422 INVALID_LOCATION`, `422 DRIVER_NOT_AVAILABLE`, `503 PAYMENTS_NOT_CONFIGURED`, `502 PAYMENT_GATEWAY_ERROR`.

## 5. Server setup

- Run the `1760000000027_create_rentals` migration.
- Set `MYFATOORAH_API_KEY` and `MYFATOORAH_BASE_URL`. The default is the test URL `https://apitest.myfatoorah.com`; Kuwait live is `https://api.myfatoorah.com`. `APP_API_BASE_URL` (or `APP_URL`) must be publicly reachable for the payment callback.
- In the MyFatoorah portal, point the webhook at `https://<api-origin>/api/v2/rentals/payments/webhook`. Webhooks only trigger a status pull from the MyFatoorah API, so webhook signatures are not relied on.
- In the CMS, add providers, locations and vehicles, then publish the vehicles. Set the booking fee and rules under **Rental fleet → Settings**. Grant staff the `rentals.*` and `rental_bookings.*` permissions.

## 6. Not included yet

Provider notification by e-mail or SMS, provider/vehicle reviews, a unified cab and rental history envelope, and native Apple Pay or embedded payment (Apple Pay here runs through the MyFatoorah hosted page).
