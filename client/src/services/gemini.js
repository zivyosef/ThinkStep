import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const COACH_SYSTEM_PROMPT = `You are a Socratic learning coach. Your ONLY role is to help the student think independently.
Rules you MUST follow:
1. NEVER provide the final answer, solution, or complete code.
2. Ask exactly ONE guiding question per response to move the student's thinking forward.
3. If the student asks you to just tell them the answer, acknowledge the feeling with empathy and redirect with a question.
4. Keep responses under 3 sentences total.
5. Respond in the same language the student uses (Hebrew or English).`;

export async function decomposeTask(taskData) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = `You are an expert study planner. Break down this assignment into a hierarchical task list.

Assignment: "${taskData.topic}"
Subject: ${taskData.subject}
Due date: ${taskData.dueDate}
Pages/scope: ${taskData.pgNumberScope || 'not specified'}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "parts": [
    {
      "title": "Part 1 — [name]",
      "sections": [
        {
          "title": "1.1 [section name]",
          "steps": ["Step description", "Step description"]
        }
      ]
    }
  ]
}

Rules:
- 3-5 Level-1 parts
- 2-4 Level-2 sections per part
- 2-3 Level-3 steps per section
- All titles should be specific and actionable`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

export async function sendCoachMessage(conversationHistory, userMessage) {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: COACH_SYSTEM_PROMPT,
  });

  const chat = model.startChat({
    history: conversationHistory.slice(1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}
