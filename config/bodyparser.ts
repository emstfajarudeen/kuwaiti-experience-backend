import { defineConfig } from '@adonisjs/core/bodyparser'

/**
 * Body parser configuration.
 * Defines how request bodies are parsed for different content types
 * including forms, JSON, and file uploads.
 */
const bodyParserConfig = defineConfig({
  /**
   * The bodyparser middleware will parse the request body
   * for the following HTTP methods.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser
   */
  form: {
    /**
     * Convert empty strings to null values.
     * Helps maintain consistent data types in your application.
     */
    convertEmptyStringsToNull: true,

    /**
     * Automatically trim whitespace from the start and end of string values.
     */
    trimWhitespaces: true,

    /**
     * Content types that should be parsed as form data.
     */
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser
   */
  json: {
    /**
     * Convert empty strings to null values.
     * Helps maintain consistent data types in your application.
     */
    convertEmptyStringsToNull: true,

    /**
     * Automatically trim whitespace from the start and end of string values.
     */
    trimWhitespaces: true,

    /**
     * Content types that should be parsed as JSON.
     * Includes standard JSON and various JSON-based API formats.
     */
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Enabling auto process allows bodyparser middleware to
     * move all uploaded files inside the tmp folder of your
     * operating system
     */
    autoProcess: [
      // CMS forms that carry image fields. Patterns must match routes exactly,
      // otherwise multipart fields (including the CSRF token) are not parsed.
      '/admin/places',
      '/admin/places/:id/save',
      '/admin/category-types',
      '/admin/category-types/:code/save',
      '/admin/home',
      '/admin/settings',
      '/admin/rentals/vehicles',
      '/admin/rentals/vehicles/:id/save',
      '/admin/rentals/providers',
      '/admin/rentals/providers/:id/save',
      '/admin/rentals/drivers',
      '/admin/rentals/drivers/:id/save',
      '/admin/rentals/documents',
      // Admin API image endpoints.
      '/api/v1/admin/places/:id/cover',
      '/api/v1/admin/places/:id/gallery',
      '/api/v1/admin/category-types/:code/image',
      '/api/v1/admin/home/hero-image',
      '/api/v1/admin/settings/logo',
      '/api/v2/customer/me/photo',
      '/admin/movies',
      '/admin/videos',
      '/admin/videos/:id/save',
      '/admin/movies/:id/save',
      '/api/v2/admin/movies/:id/poster',
      '/api/v2/admin/home/hero-image',
    ],

    /**
     * Convert empty strings to null values.
     * Helps maintain consistent data types in your application.
     */
    convertEmptyStringsToNull: true,

    /**
     * Automatically trim whitespace from the start and end of string values.
     */
    trimWhitespaces: true,

    /**
     * Routes where file uploads should be processed manually.
     * Useful when you need custom file handling logic.
     */
    processManually: [],

    /**
     * Maximum limit of data to parse including all files
     * and fields. Sized for a 100 MB video with a 5 MB cover image plus form fields (or five 5 MB images).
     */
    limit: '110mb',

    /**
     * Content types that should be parsed as multipart form data.
     */
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
