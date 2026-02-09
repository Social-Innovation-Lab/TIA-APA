'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const RISK_CONFIG = {
  Red: { 
    color: '#dc2626', 
    glow: 'rgba(220, 38, 38, 0.3)',
    label: 'উচ্চ ঝুঁকি',
    labelEn: 'High Risk',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    btnBg: 'bg-red-100 hover:bg-red-200'
  },
  Yellow: { 
    color: '#d97706', 
    glow: 'rgba(217, 119, 6, 0.3)',
    label: 'মাঝারি ঝুঁকি',
    labelEn: 'Medium Risk',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    btnBg: 'bg-amber-100 hover:bg-amber-200'
  },
  Green: { 
    color: '#16a34a', 
    glow: 'rgba(22, 163, 74, 0.3)',
    label: 'কম ঝুঁকি',
    labelEn: 'Low Risk',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    btnBg: 'bg-emerald-100 hover:bg-emerald-200'
  },
};

// Geographic regions - Rampal and Nilganj are ~80km apart
const REGIONS = {
  all: {
    label: 'সব এলাকা',
    labelEn: 'All Areas',
    center: [89.9, 22.3],
    zoom: 9,
    bounds: [[89.5, 21.8], [90.3, 22.8]]
  },
  rampal: {
    label: 'রামপাল',
    labelEn: 'Rampal',
    center: [89.655, 22.645],
    zoom: 13,
    bounds: [[89.62, 22.62], [89.70, 22.68]]
  },
  nilganj: {
    label: 'নীলগঞ্জ',
    labelEn: 'Nilganj',
    center: [90.168, 21.955],
    zoom: 13,
    bounds: [[90.14, 21.92], [90.20, 22.00]]
  },
  farmland: {
    label: 'জমি/পুকুর',
    labelEn: 'Farmland',
    center: [89.66, 22.63],
    zoom: 14,
    bounds: [[89.64, 22.62], [89.68, 22.64]]
  }
};

