# Frontend migration: image URLs changed

The backend removed the shared media library. Images are now stored directly on
the record that uses them, so **image URLs no longer contain a numeric media
id**. This note covers that older v1 migration and the current v2 settings
contract. For new website footer work, use the [website API reference](website-api-reference.md).

## TL;DR

| Was                                                                   | Now                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/v1/media/{id}`                                              | `GET /api/v1/images/{key}`                                                          |
| `cover: { id, url }`                                                  | `cover: { url }` (no `id`)                                                          |
| `hero.image`, `logo`, `categoryTypes[].image` as `/api/v1/media/{id}` | same fields, now `/api/v1/images/{key}`                                             |
| gallery item `id` = media id                                          | gallery item `id` = gallery row id (still present)                                  |
| `/api/v2/site` → `logo_media_id` (number)                             | `/api/v2/site` → `logo_image_key` (stored key or null); public URL in `meta.images` |

**Golden rule:** use the URL string the API gives you, including v2
`meta.images[].url`. Never build an image URL yourself from an id. If you were doing
`` `${API}/api/v1/media/${cover.id}` ``, stop doing that and use `cover.url`.

`{key}` looks like `b1b9f0c2-2c3a-4e6a-9f1e-2a1d7c4e5f90.webp`. Treat it as an
opaque string.

## Image delivery endpoint

- Old: `GET /api/v1/media/{id}` returned the WebP bytes.
- New: `GET /api/v1/images/{key}` returns the WebP bytes.
- Unchanged: `Content-Type: image/webp`, `Cache-Control: public, max-age=60`,
  and an image is served only while it belongs to visible (published) content.
  A hidden or unknown image returns `404`.

You rarely call this directly: the URL already appears in the responses below or in v2 image metadata.
Prefix it with the API origin when the field is a path (the public endpoints
return absolute paths beginning with `/api/v1/images/...`).

## Public endpoints (`/api/v1`)

### `GET /api/v1/home`

- `data.hero.image`: still a string URL or `null`. Path format changed only.
- `data.categoryTypes[].image`: still a string URL or `null`. Path format changed only.
- `data.featured[].places[].cover`: see the place card change below.

```jsonc
{
  "data": {
    "hero": { "eyebrow": "...", "title": "...", "image": "/api/v1/images/<key>.webp" },
    "categoryTypes": [
      {
        "type": "attraction",
        "name": "Attractions",
        "image": "/api/v1/images/<key>.webp",
        "order": 0,
      },
    ],
    "featured": [{ "type": "attraction", "places": [/* place cards, see below */] }],
  },
}
```

### `GET /api/v1/site`

- `data.logo`: string URL or `null`. Path format changed only.

### `GET /api/v1/places` and place cards everywhere

The `cover` object **lost its `id` field**.

```jsonc
// Before
"cover": { "id": 13, "url": "/api/v1/media/13" }
// After
"cover": { "url": "/api/v1/images/<key>.webp" }   // or null
```

The rest of the card (`id`, `slug`, `type`, `category`, `title`, `summary`,
`address`) and the pagination `meta` are unchanged.

### `GET /api/v1/places/{slug}`

- `data.cover`: same change as the card above (`{ url }`, no `id`).
- `data.gallery[]`: still `{ id, url, alt, caption }`.
  - `url` path format changed.
  - `id` is **still present** but now it is the gallery row id, not a media id.
    Keep using it only as a list key; it is not a media reference.

```jsonc
"gallery": [
  { "id": 15, "url": "/api/v1/images/<key>.webp", "alt": "Example", "caption": null }
]
```

Everything else on the place detail (body, price, coordinates, hours, seo,
cabDestination) is unchanged.

## Mobile endpoint (`/api/v2`)

### `GET /api/v2/site`

- Removed: `logo_media_id` (was a number or `null`).
- Added: `logo_image_key` (the stored image key or `null`) and
  `meta.images` (an array of `{ storage_key, url }` entries).

```jsonc
// Before
{ "data": { "...": "...", "logo_media_id": 7 } }
// After
{ "data": { "...": "...", "logo_image_key": "<key>.webp" }, "meta": { "images": [{ "storage_key": "<key>.webp", "url": "/api/v1/images/<key>.webp" }] } }
```

Find the `meta.images` entry matching `data.logo_image_key` and use its `url`.
The array is empty when no logo is configured. Do not construct a media URL
from the key or an id.

## Frontend checklist

1. Search the codebase for `/api/v1/media` and remove any manual URL building.
   Replace with the URL string already in the response.
2. Place cover: read `cover?.url`. Remove any use of `cover.id`. Handle
   `cover === null` (no image).
3. Gallery: keep reading `url`, `alt`, `caption`. If you used the item `id` as a
   media reference, stop; use it only as a React/list key if needed.
4. v1 Home hero, site logo, category type tile: read the field value as-is
   (`image` / `logo`), a ready URL or `null`.
5. For current `/api/v2/site`, use `logo_image_key` and its matching
   `meta.images[].url` entry. The v2 public and admin reads share this shape.
6. If your HTTP layer joins relative paths to the API origin, no change is
   needed beyond the field renames: the paths still start with `/api/v1/...`.

## What did NOT change

Titles, summaries, bodies, prices, currency, coordinates, opening hours, SEO,
category lists, pages, transport locations, pagination `meta`, locale behavior,
and all auth flows are unchanged. Only the image fields listed above changed.
