# Notifications: format, types and deep links

How the app should read notifications (push and the in-app list) and which screen to open when one is tapped.

Base URL: `{{base_url}}/api/v2`. All notification APIs need `Authorization: Bearer <customer access token>`.

## Notification types and where to go

Switch on `type`. Use `action_data` for the ids.

| `type` | When it is sent | `action_data` | Open this screen | API to load the screen |
| --- | --- | --- | --- | --- |
| `rental_booking_confirmed` | The booking fee is paid and the rental is confirmed | `{ "type": "rental_booking", "booking_id": 45, "reference": "RN-7K2M9QXA" }` | Rental booking detail | `GET /customer/me/rental-bookings/{booking_id}` |
| `rental_driver_assigned` | The provider assigns a driver to a with-driver booking | `{ "type": "rental_booking", "booking_id": 45, "reference": "RN-7K2M9QXA" }` | Rental booking detail (the driver is in `data.driver`) | `GET /customer/me/rental-bookings/{booking_id}` |
| `contact_request_update` | Staff set a Contact Us request to *in progress* or *resolved* | `{ "screen": "contact_request", "contact_request_id": 18, "status": "resolved" }` | Notification list (see note) | none |
| `general` | Sent by admins from the CMS (announcements, offers) | `null` | Notification list | none |

Notes:

- **`contact_request_update`**: the app has no screen or API for viewing a customer's own contact requests, so open the notification list (or the Contact Us screen if you prefer). `status` is `in_progress` or `resolved`.
- **`general`**: CMS notifications don't have a link yet, so they open the notification list.
- **Unknown `type`** (a newer server may add types): open the notification list. Never crash or ignore the tap.
- The `type` *inside* `action_data` (for example `rental_booking`) isn't the notification type. Always route on the top-level `type`.

## 1. Push payload (FCM)

What the device receives. The visible `notification` part is already in the language the device registered with (`language` on the push token).

```json
{
  "notification": {
    "title": "Rental booking confirmed",
    "body": "Your car rental RN-7K2M9QXA is confirmed. Bring your driving licence and ID at pickup."
  },
  "data": {
    "notification_id": "312",
    "type": "rental_booking_confirmed",
    "title_en": "Rental booking confirmed",
    "body_en": "Your car rental RN-7K2M9QXA is confirmed. Bring your driving licence and ID at pickup.",
    "title_ar": "تم تأكيد حجز السيارة",
    "body_ar": "تم تأكيد حجز السيارة RN-7K2M9QXA. يرجى إحضار رخصة القيادة والهوية عند الاستلام.",
    "action_data": "{\"type\":\"rental_booking\",\"booking_id\":45,\"reference\":\"RN-7K2M9QXA\"}"
  }
}
```

Important for the app:

- **Every value in `data` is a string** (an FCM rule). `notification_id` is `"312"`, so convert it to a number yourself.
- **`action_data` is a JSON string** and must be parsed: `jsonDecode(data['action_data'])`. It's **missing** when there is nothing to open (for example `general`).
- `title_ar` / `body_ar` are missing when the notification has no Arabic text.
- Handle the tap in all three states: app in the foreground (show your own banner, then route on tap), app in the background, and app opened from killed (read the initial message on launch).

## 2. Notification list

`GET /customer/me/notifications?page=1&per_page=20`

Send `Accept-Language: en` or `ar`. `title` and `body` come in that language (falling back to English when there is no Arabic).

```json
{
  "data": [
    {
      "id": 312,
      "type": "rental_booking_confirmed",
      "title": "تم تأكيد حجز السيارة",
      "body": "تم تأكيد حجز السيارة RN-7K2M9QXA. يرجى إحضار رخصة القيادة والهوية عند الاستلام.",
      "title_en": "Rental booking confirmed",
      "body_en": "Your car rental RN-7K2M9QXA is confirmed. Bring your driving licence and ID at pickup.",
      "title_ar": "تم تأكيد حجز السيارة",
      "body_ar": "تم تأكيد حجز السيارة RN-7K2M9QXA. يرجى إحضار رخصة القيادة والهوية عند الاستلام.",
      "action_data": { "type": "rental_booking", "booking_id": 45, "reference": "RN-7K2M9QXA" },
      "created_at": "2026-11-12T09:30:15.000Z",
      "read_at": null
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 1,
    "last_page": 1,
    "unread_count": 1
  }
}
```

Differences from the push:

- `id` is a number (same value as `notification_id` in the push).
- `action_data` is already an **object** (or `null`); there's no need to parse it.
- `read_at: null` means unread. Use `meta.unread_count` for the bell badge.

## 3. Mark as read

| Call | Result |
| --- | --- |
| `PUT /customer/me/notifications/{id}/read` | `200`, `data` = that notification with `read_at` set |
| `PUT /customer/me/notifications/read-all` | Marks every notification read |

When the user taps a notification (from the push or the list), call `PUT …/{id}/read` with that id, then open the screen. Use `notification_id` from the push.

## Suggested tap handling

```text
onNotificationTap(type, actionData, notificationId):
  markRead(notificationId)            // fire and forget
  switch type:
    "rental_booking_confirmed",
    "rental_driver_assigned":
        open RentalBookingDetail(actionData.booking_id)
    "contact_request_update",
    "general",
    default:
        open NotificationList
```

If the user isn't logged in when they tap (logged out after the push arrived), open login first, then continue to the screen.

If the booking API returns `404` (for example the user logged in with a different account), show the notification list instead.
