/**
 * Google Flood Forecasting API Integration
 * 
 * This module handles communication with Google Flood Forecasting API
 * to fetch flood forecasts and risk data for Bangladesh.
 * 
 * API Base: https://floodforecasting.googleapis.com/v1
 * Available Endpoints:
 *   - POST /v1/floodStatus:searchLatestFloodStatusByArea
 *   - POST /v1/gauges:searchGaugesByArea
 *   - GET  /v1/gauges:queryGaugeForecasts
 */

// Target regions for monitoring
const MONITORED_REGIONS = [
  {
    id: 'nilganj',
    name: 'নীলগঞ্জ',
    district: 'পটুয়াখালী',
    bounds: {
      north: 22.00,
      south: 21.90,
      east: 90.20,
      west: 90.14
    },
    center: { lat: 21.955, lng: 90.168 }
  },
  {
    id: 'rampal',
    name: 'রামপাল',
    district: 'বাগেরহাট',
    bounds: {
      north: 22.70,
      south: 22.60,
      east: 89.70,
      west: 89.62
    },
    center: { lat: 22.65, lng: 89.66 }
  }
];

// Nearest known gauges to our target areas (based on API discovery)
const NEAREST_GAUGES = [
  {
    gaugeId: 'BWDB_SW162',
    siteName: 'Jhikargacha',
    river: 'Kobadak',
    location: { lat: 23.101868, lng: 89.096763 },
    nearestTo: 'rampal',
    distanceKm: 76.5
  },
  {
    gaugeId: 'BWDB_SW5',
    siteName: 'Madaripur',
    river: 'Arialkhan',
    location: { lat: 23.1878, lng: 90.2098 },
    nearestTo: 'nilganj',
    distanceKm: 137.3
  }
];

const API_BASE = 'https://floodforecasting.googleapis.com/v1';

/**
 * Calculate haversine distance between two points in km
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch current flood status from Google Flood Forecasting API
 * 
 * @param {string} apiKey - Google API key
 * @returns {Promise<object>} Flood status data for Bangladesh
 */
