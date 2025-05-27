import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const USER_DATA_FILE = path.join(process.cwd(), 'data', 'user_data.csv');

// Ensure data directory exists
function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Initialize CSV file with headers if it doesn't exist
function initializeCSV() {
  ensureDataDirectory();
  if (!fs.existsSync(USER_DATA_FILE)) {
    const headers = 'Email,Location,Name of the Adaptation Clinic,Query Type,Query,Answer Given\n';
    fs.writeFileSync(USER_DATA_FILE, headers, 'utf8');
  }
}

// Validate user credentials
function validateCredentials(email, location, clinicName) {
  // Basic validation
  if (!email || !email.trim()) return false;
  if (!location || !location.trim()) return false;
  if (!clinicName || !clinicName.trim()) return false;
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return false;
  
  return true;
}

export async function POST(request) {
  try {
    const { email, location, clinicName } = await request.json();
    
    // Validate credentials
    if (!validateCredentials(email, location, clinicName)) {
      return NextResponse.json({ 
        success: false, 
        error: 'সকল তথ্য সঠিকভাবে পূরণ করুন। ইমেইল ঠিকানা বৈধ হতে হবে।' 
      }, { status: 400 });
    }

    // Initialize CSV file
    initializeCSV();

    // Create session token (simple timestamp-based for this implementation)
    const sessionToken = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store user session data (in a real app, use proper session management)
    const sessionData = {
      email: email.trim(),
      location: location.trim(),
      clinicName: clinicName.trim(),
      loginTime: new Date().toISOString(),
      sessionToken
    };

    return NextResponse.json({
      success: true,
      message: 'সফলভাবে লগইন হয়েছে',
      sessionToken,
      userData: {
        email: sessionData.email,
        location: sessionData.location,
        clinicName: sessionData.clinicName
      }
    });

  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'লগইনে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।' 
    }, { status: 500 });
  }
} 