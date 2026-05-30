const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const generateSmartReply = async (incomingText, tone, customPrompt, customerName) => {
  try {
    const baseSystemInstruction = customPrompt || "You are a helpful and friendly assistant. Use simple, clear, and natural language. Avoid technical jargon or overly complex vocabulary. Be direct but polite.";
    
    const contextInstruction = `${baseSystemInstruction}\nCustomer Name: ${customerName}.\nTone Profile: ${tone}.\n` +
      `If the query is too complex, mentions a complaint, or requires specific human authority, set isEscalationRequired to true. ` +
      `Always use the customer's name to sound friendly. Keep sentences short and easy to read.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: incomingText,
      config: {
        systemInstruction: contextInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING, 
              enum: ['greeting', 'faq', 'pricing', 'custom_inquiry'] 
            },
            suggestedReply: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
            isEscalationRequired: { type: Type.BOOLEAN }
          },
          required: ['category', 'suggestedReply', 'confidenceScore', 'isEscalationRequired']
        }
      }
    });

    // Ensure we handle both function and property access for different library versions
    let responseText = '';
    if (typeof response.text === 'function') {
      responseText = response.text();
    } else {
      responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    return JSON.parse(responseText);
  } catch (error) {
    console.error(`[Gemini Execution Fault]: ${error.message}`);
    return {
      category: 'custom_inquiry',
      suggestedReply: "Thank you for reaching out. A human technician will review this conversation shortly.",
      confidenceScore: 1.0
    };
  }
};

module.exports = { generateSmartReply };