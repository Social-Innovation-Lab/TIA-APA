import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const USER_DATA_FILE = path.join(process.cwd(), 'data', 'user_data.csv');

export async function GET() {
  try {
    // Check if CSV file exists
    if (!fs.existsSync(USER_DATA_FILE)) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'No data file found'
      });
    }

    // Read CSV file
    const csvContent = fs.readFileSync(USER_DATA_FILE, 'utf8');
    
    // Parse CSV
    const results = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true
    });

    if (results.errors.length > 0) {
      console.error('CSV parsing errors:', results.errors);
      return NextResponse.json({
        success: false,
        error: 'Error parsing CSV data'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: results.data,
      total: results.data.length
    });

  } catch (error) {
    console.error('Error reading CSV data:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to read CSV data'
    }, { status: 500 });
  }
} 