import { createClient } from '@deepgram/sdk';
import { NextResponse } from 'next/server';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Convert audio file to buffer
    const audioBuffer = await audioFile.arrayBuffer();
    
    // Transcribe with multilingual support
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      Buffer.from(audioBuffer),
      {
        model: 'nova-3',
        language: 'multi', // Supports Bengali + English code-switching
        smart_format: true,
        punctuate: true,
        diarize: false,
        detect_language: true
      }
    );

    if (error) {
      console.error('Deepgram error:', error);
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;
    const detectedLanguages = result.results.channels[0].alternatives[0].languages || [];
    
    return NextResponse.json({ 
      transcript,
      detectedLanguages,
      confidence: result.results.channels[0].alternatives[0].confidence
    });

  } catch (error) {
    console.error('Voice transcription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 