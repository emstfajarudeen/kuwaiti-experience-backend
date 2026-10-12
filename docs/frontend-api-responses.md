# Frontend integration guide for the public API

Use this document as the contract when implementing the visitor-facing frontend. The examples are illustrative; IDs, text, category type codes, categories, and media URLs come from the CMS and can change. Integrate the public `/api/v1` endpoints below. The `/api/v1/admin/*` endpoints are for the CMS and are not needed by the visitor frontend.

## Start here: page-to-API map

| Frontend screen or feature | Request | What to render |
| --- | --- | --- |
| Landing page | `GET /api/v1/home?locale=en` | Hero, ordered category type tiles, featured place groups, and app store links. |
| Place listing for a selected type | `GET /api/v1/categories?type={type}&locale=en` and `GET /api/v1/places?type={type}&category=all&page=1&perPage=12&locale=en` | Category filters and paginated place cards. |
| Place detail | `GET /api/v1/places/{slug}?locale=en` | Full place content, gallery, hours, and visit details. |
| Static content page | `GET /api/v1/pages/{slug}?locale=en` | CMS page title and body. |
| Shared branding/contact | `GET /api/v1/site` | Brand name, logo, contact email, WhatsApp availability, and store links. |
| Cab enquiry | `GET /api/v1/transport/locations?locale=en`, then `POST /api/v1/transport/enquiry-link` | Pickup/destination choices and a WhatsApp enquiry URL. |
| Image | `GET /api/v1/media/{id}` | Image bytes; use the media paths returned by the other endpoints. |

## Integration rules

1. Configure an API origin, such as `http://localhost:3333` in development. All paths in this document are relative to that origin. Public JSON calls do not need admin authentication.
2. JSON success responses put content under `data`. The places list also has `meta`. Check the HTTP status before using `data`; errors use an `error` object instead.
3. Pass `locale=en` or `locale=ar` on localized endpoints. English is the default when `locale` is missing or different. Missing Arabic text falls back to English. The `/site` endpoint does not use `locale`.
4. On the landing page, use `data.categoryTypes` in its returned order. Use each tile's `type` code in the listing URL and later API calls; use `name` as visible text. Do not hardcode type codes such as `attraction`, because admins can add or remove types.
5. Fetch category filters on the listing page, after a type is selected. The landing response deliberately has no `categories` key. Each category filter uses its `slug`, not its `id`. Categories have no image in the public response.
6. For the “All” filter, omit `category` or send `category=all`. This includes published places without a category. For a specific filter, send its slug, for example `category=parks`. Keep `type` in every listing request. Reset `page` to `1` when the type, category, or search changes.
7. Treat all arrays as possibly empty and all documented nullable fields as nullable. Join relative media paths to the API origin. Do not use CMS/admin media URLs for the public site.
8. App promotion title, body, and artwork are static frontend content. Only `appStoreUrl` and `playStoreUrl` come from the API; hide a store button when its URL is `null`.

Navigation flow: a category type tile opens the listing for its `type`. A featured or listing place card opens the detail page using its `slug`. The frontend may choose its own page URLs; the API query values must come from these fields. `featured` is an array, so find a group by its `type` when rendering a specific section.

Example request construction:

```ts
const apiOrigin = 'http://localhost:3333' // configure per environment
const imageUrl = (path: string | null) => path ? new URL(path, apiOrigin).toString() : null
const params = new URLSearchParams({ type: selectedType, category: selectedCategory ?? 'all', page: String(page), perPage: '12', locale })
const response = await fetch(`${apiOrigin}/api/v1/places?${params}`)
if (!response.ok) throw await response.json()
const { data, meta } = await response.json()
```

The code above illustrates URL construction; adapt state and error handling to the frontend framework.

## `GET /api/v1/home?locale=en`

```json
{
  "data": {
    "hero": {
      "eyebrow": "WELCOME TO KUWAIT",
      "title": "Explore Kuwait",
      "image": "/api/v1/media/10"
    },
    "discoveryTitle": "What would you like to do?",
    "categoryTypes": [
      {
        "type": "attraction",
        "name": "Attractions",
        "image": "/api/v1/media/11",
        "order": 0
      }
    ],
    "featured": [
      {
        "type": "attraction",
        "places": [
          {
            "id": 42,
            "slug": "sample-park",
            "type": "attraction",
            "category": "parks",
            "title": "Sample Park",
            "summary": "An example place summary",
            "address": "Kuwait City",
            "cover": { "id": 13, "url": "/api/v1/media/13" }
          }
        ]
      }
    ],
    "app": {
      "appStoreUrl": null,
      "playStoreUrl": null
    }
  }
}
```

This endpoint is only for the first landing page. It does not provide category filters or a paginated list. `featured` is an array of `{ type, places }` groups, one for each current category type. Its places are published entries selected as featured in the CMS. A group's `places` array can be empty. Tile images can be `null`; `app` contains only the two store links.

## `GET /api/v1/categories?type=attraction&locale=en`

```json
{
  "data": [
    { "id": 3, "slug": "parks", "name": "Parks" },
    { "id": 4, "slug": "museums", "name": "Museums" }
  ]
}
```

