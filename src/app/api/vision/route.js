import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your_openai_api_key_here'
});

// Load CSV data and format for AI assistant (same as search API)
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

export async function POST(request) {
  try {
    const { image, query, answerLanguage } = await request.json();
    
    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    let finalResponse = '';
    let source = 'vision_assistant';
    // Set language instruction
    let languageInstruction = '';
    if (answerLanguage === 'en') {
      languageInstruction = 'Respond ONLY in English.';
    } else {
      languageInstruction = 'Respond ONLY in Bangla.';
    }
    try {
      // Load CSV data
      const csvData = await loadAndFormatCSVData();
      
      // Use GPT-4o Vision with Assistant approach
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
      messages: [
        {
          role: "system",
            content: `You are Tia Apa (টিয়া আপা), an expert AI assistant for Bangladeshi farmers specializing in image analysis.\n\n${languageInstruction}\n\nYour task:\n1. Analyze the agricultural image thoroughly\n2. Identify any crops, diseases, pests, or problems visible\n3. Search through the provided agriculture database for relevant solutions\n4. Provide practical, specific advice\n\nIMPORTANT GUIDELINES:\n- NEVER mention "Entry", "CSV file names", or "database" in your responses\n- DO NOT reference which file or entry the information comes from\n- Present solutions in a clean, organized manner\n- Focus on practical, actionable advice\n- Use natural language as if you're directly advising the farmer\n- Combine similar treatments into coherent advice\n\nHere is the agriculture database:\n\n${csvData}\n\nRespond in a helpful manner suitable for Bangladeshi farmers.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
                text: `Please analyze this agricultural image and provide detailed advice. \n\nUser's question: ${query || 'এই ছবিটি বিশ্লেষণ করুন এবং কৃষি সংক্রান্ত পরামর্শ দিন।'}\n\nSteps:\n1. Describe what you see in the image\n2. Identify any problems, diseases, or pests\n3. Search the database for relevant solutions\n4. Provide specific treatment recommendations\n5. Include prevention measures if applicable`
            },
            {
              type: "image_url",
              image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      });
      
      finalResponse = completion.choices[0].message.content;
      source = 'gpt4o_vision_csv';
      
    } catch (visionError) {
      console.error('Vision analysis error:', visionError);
      
      // Fallback to basic vision analysis
      try {
        const fallbackCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are Tia Apa (টিয়া আপা), an AI assistant for Bangladeshi farmers. 
                  
                  Analyze this agricultural image and provide:
                  1. What you see in the image
                  2. Any problems or diseases identified
                  3. Practical solutions and treatments
                  4. Prevention measures
                  5. When to seek professional help
                  
                  User's question: ${query || 'এই ছবিটি বিশ্লেষণ করুন এবং কৃষি সংক্রান্ত পরামর্শ দিন।'}
                  
                  Respond in a mix of Bangla and English as appropriate for Bangladeshi farmers.`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image
              }
            }
          ]
        }
      ],
          max_tokens: 800,
          temperature: 0.3
    });
        
        finalResponse = fallbackCompletion.choices[0].message.content;
        source = 'gpt4o_vision_fallback';
        
      } catch (fallbackError) {
        console.error('Fallback vision error:', fallbackError);
        finalResponse = 'ছবি বিশ্লেষণে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন অথবা ছবিটি আরো স্পষ্ট করে তুলুন।';
        source = 'error';
      }
    }

    return NextResponse.json({
      analysis: finalResponse,
      source,
      confidence: source.includes('csv') ? 0.9 : 0.8
    });

  } catch (error) {
    console.error('Vision API error:', error);
    return NextResponse.json(
      { 
        analysis: 'ছবি বিশ্লেষণে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন অথবা ছবিটি আরো স্পষ্ট করে তুলুন।',
        error: 'Vision analysis failed' 
      },
      { status: 500 }
    );
  }
} 