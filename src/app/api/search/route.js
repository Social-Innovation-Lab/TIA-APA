import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { retrieveRelevantKnowledge, createRAGPrompt, enhancedRAGSearch } from '../../../lib/rag';
import { searchClinicAdvice } from '../../../lib/clinicData';
import { getRecentQueriesByUser } from '../../../lib/db';

// Initialize AI client based on available API keys
function initializeAIClient() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  
  if (deepseekKey && deepseekKey !== 'your_deepseek_api_key_here') {
    console.log('Using DeepSeek API for AI responses');
    return {
      client: new OpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com'
      }),
      model: 'deepseek-chat',
      provider: 'deepseek'
    };
  } else if (openaiKey && openaiKey !== 'your_openai_api_key_here') {
    console.log('Using OpenAI API for AI responses');
    return {
      client: new OpenAI({
        apiKey: openaiKey
      }),
      model: 'gpt-4o',
      provider: 'openai'
    };
  } else {
    throw new Error('No valid AI API key found. Please add OPENAI_API_KEY or DEEPSEEK_API_KEY to .env.local');
  }
}

const aiConfig = initializeAIClient();

// Load CSV data and format for AI assistant
async function loadAndFormatCSVData() {
  const csvFiles = ['CCPNilganj.csv', 'CCPRampal.csv', 'Kharif1_Crop_Diseases_Data.csv'];
  let formattedData = '';
  
  for (const fileName of csvFiles) {
    try {
      const filePath = path.join(process.cwd(), 'public', fileName);
      const csvText = fs.readFileSync(filePath, 'utf8');
      
      const results = Papa.parse(csvText, { header: true });
      const validData = results.data.filter(row => 
        Object.values(row).some(value => value && value.toString().trim())
      );
      
      formattedData += `\n=== ${fileName} ===\n`;
      validData.forEach((row, index) => {
        formattedData += `Entry ${index + 1}:\n`;
        Object.entries(row).forEach(([key, value]) => {
          if (value && value.toString().trim()) {
            formattedData += `${key}: ${value}\n`;
          }
        });
        formattedData += '\n';
      });
      
    } catch (error) {
      console.log(`Could not load ${fileName}:`, error);
    }
  }
  
  return formattedData;
}

// Enhanced RAG-based search with optional conversation history
async function ragBasedSearch(query, userLocation = 'Bangladesh', historyMessages = []) {
  try {
    console.log('🔍 Starting enhanced RAG-based search for:', query);
    
    // Step 1: Get enhanced RAG results with web integration
    const ragResults = await enhancedRAGSearch(query, userLocation, 3);
    console.log(`📊 RAG Results - Local: ${ragResults.localCount}, Web: ${ragResults.webCount}`);
    
    // Step 2: Load CSV data for additional context
    const csvData = await loadAndFormatCSVData();

    // Step 2b: Retrieve clinic advice pairs (top matches)
    const clinicTop = searchClinicAdvice(query, 5);
    const clinicContext = clinicTop.length > 0
      ? clinicTop.map((p, i) => `Clinic Pair ${i+1}:\nProblem: ${p.problem}\nAdvice: ${p.solution}`).join('\n\n')
      : '';
    
    // Step 3: Create final prompt combining RAG + CSV + clinic pairs
    let finalPrompt = ragResults.prompt;
    if (clinicContext) {
      finalPrompt += `\n\nCLINIC EXPERIENCE (PROBLEMS → ADVICE):\n${clinicContext}`;
    }
    if (csvData) {
      finalPrompt += `\n\nADDITIONAL REFERENCE DATA:\n${csvData.substring(0, 1500)}...`;
    }
    
    // Step 4: Get AI response with enhanced context + history
    const messages = [
      {
        role: "system",
        content: finalPrompt
      },
      ...historyMessages,
      {
        role: "user",
        content: query
      }
    ];

    const completion = await aiConfig.client.chat.completions.create({
      model: aiConfig.model,
      messages,
      max_tokens: 1200,
      temperature: 0.3
    });
    
    const response = completion.choices[0].message.content;
    console.log('✅ Enhanced RAG response generated successfully');
    
    // Return response with metadata
    return {
      response,
      metadata: {
        localSources: ragResults.localCount,
        webSources: ragResults.webCount,
        csvData: csvData ? true : false,
        clinicPairs: clinicTop.length,
        enhanced: true
      }
    };
    
  } catch (error) {
    console.error('❌ Enhanced RAG search error:', error);
    throw error;
  }
}

// Create or get assistant
async function getOrCreateAssistant() {
  try {
    // Try to find existing assistant
    const assistants = await aiConfig.client.beta.assistants.list();
    let assistant = assistants.data.find(a => a.name === 'Tia Apa Agriculture Assistant');
    
    if (!assistant) {
      // Create new assistant
      assistant = await aiConfig.client.beta.assistants.create({
        name: 'Tia Apa Agriculture Assistant',
        instructions: `You are Tia Apa (টিয়া আপা), an expert AI assistant for Bangladeshi farmers. 

Your role:
1. Search through the provided agriculture database for relevant information
2. Provide accurate, practical solutions for agricultural problems
3. Respond in the user's language (Bangla or English)
4. Present information in a clean, organized manner

CRITICAL GUIDELINES:
- NEVER mention "database", "CSV", "data not found", or "information not available"
- NEVER say "আমাদের ডেটাবেজে নেই" or similar phrases
- If specific information isn't in the database, provide general agricultural knowledge
- Always give helpful, practical advice as if you're an expert farmer
- NEVER mention "Entry", "CSV file names", or technical references
- Combine similar solutions into coherent, organized advice
- Present solutions as numbered points or paragraphs
- Focus on practical, actionable advice
- Use natural language as if you're directly advising the farmer
- Always be confident and helpful in your responses

Example responses:
"তুলসী পাতার সাধারণ সমস্যা ও সমাধান:

1. **পাতা হলুদ হওয়া:** অতিরিক্ত পানি বা পুষ্টির অভাব হতে পারে। মাটির নিষ্কাশন ভালো রাখুন এবং জৈব সার প্রয়োগ করুন।

2. **পোকামাকড়:** নিম তেল বা সাবান পানির মিশ্রণ স্প্রে করুন।"

Always provide practical, specific advice without mentioning data sources.`,
        model: aiConfig.model,
        tools: []
      });
    }
    
    return assistant;
  } catch (error) {
    console.error('Error creating/getting assistant:', error);
    throw error;
  }
}

