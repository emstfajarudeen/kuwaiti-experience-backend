import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import {
  authThrottle,
  enquiryThrottle,
  customerAuthThrottle,
  contactThrottle,
  customerPhotoThrottle,
  bookmarkThrottle,
  videoActionThrottle,
  videoCommentThrottle,
  customerAddressThrottle,
  customerNotificationThrottle,
  notificationBroadcastThrottle,
  pushConnectionCheckThrottle,
  passwordResetRequestThrottle,
  passwordResetConfirmThrottle,
  rentalBookingThrottle,
  rentalPaymentWebhookThrottle,
} from '#start/limiter'

const AuthController = () => import('#controllers/api/auth_controller')
const CustomerAuthController = () => import('#controllers/api/customer_auth_controller')
const CustomerProfileController = () => import('#controllers/api/customer_profile_controller')
const CustomerAddressesController = () => import('#controllers/api/customer_addresses_controller')
const CustomerNotificationsController = () =>
  import('#controllers/api/customer_notifications_controller')
const CustomerSupportController = () => import('#controllers/api/customer_support_controller')
const AppConfigController = () => import('#controllers/api/app_config_controller')
const AdminAppConfigController = () => import('#controllers/admin/app_config_controller')
const AdminContactsController = () => import('#controllers/api/admin_contacts_controller')
const ContactsController = () => import('#controllers/admin/contacts_controller')
const PublicController = () => import('#controllers/api/public_controller')
const VideosController = () => import('#controllers/api/videos_controller')
const AdminVideosController = () => import('#controllers/admin/videos_controller')
const ExploreController = () => import('#controllers/api/explore_controller')
const HomeController = () => import('#controllers/api/home_controller')
const RentalsController = () => import('#controllers/api/rentals_controller')
const AdminRentalsController = () => import('#controllers/admin/rentals_controller')
const AdminHomeController = () => import('#controllers/api/admin_home_controller')
const AdminExploreController = () => import('#controllers/api/admin_explore_controller')
const ExplorePageController = () => import('#controllers/admin/explore_controller')
const ImagesController = () => import('#controllers/api/images_controller')
const AdminPlacesController = () => import('#controllers/api/admin_places_controller')
const AdminCategoriesController = () => import('#controllers/api/admin_categories_controller')
const AdminCategoryTypesController = () =>
  import('#controllers/api/admin_category_types_controller')
const AdminPagesController = () => import('#controllers/api/admin_pages_controller')
const AdminSiteController = () => import('#controllers/api/admin_site_controller')
const AdminLocationsController = () => import('#controllers/api/admin_locations_controller')
const AdminAuthController = () => import('#controllers/admin/auth_controller')
const AdminDashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminPlacesPageController = () => import('#controllers/admin/places_controller')
const AdminAddressSearchController = () => import('#controllers/admin/address_search_controller')
const AdminCategoriesPageController = () => import('#controllers/admin/categories_controller')
const AdminCategoryTypesPageController = () =>
  import('#controllers/admin/category_types_controller')
const AdminCountriesPageController = () => import('#controllers/admin/countries_controller')
const AdminSaveSuccessController = () => import('#controllers/admin/save_success_controller')
const AdminPagesPageController = () => import('#controllers/admin/pages_controller')
const AdminSitePageController = () => import('#controllers/admin/site_controller')
const AdminUsersController = () => import('#controllers/admin/users_controller')
const AdminCustomersController = () => import('#controllers/admin/customers_controller')
const AdminRolesController = () => import('#controllers/admin/roles_controller')
const AdminActivityLogsController = () => import('#controllers/admin/activity_logs_controller')
const AdminNotificationsController = () => import('#controllers/admin/notifications_controller')

router.get('/', ({ response }) => response.redirect('/admin'))
router.get('/admin/login', [AdminAuthController, 'showLogin'])
router.post('/admin/login', [AdminAuthController, 'login']).use(authThrottle)
router.post('/admin/refresh', [AdminAuthController, 'refresh']).use(authThrottle)
router.get('/admin/forgot-password', [AdminAuthController, 'showForgotPassword'])
router
  .post('/admin/forgot-password', [AdminAuthController, 'requestPasswordReset'])
  .use(passwordResetRequestThrottle)
