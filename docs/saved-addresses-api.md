# Customer saved addresses

The Profile screen's **Saved Places** address book uses these endpoints. Venue bookmarks under **Saved Items** continue to use `/api/v2/customer/me/saved-places`.

Base path: `/api/v2/customer/me/saved-addresses`. Every request requires `Authorization: Bearer <customer_access_token>`. The customer is identified from that token; do not send `customer_id`.

| Method | Path | Success |
| --- | --- | --- |
| POST | `/api/v2/customer/me/saved-addresses` | 201, `{ data: SavedAddress }` |
| GET | `/api/v2/customer/me/saved-addresses?page=1&per_page=12` | 200, `{ data: SavedAddress[], meta: { page, per_page, total, last_page } }` |
| GET | `/api/v2/customer/me/saved-addresses/{id}` | 200, `{ data: SavedAddress }` |
| PUT | `/api/v2/customer/me/saved-addresses/{id}` | 200, `{ data: SavedAddress }` |
| DELETE | `/api/v2/customer/me/saved-addresses/{id}` | 204, empty body |

Create example:

```json
{
  "label": "Home",
  "address": "Block 2, Street 10, Building 5, Kuwait City",
  "latitude": 29.3759,
  "longitude": 47.9774,
  "notes": "Apartment 12, second floor"
}
```

`label` and `address` are required nonempty strings, with maximum lengths of 80 and 500 characters. Labels may be Home, Work or a custom user label. Coordinates are required numbers: latitude from -90 to 90 and longitude from -180 to 180. Optional `notes` accepts null or up to 500 characters. The app supplies address text and coordinates from its map picker; this API does not perform geocoding. User-entered labels, addresses and notes are returned as entered, without language translation.

All create/read/update/list responses use the same `SavedAddress` fields:

```json
{
  "data": {
    "id": 1,
    "customer_id": 7,
    "label": "Home",
    "address": "Block 2, Street 10, Building 5, Kuwait City",
    "latitude": 29.3759,
    "longitude": 47.9774,
    "notes": "Apartment 12, second floor",
    "created_at": "2026-10-27T06:00:00.000Z",
    "updated_at": null
  }
}
```

IDs and coordinates are JSON numbers. Timestamps use UTC ISO strings. PUT accepts any nonempty subset of the create fields; omitted fields retain their current values, and `notes: null` clears notes. Identity, ownership and timestamps cannot be edited.

Lists show newest IDs first. `page` defaults to 1 and supports 1–10000; `per_page` defaults to 12 and supports 1–50. An empty list has `data: []`, `meta.total: 0`, and `meta.last_page: 1`.

An unavailable address, including one owned by another account, returns 404 `NOT_FOUND` for detail/update/delete. Repeated deletion returns 404. Missing or invalid authentication returns 401; invalid fields, empty PUT and invalid pagination return 422. Writes are limited to 120 requests per customer per minute; excess requests return 429. All responses use `Cache-Control: no-store`. Account deletion removes its saved addresses automatically.

Schemas: [saved-addresses-openapi.json](saved-addresses-openapi.json). Postman: **08A — Saved addresses** in the main collection.

Deployment: apply migration `1760000000016_create_customer_saved_addresses` with `node ace migration:run --force` before serving these endpoints. The migration creates the new address table and does not alter existing address or place data.
