import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('Store-query API called');
    
    const body = await request.json();
    console.log('Store-query API received:', body);
    
    const { 
      email, 
      location, 
      clinicName, 
      query, 
      answer, 
      queryType, 
      hasImage = false, 
      isVoice = false 
    } = body;

    // Validate required fields
    if (!email || !location || !clinicName || !query || !answer) {
      console.log('Missing required fields');
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 });
    }

    // Determine final query type
    let finalQueryType = queryType;
    if (hasImage) {
      finalQueryType = 'Image';
    } else if (isVoice) {
      finalQueryType = 'Voice';
    } else if (!finalQueryType) {
      finalQueryType = 'Text';
    }
    
    console.log('Final query type:', finalQueryType);

    // Create data object for logging
    const queryData = {
      timestamp: new Date().toISOString(),
      email,
      location,
      clinicName,
      queryType: finalQueryType,
      query,
      answer: answer.substring(0, 500) + '...', // Truncate for logging
      hasImage,
      isVoice
    };

    // Log the query data to console
    console.log('=== QUERY DATA LOG ===');
    console.log('Timestamp:', queryData.timestamp);
    console.log('Email:', queryData.email);
    console.log('Location:', queryData.location);
    console.log('Clinic:', queryData.clinicName);
    console.log('Query Type:', queryData.queryType);
    console.log('Query:', queryData.query);
    console.log('Answer (truncated):', queryData.answer);
    console.log('Has Image:', queryData.hasImage);
    console.log('Is Voice:', queryData.isVoice);
    console.log('=====================');

    // Return success response
    return NextResponse.json({ 
      success: true, 
      message: 'Query logged successfully',
      data: {
        timestamp: queryData.timestamp,
        queryType: finalQueryType
      }
    });

  } catch (error) {
    console.error('Store-query API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
} 