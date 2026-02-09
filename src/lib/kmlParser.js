/**
 * KML Parser for farmland/pond data
 * Extracts polygon coordinates and farmer information from Google Earth KML exports
 */

import fs from 'fs/promises';
import path from 'path';

const KML_PATH = path.join(process.cwd(), 'data', 'Bangladesh - Ponds.kml');

/**
 * Parse coordinate string from KML format to array of [lng, lat] pairs
 * KML format: "lng,lat,alt lng,lat,alt ..."
 */
function parseCoordinates(coordString) {
  if (!coordString) return [];
  
  return coordString
    .trim()
    .split(/\s+/)
    .filter(c => c.length > 0)
    .map(coord => {
      const [lng, lat] = coord.split(',').map(parseFloat);
      return [lng, lat];
    })
    .filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));
}

/**
 * Calculate polygon area using Shoelace formula (in square meters approximately)
 */
function calculateArea(coordinates) {
  if (coordinates.length < 3) return 0;
  
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }
  
  // Convert from degrees to approximate square meters (at Bangladesh latitude ~22°)
  // 1 degree latitude ≈ 111,000m, 1 degree longitude ≈ 102,000m at 22°N
  const areaInDegrees = Math.abs(area) / 2;
  const areaInSqMeters = areaInDegrees * 111000 * 102000;
  
  return Math.round(areaInSqMeters);
}

/**
 * Calculate polygon perimeter (in meters approximately)
 */
function calculatePerimeter(coordinates) {
  if (coordinates.length < 2) return 0;
  
  let perimeter = 0;
  
  for (let i = 0; i < coordinates.length; i++) {
    const j = (i + 1) % coordinates.length;
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[j];
    
    // Haversine approximation for short distances
    const dLat = (lat2 - lat1) * 111000;
    const dLng = (lng2 - lng1) * 102000; // at ~22°N
    perimeter += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  
  return Math.round(perimeter);
}

/**
 * Calculate centroid of polygon
 */
function calculateCentroid(coordinates) {
  if (coordinates.length === 0) return { lng: 0, lat: 0 };
  
  let sumLng = 0;
  let sumLat = 0;
  
  for (const [lng, lat] of coordinates) {
    sumLng += lng;
    sumLat += lat;
  }
  
  return {
    lng: sumLng / coordinates.length,
    lat: sumLat / coordinates.length
  };
}

/**
 * Extract farmer name from placemark name (e.g., "Kamal Talukder -P1" -> "Kamal Talukder")
 */
function extractFarmerName(placemarkName) {
  if (!placemarkName) return 'Unknown';
  
  // Remove suffixes like -P1, -F1, - P1, - F1, etc.
  return placemarkName
    .replace(/\s*[-–]\s*(P|F|J)\d+\s*$/i, '')
    .trim();
}

/**
 * Extract plot type from placemark name (P = Pond, F = Farmland, J = Joint/Other)
 */
function extractPlotType(placemarkName) {
  if (!placemarkName) return 'unknown';
  
  const match = placemarkName.match(/[-–]\s*(P|F|J)(\d+)\s*$/i);
  if (!match) return 'farmland';
  
  const type = match[1].toUpperCase();
  if (type === 'P') return 'pond';
  if (type === 'F') return 'farmland';
  if (type === 'J') return 'joint';
  return 'unknown';
}

/**
 * Simple XML tag content extractor
 */
function getTagContent(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract all Placemarks from KML content
 */
function extractPlacemarks(kmlContent) {
  const placemarks = [];
  const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let match;
  
  while ((match = placemarkRegex.exec(kmlContent)) !== null) {
    const placemarkXml = match[1];
    
    const name = getTagContent(placemarkXml, 'name');
    const coordsMatch = placemarkXml.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    
    if (name && coordsMatch) {
      const coordinates = parseCoordinates(coordsMatch[1]);
      
      if (coordinates.length >= 3) {
        const centroid = calculateCentroid(coordinates);
        const area = calculateArea(coordinates);
        const perimeter = calculatePerimeter(coordinates);
        const farmerName = extractFarmerName(name);
        const plotType = extractPlotType(name);
        
        placemarks.push({
          id: `farm_${placemarks.length + 1}`,
          name: name,
          farmerName: farmerName,
          plotType: plotType,
          coordinates: coordinates,
          centroid: centroid,
          area: area, // square meters
          perimeter: perimeter, // meters
          riskLevel: 'green' // Default, will be updated based on flood data
        });
      }
    }
  }
  
  return placemarks;
}

/**
 * Load and parse farmland data from KML file
 */
export async function loadFarmlandData() {
  try {
    const kmlContent = await fs.readFile(KML_PATH, 'utf8');
    const placemarks = extractPlacemarks(kmlContent);
    
    // Group by farmer
    const farmerMap = new Map();
    
    for (const placemark of placemarks) {
      if (!farmerMap.has(placemark.farmerName)) {
        farmerMap.set(placemark.farmerName, {
          name: placemark.farmerName,
          plots: []
        });
      }
      farmerMap.get(placemark.farmerName).plots.push(placemark);
    }
    
    console.log(`Loaded ${placemarks.length} farmland plots for ${farmerMap.size} farmers from KML`);
    
    return {
      plots: placemarks,
      farmers: Array.from(farmerMap.values()),
      totalPlots: placemarks.length,
      totalFarmers: farmerMap.size
    };
  } catch (error) {
    console.error('Error loading farmland data:', error);
    return {
      plots: [],
      farmers: [],
      totalPlots: 0,
      totalFarmers: 0,
      error: error.message
    };
  }
}

/**
 * Convert plot data to GeoJSON for MapLibre
 */
export function toGeoJSON(plots) {
  return {
    type: 'FeatureCollection',
    features: plots.map(plot => ({
      type: 'Feature',
      id: plot.id,
      properties: {
        id: plot.id,
        name: plot.name,
        farmerName: plot.farmerName,
        plotType: plot.plotType,
        area: plot.area,
        perimeter: plot.perimeter,
        riskLevel: plot.riskLevel
      },
      geometry: {
        type: 'Polygon',
        coordinates: [plot.coordinates]
      }
    }))
  };
}

