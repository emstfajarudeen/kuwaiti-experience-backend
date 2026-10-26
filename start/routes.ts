import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import {
  authThrottle,
  enquiryThrottle,
  customerAuthThrottle,
  contactThrottle,
  customerPhotoThrottle,
  bookmarkThrottle,
  passwordResetRequestThrottle,
  passwordResetConfirmThrottle,
} from '#start/limiter'

const AuthController = () => import('#controllers/api/auth_controller')
const CustomerAuthController = () => import('#controllers/api/customer_auth_controller')
const CustomerProfileController = () => import('#controllers/api/customer_profile_controller')
const CustomerSupportController = () => import('#controllers/api/customer_support_controller')
const AdminContactsController = () => import('#controllers/api/admin_contacts_controller')
const ContactsController = () => import('#controllers/admin/contacts_controller')
const PublicController = () => import('#controllers/api/public_controller')
const ExploreController = () => import('#controllers/api/explore_controller')
const HomeController = () => import('#controllers/api/home_controller')
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
const AdminCategoriesPageController = () => import('#controllers/admin/categories_controller')
const AdminCategoryTypesPageController = () =>
  import('#controllers/admin/category_types_controller')
const AdminSaveSuccessController = () => import('#controllers/admin/save_success_controller')
const AdminPagesPageController = () => import('#controllers/admin/pages_controller')
const AdminSitePageController = () => import('#controllers/admin/site_controller')
const AdminUsersController = () => import('#controllers/admin/users_controller')
const AdminCustomersController = () => import('#controllers/admin/customers_controller')
const AdminRolesController = () => import('#controllers/admin/roles_controller')

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
    router.post('/places', [AdminPlacesPageController, 'save']).as('cms.places.create')
    router.get('/places/:id/edit', [AdminPlacesPageController, 'edit'])
    router.get('/places/:id/preview', [AdminPlacesPageController, 'preview'])
    router
      .get('/places/:id/explore', [ExplorePageController, 'place'])
      .as('explore.ExplorePageController.get.places_id_explore')
    router
      .post('/places/:id/explore', [ExplorePageController, 'savePlace'])
      .as('explore.ExplorePageController.post.places_id_explore')
    router
      .get('/place-features', [ExplorePageController, 'features'])
      .as('explore.ExplorePageController.get.place_features')
    router
      .post('/place-features', [ExplorePageController, 'saveFeature'])
      .as('explore.ExplorePageController.post.place_features')
    router
      .get('/place-features/:id/edit', [ExplorePageController, 'features'])
      .as('explore.ExplorePageController.get.place_features_id_edit')
    router
      .post('/place-features/:id/save', [ExplorePageController, 'saveFeature'])
      .as('explore.ExplorePageController.post.place_features_id_save')
    router
      .post('/place-features/:id/delete', [ExplorePageController, 'deleteFeature'])
      .as('explore.ExplorePageController.post.place_features_id_delete')
    router
      .get('/movies', [ExplorePageController, 'movies'])
      .as('explore.ExplorePageController.get.movies')
    router
      .get('/movies/new', [ExplorePageController, 'movie'])
      .as('explore.ExplorePageController.get.movies_new')
    router
      .post('/movies', [ExplorePageController, 'saveMovie'])
      .as('explore.ExplorePageController.post.movies')
    router
      .get('/movies/:id/edit', [ExplorePageController, 'movie'])
      .as('explore.ExplorePageController.get.movies_id_edit')
    router
      .post('/movies/:id/save', [ExplorePageController, 'saveMovie'])
      .as('explore.ExplorePageController.post.movies_id_save')
    router
      .post('/movies/:id/delete', [ExplorePageController, 'deleteMovie'])
      .as('explore.ExplorePageController.post.movies_id_delete')
    router
      .get('/showtimes', [ExplorePageController, 'showtimes'])
      .as('explore.ExplorePageController.get.showtimes')
    router
      .post('/showtimes', [ExplorePageController, 'saveShowtime'])
      .as('explore.ExplorePageController.post.showtimes')
    router
      .get('/showtimes/:id/edit', [ExplorePageController, 'showtimes'])
      .as('explore.ExplorePageController.get.showtimes_id_edit')
    router
      .post('/showtimes/:id/save', [ExplorePageController, 'saveShowtime'])
      .as('explore.ExplorePageController.post.showtimes_id_save')
    router
      .post('/showtimes/:id/delete', [ExplorePageController, 'deleteShowtime'])
      .as('explore.ExplorePageController.post.showtimes_id_delete')
    router.get('/account', [AdminAuthController, 'account'])
    router.post('/account/password', [AdminAuthController, 'password'])
    router.get('/customers', [AdminCustomersController, 'index'])
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
    router
      .post('/home/cards', [AdminSitePageController, 'saveHomeCard'])
      .as('cms.home.cards.create')
    router
      .post('/home/cards/:id/save', [AdminSitePageController, 'saveHomeCard'])
      .as('cms.home.cards.update')
    router.post('/home/cards/:id/delete', [AdminSitePageController, 'deleteHomeCard'])
    router.get('/settings', [AdminSitePageController, 'settings'])
    router.post('/settings', [AdminSitePageController, 'saveSettings'])
    router.get('/transport', [AdminSitePageController, 'transport'])
    router.post('/transport', [AdminSitePageController, 'saveLocation']).as('cms.transport.create')
    router
      .post('/transport/:id/save', [AdminSitePageController, 'saveLocation'])
      .as('cms.transport.update')
    router.post('/transport/:id/delete', [AdminSitePageController, 'deleteLocation'])
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
          .get('/customer/me/saved-places', [ExploreController, 'saved'])
          .as('explore.ExploreController.get.customer_me_saved_places')
        router
          .put('/customer/me/saved-places/:id', [ExploreController, 'save'])
          .use(bookmarkThrottle)
        router
          .delete('/customer/me/saved-places/:id', [ExploreController, 'unsave'])
          .use(bookmarkThrottle)
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
