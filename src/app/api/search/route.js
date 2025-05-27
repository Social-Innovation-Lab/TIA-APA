import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your_openai_api_key_here'
});

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

// Create or get assistant
async function getOrCreateAssistant() {
  try {
    // Try to find existing assistant
    const assistants = await openai.beta.assistants.list();
    let assistant = assistants.data.find(a => a.name === 'Tia Apa Agriculture Assistant');
    
    if (!assistant) {
      // Create new assistant
      assistant = await openai.beta.assistants.create({
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
        model: 'gpt-4o',
        tools: []
      });
    }
    
    return assistant;
  } catch (error) {
    console.error('Error creating/getting assistant:', error);
    throw error;
  }
}

// Search using AI Assistant
async function searchWithAssistant(query, csvData) {
  try {
    const assistant = await getOrCreateAssistant();
    
    // Create a thread
    const thread = await openai.beta.threads.create();
    
    // Add the CSV data and user query to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: `Here is some agricultural reference information:\n\n${csvData}\n\nUser Query: "${query}"\n\nPlease provide the most relevant and accurate answer to the user's query. If you find matching information, use it. If not, provide general agricultural advice based on your knowledge. Respond in a helpful, practical manner suitable for Bangladeshi farmers. Do NOT mention any database, file, or entry in your answer.`
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });
    
    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }
    
    if (runStatus.status === 'failed') {
      throw new Error('Assistant run failed');
    }
    
    // Get the response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    // Clean up thread
    await openai.beta.threads.del(thread.id);
    
    return assistantMessage?.content[0]?.text?.value || 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।';
    
  } catch (error) {
    console.error('Assistant search error:', error);
    throw error;
  }
}

// Fallback search using direct GPT-4o
async function fallbackSearch(query) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are Tia Apa (টিয়া আপা), a helpful AI assistant for Bangladeshi farmers. 
          Provide practical, accurate agricultural advice in the user's language (Bangla or English).
          Focus on solutions that are practical for Bangladeshi farming conditions.
          Be specific and actionable in your recommendations.`
        },
        {
          role: "user",
          content: `Please provide detailed agricultural advice for this query: "${query}". 
          Include specific steps, treatments, and recommendations suitable for Bangladeshi farmers.`
        }
      ],
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
    const { query, type = 'text' } = await request.json();
    
    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    let response = '';
    let source = 'assistant';
    
    try {
      // Load CSV data
      const csvData = await loadAndFormatCSVData();
      
      // Search using AI Assistant
      response = await searchWithAssistant(query, csvData);
      source = 'assistant_csv';
      
    } catch (assistantError) {
      console.error('Assistant API error:', assistantError);
      
      // Fallback to direct GPT-4o
      response = await fallbackSearch(query);
      source = 'gpt4o_fallback';
    }

    return NextResponse.json({ 
      response,
      source,
      confidence: 0.9
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { 
        response: 'দুঃখিত, এই মুহূর্তে আমি আপনার প্রশ্নের উত্তর দিতে পারছি না। অনুগ্রহ করে পরে আবার চেষ্টা করুন।',
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
} 