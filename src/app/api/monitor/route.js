import { NextResponse } from 'next/server';
import { getAllQueries, getQueryStats } from '../../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'queries';
    const limit = parseInt(searchParams.get('limit')) || 50;

    if (action === 'stats') {
      // Get query statistics
      const stats = await getQueryStats();
      
      return NextResponse.json({
        success: true,
        data: {
          totalQueries: parseInt(stats.total_queries),
          uniqueClinics: parseInt(stats.unique_clinics),
          queriesLast24h: parseInt(stats.queries_last_24h),
          queriesLast7d: parseInt(stats.queries_last_7d)
        }
      });

    } else {
      // Get recent queries
      const queries = await getAllQueries(limit);
      
      return NextResponse.json({
        success: true,
        data: queries.map(query => ({
          id: query.id,
          userContact: query.user_contact,
          clinicName: query.clinic_name,
          queryType: query.query_type,
          query: query.query,
          answer: query.answer.substring(0, 200) + '...', // Truncate for display
          createdAt: query.created_at
        }))
      });
    }

  } catch (error) {
    console.error('Monitor API error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch data',
      details: error.message
    }, { status: 500 });
  }
} 