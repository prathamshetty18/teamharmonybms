import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function MapView({ 
  parcels = [], 
  selectedParcel, 
  onSelectParcel,
  isDrawingMode,
  newPin,
  onMapClick 
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef([]);

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

      const marker = L.marker([parcel.lat, parcel.lon], { icon: customIcon }).addTo(map);
      marker.on('click', () => onSelectParcel(parcel));
      layersRef.current.push(marker);
    });

    // Draw candidate pin if in drawing mode
    if (newPin) {
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
      const candidateMarker = L.marker([newPin.lat, newPin.lng], { icon: pinIcon }).addTo(map);
      layersRef.current.push(candidateMarker);
    }
  }, [parcels, selectedParcel, newPin]);

  // Center on selected parcel
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedParcel) return;
    map.flyTo([selectedParcel.lat, selectedParcel.lon], 16, { duration: 1 });
  }, [selectedParcel]);

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
