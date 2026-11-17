import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, Map } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  latitude: number | null
  longitude: number | null
  onSelectLocation: (latitude: number, longitude: number) => void
}

const KUWAIT_CITY: [number, number] = [29.3759, 47.9774]

export default function PlaceLocationMap({ latitude, longitude, onSelectLocation }: Props) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const marker = useRef<CircleMarker | null>(null)
  const onSelectRef = useRef(onSelectLocation)
  onSelectRef.current = onSelectLocation
  const coordinatesRef = useRef({ latitude, longitude })
  coordinatesRef.current = { latitude, longitude }
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocateError('This browser cannot share your location.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onSelectRef.current(position.coords.latitude, position.coords.longitude)
      },
      (failure) => {
        setLocating(false)
        setLocateError(
          failure.code === failure.PERMISSION_DENIED
            ? 'Location access is blocked. Allow it in the browser, or click the map instead.'
            : 'Could not find your location. Click the map instead.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    let active = true
    void import('leaflet').then((leaflet) => {
      if (!active || !element.current) return
      const { latitude: currentLat, longitude: currentLon } = coordinatesRef.current
      const selected = currentLat !== null && currentLon !== null
      const center: [number, number] = selected ? [currentLat, currentLon] : KUWAIT_CITY
      const instance = leaflet.map(element.current, {
        center,
        zoom: selected ? 15 : 10,
        scrollWheelZoom: true,
      })
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        })
        .addTo(instance)
      map.current = instance
      instance.on('click', (event) => {
        onSelectRef.current(event.latlng.lat, event.latlng.lng)
      })
      if (selected) {
        marker.current = leaflet
          .circleMarker(center, {
            radius: 9,
            color: '#fff',
            weight: 3,
            fillColor: '#00345f',
            fillOpacity: 1,
          })
          .addTo(instance)
      }
    })
    return () => {
      active = false
      map.current?.remove()
      map.current = null
      marker.current = null
    }
    // The map is created once; location changes are handled below.
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (latitude === null || longitude === null) {
      marker.current?.remove()
      marker.current = null
      return
    }
    const position: [number, number] = [latitude, longitude]
    // Keep the admin's zoom; only bring the pin into view when it is off screen.
    if (!instance.getBounds().contains(position)) instance.panTo(position)
    if (marker.current) marker.current.setLatLng(position)
    else {
      void import('leaflet').then((leaflet) => {
        if (!map.current || marker.current) return
        marker.current = leaflet
          .circleMarker(position, {
            radius: 9,
            color: '#fff',
            weight: 3,
            fillColor: '#00345f',
            fillOpacity: 1,
          })
          .addTo(map.current)
      })
    }
  }, [latitude, longitude])

  return (
    <div className="tw:mt-3">
      <div className="tw:relative tw:isolate tw:z-0">
        <div
          ref={element}
          aria-label="Place location on OpenStreetMap"
          className="tw:h-[240px] tw:w-full tw:overflow-hidden tw:rounded-lg tw:border tw:border-brand-line"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="tw:absolute tw:top-2.5 tw:right-2.5 tw:z-[1000] tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-brand-line tw:bg-white tw:px-3 tw:py-1.5 tw:text-[13px] tw:font-semibold tw:text-brand-navy tw:shadow-sm tw:hover:bg-brand-surface tw:disabled:cursor-wait tw:disabled:opacity-70"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2v3M12 19v3M2 12h3M19 12h3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {locating ? 'Finding you…' : 'My location'}
        </button>
      </div>
      {locateError && (
        <p role="alert" className="tw:mt-2 tw:text-[12px] tw:text-red-700">
          {locateError}
        </p>
      )}
    </div>
  )
}
