/**
 * Farmer Data Utility
 * Loads and processes farmer data from Rampal and Nilganj CSV files
 */

import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

// Cache for parsed farmer data
let cachedFarmers = null;

/**
 * Load and parse farmer data from CSV files
 */
export function loadFarmers() {
  if (cachedFarmers) {
    return cachedFarmers;
  }

  const dataDir = path.join(process.cwd(), 'data');
  const farmers = [];

  // File configurations
  const files = [
    {
      filename: 'Final Data_Rampal & Nilganj.xlsx - Rampal.csv',
      region: 'Rampal',
      nameCol: 'Full Name',
      latCol: '_Record your location_latitude',
      lngCol: '_Record your location_longitude',
    },
    {
      filename: 'Final Data_Rampal & Nilganj.xlsx - Nilganj.csv',
      region: 'Nilganj',
      nameCol: 'Full Name ', // Note: has trailing space
      latCol: '_Record your location_latitude',
      lngCol: '_Record your location_longitude',
    }
  ];

  for (const fileConfig of files) {
    const filePath = path.join(dataDir, fileConfig.filename);
    
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Farmer data file not found: ${fileConfig.filename}`);
        continue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      if (parsed.errors.length > 0) {
        console.warn(`Parse errors in ${fileConfig.filename}:`, parsed.errors.slice(0, 3));
      }

      for (const row of parsed.data) {
        // Get values from correct columns
        const uniqueId = row['Unique ID'];
        const name = row[fileConfig.nameCol] || row['Full Name'] || row['Full Name '];
        const lat = parseFloat(row[fileConfig.latCol]);
        const lng = parseFloat(row[fileConfig.lngCol]);
        const district = row['District'];
        const upazila = row['Upazila'];
        const union = row['Union'];
        const village = row['Village'];
        const gender = row['Gender'];

        // Skip rows with invalid coordinates
        if (!uniqueId || !name || isNaN(lat) || isNaN(lng)) {
          continue;
        }

        // Skip obviously invalid coordinates (outside Bangladesh)
        if (lat < 20 || lat > 27 || lng < 88 || lng > 93) {
          continue;
        }

        farmers.push({
          id: uniqueId,
          name: name.trim(),
          lat,
          lng,
          district: district || '',
          upazila: upazila || '',
          union: union ? union.trim() : '',
          village: village || '',
          gender: gender || '',
          region: fileConfig.region,
          // Generate a placeholder phone (in production, this would come from DB)
          phone: `017${Math.floor(10000000 + Math.random() * 90000000)}`,
        });
      }
    } catch (error) {
      console.error(`Error loading ${fileConfig.filename}:`, error.message);
    }
  }

  console.log(`Loaded ${farmers.length} farmers from CSV files`);
  cachedFarmers = farmers;
  return farmers;
}

/**
 * Get farmers for flood risk assessment
 * Returns farmers with coordinates suitable for map display
 */
export function getFarmersForFloodRisk(limit = 2000) {
  const allFarmers = loadFarmers();
  
  // If limit is high enough, return all farmers
  if (limit >= allFarmers.length) {
    return allFarmers;
  }
  
  // If we have many farmers and need to limit, sample evenly from both regions
  const rampalFarmers = allFarmers.filter(f => f.region === 'Rampal');
  const nilganjFarmers = allFarmers.filter(f => f.region === 'Nilganj');
  
  const halfLimit = Math.floor(limit / 2);
  const selectedRampal = rampalFarmers.slice(0, halfLimit);
  const selectedNilganj = nilganjFarmers.slice(0, halfLimit);
  
  return [...selectedRampal, ...selectedNilganj];
}

/**
 * Get statistics about farmer data
 */
export function getFarmerStats() {
  const farmers = loadFarmers();
  
  const stats = {
    total: farmers.length,
    byRegion: {},
    byDistrict: {},
    byUpazila: {},
  };
  
  for (const farmer of farmers) {
    // By region
    stats.byRegion[farmer.region] = (stats.byRegion[farmer.region] || 0) + 1;
    
    // By district
    if (farmer.district) {
      stats.byDistrict[farmer.district] = (stats.byDistrict[farmer.district] || 0) + 1;
    }
    
    // By upazila
    if (farmer.upazila) {
      stats.byUpazila[farmer.upazila] = (stats.byUpazila[farmer.upazila] || 0) + 1;
    }
  }
  
  return stats;
}

/**
 * Clear the farmer cache (useful for reloading data)
 */
export function clearFarmerCache() {
  cachedFarmers = null;
}

