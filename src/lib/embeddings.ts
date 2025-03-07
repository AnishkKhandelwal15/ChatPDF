import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not defined");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export async function getEmbeddings(text: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const cleanedText = text.replace(/\n/g, " ");
    const result = await model.embedContent(cleanedText);
    if (!result.embedding?.values) throw new Error("Invalid embedding response");
    return result.embedding.values as number[];
  } catch (error) {
    console.error("Error calling Gemini Embeddings API:", error);
    throw error;
  }
}