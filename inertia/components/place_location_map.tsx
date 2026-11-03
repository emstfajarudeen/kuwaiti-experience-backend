import { useEffect, useRef } from 'react'
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
        scrollWheelZoom: false,
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
    instance.setView(position, 15)
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
    <div
      ref={element}
      aria-label="Place location on OpenStreetMap"
      className="tw:relative tw:isolate tw:z-0 tw:mt-3 tw:h-[240px] tw:w-full tw:overflow-hidden tw:rounded-lg tw:border tw:border-brand-line"
    />
  )
}
