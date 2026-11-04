import { useEffect, useRef, useState } from 'react'
import { AutoComplete, Form, Input } from 'antd'
import PlaceLocationMap from './place_location_map'

type AddressResult = {
  id: string | number
  label: string
  latitude: number
  longitude: number
}

type Props = {
  value?: string
  onChange?: (value: string) => void
  latitude: number | null
  longitude: number | null
  onAddressEdited: () => void
  onPlaceSelected: (address: string, latitude: number, longitude: number) => void
  /** Form field name of the address input. */
  name?: string
  searchUrl?: string
  reverseUrl?: string
}

export default function OpenMapAddressSearch({
  value,
  onChange,
  latitude,
  longitude,
  onAddressEdited,
  onPlaceSelected,
  name = 'addressEn',
  searchUrl = '/admin/places/address-search',
  reverseUrl = '/admin/places/address-reverse',
}: Props) {
  const [results, setResults] = useState<AddressResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const requestNumber = useRef(0)
  const searchTimer = useRef<number | undefined>(undefined)
  const resultsRef = useRef<AddressResult[]>([])
  const preservePinWhileTyping = useRef(false)

  useEffect(() => {
    return () => {
      requestNumber.current += 1
      window.clearTimeout(searchTimer.current)
    }
  }, [])

  async function searchAddress(query: string) {
    const trimmed = query.trim()
    const requestId = ++requestNumber.current
    if (trimmed.length < 3) {
      setLoading(false)
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setError(null)
    setSearched(false)
    try {
      const response = await fetch(
        `${searchUrl}?q=${encodeURIComponent(trimmed)}`,
        {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        }
      )
      const data = (await response.json()) as { results?: AddressResult[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Map search is unavailable.')
      if (requestId !== requestNumber.current) return
      setResults(data.results ?? [])
      resultsRef.current = data.results ?? []
      setOpen(Boolean(data.results?.length))
      setSearched(true)
    } catch (cause) {
      if (requestId !== requestNumber.current) return
      setResults([])
      setOpen(false)
      setError(cause instanceof Error ? cause.message : 'Map search is unavailable.')
    } finally {
      if (requestId === requestNumber.current) setLoading(false)
    }
  }

  function editAddress(nextValue: string) {
    if (resultsRef.current.some((result) => result.label === nextValue)) return
    onChange?.(nextValue)
    if (!preservePinWhileTyping.current) onAddressEdited()
    setResults([])
    resultsRef.current = []
    setSearched(false)
    setError(null)
    setOpen(false)
    requestNumber.current += 1
  }

  function selectResult(result: AddressResult) {
    requestNumber.current += 1
    preservePinWhileTyping.current = false
    onChange?.(result.label)
    onPlaceSelected(result.label, result.latitude, result.longitude)
    setResults([])
    resultsRef.current = []
    setOpen(false)
    setSearched(false)
    setError(null)
  }

  async function selectMapLocation(selectedLatitude: number, selectedLongitude: number) {
    const requestId = ++requestNumber.current
    preservePinWhileTyping.current = true
    onChange?.('')
    onPlaceSelected('', selectedLatitude, selectedLongitude)
    setResults([])
    resultsRef.current = []
    setOpen(false)
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `${reverseUrl}?lat=${encodeURIComponent(selectedLatitude)}&lon=${encodeURIComponent(selectedLongitude)}`,
        { credentials: 'same-origin', headers: { Accept: 'application/json' } }
      )
      const data = (await response.json()) as { result?: AddressResult | null; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not find an address here.')
      if (requestId !== requestNumber.current) return
      if (data.result) onChange?.(data.result.label)
      else
        setError(
          'No address found at this point. Enter one manually; the map pin will stay selected.'
        )
    } catch {
      if (requestId === requestNumber.current) {
        setError(
          'Could not find an address at this point. Enter one manually; the map pin will stay selected.'
        )
      }
    } finally {
      if (requestId === requestNumber.current) setLoading(false)
    }
  }

  const { status: fieldStatus } = Form.Item.useStatus()
  const invalid = fieldStatus === 'error' ? 'error' : undefined
  return (
    <div>
      <AutoComplete
        status={invalid}
        value={value ?? ''}
        open={open}
        options={results.map((result) => ({ value: result.label, label: result.label }))}
        onChange={editAddress}
        onSearch={(query) => {
          if (query.trim().length >= 3) {
            const scheduledQuery = query
            window.clearTimeout(searchTimer.current)
            searchTimer.current = window.setTimeout(() => void searchAddress(scheduledQuery), 500)
          } else {
            window.clearTimeout(searchTimer.current)
          }
        }}
        onSelect={(selected) => {
          const result = resultsRef.current.find((item) => item.label === selected)
          if (result) selectResult(result)
        }}
        className="tw:w-full"
      >
        <Input.Search
          status={invalid}
          id="place-address"
          aria-label="Address"
          name={name}
          maxLength={300}
          placeholder="Search for a place or address"
          enterButton="Search map"
          loading={loading}
          onSearch={(query) => {
            window.clearTimeout(searchTimer.current)
            void searchAddress(query)
          }}
        />
      </AutoComplete>
      {error && <p className="tw:mt-2 tw:text-sm tw:text-red-700">{error}</p>}
      {searched && results.length === 0 && (
        <p className="tw:mt-2 tw:text-sm tw:text-[var(--muted)]">
          No matching places found. You can enter the address manually or choose a point on the map.
        </p>
      )}
      <PlaceLocationMap
        latitude={latitude}
        longitude={longitude}
        onSelectLocation={selectMapLocation}
      />
      <p className="tw:mt-2 tw:text-xs tw:text-[var(--muted)]">
        Search as you type or click the map to set the address and coordinates. Manual address entry
        is also available.
      </p>
    </div>
  )
}
