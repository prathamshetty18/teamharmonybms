import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Helper to safely extract coordinates from various parcel shapes
function getParcelCoordinates(parcel) {
  if (!parcel) return null;
  const lat = parcel.lat ?? parcel.latitude ?? (parcel.latE6 != null ? parcel.latE6 / 1e6 : null);
  const lon = parcel.lon ?? parcel.lng ?? parcel.longitude ?? (parcel.lonE6 != null ? parcel.lonE6 / 1e6 : null);
  if (lat != null && !isNaN(Number(lat)) && lon != null && !isNaN(Number(lon))) {
    return [Number(lat), Number(lon)];
  }
  if (Array.isArray(parcel.polygon) && parcel.polygon.length > 0) {
    const validPts = parcel.polygon.filter(pt => Array.isArray(pt) && pt.length >= 2 && !isNaN(Number(pt[0])) && !isNaN(Number(pt[1])));
    if (validPts.length > 0) {
      const sumLat = validPts.reduce((acc, pt) => acc + Number(pt[0]), 0);
      const sumLon = validPts.reduce((acc, pt) => acc + Number(pt[1]), 0);
      return [sumLat / validPts.length, sumLon / validPts.length];
    }
  }
  return null;
}

export default function MapView({ 
  parcels = [], 
  selectedParcel, 
  onSelectParcel,
  isDrawingMode,
  newPin,
  onMapClick,
  showGisOverlay = false,
  claimId = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);
  const gisLayersRef = useRef([]);

  const isGisFeatureEnabled = 
    (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_FEATURE_GIS_BOUNDARY === 'true' || import.meta.env?.FEATURE_GIS_BOUNDARY === 'true')) ||
    (typeof window !== 'undefined' && (window.FEATURE_GIS_BOUNDARY === true || window.FEATURE_GIS_BOUNDARY === 'true'));

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default to Wayanad disaster zone coordinates
      const map = L.map(mapContainerRef.current, {
        center: [11.5284, 76.1362],
        zoom: 15,
        zoomControl: false
      });

      // CartoDB Positron (Clean, sleek light tiles matching reference design)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> | Govt of India Cadastre',
        maxZoom: 19
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick(e.latlng);
        }
      });

      mapInstanceRef.current = map;
    }

    return () => {
      // Cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update parcel polygons & markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous layers
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    parcels.forEach(parcel => {
      let color = '#F59E0B'; // Pending
      if (parcel.status === 'Verified') color = '#10B981';
      if (parcel.status === 'Disputed' || parcel.legalStatus?.includes('Detected')) color = '#EF4444';

      const isSelected = selectedParcel && selectedParcel.landId === parcel.landId;

      // Draw Polygon
      if (parcel.polygon && parcel.polygon.length > 2) {
        const poly = L.polygon(parcel.polygon, {
          color: color,
          weight: isSelected ? 3 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.45 : 0.25,
          dashArray: parcel.status === 'Pending Verification' ? '4, 4' : null
        }).addTo(map);

        poly.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
            <div style="font-weight: 800; font-size: 13px; color: #0F172A;">Survey #${parcel.surveyNumber}</div>
            <div style="color: #64748B;">Land ID: ${parcel.landId}</div>
            <div style="margin-top: 4px;"><strong>Owner:</strong> ${parcel.farmerName}</div>
            <div><strong>Area:</strong> ${parcel.areaAcres} Acres (${parcel.areaHectares} ha)</div>
            <div><strong>Classification:</strong> ${parcel.finalClassification}</div>
            <div style="margin-top: 4px; font-weight: 700; color: ${color};">Status: ${parcel.status}</div>
          </div>
        `);

        poly.on('click', () => {
          onSelectParcel(parcel);
        });

        layersRef.current.push(poly);
      }

      // Add Centroid Marker
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `
          <div style="
            background: ${color}; 
            color: white; 
            padding: 2px 6px; 
            border-radius: 9999px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 10px; 
            font-weight: 800; 
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            border: 2px solid white;
            white-space: nowrap;
          ">
            ${parcel.surveyNumber || 'Plot'}
          </div>
        `,
        iconSize: [50, 20],
        iconAnchor: [25, 10]
      });

      const coords = getParcelCoordinates(parcel);
      if (coords) {
        const marker = L.marker(coords, { icon: customIcon }).addTo(map);
        marker.on('click', () => onSelectParcel(parcel));
        layersRef.current.push(marker);
      }
    });

    // Draw candidate pin if in drawing mode
    if (newPin && newPin.lat != null && (newPin.lng != null || newPin.lon != null)) {
      const pinLat = Number(newPin.lat);
      const pinLng = Number(newPin.lng != null ? newPin.lng : newPin.lon);
      if (!isNaN(pinLat) && !isNaN(pinLng)) {
        const pinIcon = L.divIcon({
          className: 'candidate-pin',
          html: `
            <div style="
              background: #0F172A; 
              color: white; 
              padding: 4px 8px; 
              border-radius: 9999px; 
              font-size: 11px; 
              font-weight: 700; 
              white-space: nowrap;
              box-shadow: 0 6px 16px rgba(0,0,0,0.3);
              border: 2px solid #4F46E5;
            ">
              📍 New Claim GPS
            </div>
          `,
          iconSize: [100, 30],
          iconAnchor: [50, 15]
        });
        const candidateMarker = L.marker([pinLat, pinLng], { icon: pinIcon }).addTo(map);
        layersRef.current.push(candidateMarker);
      }
    }
  }, [parcels, selectedParcel, newPin]);

  // Center on selected parcel
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedParcel) return;
    const coords = getParcelCoordinates(selectedParcel);
    if (coords) {
      map.flyTo(coords, 16, { duration: 1 });
    }
  }, [selectedParcel]);

  // Read-only GIS Boundary & Nearby Overlay Effect
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up any existing GIS layers
    gisLayersRef.current.forEach(layer => {
      try { map.removeLayer(layer); } catch (_) {}
    });
    gisLayersRef.current = [];

    if (!isGisFeatureEnabled || !showGisOverlay || !claimId) {
      return;
    }

    let isMounted = true;

    const fetchGisData = async () => {
      try {
        // 1. Fetch Boundary
        const boundaryRes = await fetch(`/api/gis/boundary/${claimId}`);
        if (!boundaryRes.ok) {
          console.warn(`GIS overlay: boundary fetch failed with status ${boundaryRes.status}`);
          return;
        }
        const boundaryData = await boundaryRes.json();
        if (!isMounted || !mapInstanceRef.current) return;

        if (boundaryData && boundaryData.boundary && boundaryData.boundary.geometry) {
          // Draw polygon with solid outline and light fill
          const boundaryLayer = L.geoJSON(boundaryData.boundary, {
            style: {
              color: '#2563EB',
              weight: 3,
              fillColor: '#3B82F6',
              fillOpacity: 0.25
            }
          }).addTo(map);

          gisLayersRef.current.push(boundaryLayer);

          if (boundaryLayer.getBounds && boundaryLayer.getBounds().isValid()) {
            map.fitBounds(boundaryLayer.getBounds(), { padding: [40, 40] });
          }
        }

        // Place centroid marker with popup Area: <acres> acres · Perimeter: <m> m
        if (boundaryData && boundaryData.metrics) {
          const m = boundaryData.metrics;
          const centroid = m.centroid; // [lon, lat] in GeoJSON
          if (Array.isArray(centroid) && centroid.length >= 2) {
            const centerLatLng = [centroid[1], centroid[0]];
            const acresStr = m.areaAcres !== undefined ? m.areaAcres : '';
            const perimM = m.perimeterKm !== undefined ? Math.round(m.perimeterKm * 1000) : (m.perimeterM || 0);

            const centroidMarker = L.marker(centerLatLng, {
              icon: L.divIcon({
                className: 'gis-centroid-pin',
                html: `
                  <div style="
                    background: #1D4ED8;
                    color: white;
                    padding: 2px 8px;
                    border-radius: 9999px;
                    font-size: 11px;
                    font-weight: 700;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                    border: 2px solid white;
                    white-space: nowrap;
                  ">
                    📍 Centroid #${boundaryData.claimId || claimId}
                  </div>
                `,
                iconSize: [110, 24],
                iconAnchor: [55, 12]
              })
            }).addTo(map);

            centroidMarker.bindPopup(`Area: ${acresStr} acres · Perimeter: ${perimM} m`);
            gisLayersRef.current.push(centroidMarker);

            map.panTo(centerLatLng);
          }
        }

        // 2. Fetch Nearby parcels
        const nearbyRes = await fetch(`/api/gis/nearby/${claimId}`);
        if (!nearbyRes.ok) {
          console.warn(`GIS overlay: nearby fetch failed with status ${nearbyRes.status}`);
          return;
        }
        const nearbyData = await nearbyRes.json();
        if (!isMounted || !mapInstanceRef.current) return;

        if (nearbyData && Array.isArray(nearbyData.nearby) && nearbyData.nearby.length > 0) {
          for (const item of nearbyData.nearby) {
            try {
              const itemBRes = await fetch(`/api/gis/boundary/${item.claimId}`);
              if (itemBRes.ok) {
                const itemBData = await itemBRes.json();
                if (itemBData && itemBData.boundary && itemBData.boundary.geometry) {
                  const nearbyLayer = L.geoJSON(itemBData.boundary, {
                    style: {
                      color: '#DC2626',
                      weight: 2,
                      dashArray: '6, 6',
                      fillColor: '#F87171',
                      fillOpacity: 0.2
                    }
                  }).addTo(map);

                  const overlapText = item.overlapPct !== undefined ? `Overlap: ${item.overlapPct}%` : 'Nearby Parcel';
                  nearbyLayer.bindTooltip(overlapText, { sticky: true });
                  gisLayersRef.current.push(nearbyLayer);
                }
              }
            } catch (err) {
              console.warn(`Failed loading nearby boundary for ${item.claimId}:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('GIS overlay fetch failure:', err);
      }
    };

    fetchGisData();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        gisLayersRef.current.forEach(layer => {
          try { mapInstanceRef.current.removeLayer(layer); } catch (_) {}
        });
        gisLayersRef.current = [];
      }
    };
  }, [showGisOverlay, claimId, isGisFeatureEnabled]);

  return (
    <div className="map-frame">
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      {isDrawingMode && (
        <div style={{
          position: 'absolute',
          top: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.9)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 'var(--radius-pill)',
          fontSize: '12px',
          fontWeight: 600,
          zIndex: 1000,
          boxShadow: 'var(--shadow-dropdown)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>👆 Click anywhere on the map to place parcel GPS pin</span>
        </div>
      )}
    </div>
  );
}
