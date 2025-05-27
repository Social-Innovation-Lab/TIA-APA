'use client';

import { useState } from 'react';

export default function TestPage() {
  const [message, setMessage] = useState('Hello World');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Page</h1>
      <p>{message}</p>
      <button 
        onClick={() => setMessage('Button clicked!')}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Click me
      </button>
    </div>
  );
} 