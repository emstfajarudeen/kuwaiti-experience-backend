-- Read-only check: why does a vehicle not show in the app's car search?
-- Run on the server database, for example:
--   mysql -u <user> -p <database> < scripts/diagnose_rental_search.sql
-- Change the vehicle name and the pickup time below. The pickup time is in Kuwait time,
-- because branch hours are checked in Kuwait time.

SET @vehicle := '%Swift%';
SET @pickup_kuwait := '2026-11-12 15:30:00';

-- 1. The vehicle and its provider. Every column must be "yes" for the car to be listed.
SELECT
  v.id,
  v.name_en,
  v.vehicle_type,
  t.code IS NOT NULL                       AS type_exists,
  v.status = 'published'                   AS is_published,
  v.published_at <= NOW()                  AS publish_time_passed,
  v.published_at,
  NOW()                                    AS db_now,
  p.name_en                                AS provider,
  p.active                                 AS provider_on,
  v.self_drive_available                   AS self_drive,
  v.with_driver_available                  AS with_driver,
  v.quantity                               AS units
FROM rental_vehicles v
JOIN rental_providers p ON p.id = v.provider_id
LEFT JOIN rental_vehicle_types t ON t.code = v.vehicle_type
WHERE v.name_en LIKE @vehicle;

-- 2. The branches the vehicle is linked to, and whether each one is open at the pickup time.
--    The app's pickup place must match one of these branches' places.
SELECT
  v.name_en                                AS vehicle,
  l.id                                     AS branch_id,
  l.name_en                                AS branch,
  l.active                                 AS branch_on,
  pl.id                                    AS place_id,
  pl.name_en                               AS place,
  pl.active                                AS place_on,
  l.hours_enabled,
  (SELECT GROUP_CONCAT(CONCAT(h.opens_at, '-', h.closes_at))
     FROM rental_location_hours h
    WHERE h.location_id = l.id
      AND h.weekday = DAYOFWEEK(@pickup_kuwait) - 1) AS hours_on_pickup_day,
  (l.hours_enabled = 0 OR EXISTS (
     SELECT 1 FROM rental_location_hours h
      WHERE h.location_id = l.id
        AND h.weekday = DAYOFWEEK(@pickup_kuwait) - 1
        AND h.opens_at <= DATE_FORMAT(@pickup_kuwait, '%H:%i')
        AND h.closes_at >= DATE_FORMAT(@pickup_kuwait, '%H:%i')))  AS open_at_pickup,
  EXISTS (
     SELECT 1 FROM rental_location_closures c
      WHERE c.location_id = l.id
        AND c.starts_on <= DATE(@pickup_kuwait)
        AND c.ends_on >= DATE(@pickup_kuwait))                     AS closed_that_day
FROM rental_vehicles v
LEFT JOIN rental_vehicle_locations vl ON vl.vehicle_id = v.id
LEFT JOIN rental_locations l ON l.id = vl.location_id
LEFT JOIN rental_places pl ON pl.id = l.place_id
WHERE v.name_en LIKE @vehicle;

-- 3. Bookings that hold a unit (confirmed, or unpaid holds that have not expired).
SELECT b.id, b.status, b.pickup_at, b.return_at, b.hold_expires_at
FROM rental_bookings b
JOIN rental_vehicles v ON v.id = b.vehicle_id
WHERE v.name_en LIKE @vehicle
  AND (b.status = 'confirmed' OR (b.status = 'pending_payment' AND b.hold_expires_at > NOW()));

-- 4. The pickup places the app can choose from.
SELECT id, name_en, active FROM rental_places ORDER BY sort_order, id;