router.get('/admin/reset-password', [AdminAuthController, 'showResetPassword'])
router
  .post('/admin/reset-password', [AdminAuthController, 'resetPassword'])
  .use(passwordResetConfirmThrottle)
router
  .group(() => {
    router.get('/', [AdminDashboardController, 'index'])
    router.get('/contact-requests', [ContactsController, 'index'])
    router.get('/contact-requests/:id', [ContactsController, 'show'])
    router.post('/contact-requests/:id/status', [ContactsController, 'update'])
    router.post('/logout', [AdminAuthController, 'logout'])
    router.get('/:resource/saved', [AdminSaveSuccessController, 'show'])
    router.get('/places', [AdminPlacesPageController, 'index'])
    router.get('/places/new', [AdminPlacesPageController, 'create'])
    router.get('/places/address-search', [AdminAddressSearchController, 'search'])
    router.get('/places/address-reverse', [AdminAddressSearchController, 'reverse'])
    router.post('/places', [AdminPlacesPageController, 'save']).as('cms.places.create')
    router.get('/places/:id/edit', [AdminPlacesPageController, 'edit'])
    router
      .get('/places/:id/explore', [ExplorePageController, 'place'])
      .as('explore.ExplorePageController.get.places_id_explore')
    router
      .post('/places/:id/explore', [ExplorePageController, 'savePlace'])
      .as('explore.ExplorePageController.post.places_id_explore')
    router.get('/account', [AdminAuthController, 'account'])
    router.post('/account/password', [AdminAuthController, 'password'])
    router.get('/customers', [AdminCustomersController, 'index'])
    router.get('/customers/:id/photo', [AdminCustomersController, 'photo'])
    router.post('/customers/:id/status', [AdminCustomersController, 'updateStatus'])
    router.get('/notifications', [AdminNotificationsController, 'index'])
    router
      .post('/notifications', [AdminNotificationsController, 'send'])
      .use(notificationBroadcastThrottle)
    router
      .post('/notifications/check-connection', [AdminNotificationsController, 'checkConnection'])
      .use(pushConnectionCheckThrottle)
    router.get('/videos', [AdminVideosController, 'index'])
    router.get('/videos/new', [AdminVideosController, 'create'])
    router.get('/videos/reports', [AdminVideosController, 'reports'])
    router
      .get('/videos/address-search', [AdminAddressSearchController, 'search'])
      .as('cms.videos.address_search')
    router
      .get('/videos/address-reverse', [AdminAddressSearchController, 'reverse'])
      .as('cms.videos.address_reverse')
    router.post('/videos/reports/:id/status', [AdminVideosController, 'updateReport'])
    router.post('/videos/comments/:id/status', [AdminVideosController, 'updateComment'])
    router.get('/video-files/:key', [VideosController, 'adminFile'])
    router.post('/videos', [AdminVideosController, 'save']).as('cms.videos.create')
    router.get('/videos/:id/edit', [AdminVideosController, 'edit'])
    router.post('/videos/:id/save', [AdminVideosController, 'save']).as('cms.videos.update')
    router.post('/videos/:id/status', [AdminVideosController, 'updateStatus'])
    router.post('/videos/:id/delete', [AdminVideosController, 'destroy'])
    router.get('/rentals/bookings', [AdminRentalsController, 'bookings'])
    router.get('/rentals/bookings/:id', [AdminRentalsController, 'booking'])
    router.post('/rentals/bookings/:id/complete', [AdminRentalsController, 'completeBooking'])
    router.post('/rentals/bookings/:id/cancel', [AdminRentalsController, 'cancelBooking'])
    router.post('/rentals/bookings/:id/refund', [AdminRentalsController, 'refundBooking'])
    router.post('/rentals/bookings/:id/verify-payment', [AdminRentalsController, 'verifyPayment'])
    router.post('/rentals/bookings/:id/provider-email', [
      AdminRentalsController,
      'sendProviderEmail',
    ])
    router.get('/rentals/reviews', [AdminRentalsController, 'reviews'])
    router.post('/rentals/reviews/:id/status', [AdminRentalsController, 'reviewStatus'])
    router.post('/rentals/reviews/:id/delete', [AdminRentalsController, 'deleteReview'])
    router.get('/rentals/vehicles', [AdminRentalsController, 'vehicles'])
    router.get('/rentals/vehicles/new', [AdminRentalsController, 'newVehicle'])
    router
      .post('/rentals/vehicles', [AdminRentalsController, 'saveVehicle'])
      .as('cms.rentalVehicles.create')
    router.get('/rentals/vehicles/:id/edit', [AdminRentalsController, 'editVehicle'])
    router
      .post('/rentals/vehicles/:id/save', [AdminRentalsController, 'saveVehicle'])
      .as('cms.rentalVehicles.update')
    router.post('/rentals/vehicles/:id/status', [AdminRentalsController, 'vehicleStatus'])
    router.post('/rentals/vehicles/:id/delete', [AdminRentalsController, 'deleteVehicle'])
    router.get('/rentals/providers', [AdminRentalsController, 'providers'])
    router.get('/rentals/providers/new', [AdminRentalsController, 'newProvider'])
    router
      .post('/rentals/providers', [AdminRentalsController, 'saveProvider'])
      .as('cms.rentalProviders.create')
    router.get('/rentals/providers/:id/edit', [AdminRentalsController, 'editProvider'])
    router
      .post('/rentals/providers/:id/save', [AdminRentalsController, 'saveProvider'])
      .as('cms.rentalProviders.update')
    router.post('/rentals/providers/:id/status', [AdminRentalsController, 'providerStatus'])
    router.post('/rentals/providers/:id/delete', [AdminRentalsController, 'deleteProvider'])
    router
      .get('/rentals/address-search', [AdminAddressSearchController, 'search'])
      .as('cms.rentals.address_search')
    router
      .get('/rentals/address-reverse', [AdminAddressSearchController, 'reverse'])
      .as('cms.rentals.address_reverse')
    router.get('/rentals/locations', [AdminRentalsController, 'locations'])
    router.get('/rentals/locations/new', [AdminRentalsController, 'newLocation'])
    router
      .post('/rentals/locations', [AdminRentalsController, 'saveLocation'])
      .as('cms.rentalLocations.create')
    router.get('/rentals/locations/:id/edit', [AdminRentalsController, 'editLocation'])
    router
      .post('/rentals/locations/:id/save', [AdminRentalsController, 'saveLocation'])
      .as('cms.rentalLocations.update')
    router.post('/rentals/locations/:id/status', [AdminRentalsController, 'locationStatus'])
    router.post('/rentals/locations/:id/delete', [AdminRentalsController, 'deleteLocation'])
    router.get('/rentals/settings', [AdminRentalsController, 'settings'])
    router.post('/rentals/settings', [AdminRentalsController, 'saveSettings'])
    router.get('/users', [AdminUsersController, 'index'])
    router.get('/users/new', [AdminUsersController, 'create'])
    router.post('/users', [AdminUsersController, 'save']).as('cms.users.create')
    router.get('/users/:id/edit', [AdminUsersController, 'edit'])
    router.post('/users/:id/save', [AdminUsersController, 'save']).as('cms.users.update')
    router.post('/users/:id/send-reset', [AdminUsersController, 'sendReset'])
    router.post('/users/:id/delete', [AdminUsersController, 'destroy'])
    router.get('/roles', [AdminRolesController, 'index'])
    router.get('/roles/new', [AdminRolesController, 'create'])
    router.post('/roles', [AdminRolesController, 'store'])
    router.get('/roles/:id', [AdminRolesController, 'show'])
    router.get('/roles/:id/edit', [AdminRolesController, 'edit'])
    router.post('/roles/:id/save', [AdminRolesController, 'update'])
    router.post('/roles/:id/delete', [AdminRolesController, 'destroy'])
    router.post('/places/:id/save', [AdminPlacesPageController, 'save']).as('cms.places.update')
    router.post('/places/:id/publish', [AdminPlacesPageController, 'publish'])
    router.post('/places/:id/archive', [AdminPlacesPageController, 'archive'])
    router.post('/places/:id/delete', [AdminPlacesPageController, 'destroy'])
    router.get('/categories', [AdminCategoriesPageController, 'index'])
    router.get('/categories/new', [AdminCategoriesPageController, 'create'])
    router.get('/categories/:id/edit', [AdminCategoriesPageController, 'edit'])
    router.post('/categories', [AdminCategoriesPageController, 'save']).as('cms.categories.create')
    router
      .post('/categories/:id/save', [AdminCategoriesPageController, 'save'])
      .as('cms.categories.update')
    router.post('/categories/:id/delete', [AdminCategoriesPageController, 'destroy'])
    router.get('/category-types', [AdminCategoryTypesPageController, 'index'])
    router.get('/category-types/new', [AdminCategoryTypesPageController, 'create'])
    router.get('/category-types/:code/edit', [AdminCategoryTypesPageController, 'edit'])
    router
      .post('/category-types', [AdminCategoryTypesPageController, 'save'])
      .as('cms.categoryTypes.create')
    router
      .post('/category-types/:code/save', [AdminCategoryTypesPageController, 'save'])
      .as('cms.categoryTypes.update')
    router.post('/category-types/:code/delete', [AdminCategoryTypesPageController, 'destroy'])
    router.get('/countries', [AdminCountriesPageController, 'index'])
    router.get('/countries/new', [AdminCountriesPageController, 'create'])
    router.get('/countries/:code/edit', [AdminCountriesPageController, 'edit'])
    router.post('/countries', [AdminCountriesPageController, 'save']).as('cms.countries.create')
    router
      .post('/countries/:code/save', [AdminCountriesPageController, 'save'])
      .as('cms.countries.update')
    router.post('/countries/:code/status', [AdminCountriesPageController, 'updateStatus'])
    router.post('/countries/:code/delete', [AdminCountriesPageController, 'destroy'])
    router.get('/pages', [AdminPagesPageController, 'index'])
    router.get('/pages/new', [AdminPagesPageController, 'edit']).as('cms.pages.new')
    router.post('/pages', [AdminPagesPageController, 'save']).as('cms.pages.create')
    router.get('/pages/:id/edit', [AdminPagesPageController, 'edit']).as('cms.pages.edit')
    router.post('/pages/:id/save', [AdminPagesPageController, 'save']).as('cms.pages.update')
    router.post('/pages/:id/publish', [AdminPagesPageController, 'publish'])
    router.post('/pages/:id/archive', [AdminPagesPageController, 'archive'])
    router.post('/pages/:id/delete', [AdminPagesPageController, 'destroy'])
    router.get('/images/:key', [ImagesController, 'adminShow']).as('cms.images.show')
    router.get('/home', [AdminSitePageController, 'home'])
    router.post('/home', [AdminSitePageController, 'saveHome'])
    router.get('/settings', [AdminSitePageController, 'settings'])
    router.post('/settings', [AdminSitePageController, 'saveSettings'])
    router.get('/app-config', [AdminAppConfigController, 'show'])
    router.post('/app-config', [AdminAppConfigController, 'update'])
    router.get('/activity-logs', [AdminActivityLogsController, 'index'])
    router.get('/transport', ({ response }) => response.redirect('/admin'))
    router.get('/place-features', ({ response }) => response.redirect('/admin'))
    router.get('/place-features/:id/edit', ({ response }) => response.redirect('/admin'))
  })
  .prefix('/admin')
  .use(middleware.jwtAdmin())
  .use(middleware.adminAuthorization())