// Search using AI Assistant (include history as plain text context)
async function searchWithAssistant(query, csvData, historyText = '') {
  try {
    const assistant = await getOrCreateAssistant();
    
    // Create a thread
    const thread = await aiConfig.client.beta.threads.create();
    
    // Add the CSV data and user query to the thread
    await aiConfig.client.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `Here is some agricultural reference information:\n\n${csvData}\n\nConversation so far (may be empty):\n${historyText}\n\nUser Query: "${query}"\n\nPlease provide the most relevant and accurate answer to the user's query. If you find matching information, use it. If not, provide general agricultural advice based on your knowledge. Respond in a helpful, practical manner suitable for Bangladeshi farmers. Do NOT mention any database, file, or entry in your answer.`
    });
    
    // Run the assistant
    const run = await aiConfig.client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });
    
    // Wait for completion
    let runStatus = await aiConfig.client.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await aiConfig.client.beta.threads.runs.retrieve(thread.id, run.id);
    }
    
    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed');
    }
    
    // Get the response
    const messages = await aiConfig.client.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    // Clean up thread
    await aiConfig.client.beta.threads.del(thread.id);
    
    return assistantMessage?.content[0]?.text?.value || 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।';
    
  } catch (error) {
    console.error('Assistant search error:', error);
    throw error;
  }
}

// Fallback search using direct GPT-4o
async function fallbackSearch(query, historyMessages = []) {
  try {
    const messages = [
      {
        role: "system",
        content: `You are Tia Apa (টিয়া আপা), a helpful AI assistant for Bangladeshi farmers. 
          Provide practical, accurate agricultural advice in the user's language (Bangla or English).
          Focus on solutions that are practical for Bangladeshi farming conditions.
          Be specific and actionable in your recommendations.`
      },
      ...historyMessages,
      {
        role: "user",
        content: `Please provide detailed agricultural advice for this query: "${query}". 
          Include specific steps, treatments, and recommendations suitable for Bangladeshi farmers.`
      }
    ];

    const completion = await aiConfig.client.chat.completions.create({
      model: aiConfig.model,
      messages,
      max_tokens: 800,
      temperature: 0.3
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Fallback search error:', error);
    return 'দুঃখিত, এই মুহূর্তে আমি আপনার প্রশ্নের উত্তর দিতে পারছি না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।';
  }
}

export async function POST(request) {
  try {
    const { query, type = 'text', userLocation = 'Bangladesh', history = [], userEmail, clinicName } = await request.json();
    
    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    let response = '';
    let source = 'rag';
    let metadata = {};
    
    // Build conversation history messages (limit to last 10 turns)
    let historyMessages = [];
    try {
      if (Array.isArray(history) && history.length > 0) {
        historyMessages = history
          .slice(-10)
          .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: (m.content || '').toString().slice(0, 1200) }));
      } else if (userEmail && clinicName) {
        const rows = await getRecentQueriesByUser(userEmail, clinicName, 10);
        rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        for (const r of rows) {
          if (r.query) historyMessages.push({ role: 'user', content: (r.query || '').slice(0, 800) });
          if (r.answer) historyMessages.push({ role: 'assistant', content: (r.answer || '').slice(0, 1200) });
        }
      }
    } catch (memErr) {
      console.log('Conversation memory build failed:', memErr);
      historyMessages = [];
    }
    
    try {
      // Primary: Use enhanced RAG-based search for maximum accuracy
      console.log('🚀 Using enhanced RAG-based search as primary method');
      const ragResult = await ragBasedSearch(query, userLocation, historyMessages);
      response = ragResult.response;
      metadata = ragResult.metadata;
      source = 'enhanced_rag';
      
    } catch (ragError) {
      console.error('Enhanced RAG search error, falling back to assistant:', ragError);
      
      try {
        // Fallback 1: Use AI Assistant with CSV data
        const csvData = await loadAndFormatCSVData();
        const historyText = historyMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
        response = await searchWithAssistant(query, csvData, historyText);
        source = 'assistant_csv';
        metadata = { csvData: true, enhanced: false };
        
      } catch (assistantError) {
        console.error('Assistant API error, using final fallback:', assistantError);
        
        // Fallback 2: Direct GPT-4o
        response = await fallbackSearch(query, historyMessages);
        source = 'gpt4o_fallback';
        metadata = { enhanced: false };
      }
    }

    // Log the search method used
    console.log(`✅ Search completed using: ${source}`);
    console.log(`📊 Metadata:`, metadata);

    return NextResponse.json({ 
      response,
      source,
      metadata,
      confidence: source === 'enhanced_rag' ? 0.98 : (source === 'assistant_csv' ? 0.85 : 0.75),
      enhanced: metadata.enhanced || false
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { 
        response: 'দুঃখিত, এই মুহূর্তে আমি আপনার প্রশ্নের উত্তর দিতে পারছি না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।',
        error: 'Internal server error',
        source: 'error',
        enhanced: false
      },
      { status: 500 }
    );
  }
} 