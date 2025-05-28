# 🎯 Deepgram Integration Plan for Tia Apa

## Overview
This document outlines the complete integration plan for replacing the current voice recognition system with Deepgram's advanced speech-to-text API, specifically optimized for Bengali and English multilingual support.

## Why Deepgram?

### ✅ **Perfect for Tia Apa's Requirements:**
- **Free Tier**: $200 credit (no credit card required) = ~45,000 minutes of transcription
- **Multilingual Support**: Excellent Bengali + English support with automatic code-switching
- **Real-time Streaming**: Ultra-low latency (<300ms) for live transcription
- **Next.js Compatible**: Official JavaScript SDK with excellent documentation
- **Vercel Friendly**: Works seamlessly in serverless environments
- **Mobile Optimized**: Works on both web and mobile browsers
- **Language Detection**: Automatic language detection between Bengali and English

### 🔥 **Key Advantages Over Current System:**
- **Better Accuracy**: 30% more accurate than competitors
- **Faster Processing**: Up to 40x faster than current solution
- **Cost Effective**: 3-5x cheaper than alternatives
- **Live Transcription**: Real-time streaming with live preview
- **Language Switching**: Seamless Bengali-English code-switching
- **No Language Parameter**: Auto-detects language (no hardcoded Bengali issues)

---

## 📋 Phase 1: Setup & Installation

### 1.1 Install Deepgram SDK
```bash
npm install @deepgram/sdk
```

### 1.2 Environment Setup
Add to `.env.local`:
```env
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### 1.3 Get Free API Key
1. Sign up at https://deepgram.com (no credit card required)
2. Get $200 free credit (45,000+ minutes)
3. Copy API key to environment variables

---

## 📋 Phase 2: Backend API Implementation

### 2.1 Create Deepgram Voice API Route
**File**: `src/app/api/deepgram-voice/route.js`

```javascript
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
```

### 2.2 Create Real-time Streaming API Route
**File**: `src/app/api/deepgram-stream/route.js`

```javascript
import { createClient } from '@deepgram/sdk';
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
```

---

## 📋 Phase 3: Frontend Integration

### 3.1 Create Deepgram Hook
**File**: `src/hooks/useDeepgramVoice.js`

```javascript
import { useState, useRef, useCallback } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export const useDeepgramVoice = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const connectionRef = useRef(null);
  const deepgramRef = useRef(null);

  const initializeDeepgram = useCallback(async () => {
    try {
      // Get stream configuration from backend
      const response = await fetch('/api/deepgram-stream');
      const config = await response.json();
      
      // Initialize Deepgram client
      deepgramRef.current = createClient(config.apiKey);
      
      // Create live transcription connection
      const connection = deepgramRef.current.listen.live(config.config);
      connectionRef.current = connection;

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram connection opened');
        setIsConnected(true);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        const languages = data.channel.alternatives[0].languages || [];
        
        if (transcript) {
          if (data.is_final) {
            setTranscript(prev => prev + ' ' + transcript);
            setInterimTranscript('');
          } else {
            setInterimTranscript(transcript);
          }
          
          // Update detected language
          if (languages.length > 0) {
            setDetectedLanguage(languages[0]);
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed');
        setIsConnected(false);
      });

      return connection;
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
      throw error;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Initialize Deepgram connection
      await initializeDeepgram();
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      // Create MediaRecorder for sending audio to Deepgram
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && connectionRef.current) {
          // Send audio data to Deepgram
          connectionRef.current.send(event.data);
        }
      };

      mediaRecorder.start(100); // Send data every 100ms
      setIsRecording(true);
      setTranscript('');
      setInterimTranscript('');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, [initializeDeepgram]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
    
    if (connectionRef.current) {
      connectionRef.current.finish();
      connectionRef.current = null;
    }
    
    setIsConnected(false);
  }, [isRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isRecording,
    transcript,
    interimTranscript,
    isConnected,
    detectedLanguage,
    startRecording,
    stopRecording,
    resetTranscript
  };
};
```

### 3.2 Update Main Page Component
**File**: `src/app/page.js` (Update voice recording section)

```javascript
// Add import
import { useDeepgramVoice } from '../hooks/useDeepgramVoice';

// Replace existing voice recording logic with:
const {
  isRecording: isDeepgramRecording,
  transcript: deepgramTranscript,
  interimTranscript,
  isConnected,
  detectedLanguage: deepgramLanguage,
  startRecording: startDeepgramRecording,
  stopRecording: stopDeepgramRecording,
  resetTranscript
} = useDeepgramVoice();

// Update voice recording handlers
const handleVoiceStart = async () => {
  try {
    resetTranscript();
    await startDeepgramRecording();
  } catch (error) {
    console.error('Failed to start voice recording:', error);
    // Fallback to existing system if needed
  }
};

const handleVoiceStop = () => {
  stopDeepgramRecording();
  
  // Use the final transcript
  const finalTranscript = deepgramTranscript.trim();
  if (finalTranscript) {
    setInputValue(finalTranscript);
    setDetectedLanguage(deepgramLanguage);
  }
};