router.get('/api/v1/health', () => ({ data: { status: 'ok' } }))
router
  .group(() => {
    router.get('/home', [PublicController, 'home'])
    router.get('/site', [PublicController, 'site'])
    router.get('/categories', [PublicController, 'categories'])
    router.get('/places', [PublicController, 'places'])
    router.get('/places/:slug', [PublicController, 'place'])
    router.get('/pages/:slug', [PublicController, 'page'])
    router.get('/transport/locations', [PublicController, 'locations'])
    router.post('/transport/enquiry-link', [PublicController, 'enquiry']).use(enquiryThrottle)
    router.get('/images/:key', [ImagesController, 'show'])
    router.get('/video-files/:key', [VideosController, 'file'])
  })
  .prefix('/api/v1')

router
  .group(() => {
    router.post('/auth/login', [AuthController, 'login']).use(authThrottle)
    router.post('/auth/refresh', [AuthController, 'refresh']).use(authThrottle)
    router
      .group(() => {
        router.get('/auth/me', [AuthController, 'me'])
        router.post('/auth/logout', [AuthController, 'logout'])
        router.patch('/auth/password', [AuthController, 'password'])
        router.get('/images/:key', [ImagesController, 'adminShow']).as('admin.images.show')
        router.get('/dashboard', [AdminSiteController, 'dashboard'])
        router.get('/places', [AdminPlacesController, 'index'])
        router.post('/places', [AdminPlacesController, 'store'])
        router.get('/places/:id', [AdminPlacesController, 'show'])
        router.get('/places/:id/preview', [AdminPlacesController, 'preview'])
        router.put('/places/:id', [AdminPlacesController, 'update'])
        router.post('/places/:id/publish', [AdminPlacesController, 'publish'])
        router.post('/places/:id/archive', [AdminPlacesController, 'archive'])
        router.delete('/places/:id', [AdminPlacesController, 'destroy'])
        router.put('/places/:id/cover', [AdminPlacesController, 'updateCover'])
        router.delete('/places/:id/cover', [AdminPlacesController, 'removeCover'])
        router.post('/places/:id/gallery', [AdminPlacesController, 'addGalleryImages'])
        router.patch('/places/:id/gallery/:imageId', [AdminPlacesController, 'updateGalleryImage'])
        router.delete('/places/:id/gallery/:imageId', [AdminPlacesController, 'removeGalleryImage'])
        router.get('/categories', [AdminCategoriesController, 'index'])
        router.get('/category-types', [AdminCategoryTypesController, 'index'])
        router.post('/category-types', [AdminCategoryTypesController, 'store'])
        router.put('/category-types/:code', [AdminCategoryTypesController, 'update'])
        router.delete('/category-types/:code', [AdminCategoryTypesController, 'destroy'])
        router.put('/category-types/:code/image', [AdminCategoryTypesController, 'updateImage'])
        router.delete('/category-types/:code/image', [AdminCategoryTypesController, 'removeImage'])
        router.post('/categories', [AdminCategoriesController, 'store'])
        router.put('/categories/:id', [AdminCategoriesController, 'update'])
        router.delete('/categories/:id', [AdminCategoriesController, 'destroy'])
        router.get('/pages', [AdminPagesController, 'index'])
        router.post('/pages', [AdminPagesController, 'store'])
        router.get('/pages/:id', [AdminPagesController, 'show'])
        router.put('/pages/:id', [AdminPagesController, 'update'])
        router.post('/pages/:id/publish', [AdminPagesController, 'publish'])
        router.post('/pages/:id/archive', [AdminPagesController, 'archive'])
        router.delete('/pages/:id', [AdminPagesController, 'destroy'])
        router.get('/settings', [AdminSiteController, 'settings'])
        router.patch('/settings', [AdminSiteController, 'updateSettings'])
        router.get('/home', [AdminSiteController, 'home'])
        router.patch('/home', [AdminSiteController, 'updateHome'])
        router.put('/settings/logo', [AdminSiteController, 'updateLogo'])
        router.delete('/settings/logo', [AdminSiteController, 'removeLogo'])
        router.put('/home/hero-image', [AdminSiteController, 'updateHeroImage'])
        router.delete('/home/hero-image', [AdminSiteController, 'removeHeroImage'])
        router.get('/transport/locations', [AdminLocationsController, 'index'])
        router.post('/transport/locations', [AdminLocationsController, 'store'])
        router.put('/transport/locations/:id', [AdminLocationsController, 'update'])
        router.delete('/transport/locations/:id', [AdminLocationsController, 'destroy'])
      })
      .use(middleware.jwtAdmin())
      .use(middleware.adminAuthorization())
  })
  .prefix('/api/v1/admin')

