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

// Escape CSV values to handle commas and quotes
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // If the value contains comma, quote, or newline, wrap it in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

// Generate unique temporary file name
function getTempFileName() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return path.join(process.cwd(), 'data', `temp_${timestamp}_${random}.csv`);
}

// Retry function for file operations with longer delays
async function retryFileOperation(operation, maxRetries = 10, delay = 200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'ENOENT' || error.code === 'EPERM' || error.code === 'EACCES') {
        if (i === maxRetries - 1) throw error;
        console.log(`File operation failed (attempt ${i + 1}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 2000); // Exponential backoff with cap
      } else {
        throw error;
      }
    }
  }
}

// Store query data to CSV with atomic write operation
async function storeQueryToCSV(email, location, clinicName, queryType, query, answer) {
  try {
    console.log('Attempting to store to CSV:', { email, location, clinicName, queryType, query, answer });
    
    // Initialize CSV with retry
    await retryFileOperation(() => {
      initializeCSV();
      return Promise.resolve();
    });
    
    console.log('CSV initialized, file path:', USER_DATA_FILE);
    
    // Create CSV row
    const csvRow = [
      escapeCSVValue(email),
      escapeCSVValue(location),
      escapeCSVValue(clinicName),
      escapeCSVValue(queryType),
      escapeCSVValue(query),
      escapeCSVValue(answer)
    ].join(',') + '\n';
    
    console.log('CSV row to append:', csvRow);
    
    // Try atomic write approach using temporary file
    const tempFile = getTempFileName();
    
    try {
      await retryFileOperation(async () => {
        // Read existing content
        let existingContent = '';
        if (fs.existsSync(USER_DATA_FILE)) {
          existingContent = await new Promise((resolve, reject) => {
            fs.readFile(USER_DATA_FILE, 'utf8', (err, data) => {
              if (err) reject(err);
              else resolve(data);
            });
          });
        } else {
          existingContent = 'Email,Location,Name of the Adaptation Clinic,Query Type,Query,Answer Given\n';
        }
        
        // Write to temporary file first
        const newContent = existingContent + csvRow;
        await new Promise((resolve, reject) => {
          fs.writeFile(tempFile, newContent, 'utf8', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        // Atomic move from temp to final file
        await new Promise((resolve, reject) => {
          fs.rename(tempFile, USER_DATA_FILE, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      
      console.log('Successfully wrote to CSV using atomic operation');
      return true;
      
    } catch (atomicError) {
      console.error('Atomic write failed:', atomicError);
      
      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          console.error('Failed to clean up temp file:', cleanupError);
        }
      }
      
      // Fallback to simple append with longer retry
      try {
        console.log('Trying simple append with extended retry...');
        
        await retryFileOperation(() => {
          return new Promise((resolve, reject) => {
            fs.appendFile(USER_DATA_FILE, csvRow, 'utf8', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }, 15, 500); // More retries with longer delays
        
        console.log('Successfully appended using fallback method');
        return true;
        
      } catch (appendError) {
        console.error('All write methods failed:', appendError);
        return false;
      }
    }
    
  } catch (error) {
    console.error('Error storing query to CSV:', error);
    return false;
  }
}

// Detect query type based on content and metadata
function detectQueryType(query, hasImage = false, isVoice = false) {
  if (hasImage) return 'Image';
  if (isVoice) return 'Voice';
  return 'Text';
}

export async function POST(request) {
  try {
    const { 
      email, 
      location, 
      clinicName, 
      query, 
      answer, 
      queryType = null,
      hasImage = false,
      isVoice = false 
    } = await request.json();
    
    console.log('Store-query API received:', {
      email, location, clinicName, query, answer, queryType, hasImage, isVoice
    });
    
    // Validate required fields
    if (!email || !location || !clinicName || !query) {
      console.log('Validation failed - missing required fields');
      return NextResponse.json({ 
        success: false, 
        error: 'সকল প্রয়োজনীয় তথ্য প্রদান করুন।' 
      }, { status: 400 });
    }

    // Determine query type
    const finalQueryType = queryType || detectQueryType(query, hasImage, isVoice);
    console.log('Final query type:', finalQueryType);
    
    // Store to CSV (now async)
    const stored = await storeQueryToCSV(
      email.trim(),
      location.trim(),
      clinicName.trim(),
      finalQueryType,
      query.trim(),
      answer || ''
    );

    console.log('Storage result:', stored);

    if (stored) {
      return NextResponse.json({
        success: true,
        message: 'প্রশ্ন সফলভাবে সংরক্ষিত হয়েছে'
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'ডেটা সংরক্ষণে সমস্যা হয়েছে।' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Store query API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'সার্ভার ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।' 
    }, { status: 500 });
  }
} 