// Web search utility for real-time agricultural information
export async function searchWeb(query, maxResults = 3) {
  try {
    // For now, we'll use a simple approach
    // In production, you could integrate with:
    // - Google Custom Search API
    // - Bing Search API
    // - SerpAPI
    // - Tavily API
    
    // Simulate web search results with relevant agricultural sources
    const simulatedResults = [
      {
        title: "Bangladesh Rice Research Institute (BRRI)",
        snippet: "Latest research and recommendations for rice cultivation in Bangladesh",
        url: "http://brri.gov.bd",
        relevance: 0.9
      },
      {
        title: "Department of Agricultural Extension (DAE)",
        snippet: "Government agricultural extension services and farmer guidance",
        url: "http://dae.gov.bd",
        relevance: 0.8
      },
      {
        title: "Bangladesh Agricultural Research Council",
        snippet: "Agricultural research and development for sustainable farming",
        url: "http://barc.gov.bd",
        relevance: 0.7
      }
    ];
    
    // Filter results based on query relevance
    const relevantResults = simulatedResults
      .filter(result => {
        const queryWords = query.toLowerCase().split(' ');
        const contentText = `${result.title} ${result.snippet}`.toLowerCase();
        return queryWords.some(word => contentText.includes(word));
      })
      .slice(0, maxResults);
    
    return relevantResults;
    
  } catch (error) {
    console.error('Web search error:', error);
    return [];
  }
}

// Enhanced RAG with web search
export function combineKnowledgeSources(localKnowledge, webResults) {
  const combinedContext = [];
  
  // Add local knowledge base results
  localKnowledge.forEach(item => {
    combinedContext.push({
      source: 'knowledge_base',
      content: `${item.topic}: ${item.content}`,
      relevance: item.score || 0.8,
      region: item.region,
      crop: item.crop
    });
  });
  
  // Add web search results
  webResults.forEach(result => {
    combinedContext.push({
      source: 'web_search',
      content: `${result.title}: ${result.snippet}`,
      relevance: result.relevance || 0.6,
      url: result.url
    });
  });
  
  // Sort by relevance
  return combinedContext.sort((a, b) => b.relevance - a.relevance);
}

// Create enhanced prompt with multiple sources
export function createEnhancedRAGPrompt(query, combinedKnowledge, userLocation) {
  const knowledgeContext = combinedKnowledge.length > 0 
    ? combinedKnowledge.map(item => {
        const sourceLabel = item.source === 'knowledge_base' ? '📚' : '🌐';
        return `${sourceLabel} ${item.content}`;
      }).join('\n')
    : "No specific knowledge found.";

  return `You are Tia Apa, an expert agricultural advisor for Bangladesh farmers. You provide practical, localized advice using the most current and relevant information available.

CONTEXT INFORMATION FROM MULTIPLE SOURCES:
${knowledgeContext}

USER LOCATION: ${userLocation}
USER QUERY: ${query}

INSTRUCTIONS:
1. Use the context information above to provide accurate, localized advice
2. Prioritize information from knowledge base (📚) for proven practices
3. Consider web sources (🌐) for current trends and updates
4. Focus on practical, actionable advice for Bangladesh farming conditions
5. Consider the user's location (${userLocation}) for specific recommendations
6. If you don't have specific information, acknowledge it and provide general best practices
7. Always consider Bangladesh's climate, soil conditions, and farming practices
8. Respond in a helpful, friendly manner as Tia Apa
9. Do not mention the sources directly in your response - just use the information naturally

Please provide your agricultural advice:`;
} 