export async function fetchFloodForecasts(apiKey) {
  console.log('=== Google Flood Forecasting API ===');
  console.log('API Key:', apiKey ? `${apiKey.slice(0, 10)}...` : 'NOT SET');

  try {
    // Fetch current flood status for Bangladesh
    const response = await fetch(`${API_BASE}/floodStatus:searchLatestFloodStatusByArea?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        regionCode: 'BD',
        pageSize: 100
      })
    });

    if (!response.ok) {
      console.error('Flood API error:', response.status);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const floodStatuses = data.floodStatuses || [];
    
    console.log(`Received ${floodStatuses.length} flood status records`);

    // Process and attach to monitored regions
    const forecasts = MONITORED_REGIONS.map(region => {
      // Find the nearest gauge with flood data
      const nearestGaugeInfo = NEAREST_GAUGES.find(g => g.nearestTo === region.id);
      
      // Find flood status for nearest gauge
      const gaugeStatus = nearestGaugeInfo 
        ? floodStatuses.find(s => s.gaugeId === nearestGaugeInfo.gaugeId)
        : null;

      // If no direct gauge, find any gauge within 150km
      let nearestStatus = gaugeStatus;
      let nearestDistance = nearestGaugeInfo?.distanceKm || 999;

      if (!gaugeStatus) {
        for (const status of floodStatuses) {
          if (status.gaugeLocation) {
            const dist = haversineDistance(
              region.center.lat, region.center.lng,
              status.gaugeLocation.latitude, status.gaugeLocation.longitude
            );
            if (dist < nearestDistance) {
              nearestDistance = dist;
              nearestStatus = status;
            }
          }
        }
      }

      // Map severity to risk level
      let riskLevel = 'unknown';
      if (nearestStatus?.severity) {
        switch (nearestStatus.severity) {
          case 'EXTREME':
          case 'SEVERE':
            riskLevel = 'high';
            break;
          case 'MODERATE':
          case 'MINOR':
            riskLevel = 'medium';
            break;
          case 'NO_FLOODING':
            riskLevel = 'low';
            break;
          default:
            riskLevel = 'unknown';
        }
      }

      return {
        region,
        forecast: {
          riskLevel,
          severity: nearestStatus?.severity || 'NO_DATA',
          nearestGauge: nearestStatus ? {
            gaugeId: nearestStatus.gaugeId,
            location: nearestStatus.gaugeLocation,
            distanceKm: Math.round(nearestDistance)
          } : null,
          issuedTime: nearestStatus?.issuedTime || new Date().toISOString(),
          source: nearestStatus?.source || 'N/A',
          hasDirectData: nearestDistance < 50,
          dataQuality: nearestDistance < 50 ? 'direct' : nearestDistance < 100 ? 'proxy' : 'distant'
        },
        fetchedAt: new Date().toISOString()
      };
    });

    return {
      success: true,
      forecasts,
      totalGauges: floodStatuses.length,
      fetchedAt: new Date().toISOString(),
      isMock: false
    };

  } catch (error) {
    console.error('Flood API error:', error);
    return {
      success: false,
      error: error.message,
      fetchedAt: new Date().toISOString()
    };
  }
}

/**
 * Fetch flood inundation map data (GeoJSON)
 */
export async function fetchInundationMap(apiKey, bounds) {
  // Not implemented - requires additional API access
  return { success: false, error: 'Inundation maps not available in this API version' };
}

/**
 * Fetch gauge station data
 */
export async function fetchGaugeData(apiKey, stationId) {
  try {
    const response = await fetch(`${API_BASE}/gauges/${stationId}?key=${apiKey}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, gauge: data, fetchedAt: new Date().toISOString() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Calculate risk tier based on flood forecast data
 * 
 * @param {object} forecast - Flood forecast data
 * @param {object} farmerLocation - Farmer's location { lat, lng }
 * @returns {string} Risk tier: 'Red', 'Yellow', or 'Green'
 */
export function calculateRiskTier(forecast, farmerLocation) {
  if (!forecast) {
    return 'Green'; // Default to low risk if no data
  }

  const riskLevel = forecast.forecast?.riskLevel || forecast.riskLevel;
  
  switch (riskLevel) {
    case 'high':
      return 'Red';
    case 'medium':
      return 'Yellow';
    case 'low':
    case 'unknown':
    default:
      return 'Green';
  }
}

/**
 * Get monitored regions
 */
export function getMonitoredRegions() {
  return MONITORED_REGIONS;
}

/**
 * Generate mock flood data for testing when API is unavailable
 */
export function generateMockFloodData() {
  const riskLevels = ['low', 'medium', 'high'];
  
  return {
    success: true,
    forecasts: MONITORED_REGIONS.map(region => ({
      region,
      forecast: {
        riskLevel: riskLevels[Math.floor(Math.random() * 3)],
        floodProbability: Math.random(),
        waterLevel: {
          current: 2.5 + Math.random() * 3,
          predicted: 3.0 + Math.random() * 4,
          dangerLevel: 6.5
        },
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      fetchedAt: new Date().toISOString()
    })),
    fetchedAt: new Date().toISOString(),
    isMock: true
  };
}

/**
 * Generate STABLE mock flood data based on REAL API patterns
 * Uses "NO_FLOODING" which matches current Bangladesh status
 */
export function generateStableMockData() {
  return {
    success: true,
    forecasts: MONITORED_REGIONS.map(region => {
      const nearestGauge = NEAREST_GAUGES.find(g => g.nearestTo === region.id);
      
      return {
        region,
        forecast: {
          riskLevel: 'low',  // Based on current real API data showing NO_FLOODING
          severity: 'NO_FLOODING',
          nearestGauge: nearestGauge ? {
            gaugeId: nearestGauge.gaugeId,
            siteName: nearestGauge.siteName,
            river: nearestGauge.river,
            distanceKm: nearestGauge.distanceKm
          } : null,
          issuedTime: new Date().toISOString(),
          source: 'DEMO',
          hasDirectData: false,
          dataQuality: 'distant',
          note: `No direct gauge in ${region.name}. Nearest: ${nearestGauge?.siteName || 'Unknown'} (${nearestGauge?.distanceKm || '?'}km)`
        },
        fetchedAt: new Date().toISOString()
      };
    }),
    fetchedAt: new Date().toISOString(),
    isMock: true,
    isStable: true,
    note: 'Using stable demo data. Actual API shows NO_FLOODING for Bangladesh.'
  };
}
