'use client';

import { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [csvData, setCsvData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    byType: { Text: 0, Voice: 0, Image: 0 },
    byLocation: {},
    byClinics: {}
  });

  // Fetch CSV data
  const fetchCSVData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/csv-data');
      const data = await response.json();
      
      if (data.success) {
        setCsvData(data.data);
        calculateStats(data.data);
      } else {
        setError(data.error || 'Failed to load data');
      }
    } catch (error) {
      console.error('Failed to fetch CSV data:', error);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const calculateStats = (data) => {
    const stats = {
      total: data.length,
      byType: { Text: 0, Voice: 0, Image: 0 },
      byLocation: {},
      byClinics: {}
    };

    data.forEach(row => {
      // Count by type
      if (row['Query Type']) {
        stats.byType[row['Query Type']] = (stats.byType[row['Query Type']] || 0) + 1;
      }

      // Count by location
      if (row.Location) {
        stats.byLocation[row.Location] = (stats.byLocation[row.Location] || 0) + 1;
      }

      // Count by clinic
      if (row['Name of the Adaptation Clinic']) {
        stats.byClinics[row['Name of the Adaptation Clinic']] = (stats.byClinics[row['Name of the Adaptation Clinic']] || 0) + 1;
      }
    });

    setStats(stats);
  };

  // Export CSV data
  const exportCSV = () => {
    if (csvData.length === 0) return;

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape CSV values
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tia-apa-queries-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Load data on component mount
  useEffect(() => {
    fetchCSVData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Tia Apa Admin Dashboard</h1>
              <p className="text-gray-600">Monitor user queries and interactions</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchCSVData}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Refresh Data
              </button>
              <button
                onClick={exportCSV}
                disabled={csvData.length === 0}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Queries</h3>
            <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Text Queries</h3>
            <p className="text-3xl font-bold text-green-600">{stats.byType.Text || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Voice Queries</h3>
            <p className="text-3xl font-bold text-purple-600">{stats.byType.Voice || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Image Queries</h3>
            <p className="text-3xl font-bold text-orange-600">{stats.byType.Image || 0}</p>
          </div>
        </div>

        {/* Location and Clinic Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Locations</h3>
            <div className="space-y-2">
              {Object.entries(stats.byLocation)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([location, count]) => (
                  <div key={location} className="flex justify-between items-center">
                    <span className="text-gray-700">{location}</span>
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm">{count}</span>
                  </div>
                ))}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Clinics</h3>
            <div className="space-y-2">
              {Object.entries(stats.byClinics)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([clinic, count]) => (
                  <div key={clinic} className="flex justify-between items-center">
                    <span className="text-gray-700 truncate">{clinic}</span>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Query Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Showing {csvData.length} queries
            </p>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading data...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              <p>Error: {error}</p>
              <button
                onClick={fetchCSVData}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          ) : csvData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No data available. Users haven't submitted any queries yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Clinic
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Query
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Answer
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {csvData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate">
                        {row['Name of the Adaptation Clinic']}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          row['Query Type'] === 'Text' ? 'bg-blue-100 text-blue-800' :
                          row['Query Type'] === 'Voice' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {row['Query Type']}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                        <div className="truncate" title={row.Query}>
                          {row.Query}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                        <div className="truncate" title={row['Answer Given']}>
                          {row['Answer Given']}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 