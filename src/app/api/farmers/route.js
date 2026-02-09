import { NextResponse } from 'next/server';
import { getFarmersForFloodRisk, getFarmerStats, loadFarmers } from '../../../lib/farmerData';

/**
 * GET /api/farmers
 * 
 * Get farmer data from CSV files
 * Query params:
 *   - limit: (optional) max number of farmers to return (default: 100)
 *   - region: (optional) filter by region (Rampal or Nilganj)
 *   - stats: (optional) if 'true', return statistics instead of farmer list
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const region = searchParams.get('region');
    const showStats = searchParams.get('stats') === 'true';

    // Return statistics if requested
    if (showStats) {
      const stats = getFarmerStats();
      return NextResponse.json({
        success: true,
        stats
      });
    }

    // Get farmers
    let farmers = getFarmersForFloodRisk(limit);

    // Filter by region if specified
    if (region) {
      farmers = farmers.filter(f => f.region.toLowerCase() === region.toLowerCase());
    }

    return NextResponse.json({
      success: true,
      farmers,
      total: farmers.length,
      message: `Loaded ${farmers.length} farmers from CSV data`
    });

  } catch (error) {
    console.error('Farmers API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

