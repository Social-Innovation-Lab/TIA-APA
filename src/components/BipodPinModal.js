'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Authorised PINs - add specific PINs here when ready for production
// For now (development), any 6-digit number is accepted
const AUTHORISED_PINS = [
  // Add specific PINs here, e.g.:
  // '123456',
  // '654321',
];

// Set to true to enforce specific PINs, false to allow any 6-digit number
const ENFORCE_PIN_LIST = false;

export default function BipodPinModal({ isOpen, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // PIN verification
    const isValidLength = pin.length === 6;
    const isAuthorised = ENFORCE_PIN_LIST 
      ? AUTHORISED_PINS.includes(pin) 
      : isValidLength;

    if (isAuthorised) {
      // Store access in sessionStorage
      sessionStorage.setItem('bipodAccess', 'granted');
      sessionStorage.setItem('bipodAccessTime', Date.now().toString());
      router.push('/bipod-barta');
      onClose();
    } else {
      setError(ENFORCE_PIN_LIST 
        ? 'অননুমোদিত পিন। অনুগ্রহ করে সঠিক পিন প্রবেশ করুন।' 
        : 'পিন অবশ্যই ৬ সংখ্যার হতে হবে।');
    }
    
    setIsLoading(false);
    setPin('');
  };

  const handlePinChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(value);
    setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">বিপদ বার্তা</h2>
                <p className="text-xs text-white/80">Early Flood Warning</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-gray-600 text-sm mb-4 text-center">
            বিপদ বার্তা ড্যাশবোর্ড অ্যাক্সেস করতে পিন প্রবেশ করুন
          </p>

          {/* PIN Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              পিন নম্বর
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={handlePinChange}
              placeholder="••••••"
              className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
              autoFocus
              maxLength={6}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={pin.length < 6 || isLoading}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>যাচাই করা হচ্ছে...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>অ্যাক্সেস করুন</span>
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            শুধুমাত্র অনুমোদিত সেক্টর স্পেশালিস্টদের জন্য
          </p>
        </form>
      </div>
    </div>
  );
}

