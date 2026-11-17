# Rental: pickup at the customer's address (with driver)

With a driver, the customer can choose to be picked up at their own address (a spot on the map or a saved address) instead of going to a pickup place. Self-drive bookings always use a pickup place.

Base URL: `{{base_url}}/api/v2`. Everything else in the rental flow stays the same (see `rental-api.md`).

## How it works

- Admins set up **service areas** in the CMS (Salmiya, Jahra…), each with a pin. An address belongs to the area whose pin is nearest.
- Each provider can be marked as **not serving** some areas. Their cars are not shown or bookable for addresses in those areas.
- An address outside Kuwait, or more than 25 km from every area pin, isn't served.
- **Price:** the same as a branch pickup. There's no delivery fee. The customer pays only the booking fee in the app; the provider collects the rental at handover.

## 1. Search cars for an address

Send the coordinates instead of `pickup_location_id`, together with `with_driver=true`:

```
GET /rentals/vehicles?with_driver=true&pickup_lat=29.34&pickup_lng=48.07&pickup_at=…&return_at=…
```

- Returns only cars whose provider serves that area.
- `meta.pickup_area` = `{ "id": 3, "name": "Salmiya" }`. It's `null` while no areas are set up in the CMS.
- All other filters (`vehicle_type`, `sort`…) work as usual.

## 2. Quote for the summary screen (optional)

```
GET /rentals/vehicles/{id}/quote?with_driver=true&pickup_lat=29.34&pickup_lng=48.07&pickup_at=…&return_at=…
```

Runs the same checks as the booking without creating anything. The response adds `pickup_type: "address"` and `pickup_area`.

## 3. Create the booking

`POST /customer/me/rental-bookings` (with `Idempotency-Key`, as today). Send **one** of these instead of `pickup_location_id`.

**A) Spot picked on the map / searched address**

```json
{
  "vehicle_id": 12,
  "pickup_at": "2026-12-20T10:00:00+03:00",
  "return_at": "2026-12-23T10:00:00+03:00",
  "with_driver": true,
  "pickup_name": "Block 5, Street 12, Salmiya",
  "pickup_lat": 29.34,
  "pickup_lng": 48.07,
  "notes": "Blue gate"
}
```

`pickup_name` is the address text the customer sees (up to 500 characters). `pickup_name`, `pickup_lat` and `pickup_lng` are all required together.

**B) One of the customer's saved addresses**

```json
{
  "vehicle_id": 12,
  "pickup_at": "2026-12-20T10:00:00+03:00",
  "return_at": "2026-12-23T10:00:00+03:00",
  "with_driver": true,
  "pickup_saved_address_id": 7
}
```

`pickup_saved_address_id` is an `id` from `GET /customer/me/saved-addresses`. The server copies the address into the booking, so editing or deleting the saved address later doesn't change the booking.

Rules:

- Send the data in the **JSON body**, not in the URL.
- Exactly one pickup: `pickup_location_id`, **or** the map fields, **or** `pickup_saved_address_id`.
- Don't send `return_location_id` with an address pickup. The driver drops the customer back at the **same address** at `return_at`.

## 4. Booking response

Every booking (create, list, detail) now has `pickup`:

```json
"pickup": {
  "type": "address",
  "address": "Block 5, Street 12, Salmiya",
  "latitude": 29.34,
  "longitude": 48.07,
  "area": { "id": 3, "name": "Salmiya" }
}
```

For a normal branch pickup:

```json
"pickup": { "type": "branch", "address": null, "latitude": null, "longitude": null, "area": null }
```

When `pickup.type` is `"address"`, show `pickup.address` as the pickup on the summary, booking detail and history screens. `pickup_location` is then the provider's branch the driver sets off from (you don't need to show it).

Every booking also has `return`, with the same shape as `pickup`. For an address pickup it is the same address: the driver drops the customer back there at `return_at`. Show `return.address` as the return on the summary, booking detail and history screens. For a branch pickup, `return.type` is `"branch"`; show `return_location` as before. Branch working hours apply only to the pickup time of an address booking.

## Errors

| Status | Code | When | Show |
| --- | --- | --- | --- |
| 422 | `ADDRESS_PICKUP_NEEDS_DRIVER` | Address sent without `with_driver: true` | Only with-driver bookings can use an address |
| 422 | `OUTSIDE_SERVICE_AREA` | The address is outside the service areas, or this car's provider doesn't serve that area | "We don't pick up from this location yet" and let them choose another address or car |
| 422 | `VALIDATION_ERROR` | Both a place and an address sent, none sent, `pickup_name` missing, only one coordinate, or a saved address that isn't theirs | `error.fields` names the field |
| 422 | `BRANCH_CLOSED` | No branch of that car is open at the pickup or return time | Ask for another time |

Errors have the usual shape: `{ "error": { "code", "message", "fields"?, "requestId" } }`.

## Postman

Folder **12A — Car rental**: **Search vehicles at an address (with driver)**, **Create booking: driver picks up at a map address** and **Create booking: driver picks up at a saved address**. For the saved-address request, run **Save address** (Saved addresses folder) first.
