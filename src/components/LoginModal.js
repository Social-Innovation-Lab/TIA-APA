'use client';

import { useState } from 'react';

export default function LoginModal({ isOpen, onClose, onLogin }) {
  const [formData, setFormData] = useState({
    email: '',
    clinicName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login with data:', formData);
      
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        // Store session data in localStorage
        localStorage.setItem('tiaApaSession', JSON.stringify({
          sessionToken: data.sessionToken,
          userData: data.userData,
          loginTime: new Date().toISOString()
        }));
        
        onLogin(data.userData);
        onClose();
        
        // Reset form
        setFormData({ email: '', clinicName: '' });
      } else {
        setError(data.error || 'লগইনে সমস্যা হয়েছে');
      }
    } catch (error) {
      console.error('Login error details:', error);
      
      if (error.message.includes('404')) {
        setError('API রুট পাওয়া যায়নি। সার্ভার সমস্যা।');
      } else if (error.message.includes('500')) {
        setError('সার্ভার ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।');
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setError('নেটওয়ার্ক সংযোগ সমস্যা। ইন্টারনেট সংযোগ পরীক্ষা করুন।');
      } else {
        setError(`নেটওয়ার্ক সমস্যা: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              টিয়া আপাকে প্রশ্ন করতে আপনার তথ্য দিয়ে লগইন করুন
            </h2>
            <p className="text-sm text-gray-600">
              প্রশ্ন করার জন্য নিচের তথ্যগুলো পূরণ করুন
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email/Contact Field - Plain Text Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                আপনার তথ্য/Your Information *
              </label>
              <input
                type="text"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Enter any text (name, phone, email, etc.)"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-gray-700 text-sm font-medium"
              />
            </div>

            {/* Clinic Name Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name of the Adaptation Clinic/অ্যাডাপ্টেশন ক্লিনিকের নাম *
              </label>
              <select
                value={formData.clinicName}
                onChange={(e) => handleInputChange('clinicName', e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-gray-700 text-sm font-medium"
              >
                <option value="" className="text-gray-700 text-sm font-medium">Select Clinic/ক্লিনিক নির্বাচন করুন</option>
                <option value="Nilganj" className="text-gray-700 text-sm font-medium">Nilganj/নীলগঞ্জ</option>
                <option value="Rampal" className="text-gray-700 text-sm font-medium">Rampal/রামপাল</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                disabled={loading}
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
              </button>
            </div>
          </form>

          {/* Note */}
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-700">
              <strong>নোট:</strong> আপনার তথ্য নিরাপদে সংরক্ষিত হবে এবং শুধুমাত্র কৃষি পরামর্শ প্রদানের জন্য ব্যবহৃত হবে।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 