// Update the voice button display
const displayTranscript = interimTranscript || deepgramTranscript;
```

---

## 📋 Phase 4: Enhanced Features

### 4.1 Language Detection & Auto-switching
```javascript
// In the voice hook, add language detection logic
const detectAndSetLanguage = (languages) => {
  if (languages.includes('bn')) {
    setDetectedLanguage('bn');
  } else if (languages.includes('en')) {
    setDetectedLanguage('en');
  } else {
    setDetectedLanguage('auto');
  }
};
```

### 4.2 Confidence Scoring
```javascript
// Add confidence tracking
const [confidence, setConfidence] = useState(0);

// In transcript event handler
connection.on(LiveTranscriptionEvents.Transcript, (data) => {
  const transcript = data.channel.alternatives[0].transcript;
  const confidence = data.channel.alternatives[0].confidence;
  
  setConfidence(confidence);
  // Only accept high-confidence transcripts
  if (confidence > 0.7) {
    // Process transcript
  }
});
```

### 4.3 Fallback System
```javascript
// Implement fallback to existing system
const handleVoiceWithFallback = async () => {
  try {
    await startDeepgramRecording();
  } catch (error) {
    console.warn('Deepgram failed, falling back to browser API:', error);
    // Fall back to existing react-speech-recognition
    startListening();
  }
};
```

---

## 📋 Phase 5: Testing & Optimization

### 5.1 Test Cases
- [ ] Bengali-only speech
- [ ] English-only speech  
- [ ] Bengali-English code-switching
- [ ] Low-quality audio
- [ ] Background noise
- [ ] Mobile device testing
- [ ] Network interruption handling

### 5.2 Performance Optimization
```javascript
// Add connection pooling and retry logic
const retryConnection = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await initializeDeepgram();
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

### 5.3 Error Handling
```javascript
// Comprehensive error handling
const handleDeepgramError = (error) => {
  console.error('Deepgram error:', error);
  
  // Show user-friendly error messages
  if (error.message.includes('network')) {
    setError('নেটওয়ার্ক সমস্যা। অনুগ্রহ করে আবার চেষ্টা করুন।');
  } else if (error.message.includes('microphone')) {
    setError('মাইক্রোফোন অ্যাক্সেস প্রয়োজন।');
  } else {
    setError('ভয়েস রেকগনিশনে সমস্যা হয়েছে।');
  }
};
```

---

## 📋 Phase 6: Deployment & Monitoring

### 6.1 Environment Variables for Production
```env
# Production .env
DEEPGRAM_API_KEY=your_production_api_key
NEXT_PUBLIC_DEEPGRAM_ENABLED=true
```

### 6.2 Usage Monitoring
```javascript
// Track usage for monitoring
const trackUsage = async (duration, language, confidence) => {
  try {
    await fetch('/api/track-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: 'deepgram',
        duration,
        language,
        confidence,
        timestamp: new Date().toISOString()
      })
    });
  } catch (error) {
    console.error('Failed to track usage:', error);
  }
};
```

---

## 🚀 Implementation Timeline

### Week 1: Setup & Basic Integration
- [ ] Install Deepgram SDK
- [ ] Create API routes
- [ ] Basic voice recording with Deepgram

### Week 2: Advanced Features
- [ ] Real-time streaming
- [ ] Language detection
- [ ] Error handling & fallbacks

### Week 3: Testing & Optimization
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Mobile compatibility

### Week 4: Deployment & Monitoring
- [ ] Production deployment
- [ ] Usage monitoring
- [ ] Documentation

---

## 💰 Cost Analysis

### Free Tier Benefits:
- **$200 credit** = ~45,000 minutes of transcription
- **No credit card required**
- **No expiration** on Pay-As-You-Go credits

### Pricing After Free Tier:
- **Nova-3 Multilingual**: $0.0052/minute
- **Streaming**: $0.0092/minute
- **Very cost-effective** for agricultural use case

### Estimated Usage:
- 100 users × 10 minutes/day = 1,000 minutes/day
- Monthly cost: ~$156 (after free tier)
- **Much cheaper than alternatives**

---

## 🔧 Maintenance & Support

### Regular Tasks:
- [ ] Monitor API usage and costs
- [ ] Update SDK versions
- [ ] Test new Deepgram features
- [ ] Optimize for new languages/models

### Support Resources:
- Deepgram Discord Community
- Official Documentation
- GitHub Issues & Discussions
- Priority support (if needed)

---

## 📊 Success Metrics

### Technical Metrics:
- **Accuracy**: >95% for Bengali/English
- **Latency**: <500ms for real-time
- **Uptime**: >99.9%
- **Error Rate**: <1%

### User Experience Metrics:
- **User Satisfaction**: Voice recognition quality
- **Usage Frequency**: Voice vs text input ratio
- **Language Detection**: Accuracy of auto-detection
- **Mobile Performance**: Cross-device compatibility

---

This comprehensive plan ensures a smooth transition to Deepgram while maintaining backward compatibility and providing superior voice recognition capabilities for Bengali farmers using Tia Apa. 