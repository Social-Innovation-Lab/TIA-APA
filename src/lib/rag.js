import OpenAI from 'openai';
import { searchWeb, combineKnowledgeSources, createEnhancedRAGPrompt } from './webSearch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Agricultural knowledge base for Bangladesh
const AGRICULTURAL_KNOWLEDGE_BASE = [
  {
    id: 1,
    topic: "Rice Cultivation",
    content: "In Bangladesh, rice is typically planted during two main seasons: Aus (April-August) and Aman (July-December). For optimal yield, use high-yielding varieties like BRRI dhan28, BRRI dhan29. Soil should be well-puddled with 2-3 inches of standing water.",
    region: "Bangladesh",
    season: "Year-round",
    crop: "Rice"
  },
  {
    id: 2,
    topic: "Sunflower Cultivation",
    content: "Sunflowers in Bangladesh should be sown during October-November (Rabi season). Plant seeds 1-2 inches deep with 12-18 inches spacing. Requires well-drained soil and full sunlight. Harvest after 90-120 days when back of flower head turns brown.",
    region: "Bangladesh",
    season: "Rabi (October-March)",
    crop: "Sunflower"
  },
  {
    id: 3,
    topic: "Pest Management",
    content: "Common pests in Bangladesh include brown planthopper, stem borer, and leaf folder for rice. Use integrated pest management: biological control with Trichogramma, neem-based pesticides, and resistant varieties. Avoid excessive pesticide use.",
    region: "Bangladesh",
    season: "All seasons",
    crop: "Rice"
  },
  {
    id: 4,
    topic: "Fertilizer Application",
    content: "For rice in Bangladesh: Apply 80-100 kg Urea, 60-80 kg TSP, 40-60 kg MoP per hectare. Split urea application: 1/3 at transplanting, 1/3 at tillering, 1/3 at panicle initiation. Use organic matter like cow dung.",
    region: "Bangladesh",
    season: "All seasons",
    crop: "Rice"
  },
  {
    id: 5,
    topic: "Water Management",
    content: "Rice fields need 2-5 cm standing water during vegetative growth. Drain fields 1-2 weeks before harvest. In dry season, use alternate wetting and drying (AWD) to save water. Monitor water quality for salinity in coastal areas.",
    region: "Bangladesh",
    season: "All seasons",
    crop: "Rice"
  },
  {
    id: 6,
    topic: "Vegetable Cultivation",
    content: "Winter vegetables (October-February): tomato, cabbage, cauliflower, radish. Summer vegetables (March-June): bottle gourd, bitter gourd, okra. Use raised beds for better drainage. Apply compost and balanced fertilizers.",
    region: "Bangladesh",
    season: "Year-round",
    crop: "Vegetables"
  },
  {
    id: 7,
    topic: "Climate Adaptation",
    content: "Bangladesh faces flooding, drought, and salinity. Use flood-tolerant varieties like BRRI dhan51, BRRI dhan52. For drought: BRRI dhan56, BRRI dhan57. For salinity: BRRI dhan47, BRRI dhan61. Practice crop diversification.",
    region: "Bangladesh",
    season: "All seasons",
    crop: "All crops"
  },
  {
    id: 8,
    topic: "Soil Health",
    content: "Bangladesh soils are often deficient in zinc, boron, and sulfur. Test soil pH (optimal 6.0-7.0). Add lime for acidic soils. Use green manure crops like dhaincha. Practice crop rotation to maintain soil fertility.",
    region: "Bangladesh",
    season: "All seasons",
    crop: "All crops"
  }
];

// Simple text similarity function (can be replaced with embeddings)
function calculateSimilarity(query, content) {
  const queryWords = query.toLowerCase().split(' ');
  const contentWords = content.toLowerCase().split(' ');
  
  let matches = 0;
  queryWords.forEach(word => {
    if (contentWords.some(contentWord => contentWord.includes(word) || word.includes(contentWord))) {
      matches++;
    }
  });
  
  return matches / queryWords.length;
}

// Retrieve relevant knowledge
export function retrieveRelevantKnowledge(query, topK = 3) {
  // Calculate similarity scores
  const scoredKnowledge = AGRICULTURAL_KNOWLEDGE_BASE.map(item => ({
    ...item,
    score: calculateSimilarity(query, `${item.topic} ${item.content} ${item.crop}`)
  }));
  
  // Sort by relevance and return top K
  return scoredKnowledge
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(item => item.score > 0.1); // Only return if somewhat relevant
}

// Enhanced prompt with RAG
export function createRAGPrompt(query, retrievedKnowledge, userLocation) {
  const knowledgeContext = retrievedKnowledge.length > 0 
    ? retrievedKnowledge.map(item => `- ${item.topic}: ${item.content}`).join('\n')
    : "No specific knowledge found in database.";

  return `You are Tia Apa, an expert agricultural advisor for Bangladesh farmers. You provide practical, localized advice.

CONTEXT INFORMATION:
${knowledgeContext}

USER LOCATION: ${userLocation}
USER QUERY: ${query}

INSTRUCTIONS:
1. Use the context information above to provide accurate, localized advice
2. If the context is relevant, incorporate it into your response
3. Focus on practical, actionable advice for Bangladesh farming conditions
4. Consider the user's location (${userLocation}) for specific recommendations
5. If you don't have specific information, acknowledge it and provide general best practices
6. Always consider Bangladesh's climate, soil conditions, and farming practices
7. Respond in a helpful, friendly manner as Tia Apa

Please provide your agricultural advice:`;
}

// Advanced RAG with OpenAI embeddings (for future implementation)
export async function getEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error getting embedding:', error);
    return null;
  }
}

// Cosine similarity for embeddings
export function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Future: Vector-based retrieval
export async function vectorBasedRetrieval(query, topK = 3) {
  try {
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) return [];

    // In a real implementation, you would:
    // 1. Store embeddings in a vector database (Pinecone, Weaviate, etc.)
    // 2. Perform similarity search
    // 3. Return most similar documents
    
    // For now, return empty array
    return [];
  } catch (error) {
    console.error('Vector retrieval error:', error);
    return [];
  }
}

// Enhanced RAG with web search integration
export async function enhancedRAGSearch(query, userLocation = 'Bangladesh', topK = 3) {
  try {
    console.log('🔍 Starting enhanced RAG search with web integration');
    
    // Step 1: Get local knowledge base results
    const localKnowledge = retrieveRelevantKnowledge(query, topK);
    console.log('📚 Local knowledge items:', localKnowledge.length);
    
    // Step 2: Get web search results (simulated for now)
    const webResults = await searchWeb(query, 2);
    console.log('🌐 Web search results:', webResults.length);
    
    // Step 3: Combine knowledge sources
    const combinedKnowledge = combineKnowledgeSources(localKnowledge, webResults);
    console.log('🔗 Combined knowledge sources:', combinedKnowledge.length);
    
    // Step 4: Create enhanced prompt
    const enhancedPrompt = createEnhancedRAGPrompt(query, combinedKnowledge, userLocation);
    
    return {
      prompt: enhancedPrompt,
      sources: combinedKnowledge,
      localCount: localKnowledge.length,
      webCount: webResults.length
    };
    
  } catch (error) {
    console.error('Enhanced RAG search error:', error);
    // Fallback to basic RAG
    const localKnowledge = retrieveRelevantKnowledge(query, topK);
    const basicPrompt = createRAGPrompt(query, localKnowledge, userLocation);
    
    return {
      prompt: basicPrompt,
      sources: localKnowledge,
      localCount: localKnowledge.length,
      webCount: 0
    };
  }
} 