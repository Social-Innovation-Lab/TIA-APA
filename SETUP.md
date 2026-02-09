# 🚀 Tia Apa Setup Guide

## 🔑 OpenAI API Configuration

To use the AI-powered features (GPT-4, Whisper, Vision), you need to set up your OpenAI API key:

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key

### 2. Set Environment Variable

**Option A: Create .env.local file (Recommended)**
```bash
# Create .env.local file in the root directory
echo "OPENAI_API_KEY=your_actual_api_key_here" > .env.local
```

**Option B: Set system environment variable**
```bash
# Windows PowerShell
$env:OPENAI_API_KEY="your_actual_api_key_here"

# Windows Command Prompt
set OPENAI_API_KEY=your_actual_api_key_here

# Linux/Mac
export OPENAI_API_KEY="your_actual_api_key_here"
```

### 3. Update API Routes (if needed)
If you prefer to hardcode the API key temporarily for testing, update these files:
- `src/app/api/search/route.js`
- `src/app/api/voice/route.js` 
- `src/app/api/vision/route.js`

Replace `your_openai_api_key_here` with your actual API key.

## 🏃‍♂️ Running the Application

1. **Install dependencies:**
```bash
npm install
```

2. **Start development server:**
```bash
npm run dev
```

3. **Open in browser:**
```
http://localhost:3000
```

## 🎯 Features Available

### ✅ With OpenAI API Key:
- **🤖 GPT-4 Intelligence**: Smart query processing with CSV data
- **🎤 Whisper Voice**: Accurate speech-to-text in Bangla/English
- **👁️ Vision Analysis**: Agricultural image analysis and advice
- **🔍 Flexible Search**: Handles word variations (chilli/chillies)
- **🌐 Bilingual Support**: Responds in user's preferred language

### ⚠️ Without OpenAI API Key:
- **📝 Basic Text Input**: Simple CSV search
- **📷 Image Upload**: Basic image preview (no AI analysis)
- **🎤 Voice Input**: Browser-based speech recognition (limited)
- **💾 CSV Knowledge**: Local agriculture database search

## 🛠️ Troubleshooting

### API Key Issues:
- Ensure API key is correctly set in environment
- Check OpenAI account has sufficient credits
- Verify API key has correct permissions

### Voice Recording Issues:
- Allow microphone permissions in browser
- Use Chrome/Edge for best compatibility
- Check microphone hardware

### Image Analysis Issues:
- Ensure images are under 20MB
- Use common formats (JPG, PNG, WebP)
- Check internet connection for API calls

## 💰 OpenAI API Costs

**Estimated costs per query:**
- **GPT-4**: ~$0.03-0.06 per query
- **Whisper**: ~$0.006 per minute of audio
- **Vision**: ~$0.01-0.02 per image

**Monthly estimates for moderate use:**
- 100 text queries: ~$3-6
- 50 voice queries (1 min each): ~$0.30
- 30 image analyses: ~$0.30-0.60
- **Total: ~$4-7 per month**

## 🔒 Security Notes

- Never commit API keys to version control
- Use environment variables for production
- Monitor API usage in OpenAI dashboard
- Set usage limits to prevent unexpected charges

---

**Ready to help Bangladesh farmers with AI! 🌾🤖** 