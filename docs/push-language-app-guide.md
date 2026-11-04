# Push notification language: what the app must do

The server sends each push in the language the device last told it. You do two things.

## 1. Tell the server the language

When you register the FCM token, add `language` (`"en"` or `"ar"`):

```http
POST /api/v2/customer/me/push-tokens
Authorization: Bearer <access_token>
```

```json
{ "token": "<fcm-token>", "platform": "android", "device_id": "<install-id>", "language": "ar" }
```

The response contains `data.id`. Keep it; it is the id of this device on the server.

Register again (with `language`) after sign-in, when Firebase rotates the token, and on app start if you no longer have the id.

## 2. Update it when the user changes language

```http
PATCH /api/v2/customer/me/push-tokens/<id>
Authorization: Bearer <access_token>
```

```json
{ "language": "en" }
```

Use the `id` from step 1. Success is `200` with the same record. `404` means the server no longer has that device, so register the token again. Other values than `en` or `ar` return `422`.

## What the user then receives

| Notification has | Device language | Push shows |
| --- | --- | --- |
| Arabic and English text | `ar` | Arabic |
| Arabic and English text | `en` | English |
| English text only | `ar` or `en` | English |

A device that never sends a language gets English.

## Inbox and foreground messages

- The inbox list returns `title` and `body` (always English) and `title_ar` and `body_ar` (`null` when there is no Arabic). Show the Arabic pair when the app is in Arabic and both are not empty; otherwise show the English pair.
- The push `data` always has `title_en`, `body_en` and, when present, `title_ar`, `body_ar`. A foreground handler can choose from them.

## Checklist

- [ ] Send `language` when registering the token.
- [ ] Call `PATCH` when the user changes the app language.
- [ ] Test on one Arabic and one English device with the same account: each gets its own language.

Full reference: `docs/mobile-config-and-push-integration.md` (section 5, "Push language").
