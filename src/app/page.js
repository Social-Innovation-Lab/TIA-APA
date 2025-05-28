'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import LoginModal from '../components/LoginModal';
import Image from 'next/image';
import { useDeepgramVoice } from '../hooks/useDeepgramVoice';

export default function TiaApa() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]); // {role: 'user'|'ai', content: string}
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageQuery, setImageQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('bn'); // 'bn' for Bangla, 'en' for English
  const [isVoiceQuery, setIsVoiceQuery] = useState(false); // Track if current query is from voice input
  const [recordingDuration, setRecordingDuration] = useState(0); // Track recording duration
  
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Deepgram voice recognition hook
  const {
    isRecording: isDeepgramRecording,
    transcript: deepgramTranscript,
    interimTranscript,
    isConnected: isDeepgramConnected,
    detectedLanguage: deepgramLanguage,
    confidence: deepgramConfidence,
    error: deepgramError,
    startRecording: startDeepgramRecording,
    stopRecording: stopDeepgramRecording,
    resetTranscript: resetDeepgramTranscript,
    cleanup: cleanupDeepgram
  } = useDeepgramVoice();

  // Check for existing session on component mount
  useEffect(() => {
    const sessionData = localStorage.getItem('tiaApaSession');
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        const loginTime = new Date(parsed.loginTime);
        const now = new Date();
        const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
        
        // Session expires after 24 hours
        if (hoursDiff < 24) {
          setIsLoggedIn(true);
          setUserData(parsed.userData);
        } else {
          localStorage.removeItem('tiaApaSession');
        }
      } catch (error) {
        localStorage.removeItem('tiaApaSession');
      }
    }
  }, []);

  // Handle login success
  const handleLogin = (userData) => {
    setIsLoggedIn(true);
    setUserData(userData);
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('tiaApaSession');
    setIsLoggedIn(false);
    setUserData(null);
    setQuery('');
    setMessages([]);
    setTranscript('');
    setUploadedImage(null);
    setImageQuery('');
  };

  // Store query with user data
  const storeQueryWithUserData = async (queryText, answer, queryType, hasImage = false, isVoice = false) => {
    if (!userData) return;

    try {
      await fetch('/api/store-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userData.email,
          location: userData.location,
          clinicName: userData.clinicName,
          query: queryText,
          answer: answer,
          queryType: queryType,
          hasImage: hasImage,
          isVoice: isVoice
        }),
      });
    } catch (error) {
      console.error('Error storing query:', error);
    }
  };

  // Check login before allowing actions
  const requireLogin = (action) => {
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return false;
    }
    return true;
  };

  // Scroll to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isLoading]);

  // Detect language from text
  const detectLanguage = useCallback((text) => {
    if (!text || text.trim().length === 0) return 'bn';
    
    // Simple language detection based on character patterns
    const banglaPattern = /[\u0980-\u09FF]/; // Bengali Unicode range
    const englishPattern = /[a-zA-Z]/;
    
    const hasBangla = banglaPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasBangla && !hasEnglish) return 'bn';
    if (hasEnglish && !hasBangla) return 'en';
    if (hasBangla && hasEnglish) return 'bn'; // Default to Bangla for mixed
    
    return 'bn'; // Default to Bangla
  }, []);

  // Fetch query suggestions with language-specific filtering - optimized for speed
  const fetchSuggestions = useCallback(async (input) => {
    try {
      setLoadingSuggestions(true);
      
      const response = await fetch('/api/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: input,
          language: detectedLanguage
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }
      
      const data = await response.json();
      
      if (data.suggestions && data.suggestions.length > 0) {
        // Filter suggestions based on detected language
        const filteredSuggestions = data.suggestions.filter(suggestion => {
          const suggestionLang = detectLanguage(suggestion);
          return suggestionLang === detectedLanguage;
        });
        
        const finalSuggestions = filteredSuggestions.length > 0 ? filteredSuggestions : data.suggestions;
        setSuggestions(finalSuggestions);
        setShowSuggestions(finalSuggestions.length > 0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [detectedLanguage]);

  // Update detected language when query changes
  useEffect(() => {
    if (query.trim().length > 2) {
      const lang = detectLanguage(query);
      setDetectedLanguage(lang);
    }
  }, [query, detectLanguage]);

  // Debounced suggestions - faster response
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim().length > 2 && !isRecording) {
        fetchSuggestions(query);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
        setLoadingSuggestions(false);
      }
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [query, isRecording, fetchSuggestions]);

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    setLoadingSuggestions(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // Handle query submission with AI
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    if (!query.trim()) return;

    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    
    const queryType = isVoiceQuery ? 'Voice' : 'Text';

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: queryType.toLowerCase() })
      });

      const data = await response.json();
      
      if (data.response) {
        setMessages((prev) => [...prev, { role: 'ai', content: data.response }]);
        
        // Store query in CSV with correct type
        await storeQueryInCSV(query, queryType, data.response, false, isVoiceQuery);
      } else {
        const errorMsg = detectedLanguage === 'bn' 
          ? 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।'
          : 'Sorry, I cannot provide an answer at the moment.';
        setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      }
    } catch (error) {
      console.error('Search error:', error);
      const errorMsg = detectedLanguage === 'bn' 
        ? 'দুঃখিত, কিছু সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
        : 'Sorry, something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    } finally {
      setIsLoading(false);
      setQuery('');
      setIsVoiceQuery(false); // Reset voice query flag
      setShowSuggestions(false);
    }
  };

  // Cleanup media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Handle voice input with Deepgram (primary) and Whisper (fallback)
  const handleVoiceInput = async () => {
    if (!requireLogin()) return;
    
    // Check if we're currently recording
    if (isRecording || isDeepgramRecording) {
      // Stop Deepgram recording if active
      if (isDeepgramRecording) {
        stopDeepgramRecording();
        
        // Use the final transcript from Deepgram
        const finalTranscript = (deepgramTranscript + ' ' + interimTranscript).trim();
        if (finalTranscript) {
          setQuery(finalTranscript);
          if (deepgramLanguage) {
            setDetectedLanguage(deepgramLanguage);
          }
        }
        setIsVoiceQuery(true);
        return;
      }
      
      // Stop legacy recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      // Clear recording timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      setIsRecording(false);
      setRecordingDuration(0);
      return;
    }

    // Check for microphone support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errorMsg = detectedLanguage === 'bn' 
        ? 'আপনার ডিভাইস মাইক্রোফোন সাপোর্ট করে না।'
        : 'Your device does not support microphone access.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      return;
    }

    // Try Deepgram first, fallback to Whisper if it fails
    try {
      console.log('Starting Deepgram voice recording...');
      setIsVoiceQuery(true);
      setQuery(''); // Clear any existing query
      resetDeepgramTranscript();
      
      await startDeepgramRecording();
      
      // Start recording timer for UI feedback
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
      console.log('Deepgram recording started successfully');
      
    } catch (error) {
      console.warn('Deepgram failed, falling back to Whisper:', error);
      
      // Fallback to legacy Whisper system
      await handleLegacyVoiceInput();
    }
  };

  // Legacy voice input with Whisper (fallback)
  const handleLegacyVoiceInput = async () => {
    try {
      console.log('Starting legacy voice recording...');
      setIsVoiceQuery(true);
      setQuery(''); // Clear any existing query
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } 
      });

      console.log('Microphone access granted');
      
      // Create MediaRecorder with best supported format for Whisper
      let mimeType;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else {
        mimeType = ''; // Let browser choose
      }
      
      console.log('Using MIME type:', mimeType);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const audioChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log('Recording stopped, processing audio...');
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          console.log('Audio blob created, size:', audioBlob.size);
          
          // Process with Whisper
          await processWithWhisper(audioBlob);
        } else {
          console.error('No audio data recorded');
          const errorMsg = detectedLanguage === 'bn' 
            ? 'কোন অডিও রেকর্ড হয়নি। আবার চেষ্টা করুন।'
            : 'No audio recorded. Please try again.';
          setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
        }
        
        // Clear recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        
        setIsRecording(false);
        setIsVoiceQuery(false);
        setRecordingDuration(0);
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event.error);
        stream.getTracks().forEach(track => track.stop());
        
        // Clear recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        
        setIsRecording(false);
        setIsVoiceQuery(false);
        setRecordingDuration(0);
        
        const errorMsg = detectedLanguage === 'bn' 
          ? 'রেকর্ডিং এ সমস্যা হয়েছে। আবার চেষ্টা করুন।'
          : 'Recording failed. Please try again.';
        setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      };

      // Start recording
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);
      
      console.log('Recording started successfully');
      
      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
      // Show recording status in query field
      setQuery(detectedLanguage === 'bn' ? '🎤 রেকর্ডিং চলছে...' : '🎤 Recording...');

    } catch (error) {
      console.error('Voice input error:', error);
      setIsRecording(false);
      setIsVoiceQuery(false);
      
      let errorMsg;
      if (error.name === 'NotAllowedError') {
        errorMsg = detectedLanguage === 'bn' 
          ? 'মাইক্রোফোন অনুমতি দিন। ব্রাউজার সেটিংস চেক করুন।'
          : 'Microphone permission denied. Please check browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMsg = detectedLanguage === 'bn' 
          ? 'কোন মাইক্রোফোন পাওয়া যায়নি।'
          : 'No microphone found.';
      } else {
        errorMsg = detectedLanguage === 'bn' 
          ? 'মাইক্রোফোন অ্যাক্সেস করতে পারছি না। আবার চেষ্টা করুন।'
          : 'Cannot access microphone. Please try again.';
      }
      
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    }
  };

  // Process audio with Whisper API for transcription
  const processWithWhisper = async (audioBlob) => {
    try {
      console.log('Processing audio with Whisper API...');
      setIsLoading(true);
      
      // Show processing status
      setQuery(detectedLanguage === 'bn' ? '🎤 প্রসেসিং...' : '🎤 Processing...');
      
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('language', detectedLanguage);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Whisper API response:', data);
      
      if (data.success && data.transcript && data.transcript.trim()) {
        // Set the transcribed text in the query field
        setQuery(data.transcript.trim());
        
        // Update detected language based on Whisper's analysis
        if (data.detectedLanguage) {
          setDetectedLanguage(data.detectedLanguage);
        }
        
        console.log('Transcription successful:', data.transcript);
        
        // Focus on the input so user can see and edit the transcribed text
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 100);
        
      } else {
        console.error('Whisper transcription failed or empty:', data);
        setQuery(''); // Clear the processing message
        
        const errorMsg = detectedLanguage === 'bn' 
          ? 'কোন কথা শোনা যায়নি। আবার চেষ্টা করুন।'
          : 'No speech detected. Please try again.';
        setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      }
    } catch (error) {
      console.error('Whisper processing error:', error);
      setQuery(''); // Clear the processing message
      
      const errorMsg = detectedLanguage === 'bn' 
        ? 'ভয়েস প্রসেসিং এ সমস্যা হয়েছে। আবার চেষ্টা করুন।'
        : 'Voice processing failed. Please try again.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    } finally {
      setIsLoading(false);
      setIsVoiceQuery(false);
    }
  };

  // Handle image upload
  const handleImageUpload = (e) => {
    if (!requireLogin()) return;

    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result); // Store the data URL, not the file
        setImageQuery(''); // Clear any previous image query
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to render markdown bold and strip emojis/#/*
  function renderCleanedContent(content) {
    // Remove emojis, #, and * (except for markdown bold)
    let cleaned = content
      .replace(/[\p{Emoji_Presentation}\p{Emoji}\u200d#]/gu, '') // Remove emojis and #
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Replace **bold** with <strong>
      .replace(/\*/g, ''); // Remove stray *
    return cleaned;
  }

  // Helper to render a user message with image and query
  function renderImageQueryMessage(image, query) {
    return `<div style='display:flex;flex-direction:column;align-items:flex-end;'><img src='${image}' alt='Uploaded' style='max-width:180px;max-height:120px;border-radius:12px;margin-bottom:8px;'/><div>${query}</div></div>`;
  }

  // Handle image analysis with Vision API
  const handleImageQuery = async () => {
    if (!requireLogin()) return;
    if (!uploadedImage) return;
    setIsLoading(true);
    
    const queryText = imageQuery.trim() || (detectedLanguage === 'bn' ? 'এই ছবিটি বিশ্লেষণ করুন' : 'Analyze this image');
    
    // Add user message with image to chat
    setMessages((prev) => [...prev, { 
      role: 'user', 
      content: queryText,
      image: uploadedImage 
    }]);
    
    // Clear image preview immediately after adding to chat
    const currentImage = uploadedImage;
    setUploadedImage(null);
    setImageQuery('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const response = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: currentImage, 
          query: queryText,
          answerLanguage: detectedLanguage 
        })
      });

      const data = await response.json();
      
      if (data.analysis) {
        setMessages((prev) => [...prev, { role: 'ai', content: data.analysis }]);
        
        // Store query in CSV with hasImage flag
        await storeQueryInCSV(queryText, 'Image', data.analysis, true);
      } else {
        const errorMsg = detectedLanguage === 'bn' 
          ? 'ছবি বিশ্লেষণে সমস্যা হয়েছে।'
          : 'Image analysis failed.';
        setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      }
    } catch (error) {
      console.error('Vision error:', error);
      const errorMsg = detectedLanguage === 'bn' 
        ? 'ছবি বিশ্লেষণে সমস্যা হয়েছে।'
        : 'Image analysis failed.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    } finally {
      setIsLoading(false);
      setQuery('');
    }
  };

  // Store query in CSV
  const storeQueryInCSV = async (queryText, queryType, answer, hasImage = false, isVoice = false) => {
    if (!userData) {
      console.log('No userData available for storage');
      return;
    }
    
    console.log('Storing query:', {
      email: userData.email,
      location: userData.location,
      clinicName: userData.clinicName,
      queryType,
      query: queryText,
      answer,
      hasImage,
      isVoice
    });
    
    try {
      const response = await fetch('/api/store-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userData.email,
          location: userData.location,
          clinicName: userData.clinicName,
          queryType,
          query: queryText,
          answer,
          hasImage,
          isVoice
        })
      });
      
      const result = await response.json();
      console.log('Storage result:', result);
      
      if (!result.success) {
        console.error('Storage failed:', result.error);
      }
    } catch (error) {
      console.error('Error storing query:', error);
      // Don't show error to user as this is background operation
    }
  };

  // Clear all inputs and chat
  const clearAll = () => {
    setQuery('');
    setMessages([]);
    setTranscript('');
    setUploadedImage(null);
    setImageQuery('');
    setIsVoiceQuery(false);
    
    // Stop any active voice recording
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    // Clear recording timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Handle mobile keyboard visibility
  useEffect(() => {
    const handleResize = () => {
      // Adjust viewport height for mobile keyboards
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Cleanup Deepgram on unmount
  useEffect(() => {
    return () => {
      cleanupDeepgram();
    };
  }, [cleanupDeepgram]);

  // Handle Deepgram errors
  useEffect(() => {
    if (deepgramError) {
      setMessages((prev) => [...prev, { role: 'ai', content: deepgramError }]);
    }
  }, [deepgramError]);

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
      />

      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          {/* Logo Section */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Image 
              src="/logo.png" 
              alt="Tia Apa Logo" 
              width={80} height={80} 
              className="h-16 w-16 sm:h-20 sm:w-20 object-contain"
              priority
            />
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">টিয়া আপা</h1>
              <p className="text-xs text-gray-600 hidden sm:block">আপনার কৃষি সহায়ক বন্ধু</p>
            </div>
          </div>
          
          {/* User Info and Logout */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {isLoggedIn && userData ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{userData.email}</p>
                  <p className="text-xs text-gray-600">{userData.location} • {userData.clinicName}</p>
                </div>
                <div className="text-right sm:hidden">
                  <p className="text-xs font-medium text-gray-900">{userData.email.split('@')[0]}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                >
                  লগআউট
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 transition-colors text-xs sm:text-sm"
              >
                লগইন করুন
              </button>
            )}
          
          {/* Pinwheel Icon */}
            <Image 
              src="/pinwheel.gif" 
              alt="Pinwheel" 
              width={56} height={56} 
              className="h-10 w-10 sm:h-14 sm:w-14 object-contain"
              priority
            />
          </div>
        </div>
      </header>

      {/* Welcome message above chat block */}
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center mt-4 sm:mt-8 mb-2 sm:mb-4 select-none flex-shrink-0 px-4">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 text-center">আপাকে জিজ্ঞেস করুন</h2>
          <p className="text-sm text-gray-600 text-center">আপনার চ্যাট এখানে প্রদর্শিত হবে।</p>
          {!isLoggedIn && (
            <div className="mt-4 p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg max-w-sm w-full">
              <p className="text-gray-800 text-sm text-center">
                প্রশ্ন করার জন্য প্রথমে লগইন করুন
              </p>
              <button
                onClick={() => setShowLoginModal(true)}
                className="mt-2 w-full px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 transition-colors text-sm"
              >
                লগইন করুন
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat Block */}
      <main className="flex-1 flex flex-col items-center justify-center px-2 sm:px-4 pb-20 sm:pb-24 overflow-hidden">
        <div className="w-full flex flex-col items-center h-full">
          <div className="w-full max-w-4xl flex flex-col h-full">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg w-full flex-1 flex flex-col mx-auto overflow-hidden" style={{ minHeight: '200px' }}>
              <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-6">
                <div className="flex flex-col gap-3 sm:gap-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`rounded-xl sm:rounded-2xl px-3 sm:px-5 py-3 sm:py-4 max-w-[85%] sm:max-w-[80%] whitespace-pre-wrap text-gray-800 shadow-sm text-sm sm:text-base ${
                          msg.role === 'user'
                            ? 'bg-pink-50 text-right'
                            : 'bg-pink-100 text-left'
                        }`}
                        style={{ wordBreak: 'break-word' }}
                      >
                        {/* Display image if present */}
                        {msg.image && (
                          <div className={`mb-2 sm:mb-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                            <Image 
                              src={msg.image} 
                              alt="Uploaded" 
                              width={150} height={120}
                              className="max-w-full max-h-32 sm:max-h-48 rounded-lg border border-gray-200"
                              style={{ maxWidth: '150px' }}
                              unoptimized={true}
                            />
                          </div>
                        )}
                        {/* Display message content */}
                        <div
                          dangerouslySetInnerHTML={{ 
                            __html: msg.role === 'ai' ? renderCleanedContent(msg.content) : msg.content 
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="w-full flex justify-start">
                      <div className="rounded-xl sm:rounded-2xl px-3 sm:px-5 py-3 sm:py-4 max-w-[85%] sm:max-w-[80%] bg-pink-100 text-left text-gray-800 shadow-sm text-sm sm:text-base">
                        <span className="animate-pulse">
                          {detectedLanguage === 'bn' ? 'চিন্তা করা হচ্ছে...' : 'Thinking...'}
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Fixed Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 sm:p-3 z-10 flex-shrink-0 pb-safe">
        <div className="max-w-4xl mx-auto w-full">
          <form onSubmit={handleSubmit} className="relative w-full">
            {/* Mobile: 2-tier layout, Desktop: single row */}
            <div className="block sm:hidden">
              {/* Mobile Top Row: Text Input + Send Button */}
              <div className="flex items-center bg-gray-50 rounded-full border border-gray-200 p-1 gap-2 mb-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                  }}
                  disabled={!isLoggedIn}
                  placeholder={
                    !isLoggedIn
                      ? "প্রশ্ন করার জন্য লগইন করুন"
                      : isDeepgramRecording
                      ? (interimTranscript 
                          ? `🎤 ${interimTranscript}...` 
                          : (detectedLanguage === 'bn' ? `🎤 রেকর্ডিং চলছে... ${recordingDuration}s` : `🎤 Recording... ${recordingDuration}s`)
                        )
                      : isRecording
                      ? (detectedLanguage === 'bn' ? `🎤 রেকর্ডিং চলছে... ${recordingDuration}s` : `🎤 Recording... ${recordingDuration}s`)
                      : (detectedLanguage === 'bn' ? "দয়া করে আপনার সমস্যা লিখুন" : "Please write your problem")
                  }
                  className={`flex-1 min-w-0 px-4 py-3 bg-transparent border-none outline-none text-gray-700 placeholder-gray-500 text-base ${
                    isRecording ? 'placeholder-red-500' : ''
                  } ${!isLoggedIn ? 'cursor-not-allowed' : ''}`}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e); }}
                  onFocus={() => setShowSuggestions(suggestions.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  ref={inputRef}
                />
                
                                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={isLoading || !query.trim() || !isLoggedIn}
                    className="flex-shrink-0 w-12 h-12 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13"/>
                      <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                    </svg>
                  </button>
              </div>
              
              {/* Mobile Bottom Row: Other Buttons */}
              <div className="flex items-center justify-center gap-3">
                {/* Voice Button */}
                <button
                  type="button"
                  onClick={handleVoiceInput}
                  disabled={!isLoggedIn}
                  className={`flex-shrink-0 w-12 h-12 rounded-full transition-colors flex items-center justify-center ${
                    (isRecording || isDeepgramRecording)
                      ? 'bg-red-500 text-white animate-pulse' 
                      : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                  } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={
                    (isRecording || isDeepgramRecording)
                      ? (detectedLanguage === 'bn' ? 'রেকর্ডিং বন্ধ করুন' : 'Stop Recording')
                      : (detectedLanguage === 'bn' ? 'ভয়েস রেকর্ডিং শুরু করুন' : 'Start Voice Recording')
                  }
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </button>
                
                {/* Language Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const newLang = detectedLanguage === 'bn' ? 'en' : 'bn';
                    setDetectedLanguage(newLang);
                  }}
                  disabled={!isLoggedIn}
                  className={`flex-shrink-0 w-12 h-12 rounded-full transition-colors flex items-center justify-center text-xs font-bold ${
                    detectedLanguage === 'bn' 
                      ? 'bg-green-200 text-green-700 hover:bg-green-300' 
                      : 'bg-blue-200 text-blue-700 hover:bg-blue-300'
                  } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={detectedLanguage === 'bn' ? 'Switch to English' : 'Switch to Bengali'}
                >
                  <span className="text-sm leading-none font-semibold">{detectedLanguage === 'bn' ? 'বাং' : 'EN'}</span>
                </button>
                
                {/* Image Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isLoggedIn}
                  className={`flex-shrink-0 w-12 h-12 rounded-full bg-gray-300 text-gray-700 hover:bg-gray-400 transition-colors flex items-center justify-center ${
                    !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21,15 16,10 5,21"/>
                  </svg>
                </button>
                
                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={!isLoggedIn}
                  className={`flex-shrink-0 w-12 h-12 rounded-full bg-gray-300 text-gray-700 hover:bg-gray-400 transition-colors flex items-center justify-center ${
                    !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23,4 23,10 17,10"/>
                    <polyline points="1,20 1,14 7,14"/>
                    <path d="M20.49,9A9,9,0,0,0,5.64,5.64L1,10m22,4L18.36,18.36A9,9,0,0,1,3.51,15"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Desktop: Single Row Layout */}
            <div className="hidden sm:flex items-center bg-gray-50 rounded-full border border-gray-200 p-1 sm:p-2 gap-1 sm:gap-2 w-full overflow-hidden">
              {/* Voice Button */}
              <button
                type="button"
                onClick={handleVoiceInput}
                disabled={!isLoggedIn}
                className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-colors flex items-center justify-center ${
                  (isRecording || isDeepgramRecording)
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  (isRecording || isDeepgramRecording)
                    ? (detectedLanguage === 'bn' ? 'রেকর্ডিং বন্ধ করুন' : 'Stop Recording')
                    : (detectedLanguage === 'bn' ? 'ভয়েস রেকর্ডিং শুরু করুন' : 'Start Voice Recording')
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
              
              {/* Language Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  const newLang = detectedLanguage === 'bn' ? 'en' : 'bn';
                  setDetectedLanguage(newLang);
                }}
                disabled={!isLoggedIn}
                className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-colors flex items-center justify-center text-xs font-bold ${
                  detectedLanguage === 'bn' 
                    ? 'bg-green-200 text-green-700 hover:bg-green-300' 
                    : 'bg-blue-200 text-blue-700 hover:bg-blue-300'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={detectedLanguage === 'bn' ? 'Switch to English' : 'Switch to Bengali'}
              >
                <span className="text-xs sm:text-sm leading-none font-semibold">{detectedLanguage === 'bn' ? 'বাং' : 'EN'}</span>
              </button>
                  
              {/* Text Input */}
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                disabled={!isLoggedIn}
                                     placeholder={
                    !isLoggedIn
                      ? "প্রশ্ন করার জন্য লগইন করুন"
                      : isDeepgramRecording
                      ? (interimTranscript 
                          ? `🎤 ${interimTranscript}...` 
                          : (detectedLanguage === 'bn' ? `🎤 রেকর্ডিং চলছে... ${recordingDuration}s` : `🎤 Recording... ${recordingDuration}s`)
                        )
                      : isRecording
                      ? (detectedLanguage === 'bn' ? `🎤 রেকর্ডিং চলছে... ${recordingDuration}s` : `🎤 Recording... ${recordingDuration}s`)
                      : (detectedLanguage === 'bn' ? "দয়া করে আপনার সমস্যা লিখুন" : "Please write your problem")
                  }
                className={`flex-1 min-w-0 px-2 sm:px-4 py-2 sm:py-2.5 bg-transparent border-none outline-none text-gray-700 placeholder-gray-500 text-xs sm:text-base ${
                  isRecording ? 'placeholder-red-500' : ''
                } ${!isLoggedIn ? 'cursor-not-allowed' : ''}`}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e); }}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                ref={inputRef}
              />
                  
                                {/* Image Upload Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isLoggedIn}
                    className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-300 text-gray-700 hover:bg-gray-400 transition-colors flex items-center justify-center ${
                      !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21,15 16,10 5,21"/>
                    </svg>
                  </button>
                  
                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={!isLoggedIn}
                    className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-300 text-gray-700 hover:bg-gray-400 transition-colors flex items-center justify-center ${
                      !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                      <polyline points="23,4 23,10 17,10"/>
                      <polyline points="1,20 1,14 7,14"/>
                      <path d="M20.49,9A9,9,0,0,0,5.64,5.64L1,10m22,4L18.36,18.36A9,9,0,0,1,3.51,15"/>
                    </svg>
                  </button>
                  
                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading || !query.trim() || !isLoggedIn}
                    className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5">
                      <path d="M22 2L11 13"/>
                      <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                    </svg>
                  </button>
            </div>
            
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
          </form>
          
          {/* Uploaded Image Preview */}
          {uploadedImage && (
            <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-pink-50 rounded-lg border border-pink-200">
              <Image 
                src={uploadedImage} 
                alt="Uploaded" 
                width={200} height={100}
                className="max-w-full max-h-24 sm:max-h-32 mx-auto rounded-lg mb-2 border border-gray-200" 
                unoptimized={true}
              />
              <input
                type="text"
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                placeholder={detectedLanguage === 'bn' ? "ছবি সম্পর্কে আপনার প্রশ্ন লিখুন..." : "Write your question about the image..."}
                className="w-full p-2 border border-pink-300 rounded-lg text-black text-sm"
              />
              <button
                onClick={handleImageQuery}
                disabled={isLoading}
                className="mt-2 w-full bg-pink-500 text-white py-2 rounded-lg hover:bg-pink-600 disabled:opacity-50 text-sm"
              >
                {detectedLanguage === 'bn' ? 'ছবি বিশ্লেষণ করুন' : 'Analyze Image'}
              </button>
            </div>
          )}

          {/* Query Suggestions */}
          {(showSuggestions || loadingSuggestions) && (
            <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 sm:max-h-40 overflow-y-auto">
              {loadingSuggestions ? (
                <div className="px-3 sm:px-4 py-2 sm:py-2.5 text-gray-500 text-sm flex items-center">
                  <span className="animate-spin mr-2">⏳</span>
                  {detectedLanguage === 'bn' ? 'সাজেশন লোড হচ্ছে...' : 'Loading suggestions...'}
                </div>
              ) : (
                suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-gray-700 text-sm transition-colors duration-150"
                  >
                    💡 {suggestion}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

