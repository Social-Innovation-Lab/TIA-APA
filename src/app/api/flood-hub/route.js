import { NextResponse } from 'next/server';
import { 
  fetchFloodForecasts, 
  fetchInundationMap, 
  generateMockFloodData,
  generateStableMockData,
  getMonitoredRegions,
  calculateRiskTier
} from '../../../lib/floodHub';

// Cache flood data for 1 hour to reduce API calls
let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * GET /api/flood-hub
 * 
 * Fetch flood forecast data from Google Flood Hub
 * Query params:
 *   - region: (optional) specific region ID to fetch
 *   - refresh: (optional) force refresh cache
 *   - mock: (optional) use mock data for testing
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const forceRefresh = searchParams.get('refresh') === 'true';
    const useMock = searchParams.get('mock') === 'true';

    // Check if we should use mock data
    const apiKey = process.env.GOOGLE_FLOOD_HUB_API_KEY;
    
    if (useMock || !apiKey) {
      // Return mock data if no API key or mock requested
      const mockData = generateMockFloodData();
      return NextResponse.json({
        ...mockData,
        message: apiKey ? 'Mock data requested' : 'No API key configured - using mock data'
      });
    }

    // Check cache
    const now = Date.now();
    if (!forceRefresh && cachedData && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({
        ...cachedData,
        fromCache: true
      });
    }

    // Fetch fresh data from Google Flood Hub
    const data = await fetchFloodForecasts(apiKey, { region });

    if (data.success) {
      // Update cache
      cachedData = data;
      cacheTimestamp = now;
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Flood Hub API route error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/flood-hub
 * 
 * Calculate risk for farmers based on their locations
 * Body:
 *   - farmers: array of { id, lat, lng, ... }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { farmers } = body;

    if (!farmers || !Array.isArray(farmers)) {
      return NextResponse.json(
        { success: false, error: 'farmers array is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_FLOOD_HUB_API_KEY;
    
    // Get flood forecasts from Google Flood Forecasting API
    let floodData;
    
    if (!apiKey) {
      console.log('No API key - using stable demo data');
      floodData = generateStableMockData();
    } else {
      // Try real API first
      console.log('Calling Google Flood Forecasting API...');
      floodData = await fetchFloodForecasts(apiKey);
      
      // If API fails, use stable mock data
      if (!floodData.success || floodData.forecasts?.every(f => f.error)) {
        console.log('API failed - using stable demo data');
        floodData = generateStableMockData();
      }
    }

    // Calculate risk for each farmer
    const farmersWithRisk = farmers.map(farmer => {
      // Find the relevant region forecast for this farmer
      const relevantForecast = floodData.forecasts?.find(f => {
        const bounds = f.region?.bounds;
        if (!bounds || !farmer.lat || !farmer.lng) return false;
        
        return (
          farmer.lat >= bounds.south &&
          farmer.lat <= bounds.north &&
          farmer.lng >= bounds.west &&
          farmer.lng <= bounds.east
        );
      });

      const tier = calculateRiskTier(relevantForecast, { lat: farmer.lat, lng: farmer.lng });
      
      // Calculate risk score (0-1)
      let riskScore = 0.2;
      if (tier === 'Yellow') riskScore = 0.5 + Math.random() * 0.2;
      if (tier === 'Red') riskScore = 0.7 + Math.random() * 0.25;

      return {
        ...farmer,
        tier,
        riskScore: Math.round(riskScore * 100) / 100,
        forecastData: relevantForecast?.forecast || null
      };
    });

    return NextResponse.json({
      success: true,
      farmers: farmersWithRisk,
      floodData: {
        fetchedAt: floodData.fetchedAt,
        isMock: floodData.isMock || false,
        regions: floodData.forecasts?.map(f => ({
          id: f.region?.id,
          name: f.region?.name,
          riskLevel: f.forecast?.riskLevel
        }))
      }
    });

  } catch (error) {
    console.error('Flood Hub risk calculation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/flood-hub/regions
 * 
 * Get list of monitored regions
 */
export async function OPTIONS() {
  return NextResponse.json({
    regions: getMonitoredRegions()
  });
}

