# Saved Vehicles API

This is for the save (heart/bookmark) icon in the car rental screens. Customers can save a vehicle, see their saved vehicles, and remove one. Every vehicle card also says whether it is saved.

Base URL: `{{base_url}}/api/v2`. Send `Accept-Language: en` or `ar` for localized names.

## Quick summary

| Method | Path | Login | What it does |
| --- | --- | --- | --- |
| PUT | `/customer/me/saved-vehicles/{vehicle_id}` | Required | Save a vehicle |
| DELETE | `/customer/me/saved-vehicles/{vehicle_id}` | Required | Remove a saved vehicle |
| GET | `/customer/me/saved-vehicles` | Required | List my saved vehicles |
| GET | `/rentals/vehicles` | Optional | Search. Each card now has `is_saved` |
| GET | `/rentals/vehicles/{id}` | Optional | Vehicle detail. Now has `is_saved` |

Login means the header `Authorization: Bearer <customer access token>`.

## Important: send the token on search and detail too

Search and vehicle detail still work without login. But if the customer is logged in, **send the `Authorization` header on these calls as well**. Without the token the server doesn't know who is asking, so `is_saved` is always `false`.

- Guest → `is_saved: false` always. Hide the save icon or ask them to log in when they tap it.
- Logged in → `is_saved` is `true` or `false` for that customer.

## 1. Save a vehicle

`PUT /customer/me/saved-vehicles/{vehicle_id}`

No body. `vehicle_id` is the `id` from search or detail.

Response `200`:

```json
{
  "data": {
    "vehicle_id": 12,
    "is_saved": true,
    "saved_at": "2026-11-12T09:30:15.123Z"
  }
}
```

- Saving a vehicle that is already saved is safe. It returns `200` with the same `saved_at` and doesn't create a duplicate.
- `404 NOT_FOUND`: the vehicle doesn't exist or is no longer published.
- `401 UNAUTHENTICATED`: no token or an expired token.
- `429 RATE_LIMITED`: too many save/unsave taps (limit 120 per minute).

## 2. Remove a saved vehicle

`DELETE /customer/me/saved-vehicles/{vehicle_id}`

No body. Response `204` with an empty body.

Always `204`, even if the vehicle wasn't saved or has since been removed from the catalog. So the app can always call it when the user un-taps the icon.

## 3. List my saved vehicles

`GET /customer/me/saved-vehicles?page=1&per_page=12`

| Query | Required | Default | Notes |
| --- | --- | --- | --- |
| `page` | No | 1 | |
| `per_page` | No | 12 | Max 50 |

Response `200`. Each item is the same vehicle card as search, plus `saved_at`. Newest saved first.

```json
{
  "data": [
    {
      "id": 12,
      "name": "Toyota Camry",
      "make": "Toyota",
      "model": "Camry",
      "year": 2025,
      "vehicle_type": { "code": "sedan", "label": "Sedan" },
      "transmission": { "code": "automatic", "label": "Automatic" },
      "fuel_type": { "code": "petrol", "label": "Petrol" },
      "seats": 5,
      "daily_rate": "12.500",
      "currency": "KWD",
      "cover_image_key": "rentals/vehicles/12/cover.jpg",
      "rating": { "average": 4.5, "count": 8 },
      "provider": { "id": 3, "name": "Gulf Rent", "logo_image_key": null },
      "quote": null,
      "is_saved": true,
      "saved_at": "2026-11-12T09:30:15.123Z"
    }
  ],
  "meta": {
    "images": [{ "storage_key": "rentals/vehicles/12/cover.jpg", "url": "https://…" }],
    "page": 1,
    "per_page": 12,
    "total": 1,
    "last_page": 1
  }
}
```

(The card is shortened here. It has all the fields that search returns.)

Notes:

- `quote` is always `null` here because there are no dates. To show a price for dates, open the detail or call the quote API with `pickup_at` and `return_at`.
- Image URLs come from `meta.images`, matched by `storage_key`, the same as in search.
- If a vehicle is unpublished in the CMS, it disappears from this list. If it is published again, it comes back.

## 4. `is_saved` on search and detail

- `GET /rentals/vehicles` → every item in `data` has `"is_saved": true | false`.
- `GET /rentals/vehicles/{id}` → `data.is_saved`.

## Suggested app flow

1. On search and detail, send the customer token if the user is logged in. Draw the icon from `is_saved`.
2. User taps the icon:
   - Not saved → `PUT /customer/me/saved-vehicles/{id}`. Fill the icon right away and undo it if the call fails.
   - Saved → `DELETE /customer/me/saved-vehicles/{id}`. Empty the icon right away and undo it if the call fails.
3. Guest taps the icon → ask them to log in. The server returns `401` for guests.
4. Saved screen → `GET /customer/me/saved-vehicles`, paging with `page` until `page == last_page`. A remove on this screen removes the card from the list.
5. Coming back to search or detail after changes on another screen → reload or update the icon locally. The server is always the source of truth.

## Errors

All errors use the usual format:

```json
{ "error": { "code": "NOT_FOUND", "message": "Vehicle not found", "requestId": "…" } }
```

| Status | Code | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Missing or expired token on the saved-vehicles APIs |
| 404 | `NOT_FOUND` | Saving an unknown or unpublished vehicle, or `vehicle_id` isn't a positive whole number |
| 429 | `RATE_LIMITED` | More than 120 save/unsave calls in a minute. Wait and try again |

## Postman

In the collection, folder **12A — Car rental**: **Save vehicle**, **List my saved vehicles** and **Remove saved vehicle**. Run **Search vehicles** first. It stores `rental_vehicle_id` for the save calls.
