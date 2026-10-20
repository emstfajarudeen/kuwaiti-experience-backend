# Postman testing

Import both files using Postman's **Import** control:

- `kuwaitiexperience.postman_collection.json` — 59 requests covering customer/profile/support, Explore/bookmarks and related CMS APIs.
- `local.postman_environment.json` — select **Kuwaiti Experience — Local** after importing.

Set `base_url` to your running backend (default `http://localhost:3333`, without a trailing slash). Start the local server with `npm run dev` if needed. Sample phone numbers are placeholders; replace `phone_e164` and `new_phone_e164` with numbers you control. This collection does not configure the backend or SMS provider.

## Login or registration

1. Fetch Privacy policy and Terms and conditions in folder 01. Successful responses store each page's `content_hash` and actual locale. Approved legal pages must already be published in the CMS; missing/unapproved pages return 404/503.
2. Set `phone_e164`. Send Request login OTP in folder 02.
3. Enter the received four-digit SMS code in `otp_code`, keeping any leading zeros. Send Verify login OTP. Resend is optional and requires the server cooldown to have elapsed.
4. Check the verification response's `next_action`. Send **Existing customer sign in** for `sign_in`, or **Create account** for `create_account`. For registration, set `first_name` and `last_name`, review/accept the legal pages, and optionally replace the request body's `email: null` with an email string. The proof is one use: send only the matching request.
5. Successful login/registration automatically stores `access_token`, `refresh_token` and `customer_id` in the selected environment. Protected customer requests use that access token. Refresh customer session replaces both credentials; old refresh tokens cannot be reused.

**SMS is currently disabled pending provider configuration.** OTP request/resend will return 503, and their success assertion will fail as expected until delivery is configured. The API never returns OTP codes. There is no fixed test code or authentication bypass. To test authenticated requests before SMS is enabled, supply an already valid customer `access_token` (and `refresh_token` for refresh) if one is available.

## Edit Profile

In folder 03, load the profile and save names/email. Omitted fields retain their values; `email: null` clears email. All returned Customer objects are checked against the same DB-key schema by the collection's response script.

For Upload or replace my profile photo, open **Body → form-data** and select an image for `file`. Postman supplies the multipart Content-Type boundary. JPEG/PNG/WebP, maximum 5 MB, is accepted. View my profile photo returns private WebP bytes; use Postman's Preview. The view returns 404 when there is no photo. Upload, replacement and removal save immediately and independently of text edits.

To change a phone in folder 04:

1. Authenticate by OTP within the past 10 minutes. Set `new_phone_e164` to a different, unused number.
2. Request new phone OTP, then enter the received code in `phone_otp_code`.
3. Verify new phone OTP, then Save verified phone, using the same customer session throughout.

Challenge IDs and phone verification proof are stored automatically. Successful save updates the environment's `phone_e164`, consumes the proof and revokes other customer sessions. On 403 `REAUTHENTICATION_REQUIRED`, repeat normal phone sign-in and restart the phone-change flow.

## Contact, CMS and session endings

- Folder 05 offers guest and customer contact submissions. Each successful Send creates a real inbox record and captures `contact_request_id`. Limit: five submissions per IP per hour.
- Folder 06 is optional. Enter your own `admin_email`/`admin_password` and use Admin sign in, or supply an existing admin JWT as `admin_access_token`. CMS credentials are separate from customer tokens. Set `contact_status` to `new`, `in_progress` or `resolved` to filter/update contacts.
- Folders 07–09 cover Explore public browsing, customer bookmarks and CMS feature/movie/showtime management. See the flow below.
- Folder 10 contains logout and permanent account deletion. Send these individually after testing. Logout invalidates the current session; deletion removes the customer and owned data and requires OTP sign-in within the past 10 minutes. Both clear captured customer credentials on success. Use a disposable account for deletion.

## Explore testing

After the required migrations and CMS publication, set `explore_type` and send List places in folder 07 to capture `place_id` and `place_slug`. List theaters captures separate `theater_place_id` and `theater_slug`. Empty lists do not fabricate or replace IDs; choose IDs from your own CMS content if needed. Guest browsing works without OTP. The personalized detail request and folder 08 bookmarks require a valid customer access token.

Folder 09 uses the admin token from folder 06. Create a feature for the selected place type to capture `feature_id`, then save the venue phone/assignment. You can add `check_in_time`/`check_out_time` for stays, `screen_count` for theaters, or `place_hours` intervals to that PATCH body; exact examples are in [explore-api.md](../explore-api.md). Omitted fields remain unchanged. `feature_code` defaults to `family-friendly`; use a unique code if that definition already exists.

For movies, create a draft, select a local poster under Body → form-data → file, upload it, then publish the movie. Create a showtime using a published theater and movie; set `showtime_starts_at` to a **future ISO timestamp with timezone** and `showtime_date` to the matching Kuwait date. Defaults are examples for 21 October 2026 and must be updated when testing on a later day. Successful create requests capture `movie_id` and `showtime_id`. Read Active movies/showtimes in folder 07 after creating the session.

Removal and cancellation examples are individual actions: deleting assigned features or referenced movies returns 409; removing a published movie's poster returns 422. Unassign/archive/remove dependencies as appropriate before using those optional requests. Full collection runs cannot follow all of these alternative branches safely.

Send requests individually. A full Collection Runner run is unsuitable: sign-in and registration are alternative branches, OTP entry and file selection are manual, and the last folder logs out or deletes an account.

Tokens, proofs, OTP codes and the admin password are marked secret in the environment. Do not share populated environment exports; keep the checked-in template empty of credentials. A failing HTTP assertion shows an unmet prerequisite or API error; inspect the response's `error.code` and `error.message`.

Contract details: [customer API](../customer-api.md), [Edit Profile](../customer-profile-api.md), [customer OpenAPI](../customer-openapi.json), [Explore API](../explore-api.md), [Explore OpenAPI](../explore-openapi.json).
