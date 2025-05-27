'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import LoginModal from '../components/LoginModal';
import Image from 'next/image';

export default function TiaApa() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]); // {role: 'user'|'ai', content: string}
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageQuery, setImageQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('bn'); // 'bn' for Bangla, 'en' for English
  const [isVoiceQuery, setIsVoiceQuery] = useState(false); // Track if current query is from voice input
  const [useWhisperForFinal, setUseWhisperForFinal] = useState(false); // Track if we should use Whisper for final result
  
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const {
    transcript: liveTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

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
  }, [detectedLanguage, detectLanguage]);

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

  // Update query with live transcript from react-speech-recognition
  useEffect(() => {
    if (listening && liveTranscript) {
      setQuery(liveTranscript);
      setIsVoiceQuery(true);
    }
  }, [liveTranscript, listening]);

  // Cleanup media recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Handle voice input with hybrid approach: react-speech-recognition + Whisper
  const handleVoiceInput = async () => {
    if (!requireLogin()) return;
    
    if (!browserSupportsSpeechRecognition) {
      const errorMsg = detectedLanguage === 'bn' 
        ? 'আপনার ব্রাউজার ভয়েস রিকগনিশন সাপোর্ট করে না।'
        : 'Your browser does not support voice recognition.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      return;
    }

    if (listening || isRecording) {
      // Stop both real-time recognition and recording
      SpeechRecognition.stopListening();
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      setIsRecording(false);
      return;
    }

    // Start both real-time recognition and recording for Whisper
    try {
      // Clear previous state
      resetTranscript();
      setQuery('');
      setIsVoiceQuery(true);
      setUseWhisperForFinal(true);

      // Start react-speech-recognition for real-time display
      const language = detectedLanguage === 'bn' ? 'bn-BD' : 'en-US';
      await SpeechRecognition.startListening({ 
        continuous: true, 
        language: language,
        interimResults: true 
      });

      // Also start recording for Whisper API (for final accurate result)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        // If we want Whisper for final result, process the recording
        if (useWhisperForFinal && audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          await processWithWhisper(audioBlob);
        }
        
        setUseWhisperForFinal(false);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

    } catch (error) {
      console.error('Voice input error:', error);
      const errorMsg = detectedLanguage === 'bn' 
        ? 'মাইক্রোফোন অ্যাক্সেস করতে পারছি না।'
        : 'Cannot access microphone.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    }
  };

  // Process audio with Whisper API for final accurate transcription
  const processWithWhisper = async (audioBlob) => {
    try {
      setIsLoading(true);
      
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('language', detectedLanguage);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      if (data.success && data.transcript) {
        // Replace the live transcript with Whisper's more accurate result
        setQuery(data.transcript);
        
        // Update detected language based on Whisper's analysis
        if (data.detectedLanguage) {
          setDetectedLanguage(data.detectedLanguage);
        }
        
        console.log('Whisper transcription:', data.transcript);
        console.log('Live transcription was:', liveTranscript);
        
        // Focus on the input so user can see the final transcribed text
        if (inputRef.current) {
          inputRef.current.focus();
        }
      } else {
        console.error('Whisper transcription failed, keeping live transcript');
        // Keep the live transcript if Whisper fails
      }
    } catch (error) {
      console.error('Whisper processing error:', error);
      // Keep the live transcript if Whisper fails
      console.log('Keeping live transcript due to Whisper error');
    } finally {
      setIsLoading(false);
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
    setUseWhisperForFinal(false);
    
    // Stop any active voice recognition
    if (listening) {
      SpeechRecognition.stopListening();
    }
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    resetTranscript();
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

  // Check browser support on mount
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      console.warn('Browser does not support speech recognition');
    }
  }, [browserSupportsSpeechRecognition]);

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
              width={56} height={56} 
              className="h-10 w-10 sm:h-14 sm:w-14 object-contain"
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 sm:p-3 z-10 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-center bg-gray-50 rounded-full border border-gray-200 p-1.5 sm:p-2">
                  {/* Voice Button */}
                  <button
                    type="button"
                    onClick={handleVoiceInput}
                disabled={!isLoggedIn}
                className={`p-2 sm:p-2.5 rounded-full transition-colors ${
                  listening || isRecording
                        ? 'bg-red-500 text-white animate-pulse' 
                        : 'bg-pink-500 text-white hover:bg-pink-600'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  listening || isRecording
                    ? (detectedLanguage === 'bn' ? 'রেকর্ডিং বন্ধ করুন' : 'Stop Recording')
                    : (detectedLanguage === 'bn' ? 'ভয়েস রেকর্ডিং শুরু করুন' : 'Start Voice Recording')
                }
              >
                <span className="text-sm sm:text-base">🎤</span>
              </button>
              
              {/* Language Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  const newLang = detectedLanguage === 'bn' ? 'en' : 'bn';
                  setDetectedLanguage(newLang);
                  
                  // If currently listening, restart with new language
                  if (listening) {
                    SpeechRecognition.stopListening();
                    setTimeout(() => {
                      const language = newLang === 'bn' ? 'bn-BD' : 'en-US';
                      SpeechRecognition.startListening({ 
                        continuous: true, 
                        language: language,
                        interimResults: true 
                      });
                    }, 100);
                  }
                }}
                disabled={!isLoggedIn}
                className={`p-2 sm:p-2.5 rounded-full transition-colors text-xs font-bold ${
                  detectedLanguage === 'bn' 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } ${!isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={detectedLanguage === 'bn' ? 'Switch to English' : 'Switch to Bengali'}
              >
                {detectedLanguage === 'bn' ? 'বাং' : 'EN'}
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
                    ? "লগইন করুন প্রশ্ন করার জন্য"
                    : listening
                    ? (detectedLanguage === 'bn' ? "🎤 শুনছি..." : "🎤 Listening...")
                    : isRecording && !listening
                    ? (detectedLanguage === 'bn' ? "🎤 প্রসেসিং..." : "🎤 Processing...")
                    : (detectedLanguage === 'bn' ? "দয়া করে আপনার সমস্যা লিখুন" : "Please write your problem")
                }
                className={`flex-1 px-3 sm:px-4 py-2 sm:py-2.5 bg-transparent border-none outline-none text-gray-700 placeholder-gray-500 text-sm sm:text-base ${
                  listening || isRecording ? 'placeholder-red-500' : ''
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
                className={`p-2 sm:p-2.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors ${
                  !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                  >
                <span className="text-sm sm:text-base">📷</span>
                  </button>
                  
                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={clearAll}
                disabled={!isLoggedIn}
                className={`p-2 sm:p-2.5 rounded-full bg-gray-400 text-white hover:bg-gray-500 transition-colors ${
                  !isLoggedIn ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                  >
                <span className="text-sm sm:text-base">🔄</span>
                  </button>
                  
                  {/* Submit Button */}
                  <button
                    type="submit"
                disabled={isLoading || !query.trim() || !isLoggedIn}
                className="p-2 sm:p-2.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                <span className="text-sm sm:text-base">➤</span>
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
