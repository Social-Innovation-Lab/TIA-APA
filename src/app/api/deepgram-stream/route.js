import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Return WebSocket connection details for client-side streaming
    return NextResponse.json({
      wsUrl: 'wss://api.deepgram.com/v1/listen',
      apiKey: process.env.DEEPGRAM_API_KEY,
      config: {
        model: 'nova-3',
        language: 'multi',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        endpointing: 100, // Recommended for code-switching
        sample_rate: 16000,
        encoding: 'linear16'
      }
    });
  } catch (error) {
    console.error('Stream config error:', error);
    return NextResponse.json({ error: 'Failed to get stream config' }, { status: 500 });
  }
} 