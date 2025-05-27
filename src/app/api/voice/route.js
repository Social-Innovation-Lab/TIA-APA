import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your_openai_api_key_here'
});

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    let language = formData.get('language');
    
    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    console.log('Processing audio with requested language:', language);
    console.log('Audio file type:', audioFile.type);
    console.log('Audio file size:', audioFile.size);

    // Create a proper File object with correct extension for Whisper API
    let processedAudioFile;
    
    // Determine the correct file extension based on MIME type
    let extension = '.webm'; // default
    if (audioFile.type.includes('mp4')) {
      extension = '.mp4';
    } else if (audioFile.type.includes('webm')) {
      extension = '.webm';
    } else if (audioFile.type.includes('wav')) {
      extension = '.wav';
    } else if (audioFile.type.includes('ogg')) {
      extension = '.ogg';
    }

    // Create a new File object with proper name and extension
    // This is crucial for Whisper API to recognize the format
    const fileName = `audio_${Date.now()}${extension}`;
    
    try {
      // Convert the blob to a proper File object with correct name
      const audioBuffer = await audioFile.arrayBuffer();
      processedAudioFile = new File([audioBuffer], fileName, {
        type: audioFile.type
      });
      
      console.log('Created processed audio file:', fileName, 'Type:', processedAudioFile.type);
    } catch (conversionError) {
      console.error('Error processing audio file:', conversionError);
      return NextResponse.json({ 
        error: 'Failed to process audio file',
        success: false 
      }, { status: 400 });
    }

    // For better accuracy, we'll try multiple approaches:
    // 1. First try with user's preferred language if it's English
    // 2. For Bengali, use auto-detection since Whisper handles it better that way
    // 3. If first attempt fails, try auto-detection as fallback

    let transcription = '';
    let detectedLanguage = language || 'bn';

    try {
      if (language === 'en') {
        // For English, we can specify the language for better accuracy
        console.log('Transcribing with English language specification');
        transcription = await openai.audio.transcriptions.create({
          file: processedAudioFile,
          model: "whisper-1",
          response_format: "text",
          language: 'en'
        });
      } else {
        // For Bengali or auto-detection, don't specify language
        // Whisper is better at detecting Bengali automatically
        console.log('Transcribing with auto-detection for Bengali');
        transcription = await openai.audio.transcriptions.create({
          file: processedAudioFile,
          model: "whisper-1",
          response_format: "text"
          // No language parameter - let Whisper auto-detect
        });
      }

      console.log('Transcription result:', transcription);

      // Detect language from the transcribed text
      const actualLanguage = detectLanguageFromText(transcription);
      console.log('Detected language from text:', actualLanguage);

      // If user requested Bengali but we got English (or vice versa), 
      // and the confidence seems low, try the other approach
      if (language === 'bn' && actualLanguage === 'en' && transcription.length < 10) {
        console.log('Short English result for Bengali request, retrying with English setting...');
        try {
          const retryTranscription = await openai.audio.transcriptions.create({
            file: processedAudioFile,
            model: "whisper-1",
            response_format: "text",
            language: 'en'
          });
          
          if (retryTranscription.length > transcription.length) {
            transcription = retryTranscription;
            detectedLanguage = 'en';
          }
        } catch (retryError) {
          console.log('Retry with English failed, using original result');
        }
      }

      return NextResponse.json({
        transcript: transcription.trim(),
        detectedLanguage: actualLanguage,
        success: true
      });

    } catch (primaryError) {
      console.error('Primary transcription failed:', primaryError);
      
      // Fallback: try with auto-detection
      try {
        console.log('Primary method failed, trying auto-detection fallback...');
        transcription = await openai.audio.transcriptions.create({
          file: processedAudioFile,
          model: "whisper-1",
          response_format: "text"
          // No language parameter for auto-detection
        });
        
        const detectedLanguage = detectLanguageFromText(transcription);
        
        return NextResponse.json({
          transcript: transcription.trim(),
          detectedLanguage: detectedLanguage,
          success: true
        });
      } catch (fallbackError) {
        console.error('Fallback transcription also failed:', fallbackError);
        throw fallbackError;
      }
    }

  } catch (error) {
    console.error('Whisper API error:', error);
    
    return NextResponse.json({
      error: 'Voice processing failed',
      transcript: '',
      success: false
    }, { status: 500 });
  }
}

// Helper function to detect language from transcribed text
function detectLanguageFromText(text) {
  if (!text || text.trim().length === 0) return 'bn';
  
  // Simple language detection based on character patterns
  const banglaPattern = /[\u0980-\u09FF]/; // Bengali Unicode range
  const englishPattern = /[a-zA-Z]/;
  
  const hasBangla = banglaPattern.test(text);
  const hasEnglish = englishPattern.test(text);
  
  // Count characters to determine dominant language
  const banglaChars = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  
  if (banglaChars > englishChars) return 'bn';
  if (englishChars > banglaChars) return 'en';
  if (hasBangla && !hasEnglish) return 'bn';
  if (hasEnglish && !hasBangla) return 'en';
  
  return 'bn'; // Default to Bangla
} 