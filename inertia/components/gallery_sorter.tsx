import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'

type GalleryImage = {
  id: number
  url: string | null
  alt_en: string | null
  alt_ar: string | null
  caption_en: string | null
  caption_ar: string | null
  sort_order: number
}

type Props = {
  images: GalleryImage[]
  maxFiles: number
}

type Tile =
  | { key: string; kind: 'existing'; image: GalleryImage }
  | { key: string; kind: 'new'; file: File; preview: string }

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** One sortable grid for saved and newly chosen gallery images. */
export default function GallerySorter({ images, maxFiles }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [tiles, setTiles] = useState<Tile[]>(() =>
    [...images]
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((image) => ({ key: `e${image.id}`, kind: 'existing', image }))
  )
  const [removed, setRemoved] = useState<string[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [fileOver, setFileOver] = useState(false)

  const kept = tiles.filter((tile) => !removed.includes(tile.key)).length
  const newTiles = tiles.filter(
    (tile): tile is Extract<Tile, { kind: 'new' }> => tile.kind === 'new'
  )

  // Keep the real file input in the same order as the new tiles.
  useEffect(() => {
    const el = input.current
    if (!el) return
    const transfer = new DataTransfer()
    for (const tile of newTiles) transfer.items.add(tile.file)
    el.files = transfer.files
  })

  const tilesRef = useRef(tiles)
  tilesRef.current = tiles
  useEffect(
    () => () => {
      for (const tile of tilesRef.current)
        if (tile.kind === 'new') URL.revokeObjectURL(tile.preview)
    },
    []
  )

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list)
    const room = maxFiles - newTiles.length
    const accepted: Tile[] = []
    for (const file of incoming) {
      if (!allowedTypes.has(file.type)) {
        void message.error(`${file.name}: choose a JPG, PNG, or WebP image.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        void message.error(`${file.name}: images must be 5 MB or smaller.`)
        continue
      }
      if (accepted.length >= room) {
        void message.warning(`You can add up to ${maxFiles} images at a time.`)
        break
      }
      accepted.push({
        key: `n${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind: 'new',
        file,
        preview: URL.createObjectURL(file),
      })
    }
    if (accepted.length) setTiles((list) => [...list, ...accepted])
  }

  const removeTile = (tile: Tile) => {
    if (tile.kind === 'new') {
      URL.revokeObjectURL(tile.preview)
      setTiles((list) => list.filter((item) => item.key !== tile.key))
    } else {
      setRemoved((list) => [...list, tile.key])
    }
  }

  let existingIndex = -1
  let newIndex = -1

  return (
    <div className="gallery-sorter">
      <div className="gallery-sorter-head">
        <strong>Gallery</strong>
        <span>
          {kept} {kept === 1 ? 'image' : 'images'}
          {kept > 1 ? ' · drag to reorder' : ''}
        </span>
      </div>
      {tiles.length > 0 && (
        <div className="gallery-sorter-grid">
          {tiles.map((tile, index) => {
            const isRemoved = removed.includes(tile.key)
            const src = tile.kind === 'new' ? tile.preview : tile.image.url
            if (tile.kind === 'existing') existingIndex++
            else newIndex++
            const i = existingIndex
            return (
              <div
                key={tile.key}
                className={`gallery-tile${isRemoved ? ' is-removed' : ''}${dragging === index ? ' is-dragging' : ''}${tile.kind === 'new' ? ' is-new' : ''}`}
                draggable={!isRemoved}
                onDragStart={() => setDragging(index)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (dragging !== null) event.preventDefault()
                }}
                onDrop={() => {
                  if (dragging !== null) setTiles((list) => move(list, dragging, index))
                  setDragging(null)
                }}
              >
                {tile.kind === 'existing' ? (
                  <>
                    <input type="hidden" name={`gallery[${i}][id]`} value={tile.image.id} />
                    <input
                      type="hidden"
                      name={`gallery[${i}][remove]`}
                      value={isRemoved ? 'on' : ''}
                    />
                    <input type="hidden" name={`gallery[${i}][sortOrder]`} value={index + 1} />
                    <input
                      type="hidden"
                      name={`gallery[${i}][altEn]`}
                      value={tile.image.alt_en ?? ''}
                    />
                    <input
                      type="hidden"
                      name={`gallery[${i}][altAr]`}
                      value={tile.image.alt_ar ?? ''}
                    />
                    <input
                      type="hidden"
                      name={`gallery[${i}][captionEn]`}
                      value={tile.image.caption_en ?? ''}
                    />
                    <input
                      type="hidden"
                      name={`gallery[${i}][captionAr]`}
                      value={tile.image.caption_ar ?? ''}
                    />
                  </>
                ) : (
                  <input
                    type="hidden"
                    name="galleryNewOrder"
                    value={index + 1}
                    data-new-index={newIndex}
                  />
                )}
                {src ? (
                  <img
                    src={src}
                    alt={
                      tile.kind === 'existing'
                        ? tile.image.alt_en || 'Gallery image'
                        : tile.file.name
                    }
                    loading="lazy"
                  />
                ) : (
                  <div className="gallery-tile-empty">No preview</div>
                )}
                <span className="gallery-tile-badge">{index + 1}</span>
                {tile.kind === 'new' && <span className="gallery-tile-new">New</span>}
                {isRemoved ? (
                  <div className="gallery-tile-removed">
                    <span>Removed when you save</span>
                    <button
                      type="button"
                      onClick={() => setRemoved((list) => list.filter((key) => key !== tile.key))}
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <div className="gallery-tile-actions">
                    <button
                      type="button"
                      aria-label="Move earlier"
                      disabled={index === 0}
                      onClick={() => setTiles((list) => move(list, index, index - 1))}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Move later"
                      disabled={index === tiles.length - 1}
                      onClick={() => setTiles((list) => move(list, index, index + 1))}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="danger"
                      aria-label="Remove image"
                      onClick={() => removeTile(tile)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div
        className={`gallery-sorter-add${fileOver ? ' is-over' : ''}`}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setFileOver(true)
          }
        }}
        onDragLeave={() => setFileOver(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return
          event.preventDefault()
          setFileOver(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        <button
          type="button"
          className="gallery-sorter-add-button"
          disabled={newTiles.length >= maxFiles}
          onClick={() => input.current?.click()}
        >
          + Add images
        </button>
        <span className="gallery-sorter-hint">
          or drop files here · JPG, PNG or WebP, up to 5 MB each
        </span>
        <input
          ref={input}
          className="image-upload-native"
          type="file"
          name="galleryImages[]"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files)
          }}
        />
      </div>
    </div>
  )
}
