const { GoogleGenAI, Type } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const generateSmartReply = async (incomingText, tone, customPrompt) => {
  try {
    const baseSystemInstruction = customPrompt || "You are an integrated automation proxy designed to accurately classify inbound data channels and structure intuitive customer messaging architectures.";
    
    const contextInstruction = `${baseSystemInstruction}\nFormat the output using the requested schema. Ensure the response matches a tone profile of: "${tone}".`;

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
            confidenceScore: { type: Type.NUMBER }
          },
          required: ['category', 'suggestedReply', 'confidenceScore']
        }
      }
    });

    const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
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