// Mobile's database-key contract is versioned to preserve existing v1 clients.
router
  .group(() => {
    router.get('/home', [HomeController, 'show']).as('v2.home.show')
    router.get('/explore', [ExploreController, 'hub']).as('explore.ExploreController.get.explore')
    router
      .get('/categories', [ExploreController, 'categories'])
      .as('explore.ExploreController.get.categories')
    router
      .get('/place-features', [ExploreController, 'features'])
      .as('explore.ExploreController.get.place_features')
    router.get('/places', [ExploreController, 'places']).as('explore.ExploreController.get.places')
    router
      .get('/places/:slug/showtimes', [ExploreController, 'showtimes'])
      .as('explore.ExploreController.get.places_slug_showtimes')
    router
      .get('/places/:slug', [ExploreController, 'place'])
      .as('explore.ExploreController.get.places_slug')
    router.get('/videos', [VideosController, 'index'])
    router.get('/videos/report-reasons', [VideosController, 'reasons'])
    router.get('/videos/:id', [VideosController, 'show'])
    router.get('/videos/:id/comments', [VideosController, 'comments'])
    router.get('/rentals/options', [RentalsController, 'options'])
    router.get('/rentals/locations', [RentalsController, 'locations'])
    router.get('/rentals/vehicles', [RentalsController, 'vehicles'])
    router.get('/rentals/vehicles/:id', [RentalsController, 'vehicle'])
    router.get('/rentals/vehicles/:id/quote', [RentalsController, 'quote'])
    router.get('/rentals/vehicles/:id/reviews', [RentalsController, 'vehicleReviews'])
    router.get('/rentals/providers/:id/reviews', [RentalsController, 'providerReviews'])
    router.get('/rentals/payments/callback', [RentalsController, 'callback'])
    router
      .post('/rentals/payments/webhook', [RentalsController, 'webhook'])
      .use(rentalPaymentWebhookThrottle)
    router.post('/customer/auth/otp', [CustomerAuthController, 'request']).use(customerAuthThrottle)
    router
      .post('/customer/auth/otp/:id/resend', [CustomerAuthController, 'resend'])
      .use(customerAuthThrottle)
    router
      .post('/customer/auth/otp/:id/verify', [CustomerAuthController, 'verify'])
      .use(customerAuthThrottle)
    router
      .post('/customer/auth/session', [CustomerAuthController, 'session'])
      .use(customerAuthThrottle)
    router.post('/customers', [CustomerAuthController, 'register']).use(customerAuthThrottle)
    router
      .post('/customer/auth/refresh', [CustomerAuthController, 'refresh'])
      .use(customerAuthThrottle)
    router
      .group(() => {
        router.get('/customer/me', [CustomerAuthController, 'me'])
        router
          .post('/customer/me/push-tokens', [CustomerNotificationsController, 'registerToken'])
          .use(customerNotificationThrottle)
        router
          .patch('/customer/me/push-tokens/:id', [CustomerNotificationsController, 'updateToken'])
          .use(customerNotificationThrottle)
        router
          .delete('/customer/me/push-tokens/:id', [CustomerNotificationsController, 'removeToken'])
          .use(customerNotificationThrottle)
        router.get('/customer/me/notifications', [CustomerNotificationsController, 'index'])
        router
          .put('/customer/me/notifications/read-all', [
            CustomerNotificationsController,
            'markAllRead',
          ])
          .use(customerNotificationThrottle)
        router
          .put('/customer/me/notifications/:id/read', [CustomerNotificationsController, 'markRead'])
          .use(customerNotificationThrottle)
        router.get('/customer/me/saved-addresses', [CustomerAddressesController, 'index'])
        router.get('/customer/me/saved-addresses/:id', [CustomerAddressesController, 'show'])
        router
          .post('/customer/me/saved-addresses', [CustomerAddressesController, 'store'])
          .use(customerAddressThrottle)
        router
          .put('/customer/me/saved-addresses/:id', [CustomerAddressesController, 'update'])
          .use(customerAddressThrottle)
        router
          .delete('/customer/me/saved-addresses/:id', [CustomerAddressesController, 'destroy'])
          .use(customerAddressThrottle)
        router
          .get('/customer/me/saved-places', [ExploreController, 'saved'])
          .as('explore.ExploreController.get.customer_me_saved_places')
        router
          .put('/customer/me/saved-places/:id', [ExploreController, 'save'])
          .use(bookmarkThrottle)
        router
          .delete('/customer/me/saved-places/:id', [ExploreController, 'unsave'])
          .use(bookmarkThrottle)
        router.get('/customer/me/saved-videos', [VideosController, 'saved'])
        router
          .put('/customer/me/saved-videos/:id', [VideosController, 'save'])
          .use(videoActionThrottle)
        router
          .delete('/customer/me/saved-videos/:id', [VideosController, 'unsave'])
          .use(videoActionThrottle)
        router.put('/videos/:id/like', [VideosController, 'like']).use(videoActionThrottle)
        router.delete('/videos/:id/like', [VideosController, 'unlike']).use(videoActionThrottle)
        router.post('/videos/:id/share', [VideosController, 'share']).use(videoActionThrottle)
        router
          .post('/videos/:id/comments', [VideosController, 'addComment'])
          .use(videoCommentThrottle)
        router
          .delete('/video-comments/:id', [VideosController, 'deleteComment'])
          .use(videoActionThrottle)
        router
          .put('/video-comments/:id/like', [VideosController, 'likeComment'])
          .use(videoActionThrottle)
        router
          .delete('/video-comments/:id/like', [VideosController, 'unlikeComment'])
          .use(videoActionThrottle)
        router.post('/videos/:id/report', [VideosController, 'report']).use(videoCommentThrottle)
        router.get('/customer/me/rental-bookings', [RentalsController, 'index'])
        router.get('/customer/me/rental-bookings/:id', [RentalsController, 'show'])
        router
          .post('/customer/me/rental-bookings', [RentalsController, 'store'])
          .use(rentalBookingThrottle)
        router
          .post('/customer/me/rental-bookings/:id/cancel', [RentalsController, 'cancel'])
          .use(rentalBookingThrottle)
        router
          .put('/customer/me/rental-bookings/:id/review', [RentalsController, 'saveReview'])
          .use(rentalBookingThrottle)
        router
          .delete('/customer/me/rental-bookings/:id/review', [RentalsController, 'deleteReview'])
          .use(rentalBookingThrottle)
        router
          .get('/customer/me/rental-bookings/:id/payment-methods', [
            RentalsController,
            'paymentMethods',
          ])
          .use(rentalBookingThrottle)
        router
          .post('/customer/me/rental-bookings/:id/payment', [RentalsController, 'pay'])
          .use(rentalBookingThrottle)
        router
          .post('/customer/me/rental-bookings/:id/payment/verify', [
            RentalsController,
            'verifyPayment',
          ])
          .use(rentalBookingThrottle)
        router.patch('/customer/me', [CustomerProfileController, 'update'])
        router.get('/customer/me/photo', [CustomerProfileController, 'photo'])
        router
          .post('/customer/me/photo', [CustomerProfileController, 'upload'])
          .use(customerPhotoThrottle)
        router.delete('/customer/me/photo', [CustomerProfileController, 'removePhoto'])
        router
          .post('/customer/me/phone/otp', [CustomerProfileController, 'requestPhone'])
          .use(customerAuthThrottle)
        router
          .post('/customer/me/phone/otp/:id/resend', [CustomerProfileController, 'resendPhone'])
          .use(customerAuthThrottle)
        router
          .post('/customer/me/phone/otp/:id/verify', [CustomerProfileController, 'verifyPhone'])
          .use(customerAuthThrottle)
        router.delete('/customer/me', [CustomerAuthController, 'destroy'])
        router.post('/customer/auth/logout', [CustomerAuthController, 'logout'])
      })
      .use(middleware.customerAuth())
    router.get('/config', [AppConfigController, 'show'])
    router.get('/pages/:slug', [CustomerSupportController, 'page'])
    router.get('/site', [CustomerSupportController, 'site'])
    router.post('/contact-requests', [CustomerSupportController, 'contact']).use(contactThrottle)
    router
      .group(() => {
        router.get('/home', [AdminHomeController, 'home']).as('v2.admin.home.show')
        router.patch('/home', [AdminHomeController, 'updateHome']).as('v2.admin.home.update')
        router.put('/home/hero-image', [AdminHomeController, 'hero']).as('v2.admin.home.hero')
        router
          .delete('/home/hero-image', [AdminHomeController, 'removeHero'])
          .as('v2.admin.home.hero.remove')
        router.get('/home-explore-cards', [AdminHomeController, 'cards']).as('v2.admin.home.cards')
        router
          .post('/home-explore-cards', [AdminHomeController, 'saveCard'])
          .as('v2.admin.home.cards.create')
        router
          .get('/home-explore-cards/:id', [AdminHomeController, 'card'])
          .as('v2.admin.home.cards.show')
        router
          .put('/home-explore-cards/:id', [AdminHomeController, 'saveCard'])
          .as('v2.admin.home.cards.update')
        router
          .delete('/home-explore-cards/:id', [AdminHomeController, 'deleteCard'])
          .as('v2.admin.home.cards.delete')
        router
          .patch('/places/:id/featured', [AdminHomeController, 'featured'])
          .as('v2.admin.places.featured')
        router
          .get('/places', [AdminExploreController, 'places'])
          .as('explore.AdminExploreController.get.places')
        router
          .get('/places/:id', [AdminExploreController, 'place'])
          .as('explore.AdminExploreController.get.places_id')
        router
          .patch('/places/:id/explore', [AdminExploreController, 'updatePlace'])
          .as('explore.AdminExploreController.patch.places_id_explore')
        router
          .get('/place-features', [AdminExploreController, 'features'])
          .as('explore.AdminExploreController.get.place_features')
        router
          .post('/place-features', [AdminExploreController, 'saveFeature'])
          .as('explore.AdminExploreController.post.place_features')
        router
          .put('/place-features/:id', [AdminExploreController, 'saveFeature'])
          .as('explore.AdminExploreController.put.place_features_id')
        router
          .delete('/place-features/:id', [AdminExploreController, 'deleteFeature'])
          .as('explore.AdminExploreController.delete.place_features_id')
        router
          .get('/movies', [AdminExploreController, 'movies'])
          .as('explore.AdminExploreController.get.movies')
        router
          .get('/movies/:id', [AdminExploreController, 'movie'])
          .as('explore.AdminExploreController.get.movies_id')
        router
          .post('/movies', [AdminExploreController, 'saveMovie'])
          .as('explore.AdminExploreController.post.movies')
        router
          .put('/movies/:id', [AdminExploreController, 'saveMovie'])
          .as('explore.AdminExploreController.put.movies_id')
        router
          .put('/movies/:id/poster', [AdminExploreController, 'poster'])
          .as('explore.AdminExploreController.put.movies_id_poster')
        router
          .delete('/movies/:id/poster', [AdminExploreController, 'removePoster'])
          .as('explore.AdminExploreController.delete.movies_id_poster')
        router
          .delete('/movies/:id', [AdminExploreController, 'deleteMovie'])
          .as('explore.AdminExploreController.delete.movies_id')
        router
          .get('/showtimes', [AdminExploreController, 'showtimes'])
          .as('explore.AdminExploreController.get.showtimes')
        router
          .post('/showtimes', [AdminExploreController, 'saveShowtime'])
          .as('explore.AdminExploreController.post.showtimes')
        router
          .put('/showtimes/:id', [AdminExploreController, 'saveShowtime'])
          .as('explore.AdminExploreController.put.showtimes_id')
        router
          .delete('/showtimes/:id', [AdminExploreController, 'deleteShowtime'])
          .as('explore.AdminExploreController.delete.showtimes_id')
        router.get('/contact-requests', [AdminContactsController, 'index'])
        router.get('/contact-requests/:id', [AdminContactsController, 'show'])
        router.patch('/contact-requests/:id', [AdminContactsController, 'update'])
        router
          .get('/pages/:slug', [CustomerSupportController, 'adminPage'])
          .as('v2.admin.pages.show')
        router.get('/site', [CustomerSupportController, 'site']).as('v2.admin.site.show')
      })
      .prefix('/admin')
      .use(middleware.jwtAdmin())
      .use(middleware.adminAuthorization())
  })
  .prefix('/api/v2')