`type` is required and must be a current `categoryTypes[].type` code. Only active categories of that type appear. Use a category's `slug` in the places filter. Add an “All” option in the frontend; it is not an item in this response.

## `GET /api/v1/places?type=attraction&category=parks&page=1&perPage=12`

```json
{
  "data": [
    {
      "id": 42,
      "slug": "sample-park",
      "type": "attraction",
      "category": "parks",
      "title": "Sample Park",
      "summary": "An example place summary",
      "address": "Kuwait City",
      "cover": { "id": 13, "url": "/api/v1/media/13" }
    }
  ],
  "meta": { "page": 1, "perPage": 12, "total": 1, "lastPage": 1 }
}
```

`type` is required. `category`, `q`, `page`, `perPage`, and `locale` are optional. Omit `category` or pass `category=all` to include every published place of the selected type, including uncategorized places. Pass a category slug such as `parks` to filter. `page` defaults to `1` and must be a positive integer. `perPage` defaults to `12` and must be between `1` and `50`. `q` is a search string up to 80 characters; the current search matches English title and summary. `meta.total` counts matching published places across all pages; `meta.lastPage` is at least `1` even for an empty result. `cover` and `category` can be `null`.

## `GET /api/v1/places/sample-park?locale=en`

```json
{
  "data": {
    "id": 42,
    "slug": "sample-park",
    "type": "attraction",
    "category": "parks",
    "title": "Sample Park",
    "summary": "An example place summary",
    "address": "Kuwait City",
    "cover": { "id": 13, "url": "/api/v1/media/13" },
    "body": "Example place description",
    "hoursNote": null,
    "price": { "mode": "free", "amount": null, "currency": "KWD", "unit": null },
    "coordinates": { "latitude": 29.3759, "longitude": 47.9774 },
    "hours": [
      {
        "weekday": 0,
        "opens_at": "09:00:00",
        "closes_at": "18:00:00",
        "closes_next_day": 0,
        "closed": 0
      }
    ],
    "gallery": [
      { "id": 15, "url": "/api/v1/media/15", "alt": "Example gallery image", "caption": null }
    ],
    "seo": { "title": null, "description": null },
    "cabDestination": { "placeId": 42, "name": "Sample Park" }
  }
}
```

`coordinates` can be `null`; `hours` and `gallery` can be empty. `price.mode` is `unknown`, `free`, `from`, or `fixed`. `price.amount` is a three-decimal string when set. The `hours` keys currently use database-style snake case, and its boolean fields may be returned as database booleans or `0`/`1` depending on the driver. `cabDestination` identifies this place for display; its `placeId` is not a transport location ID.

## Other public endpoints

### `GET /api/v1/site`

```json
{
  "data": {
    "brandName": "The Kuwaiti Experience",
    "contactEmail": null,
    "whatsappAvailable": false,
    "logo": null,
    "appStoreUrl": null,
    "playStoreUrl": null
  }
}
```

### `GET /api/v1/pages/about?locale=en`

```json
{
  "data": {
    "slug": "about",
    "title": "About us",
    "body": "Example page body",
    "seo": { "title": null, "description": null }
  }
}
```

### `GET /api/v1/transport/locations?locale=en`

```json
{
  "data": [
    {
      "id": 7,
      "code": "airport",
      "name": "Kuwait International Airport",
      "pickupEnabled": true,
      "dropoffEnabled": true
    }
  ]
}
```

### `POST /api/v1/transport/enquiry-link`

Request body:

```json
{ "pickupId": 7, "destinationId": 8, "dateTime": "2027-01-15T14:00:00" }
```

Successful response:

```json
{
  "data": {
    "url": "https://wa.me/96512345678?text=Cab%20enquiry%3A%20...",
    "confirmed": false
  }
}
```

The URL opens a WhatsApp enquiry. It does not create a confirmed booking. The example phone number and URL are illustrative.
Offer only locations with `pickupEnabled: true` as pickups and only locations with `dropoffEnabled: true` as destinations. Both request IDs must come from `/transport/locations`, must differ, and must not be taken from a place's `cabDestination.placeId`. Send a future `dateTime` interpreted in the `Asia/Kuwait` time zone. Open the returned `url` for the visitor after a successful response; do not display the enquiry as a confirmed reservation.

### `GET /api/v1/media/13`

Returns WebP image bytes (`Content-Type: image/webp`) rather than JSON. Public media is available only while referenced by public content.

## Error response

For invalid input, unknown type codes, missing content, or content in use, the API returns a non-2xx status and this envelope:

```json
{
  "error": {
    "code": "INVALID_TYPE",
    "message": "Choose a valid place type",
    "requestId": "example-request-id"
  }
}
```

Validation errors can also include `fields`. See [OpenAPI](openapi.yaml) for request parameters and status codes.

## Frontend completion checklist

- Landing page uses `/home` for category type tiles and featured groups, with no separate category type request.
- Listing page uses `/categories` for filters and `/places` for results; “All” includes uncategorized places, and changing filters resets pagination.
- Detail pages use place `slug`; image paths are resolved against the API origin and nullable images have a fallback.
- App store buttons use only the returned links; app promotion copy and artwork remain in the frontend.
- Empty arrays, `null` values, non-2xx errors, and Arabic fallback render without breaking the page.
