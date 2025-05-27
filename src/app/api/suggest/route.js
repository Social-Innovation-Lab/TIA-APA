import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your_openai_api_key_here'
});

// Simple in-memory cache for faster suggestions
const suggestionCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function POST(request) {
  try {
    const { input, language = 'bn' } = await request.json();
    
    if (!input || input.trim().length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Create cache key
    const cacheKey = `${input.toLowerCase().trim()}_${language}`;
    
    // Check cache first
    if (suggestionCache.has(cacheKey)) {
      const cached = suggestionCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return NextResponse.json({ suggestions: cached.suggestions });
      } else {
        suggestionCache.delete(cacheKey);
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Using latest GPT-4 model for better quality
      messages: [
        {
          role: "system",
          content: `Suggest 3 relevant agricultural questions based on user input. Focus on practical farming. Return only questions, no numbering.`
        },
        {
          role: "user",
          content: `Language: ${language}\nInput: ${input}\n\nSuggest 3 questions:`
        }
      ],
      max_tokens: 150, // Increased slightly for GPT-4's better responses
      temperature: 0.5, // Reduced for more consistent results
      stream: false
    });

    const suggestions = completion.choices[0].message.content
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0 && line.length < 150) // Filter out very long suggestions
      .slice(0, 3);

    // Quick relevance filter - check if suggestion contains input words
    const inputWords = input.toLowerCase().split(/\s+/).filter(word => word.length > 1);
    let filteredSuggestions = suggestions.filter(suggestion => 
      inputWords.some(word => suggestion.toLowerCase().includes(word))
    );

    // If not enough relevant suggestions, use original suggestions
    if (filteredSuggestions.length < 2) {
      filteredSuggestions = suggestions;
    }

    const finalSuggestions = filteredSuggestions.slice(0, 3);

    // Cache the result
    suggestionCache.set(cacheKey, {
      suggestions: finalSuggestions,
      timestamp: Date.now()
    });

    // Clean cache periodically (keep only last 100 entries)
    if (suggestionCache.size > 100) {
      const entries = Array.from(suggestionCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      suggestionCache.clear();
      entries.slice(0, 50).forEach(([key, value]) => {
        suggestionCache.set(key, value);
      });
    }

    return NextResponse.json({ 
      suggestions: finalSuggestions
    });

  } catch (error) {
    console.error('Suggest API error:', error);
    return NextResponse.json({ 
      suggestions: [],
      error: 'Failed to generate suggestions' 
    });
  }
} 