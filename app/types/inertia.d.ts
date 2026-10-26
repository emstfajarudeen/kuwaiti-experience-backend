declare module '@adonisjs/inertia/types' {
  interface InertiaPages {
    'contacts/index': {
      adminName: string
      csrfToken: string
      success: string | null
      status: string | null
      contacts: Array<{
        id: number
        full_name: string
        email: string
        phone_number: string | null
        inquiry_type: string | null
        status: 'new' | 'in_progress' | 'resolved'
        created_at: string | null
      }>
      meta: { page: number; per_page: number; total: number; last_page: number }
    }
    'contacts/show': {
      adminName: string
      csrfToken: string
      success: string | null
      contact: {
        id: number
        full_name: string
        email: string
        phone_number: string | null
        inquiry_type: string | null
        message: string
        status: 'new' | 'in_progress' | 'resolved'
        created_at: string | null
      }
    }
  }
}

export {}
