# Neon Database Setup Instructions

## ✅ What We've Set Up

1. **Database Client**: Installed `pg` package for PostgreSQL connection
2. **Database Utilities**: Created `src/lib/db.js` with connection and query functions
3. **Updated APIs**: Modified `/api/store-query` to save data to database
4. **Monitoring**: Created `/api/monitor` and `/app/monitor` for viewing data
5. **Environment File**: Created `.env.local` (needs your connection string)

## 🔧 Next Steps - Get Your Neon Connection String

### 1. Go to Your Neon Dashboard
- Visit: https://console.neon.tech/
- Login to your account
- Select your project: `tiaapa-db`

### 2. Get Connection String
- In your Neon dashboard, click on your database
- Go to "Connection Details" or "Settings"
- Copy the **Connection String** (it looks like this):
  ```
  postgresql://username:password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
  ```

### 3. Update Your Environment File
- Open the `.env.local` file in your project root
- Replace the placeholder with your actual connection string:
  ```
  DATABASE_URL="your_actual_connection_string_here"
  ```

### 4. Restart Your Development Server
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## 🎯 How to Test & Monitor

### Test the Connection
1. Login to your app: http://localhost:3000
2. Ask a question to Tia Apa
3. Check the terminal - you should see "Successfully saved to database"

### Monitor Your Data
1. Visit: http://localhost:3000/monitor
2. You'll see:
   - Total queries count
   - Statistics by clinic
   - Recent queries table

### Monitor in Neon SQL Editor
Run these queries in your Neon SQL Editor:

```sql
-- View all queries
SELECT * FROM queries ORDER BY created_at DESC;

-- Count queries by clinic
SELECT clinic_name, COUNT(*) as total 
FROM queries 
GROUP BY clinic_name;

-- Recent queries (last 24 hours)
SELECT user_contact, clinic_name, query, created_at 
FROM queries 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## 🔍 Troubleshooting

### If Database Connection Fails
- The app will fallback to console logging
- Check your connection string format
- Ensure your Neon database is active
- Check the terminal for error messages

### If No Data Appears
- Make sure you've updated `.env.local` with correct connection string
- Restart the development server
- Try asking a question in the app
- Check terminal logs for database errors

## 📊 Data Structure

Your `queries` table stores:
- `id`: Auto-incrementing primary key
- `user_contact`: Phone/email from login
- `clinic_name`: Selected clinic (Nilganj/Rampal)
- `query_type`: Text/Voice/Image
- `query`: The actual question
- `answer`: AI response
- `created_at`: Timestamp

## 🚀 Production Deployment

When you deploy to Vercel:
1. Add `DATABASE_URL` to Vercel environment variables
2. Your Neon database will work automatically
3. Monitor via: `your-domain.vercel.app/monitor`

---

**Need Help?** 
- Check Neon documentation: https://neon.tech/docs
- Verify your connection string format
- Ensure your database is not paused in Neon dashboard 