export default function BipodBartaDashboard() {
  const router = useRouter();
  const mapContainer = useRef(null);
  const map = useRef(null);
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [smsText, setSmsText] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);
  const [hoveredFarmer, setHoveredFarmer] = useState(null);
  const [showPanel, setShowPanel] = useState(true);
  
  // Flood data state
  const [floodData, setFloodData] = useState(null);
  const [floodDataLoading, setFloodDataLoading] = useState(false);
  const [floodDataError, setFloodDataError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  // Farmland data state
  const [farmlandData, setFarmlandData] = useState(null);
  const [showFarmland, setShowFarmland] = useState(true);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [activeRegion, setActiveRegion] = useState('all'); // 'all', 'rampal', 'nilganj', 'farmland'

  // Fetch farmland data from KML
  const fetchFarmlandData = useCallback(async () => {
    try {
      const response = await fetch('/api/farmland?format=geojson');
      if (!response.ok) throw new Error('Failed to fetch farmland data');
      
      const data = await response.json();
      if (data.success) {
        setFarmlandData(data);
        console.log(`Loaded ${data.totalPlots} farmland plots`);
      }
    } catch (error) {
      console.error('Farmland fetch error:', error);
    }
  }, []);

  // Fetch farmers and flood data
  const fetchFloodData = useCallback(async () => {
    setFloodDataLoading(true);
    setFloodDataError(null);

    try {
      // First, fetch farmers from CSV data (all ~2000 farmers)
      const farmersResponse = await fetch('/api/farmers?limit=2000');
      if (!farmersResponse.ok) throw new Error('Failed to fetch farmer data');
      
      const farmersData = await farmersResponse.json();
      if (!farmersData.success) throw new Error(farmersData.error || 'Failed to load farmers');
      
      const loadedFarmers = farmersData.farmers;
      console.log(`Loaded ${loadedFarmers.length} farmers from API`);

      // Then, calculate flood risk for these farmers
      const response = await fetch('/api/flood-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmers: loadedFarmers })
      });

      if (!response.ok) throw new Error('Failed to fetch flood data');
      
      const data = await response.json();

      if (data.success) {
        setFarmers(data.farmers);
        setFloodData(data.floodData);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Flood data fetch error:', error);
      setFloodDataError(error.message);
      // Don't set fallback data - show the error
    } finally {
      setFloodDataLoading(false);
    }
  }, []);

  // Fly to region
  const flyToRegion = useCallback((regionKey) => {
    setActiveRegion(regionKey);
    if (map.current && REGIONS[regionKey]) {
      const region = REGIONS[regionKey];
      map.current.flyTo({
        center: region.center,
        zoom: region.zoom,
        duration: 1500
      });
    }
  }, []);

  // Initialize map with fast OpenStreetMap tiles
  useEffect(() => {
    console.log('Map init check:', { 
      hasContainer: !!mapContainer.current, 
      hasMap: !!map.current, 
      isAuthorized 
    });
    
    if (!mapContainer.current || map.current || !isAuthorized) return;

    console.log('Creating map...');
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: REGIONS.rampal.center,
      zoom: 12,
      minZoom: 5,
      maxZoom: 19,
      attributionControl: false,
      // Enable all interactions
      scrollZoom: true,
      boxZoom: true,
      dragRotate: false,
      dragPan: true,
      keyboard: true,
      doubleClickZoom: true,
      touchZoomRotate: true
    });

    // Add zoom controls with larger buttons
    map.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
        visualizePitch: false
      }), 
      'bottom-right'
    );

    map.current.on('load', () => {
      console.log('Map loaded successfully!');
      setMapLoaded(true);
    });
    
    map.current.on('error', (e) => {
      console.error('Map error:', e);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isAuthorized]);

  // Update farmers as GeoJSON layer (much faster than DOM markers)
  useEffect(() => {
    if (!map.current || !mapLoaded || farmers.length === 0) return;
    
    const FARMERS_SOURCE = 'farmers-source';
    const FARMERS_LAYER = 'farmers-layer';
    const FARMERS_LAYER_STROKE = 'farmers-layer-stroke';

    // Remove existing layers/source
    if (map.current.getLayer(FARMERS_LAYER_STROKE)) map.current.removeLayer(FARMERS_LAYER_STROKE);
    if (map.current.getLayer(FARMERS_LAYER)) map.current.removeLayer(FARMERS_LAYER);
    if (map.current.getSource(FARMERS_SOURCE)) map.current.removeSource(FARMERS_SOURCE);

    // Build GeoJSON from farmers
    const geojson = {
      type: 'FeatureCollection',
      features: farmers
        .filter(f => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng))
        .map(farmer => ({
          type: 'Feature',
          id: farmer.id,
          properties: {
            id: farmer.id,
            name: farmer.name,
            tier: farmer.tier || 'Green',
            union: farmer.union,
            upazila: farmer.upazila,
            phone: farmer.phone,
            region: farmer.region
          },
          geometry: {
            type: 'Point',
            coordinates: [farmer.lng, farmer.lat]
          }
        }))
    };

    console.log(`Creating GeoJSON layer with ${geojson.features.length} farmers`);

    // Add source
    map.current.addSource(FARMERS_SOURCE, {
      type: 'geojson',
      data: geojson
    });

    // Add white stroke layer (behind)
    map.current.addLayer({
      id: FARMERS_LAYER_STROKE,
      type: 'circle',
      source: FARMERS_SOURCE,
      paint: {
        'circle-radius': 10,
        'circle-color': '#ffffff',
        'circle-opacity': 1
      }
    });

    // Add colored fill layer
    map.current.addLayer({
      id: FARMERS_LAYER,
      type: 'circle',
      source: FARMERS_SOURCE,
      paint: {
        'circle-radius': 7,
        'circle-color': [
          'match',
          ['get', 'tier'],
          'Red', '#dc2626',
          'Yellow', '#d97706',
          '#16a34a' // Green default
        ],
        'circle-opacity': 1,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    // Click handler
    map.current.on('click', FARMERS_LAYER, (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates;
        const farmer = {
          id: props.id,
          name: props.name,
          tier: props.tier,
          union: props.union,
          upazila: props.upazila,
          phone: props.phone,
          region: props.region,
          lat: coords[1],
          lng: coords[0]
        };
        setSelectedFarmer(farmer);
        setShowPanel(true);
        map.current.flyTo({ center: coords, zoom: 15, duration: 800 });
      }
    });

    // Hover effects
    map.current.on('mouseenter', FARMERS_LAYER, (e) => {
      map.current.getCanvas().style.cursor = 'pointer';
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        setHoveredFarmer({ name: props.name, tier: props.tier, union: props.union, upazila: props.upazila, phone: props.phone });
      }
    });
    map.current.on('mouseleave', FARMERS_LAYER, () => {
      map.current.getCanvas().style.cursor = '';
      setHoveredFarmer(null);
    });

    console.log(`GeoJSON layer created successfully`);
  }, [farmers, mapLoaded]);

  // Check authorization
  useEffect(() => {
    const access = sessionStorage.getItem('bipodAccess');
    const accessTime = sessionStorage.getItem('bipodAccessTime');
    
    if (access === 'granted' && accessTime) {
      const elapsed = Date.now() - parseInt(accessTime);
      if (elapsed < 60 * 60 * 1000) {
        setIsAuthorized(true);
      } else {
        sessionStorage.removeItem('bipodAccess');
        sessionStorage.removeItem('bipodAccessTime');
        router.push('/');
      }
    } else {
      router.push('/');
    }
    setIsLoading(false);
  }, [router]);

  // Fetch flood data and farmland when authorized
  useEffect(() => {
    if (isAuthorized) {
      fetchFloodData();
      fetchFarmlandData();
    }
  }, [isAuthorized, fetchFloodData, fetchFarmlandData]);

  // Add farmland polygons to map
  useEffect(() => {
    if (!map.current || !mapLoaded || !farmlandData?.geojson) return;

    const FARMLAND_SOURCE = 'farmland-source';
    const FARMLAND_FILL_LAYER = 'farmland-fill';
    const FARMLAND_LINE_LAYER = 'farmland-line';
    const POND_FILL_LAYER = 'pond-fill';
    const POND_LINE_LAYER = 'pond-line';

    // Remove existing layers/sources
    [FARMLAND_FILL_LAYER, FARMLAND_LINE_LAYER, POND_FILL_LAYER, POND_LINE_LAYER].forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    if (map.current.getSource(FARMLAND_SOURCE)) {
      map.current.removeSource(FARMLAND_SOURCE);
    }

    // Separate ponds and farmland
    const pondFeatures = farmlandData.geojson.features.filter(f => f.properties.plotType === 'pond');
    const farmFeatures = farmlandData.geojson.features.filter(f => f.properties.plotType !== 'pond');

    // Add combined source
    map.current.addSource(FARMLAND_SOURCE, {
      type: 'geojson',
      data: farmlandData.geojson
    });

    // Add farmland fill layer (green tint)
    map.current.addLayer({
      id: FARMLAND_FILL_LAYER,
      type: 'fill',
      source: FARMLAND_SOURCE,
      filter: ['!=', ['get', 'plotType'], 'pond'],
      paint: {
        'fill-color': [
          'match',
          ['get', 'riskLevel'],
          'red', 'rgba(220, 38, 38, 0.4)',
          'yellow', 'rgba(217, 119, 6, 0.4)',
          'rgba(34, 197, 94, 0.4)' // Default green
        ],
        'fill-opacity': showFarmland ? 0.6 : 0
      }
    });

    // Add farmland outline layer
    map.current.addLayer({
      id: FARMLAND_LINE_LAYER,
      type: 'line',
      source: FARMLAND_SOURCE,
      filter: ['!=', ['get', 'plotType'], 'pond'],
      paint: {
        'line-color': [
          'match',
          ['get', 'riskLevel'],
          'red', '#dc2626',
          'yellow', '#d97706',
          '#16a34a' // Default green
        ],
        'line-width': 2,
        'line-opacity': showFarmland ? 1 : 0
      }
    });

    // Add pond fill layer (blue tint)
    map.current.addLayer({
      id: POND_FILL_LAYER,
      type: 'fill',
      source: FARMLAND_SOURCE,
      filter: ['==', ['get', 'plotType'], 'pond'],
      paint: {
        'fill-color': 'rgba(59, 130, 246, 0.4)',
        'fill-opacity': showFarmland ? 0.7 : 0
      }
    });

    // Add pond outline layer
    map.current.addLayer({
      id: POND_LINE_LAYER,
      type: 'line',
      source: FARMLAND_SOURCE,
      filter: ['==', ['get', 'plotType'], 'pond'],
      paint: {
        'line-color': '#3b82f6',
        'line-width': 2,
        'line-opacity': showFarmland ? 1 : 0
      }
    });

    // Click handler for polygons
    map.current.on('click', FARMLAND_FILL_LAYER, (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        setSelectedPlot(props);
      }
    });
    map.current.on('click', POND_FILL_LAYER, (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        setSelectedPlot(props);
      }
    });

    // Change cursor on hover
    map.current.on('mouseenter', FARMLAND_FILL_LAYER, () => {
      map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', FARMLAND_FILL_LAYER, () => {
      map.current.getCanvas().style.cursor = '';
    });
    map.current.on('mouseenter', POND_FILL_LAYER, () => {
      map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', POND_FILL_LAYER, () => {
      map.current.getCanvas().style.cursor = '';
    });

    console.log(`Added ${farmlandData.totalPlots} farmland polygons to map`);
  }, [farmlandData, mapLoaded, showFarmland]);

  const filteredFarmers = filterTier === 'all' 
    ? farmers 
    : farmers.filter(f => f.tier === filterTier);

  const stats = {
    total: farmers.length,
    red: farmers.filter(f => f.tier === 'Red').length,
    yellow: farmers.filter(f => f.tier === 'Yellow').length,
    green: farmers.filter(f => f.tier === 'Green').length,
  };

  const draftSms = (farmer) => {
    const messages = {
      Red: `🚨 বিপদ সতর্কতা: ${farmer.name}, আগামী ৭ দিনে বন্যার উচ্চ ঝুঁকি। নিরাপদ স্থানে সরে যান। - বিপদ বার্তা`,
      Yellow: `⚠️ সতর্কতা: ${farmer.name}, আগামী ৭ দিনে মাঝারি বন্যার ঝুঁকি। সতর্ক থাকুন। - বিপদ বার্তা`,
      Green: `ℹ️ ${farmer.name}, বন্যার ঝুঁকি কম। আবহাওয়ার খবর অনুসরণ করুন। - বিপদ বার্তা`
    };
    return messages[farmer.tier] || messages.Green;
  };

  const openSmsModal = (farmer) => {
    setSelectedFarmer(farmer);
    setSmsText(draftSms(farmer));
    setShowSmsModal(true);
    setSmsSuccess(false);
  };

  const sendSms = async () => {
    setSmsSending(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSmsSending(false);
    setSmsSuccess(true);
    setTimeout(() => {
      setShowSmsModal(false);
      setSelectedFarmer(null);
      setSmsText('');
    }, 2000);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('bipodAccess');
    sessionStorage.removeItem('bipodAccessTime');
    router.push('/');
  };

  const flyToFarmer = (farmer) => {
    setSelectedFarmer(farmer);
    if (map.current) {
      map.current.flyTo({ center: [farmer.lng, farmer.lat], zoom: 16, duration: 1500 });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin"></div>
          </div>
          <p className="text-gray-500 font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Map control styles */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
        
        .maplibregl-ctrl-group {
          background: white !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
          overflow: hidden;
        }
        .maplibregl-ctrl-group button {
          width: 44px !important;
          height: 44px !important;
        }
        .maplibregl-ctrl-group button span {
          font-size: 20px !important;
        }
        .maplibregl-ctrl-group button:hover {
          background: #f3f4f6 !important;
        }
        .maplibregl-canvas {
          cursor: grab;
        }
        .maplibregl-canvas:active {
          cursor: grabbing;
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                বিপদ বার্তা
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Early Flood Warning System
              </p>
            </div>
          </div>
          
          {/* Live indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-emerald-600">LIVE</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all text-sm font-medium shadow-lg shadow-blue-500/20"
          >
            টিয়া আপা
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
            title="Exit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content - Full Width Map */}
      <div className="flex-1 relative" style={{ minHeight: 'calc(100vh - 80px)' }}>
        {/* Map Container - Full screen */}
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ minHeight: '400px' }} />
        
        {/* Top Left - Stats Cards */}
        <div className="absolute top-4 left-4 z-10 space-y-3">
          {/* Region Selector */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2">
            <div className="flex gap-1">
              {Object.entries(REGIONS).map(([key, region]) => (
                <button
                  key={key}
                  onClick={() => flyToRegion(key)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeRegion === key
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}
                >
                  {region.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-100 p-4">
            <div className="flex items-center gap-6">
              <div className="text-center px-2">
                <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
                <p className="text-xs text-gray-500 font-medium mt-1">মোট কৃষক</p>
              </div>
              <div className="h-12 w-px bg-gray-200"></div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <p className="text-xl font-bold text-red-600">{stats.red}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">উচ্চ</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <p className="text-xl font-bold text-amber-600">{stats.yellow}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">মাঝারি</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <p className="text-xl font-bold text-emerald-600">{stats.green}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">কম</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Farmland Toggle */}
          {farmlandData && (
            <button
              onClick={() => setShowFarmland(!showFarmland)}
              className={`flex items-center gap-3 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 px-4 py-3 transition-all hover:shadow-xl ${showFarmland ? 'ring-2 ring-emerald-500' : ''}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${showFarmland ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                <svg className={`w-5 h-5 ${showFarmland ? 'text-emerald-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                  জমি ও পুকুর
                </p>
                <p className="text-xs text-gray-500">
                  {farmlandData.totalPlots} plots • {farmlandData.totalFarmers} farmers
                </p>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors ${showFarmland ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${showFarmland ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
              </div>
            </button>
          )}
        </div>

        {/* Bottom Left - Forecast Banner */}
        <div className="absolute bottom-4 left-4 z-10" style={{ maxWidth: showPanel ? 'calc(100% - 380px)' : 'calc(100% - 80px)' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>৭ দিনের বন্যা পূর্বাভাস</p>
                <p className="text-xs text-gray-500">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Loading...'} 
                  <span className="mx-1">•</span>
                  <span className="text-blue-600">Google Flood Hub</span>
                  {floodData?.isMock && <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">DEMO</span>}
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchFloodData()}
              disabled={floodDataLoading}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all flex items-center gap-2 text-sm font-medium text-gray-700"
            >
              <svg className={`w-4 h-4 ${floodDataLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {floodDataLoading ? 'Syncing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Hovered Farmer Tooltip */}
        {hoveredFarmer && !showPanel && (
          <div className="absolute top-4 right-4 z-20 bg-white rounded-xl shadow-xl border border-gray-100 p-4 min-w-[220px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: RISK_CONFIG[hoveredFarmer.tier]?.color }}></div>
              <p className="font-semibold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>{hoveredFarmer.name}</p>
            </div>
            <p className="text-sm text-gray-600">{hoveredFarmer.union}, {hoveredFarmer.upazila}</p>
            <p className="text-xs text-gray-400 mt-1">{hoveredFarmer.phone}</p>
          </div>
        )}

        {/* Custom Zoom Controls - Bottom Right */}
        <div className="absolute bottom-24 right-4 z-10 flex flex-col gap-2">
          <button
            onClick={() => map.current?.zoomIn({ duration: 300 })}
            className="w-12 h-12 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-all text-2xl font-bold text-gray-700"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => map.current?.zoomOut({ duration: 300 })}
            className="w-12 h-12 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-all text-2xl font-bold text-gray-700"
            title="Zoom Out"
          >
            −
          </button>
        </div>

        {/* Toggle Panel Button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="absolute top-4 right-4 z-20 w-10 h-10 bg-white rounded-xl shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          style={{ right: showPanel ? '340px' : '16px' }}
        >
          <svg className={`w-5 h-5 text-gray-600 transition-transform ${showPanel ? 'rotate-0' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Right Panel - Collapsible */}
        <div 
          className={`absolute top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col z-10 transition-transform duration-300 ${showPanel ? 'translate-x-0' : 'translate-x-full'}`}
        >
          {/* Panel Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>কৃষক তালিকা</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{filteredFarmers.length} জন</span>
            </div>
            
            {/* Filter Pills */}
            <div className="flex gap-1">
              {['all', 'Red', 'Yellow', 'Green'].map((tier) => (
                <button
                  key={tier}
                  onClick={() => setFilterTier(tier)}
                  className={`flex-1 px-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                    filterTier === tier 
                      ? tier === 'all' 
                        ? 'bg-gray-800 text-white shadow-lg' 
                        : `${RISK_CONFIG[tier].bg} ${RISK_CONFIG[tier].text} border-2 ${RISK_CONFIG[tier].border}`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tier === 'all' ? 'সব' : RISK_CONFIG[tier].label}
                </button>
              ))}
            </div>
          </div>

          {/* Farmer List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredFarmers.map((farmer) => {
              const config = RISK_CONFIG[farmer.tier] || RISK_CONFIG.Green;
              const isSelected = selectedFarmer?.id === farmer.id;
              
              return (
                <div
                  key={farmer.id}
                  onClick={() => flyToFarmer(farmer)}
                  className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
                    isSelected 
                      ? `${config.bg} ${config.border} shadow-md` 
                      : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" 
                          style={{ background: config.color }}
                        ></div>
                        <p className="font-semibold text-gray-800 truncate" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                          {farmer.name}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{farmer.union}, {farmer.upazila}</p>
                      <p className="text-xs text-gray-400 mt-1">{farmer.phone}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openSmsModal(farmer); }}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${config.btnBg} ${config.text}`}
                    >
                      SMS
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panel Footer */}
          <div className="p-4 border-t border-gray-100 bg-amber-50">
            <div className="flex items-start gap-2 text-xs text-amber-700">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                SMS পাঠানোর আগে পর্যালোচনা করুন। স্বয়ংক্রিয় বার্তা পাঠানো হয় না।
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SMS Modal */}
      {showSmsModal && selectedFarmer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full border-2 border-white" 
                    style={{ background: RISK_CONFIG[selectedFarmer.tier]?.color }}
                  ></div>
                  <div>
                    <h3 className="font-bold text-white" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>SMS পর্যালোচনা</h3>
                    <p className="text-xs text-white/80">{selectedFarmer.name} • {selectedFarmer.phone}</p>
                  </div>
                </div>
                <button onClick={() => setShowSmsModal(false)} className="text-white/80 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {smsSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-800" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>SMS সফলভাবে পাঠানো হয়েছে!</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                      বার্তা সম্পাদনা করুন
                    </label>
                    <textarea
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800 text-sm resize-none transition-all"
                      style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}
                    />
                    <div className="flex justify-between mt-2 text-xs">
                      <span className="text-gray-500">{smsText.length} characters</span>
                      <span className={smsText.length > 160 ? 'text-red-500 font-medium' : 'text-gray-500'}>
                        {smsText.length > 160 ? 'Over limit!' : `${160 - smsText.length} remaining`}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowSmsModal(false)}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                    >
                      বাতিল
                    </button>
                    <button
                      onClick={sendSms}
                      disabled={smsSending || smsText.length === 0}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      {smsSending ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          পাঠান
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Farmland Plot Details Modal */}
      {selectedPlot && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className={`px-5 py-4 ${selectedPlot.plotType === 'pond' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    {selectedPlot.plotType === 'pond' ? (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                      {selectedPlot.plotType === 'pond' ? 'পুকুর' : 'জমি'} বিবরণ
                    </h3>
                    <p className="text-xs text-white/80">{selectedPlot.farmerName}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedPlot(null)} className="text-white/80 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                  {selectedPlot.name}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedPlot.plotType === 'pond' ? 'Pond' : selectedPlot.plotType === 'joint' ? 'Joint Plot' : 'Farmland'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-emerald-700">
                    {selectedPlot.area ? `${(selectedPlot.area / 10000).toFixed(2)}` : '—'}
                  </p>
                  <p className="text-xs text-emerald-600">হেক্টর (Area)</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-blue-700">
                    {selectedPlot.perimeter ? `${selectedPlot.perimeter}` : '—'}
                  </p>
                  <p className="text-xs text-blue-600">মিটার (Perimeter)</p>
                </div>
              </div>

              {/* Risk Level */}
              <div className={`rounded-xl p-4 ${
                selectedPlot.riskLevel === 'red' ? 'bg-red-50 border-2 border-red-200' :
                selectedPlot.riskLevel === 'yellow' ? 'bg-amber-50 border-2 border-amber-200' :
                'bg-emerald-50 border-2 border-emerald-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${
                    selectedPlot.riskLevel === 'red' ? 'bg-red-500' :
                    selectedPlot.riskLevel === 'yellow' ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`}></div>
                  <div>
                    <p className={`text-sm font-semibold ${
                      selectedPlot.riskLevel === 'red' ? 'text-red-700' :
                      selectedPlot.riskLevel === 'yellow' ? 'text-amber-700' :
                      'text-emerald-700'
                    }`} style={{ fontFamily: 'Noto Sans Bengali, sans-serif' }}>
                      {selectedPlot.riskLevel === 'red' ? 'উচ্চ ঝুঁকি' :
                       selectedPlot.riskLevel === 'yellow' ? 'মাঝারি ঝুঁকি' :
                       'কম ঝুঁকি'}
                    </p>
                    <p className="text-xs text-gray-500">Flood Risk Level</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedPlot(null)}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-semibold"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
