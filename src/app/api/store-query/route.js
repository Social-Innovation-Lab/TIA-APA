import { NextResponse } from 'next/server';
import { insertQuery } from '../../../lib/db';

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

    // Prepare data for database insertion
    const queryData = {
      userContact: email, // Using email field as user contact
      clinicName: clinicName,
      queryType: finalQueryType,
      queryText: query,
      answer: answer
    };

    // Log the query data to console (for debugging)
    console.log('=== SAVING TO DATABASE ===');
    console.log('User Contact:', queryData.userContact);
    console.log('Clinic:', queryData.clinicName);
    console.log('Query Type:', queryData.queryType);
    console.log('Query:', queryData.queryText);
    console.log('Answer Length:', queryData.answer.length);
    console.log('========================');

    try {
      // Save to Neon database
      const dbResult = await insertQuery(queryData);
      console.log('Successfully saved to database:', dbResult);

      // Return success response
      return NextResponse.json({ 
        success: true, 
        message: 'Query saved to database successfully',
        data: {
          id: dbResult.id,
          timestamp: dbResult.created_at,
          queryType: finalQueryType
        }
      });

    } catch (dbError) {
      console.error('Database insertion error:', dbError);
      
      // If database fails, still log to console as fallback
      console.log('=== FALLBACK: CONSOLE LOG ===');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Email:', email);
      console.log('Location:', location);
      console.log('Clinic:', clinicName);
      console.log('Query Type:', finalQueryType);
      console.log('Query:', query);
      console.log('Answer (truncated):', answer.substring(0, 500) + '...');
      console.log('Has Image:', hasImage);
      console.log('Is Voice:', isVoice);
      console.log('============================');

      // Return success even if database fails (fallback to console logging)
      return NextResponse.json({ 
        success: true, 
        message: 'Query logged to console (database unavailable)',
        data: {
          timestamp: new Date().toISOString(),
          queryType: finalQueryType,
          fallback: true
        }
      });
    }

  } catch (error) {
    console.error('Store-query API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
} 