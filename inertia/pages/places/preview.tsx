import AdminLayout from '../../layouts/admin_layout'
type Preview = {
  id: number
  title: string
  address: string
  summary: string
  body: string | null
  slug: string
  cover: { url: string } | null
  price: { mode: string; amount: string | null; currency: string }
  hoursNote: string | null
  gallery: Array<{ url: string; alt: string | null; caption: string | null }>
}
type Props = { adminName: string; csrfToken: string; place: Preview; status: string }
export default function PlacePreview({ adminName, csrfToken, place, status }: Props) {
  return (
    <AdminLayout title="Place preview" active="places" adminName={adminName} csrfToken={csrfToken}>
      <a
        className="back-link tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[color:var(--muted)] tw:[font-size:13px] tw:[font-weight:600] tw:[margin-bottom:var(--space-3)] tw:[transition:color_0.15s_ease]"
        href={`/admin/places/${place.id}/edit`}
      >
        ← Back to editor
      </a>
      <div className="page-head tw:mb-6 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
        <div>
          <div className="tw:[display:flex] tw:[align-items:center] tw:[gap:12px]">
            <h1>{place.title}</h1>
            <span
              className={`status ${status} tw:[display:inline-flex] tw:[align-items:center] tw:[gap:6px] tw:[padding:4px_10px] tw:[border-radius:var(--radius-full)] tw:[font-size:12px] tw:[font-weight:700] tw:[text-transform:capitalize] tw:[letter-spacing:0.02em] tw:[border:1px_solid_transparent] tw:[line-height:1.2]`}
            >
              {status}
            </span>
          </div>
          <p>{place.address}</p>
        </div>
        <div className="page-head-actions tw:flex tw:flex-wrap tw:items-center tw:gap-3">
          <a className="button primary" href={`/admin/places/${place.id}/edit`}>
            Edit place
          </a>
        </div>
      </div>
      <div className="panel form-panel tw:[max-width:900px] tw:mb-6 tw:overflow-hidden tw:rounded-cms-lg tw:border tw:border-brand-line tw:bg-white tw:shadow-[0_4px_14px_rgba(0,23,46,0.06),0_1px_3px_rgba(0,23,46,0.04)] tw:p-6">
        {place.cover && (
          <div className="tw:[margin-bottom:24px]">
            <img
              className="cover-preview tw:[max-height:380px] tw:[width:100%] tw:[max-height:220px] tw:[object-fit:cover] tw:[border-radius:var(--radius-sm)] tw:[border:1px_solid_var(--line)] tw:[background:var(--ivory)]"
              src={place.cover.url}
              alt={`Preview cover for ${place.title}`}
            />
          </div>
        )}
        <div className="tw:[font-size:16px] tw:[font-weight:600] tw:[color:var(--navy)] tw:[margin-bottom:16px] tw:[line-height:1.5]">
          {place.summary}
        </div>
        {place.body && (
          <div className="tw:[font-size:15px] tw:[line-height:1.7] tw:[color:var(--ink-secondary)] tw:[margin-bottom:28px] tw:[white-space:pre-wrap]">
            {place.body}
          </div>
        )}
        <section className="tw:[border-top:1px_solid_var(--line)] tw:[padding-top:20px] tw:[margin-top:20px]">
          <h2>Plan your visit</h2>
          <div className="form-grid two tw:grid tw:grid-cols-1 tw:gap-4 tw:grid-cols-2 tw:max-[900px]:grid-cols-1">
            <div>
              <span>Price</span>
              <strong>
                {place.price.mode === 'unknown'
                  ? 'Not supplied'
                  : `${place.price.amount || ''} ${place.price.currency}`}
              </strong>
            </div>
            <div>
              <span>Hours</span>
              <strong>{place.hoursNote || 'Not supplied'}</strong>
            </div>
            <div>
              <span>Gallery</span>
              <strong>{place.gallery.length} images attached</strong>
            </div>
            <div>
              <span>Slug</span>
              <code>/places/{place.slug}</code>
            </div>
          </div>
        </section>
        {place.gallery.length > 0 && (
          <section className="tw:[border-top:1px_solid_var(--line)] tw:[padding-top:20px] tw:[margin-top:24px]">
            <h2>Gallery ({place.gallery.length})</h2>
            <div className="tw:[display:grid] tw:[grid-template-columns:repeat(auto-fill,_minmax(180px,_1fr))] tw:[gap:12px]">
              {place.gallery.map((image, index) => (
                <div key={`${image.url}-${index}`}>
                  <img
                    src={image.url}
                    alt={image.alt || ''}
                    className="tw:[width:100%] tw:[height:120px] tw:[object-fit:cover]"
                    loading="lazy"
                  />
                  {image.caption && <p>{image.caption}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  )
}
