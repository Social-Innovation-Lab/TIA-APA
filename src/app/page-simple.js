'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import LoginModal from '../components/LoginModal';
import Image from 'next/image';

export default function TiaApaSimple() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState('bn');
  
  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const inputRef = useRef(null);
  const chatEndRef = useRef(null);

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
  };

  // Check login before allowing actions
  const requireLogin = () => {
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return false;
    }
    return true;
  };

  // Handle query submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!requireLogin()) return;
    if (!query.trim()) return;

    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: 'text' })
      });

      const data = await response.json();
      
      if (data.response) {
        setMessages((prev) => [...prev, { role: 'ai', content: data.response }]);
      } else {
        const errorMsg = 'Sorry, I cannot provide an answer at the moment.';
        setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
      }
    } catch (error) {
      console.error('Search error:', error);
      const errorMsg = 'Sorry, something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'ai', content: errorMsg }]);
    } finally {
      setIsLoading(false);
      setQuery('');
    }
  };

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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Image 
              src="/logo.png" 
              alt="Tia Apa Logo" 
              width={56} height={56} 
              className="h-14 w-14 object-contain"
              priority
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">টিয়া আপা</h1>
              <p className="text-xs text-gray-600">আপনার কৃষি সহায়ক বন্ধু</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {isLoggedIn && userData ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{userData.email}</p>
                  <p className="text-xs text-gray-600">{userData.location}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                >
                  লগআউট
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700"
              >
                লগইন করুন
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Welcome message */}
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center mt-8 mb-4 px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">আপাকে জিজ্ঞেস করুন</h2>
          <p className="text-sm text-gray-600 text-center">আপনার চ্যাট এখানে প্রদর্শিত হবে।</p>
        </div>
      )}

      {/* Chat Block */}
      <main className="flex-1 flex flex-col items-center px-4 pb-24 overflow-hidden">
        <div className="w-full max-w-4xl flex flex-col h-full">
          <div className="bg-white rounded-2xl shadow-lg w-full flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="flex flex-col gap-4">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`rounded-2xl px-5 py-4 max-w-[80%] text-gray-800 shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-pink-50 text-right'
                          : 'bg-pink-100 text-left'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="w-full flex justify-start">
                    <div className="rounded-2xl px-5 py-4 max-w-[80%] bg-pink-100 text-left text-gray-800 shadow-sm">
                      <span className="animate-pulse">চিন্তা করা হচ্ছে...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Fixed Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-10">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-center bg-gray-50 rounded-full border border-gray-200 p-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!isLoggedIn}
                placeholder={
                  !isLoggedIn
                    ? "লগইন করুন প্রশ্ন করার জন্য"
                    : "দয়া করে আপনার সমস্যা লিখুন"
                }
                className="flex-1 px-4 py-2 bg-transparent border-none outline-none text-gray-700 placeholder-gray-500"
                ref={inputRef}
              />
              
              <button
                type="submit"
                disabled={isLoading || !query.trim() || !isLoggedIn}
                className="p-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>➤</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 