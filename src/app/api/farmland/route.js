import { NextResponse } from 'next/server';
import { loadFarmlandData, toGeoJSON } from '../../../lib/kmlParser';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    
    const farmlandData = await loadFarmlandData();
    
    if (format === 'geojson') {
      return NextResponse.json({
        success: true,
        geojson: toGeoJSON(farmlandData.plots),
        totalPlots: farmlandData.totalPlots,
        totalFarmers: farmlandData.totalFarmers
      });
    }
    
    return NextResponse.json({
      success: true,
      ...farmlandData,
      message: `Loaded ${farmlandData.totalPlots} farmland plots for ${farmlandData.totalFarmers} farmers`
    });
  } catch (error) {
    console.error('API error loading farmland:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

