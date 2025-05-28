import { useState, useRef, useCallback } from 'react';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export const useDeepgramVoice = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const connectionRef = useRef(null);
  const deepgramRef = useRef(null);
  const streamRef = useRef(null);

  const initializeDeepgram = useCallback(async () => {
    try {
      // Get stream configuration from backend
      const response = await fetch('/api/deepgram-stream');
      const config = await response.json();
      
      if (!config.apiKey) {
        throw new Error('Deepgram API key not configured');
      }
      
      // Initialize Deepgram client
      deepgramRef.current = createClient(config.apiKey);
      
      // Create live transcription connection
      const connection = deepgramRef.current.listen.live(config.config);
      connectionRef.current = connection;

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram connection opened');
        setIsConnected(true);
        setError('');
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        const languages = data.channel.alternatives[0].languages || [];
        const confidence = data.channel.alternatives[0].confidence || 0;
        
        if (transcript) {
          setConfidence(confidence);
          
          if (data.is_final) {
            setTranscript(prev => prev + ' ' + transcript);
            setInterimTranscript('');
          } else {
            setInterimTranscript(transcript);
          }
          
          // Update detected language
          if (languages.length > 0) {
            const primaryLanguage = languages[0];
            setDetectedLanguage(primaryLanguage === 'bn' ? 'bn' : 'en');
          }
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error);
        setError('ভয়েস রেকগনিশনে সমস্যা হয়েছে।');
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed');
        setIsConnected(false);
      });

      return connection;
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
      setError('Deepgram সংযোগ স্থাপনে সমস্যা হয়েছে।');
      throw error;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError('');
      
      // Initialize Deepgram connection
      await initializeDeepgram();
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      streamRef.current = stream;

      // Create MediaRecorder for sending audio to Deepgram
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && connectionRef.current && isConnected) {
          // Send audio data to Deepgram
          connectionRef.current.send(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        setError('অডিও রেকর্ডিংয়ে সমস্যা হয়েছে।');
      };

      mediaRecorder.start(100); // Send data every 100ms
      setIsRecording(true);
      setTranscript('');
      setInterimTranscript('');
      setConfidence(0);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      
      if (error.name === 'NotAllowedError') {
        setError('মাইক্রোফোন অ্যাক্সেস প্রয়োজন।');
      } else if (error.name === 'NotFoundError') {
        setError('মাইক্রোফোন পাওয়া যায়নি।');
      } else {
        setError('ভয়েস রেকর্ডিং শুরু করতে সমস্যা হয়েছে।');
      }
      
      throw error;
    }
  }, [initializeDeepgram, isConnected]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      if (connectionRef.current) {
        connectionRef.current.finish();
        connectionRef.current = null;
      }
      
      setIsConnected(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  }, [isRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setConfidence(0);
    setError('');
  }, []);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return {
    isRecording,
    transcript,
    interimTranscript,
    isConnected,
    detectedLanguage,
    confidence,
    error,
    startRecording,
    stopRecording,
    resetTranscript,
    cleanup
  };
}; 