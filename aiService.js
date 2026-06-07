/**
 * ============================================================
 *  aiService.js  —  צוות D: יהודה ואביתר
 * ============================================================
 */

// ✅ No SDK import needed — uses OpenRouter REST API directly

const AI_HISTORY_KEY = "my_ai_app_history";
const MAX_HISTORY = 10;

// ── OpenRouter setup (active) ─────────────────────────────────
const _openRouterKey = window.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "google/gemini-flash-1.5";
const OPENROUTER_URL   = "https://openrouter.ai/api/v1/chat/completions";
window.OPENROUTER_MODEL = OPENROUTER_MODEL;
console.log('🟠 [aiService] OpenRouter key loaded?', _openRouterKey ? `yes (${_openRouterKey.slice(0,12)}...)` : '❌ key not found!');

// ── Gemini setup (commented out — restore if switching back) ──
// const _apiKey = window.GEMINI_API_KEY || import.meta.env?.VITE_GEMINI_API_KEY;
// console.log('🟠 [aiService] מפתח API נטען?', _apiKey ? `כן (${_apiKey.slice(0,8)}...)` : '❌ לא נמצא מפתח API!');
// const GEMINI_MODEL    = "gemini-2.0-flash-lite";
// const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


// ============================================================
//  Central REST helper — OpenRouter (active)
// ============================================================
async function openRouterRequest(prompt, systemInstruction = null) {
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${_openRouterKey}`,
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages }),
  });

  if (response.status === 429) {
    const err = new Error("Rate limit");
    err.status = 429;
    throw err;
  }
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `HTTP ${response.status}`);
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}

// ── Gemini REST helper (commented out — restore if switching back) ──
// async function geminiRest(prompt, systemInstruction = null) {
//   const body = {
//     contents: [{ role: "user", parts: [{ text: prompt }] }],
//   };
//   if (systemInstruction) {
//     body.system_instruction = { parts: [{ text: systemInstruction }] };
//   }
//   const response = await fetch(`${GEMINI_REST_URL}?key=${_apiKey}`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(body),
//   });
//   if (response.status === 429) {
//     const err = new Error("Rate limit");
//     err.status = 429;
//     throw err;
//   }
//   if (!response.ok) {
//     const errBody = await response.json().catch(() => ({}));
//     throw new Error(errBody.error?.message || `HTTP ${response.status}`);
//   }
//   const json = await response.json();
//   return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
// }


// ============================================================
//  sendQuery — נקודת הכניסה המרכזית לכל הבקשות
// ============================================================
async function sendQuery(intent, rawData, userDescription, retryCount = 0) {
  const MAX_RETRIES = 2;

  console.log(`🤖 aiService קיבל בקשה מסוג: ${intent} (ניסיון ${retryCount + 1})`);

  const history = loadAIHistory();
  let result = null;

  try {
    if (intent === "DECOMPOSE_INITIAL") {
      result = await generateSmartDecomposition(rawData, userDescription);
    } else if (intent === "SUGGEST_IMPROVEMENT") {
      result = await generateRefinedPrompt(rawData.taskText, rawData.reason);
    } else if (intent === "VALIDATE_TASK") {
      result = await validateTaskWithAI(rawData);
    } else if (intent === "SOCRATIC_CHAT") {
      result = await getSocraticResponse(rawData, userDescription, history);
    } else if (intent === "STUCK_ADVISOR") {
      result = await getThinkingModels(rawData);
    } else if (intent === "GET_ANGLES") {
      result = await requestAnglesFromAI(rawData);
    } else if (intent === "ANALYZE_DEMANDS") {
      result = await generateSubtasksFromDemands(rawData, userDescription);
    } else {
      console.error("❌ intent לא מוכר:", intent);
      return null;
    }

    if (result) {
      updateContext(intent, rawData, result);
    }

    return result;

  } catch (error) {
    if (error?.status === 429) {
      if (retryCount < MAX_RETRIES) {
        const baseDelay      = 60000;
        const exponentialDelay = baseDelay * Math.pow(2, retryCount);
        const jitter         = Math.floor(Math.random() * 3000);
        const waitTime       = exponentialDelay + jitter;

        console.warn(`⏳ שרת עמוס (429). ממתין ${(waitTime / 1000).toFixed(1)} שניות... (ניסיון ${retryCount + 1}/${MAX_RETRIES})`);
        await delay(waitTime);
        return sendQuery(intent, rawData, userDescription, retryCount + 1);
      } else {
        console.error("❌ נעצרו הניסיונות החוזרים.");
        return { error: true, message: "השרת עמוס כרגע, אנא נסה שוב בעוד דקה." };
      }
    }

    console.error(`❌ שגיאה בביצוע ${intent} — FULL ERROR:`, error);
    return null;
  }
}


// ============================================================
//  validateTaskWithAI
// ============================================================
async function validateTaskWithAI(taskText) {
  const prompt = `
אתה עוזר לימודי שעוזר לתלמידים לפרק משימות לחלקים קטנים וניתנים לביצוע.

המשימה שהתלמיד כתב:
"${taskText}"

הערך האם המשימה ממוקדת וניתנת לביצוע:

🔴 אדום — המשימה רחבה מדי, עמומה, או כללית מדי (למשל: "לכתוב את כל העבודה", "ללמוד היסטוריה")
🟡 צהוב — המשימה בכיוון הנכון אבל עדיין רחבה מעט (למשל: "לכתוב את הפרק הראשון")
🟢 ירוק — המשימה ספציפית, קטנה וניתנת לביצוע היום (למשל: "לכתוב פסקת פתיחה על סיבות המהפכה הצרפתית")

החזר תשובה בפורמט JSON בלבד, ללא קוד markdown, בדיוק כך:
{
  "score": "red" | "yellow" | "green",
  "label": "משפט קצר בעברית המסביר את ההחלטה",
  "explanation": "הסבר קצר בעברית (2-3 משפטים) מה בדיוק הבעיה ואיך לשפר"
}
`;

  const rawText = await openRouterRequest(prompt);
  // Gemini: const rawText = await geminiRest(prompt);

  const text = rawText.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (!["red", "yellow", "green"].includes(parsed.score)) {
      throw new Error("score לא תקין");
    }
    return {
      score:       parsed.score,
      label:       parsed.label || "לא זוהה תיוג",
      explanation: parsed.explanation || "",
    };
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת AI לvalidation:", e, "\nתשובה גולמית:", text);
    return {
      score:       "yellow",
      label:       "לא הצלחנו לנתח את המשימה אוטומטית",
      explanation: "נסה לנסח את המשימה בצורה ספציפית יותר.",
    };
  }
}


// ============================================================
//  generateSmartDecomposition
// ============================================================
async function generateSmartDecomposition(rawText, currentState) {
  console.log("📤 שולח ל-AI לפירוק המשימה:", rawText);
  const today = new Date().toISOString().split("T")[0];
  const prompt = `
אתה עוזר לימודי חכם לתלמידי תיכון.
קרא את תיאור המשימה הבא והחזר מידע מובנה.
תאריך היום: ${today}

תיאור המשימה:
"${rawText}"

החזר JSON בלבד, ללא markdown, בפורמט הזה בדיוק:
{
  "subject": "שם המקצוע (עברית, אנגלית, היסטוריה, מדע, וכו' — אם לא ברור כתוב null)",
  "topic": "נושא הפרויקט במשפט אחד (אם לא ברור כתוב null)",
  "assignmentType": "סוג המטלה: עבודה | בחינה | מצגת | קריאה | אחר",
  "pgNumberScope": null,
  "dueDate": "YYYY-MM-DD אם מוזכר תאריך או פרק זמן (שבוע, שבועיים, חודש וכו') — חשב לפי תאריך היום. אם לא מוזכר כתוב null",
  "chunks": [
    { "id": "chunk-1", "title": "שם החלק", "description": "מה צריך לעשות בחלק הזה" },
    { "id": "chunk-2", "title": "שם החלק", "description": "מה צריך לעשות בחלק הזה" },
    { "id": "chunk-3", "title": "שם החלק", "description": "מה צריך לעשות בחלק הזה" }
  ]
}

הנחיות לפירוק לחלקים (chunks):
- היסטוריה / חברה → פירוק כרונולוגי: רקע, אירועים מרכזיים, השפעות
- מדע / ביולוגיה / כימיה → שלבי מחקר: שאלה, השערה, ניסוי, מסקנות
- ספרות / עברית → אלמנטים ספרותיים: עלילה, דמויות, מסר
- כללי → מבוא, גוף, סיכום
`;

  const apiResponse = await openRouterRequest(prompt);
  // Gemini: const apiResponse = await geminiRest(prompt);
  console.log("📥 תשובת AI לפירוק:", apiResponse);

  const text = apiResponse.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    return {
      ...currentState,
      subject:        parsed.subject        || null,
      topic:          parsed.topic          || null,
      assignmentType: parsed.assignmentType || null,
      pgNumberScope:  parsed.pgNumberScope  || currentState?.pgNumberScope || null,
      dueDate:        parsed.dueDate        || currentState?.dueDate       || null,
      chunks:         Array.isArray(parsed.chunks) ? parsed.chunks : [],
    };
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת AI לפירוק:", e, "\nתשובה גולמית:", text);
    return currentState || null;
  }
}


// ============================================================
//  generateRefinedPrompt
// ============================================================
async function generateRefinedPrompt(originalTask, analysisLabel) {
  const prompt = `
אתה עוזר לימודי שמסייע לתלמידים לפרק משימות גדולות לצעדים קטנים.

המשימה המקורית של התלמיד:
"${originalTask}"

הסיבה שהמשימה נדחתה: ${analysisLabel}

תפקידך: נסח מחדש את המשימה כך שתהיה:
- ספציפית (פסקה אחת / דף אחד / מושג אחד)
- קטנה (ניתן לביצוע ב-30-60 דקות)
- ברורה (ברור מתי היא הושלמה)

החזר JSON בלבד, ללא markdown:
{
  "refinedText": "הנוסח המשופר של המשימה",
  "explanation": "הסבר קצר (משפט אחד) למה הנוסח החדש טוב יותר"
}
`;

  const rawText = await openRouterRequest(prompt);
  // Gemini: const rawText = await geminiRest(prompt);

  const text = rawText.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    return {
      refinedText: parsed.refinedText || originalTask,
      explanation: parsed.explanation || "",
    };
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת שיפור:", e);
    return {
      refinedText: originalTask,
      explanation: "לא הצלחנו לשפר אוטומטית — נסה לפרק את המשימה לחלק קטן יותר.",
    };
  }
}


// ============================================================
//  getSocraticResponse
// ============================================================
async function getSocraticResponse(userMessage, userDescription, history) {
  const historyContext =
    history && history.length > 0
      ? history
          .slice(-3)
          .map((h) => `[${h.intent}]: ${JSON.stringify(h.user).substring(0, 80)}`)
          .join("\n")
      : "אין היסטוריה קודמת.";

  const prompt = `
אתה מורה שמשתמש בשיטה הסוקרטית — אתה אף פעם לא נותן תשובות ישירות, רק שואל שאלות מנחות.

הקשר מהשיחה הקודמת:
${historyContext}

התלמיד כתב:
"${userMessage}"

כתוב שאלה מנחה אחת בעברית שתעזור לתלמיד לחשוב לבד.
כללים:
- שאלה אחת בלבד
- לא יותר מ-2 משפטים
- אל תיתן את התשובה, רק הכוון
- אם יש היסטוריה — התייחס אליה לתגובה אישית יותר

החזר את השאלה בלבד, ללא הסברים נוספים.
`;

  const result = await openRouterRequest(prompt);
  // Gemini: const result = await geminiRest(prompt);
  return result.trim();
}


// ============================================================
//  getThinkingModels
// ============================================================
async function getThinkingModels(subject) {
  const prompt = `
אתה עוזר לימודי לתלמידי תיכון.

הנושא: "${subject}"

הצע 3 זוויות חשיבה שונות שיעזרו לתלמיד לנתח את הנושא הזה.
כל זווית צריכה להיות שונה (למשל: כרונולוגית, חברתית, כלכלית, מדעית, ספרותית, וכו').

החזר JSON בלבד, ללא markdown:
[
  { "angle": "שם הזווית", "description": "שאלה או הנחיה קצרה לחשיבה מהזווית הזאת" },
  { "angle": "שם הזווית", "description": "שאלה או הנחיה קצרה" },
  { "angle": "שם הזווית", "description": "שאלה או הנחיה קצרה" }
]
`;

  const rawText = await openRouterRequest(prompt);
  // Gemini: const rawText = await geminiRest(prompt);

  const text = rawText.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("התשובה אינה מערך");
  } catch (e) {
    console.error("❌ שגיאה בזוויות חשיבה:", e);
    return [
      { angle: "מה",        description: "מה קרה? מה הנושא המרכזי?" },
      { angle: "למה",       description: "מה הסיבות? מה הרקע?" },
      { angle: "מה השפעה", description: "מה התוצאות לטווח הארוך?" },
    ];
  }
}


// ============================================================
//  requestAnglesFromAI
// ============================================================
async function requestAnglesFromAI(topic) {
  return await getThinkingModels(topic);
}


// ============================================================
//  generateSubtasksFromDemands
// ============================================================
async function generateSubtasksFromDemands(demandsText, context) {
  const today = new Date().toISOString().split("T")[0];
  const { subject, topic, pages, dueDate, feedback } = context || {};

  const prompt = `
אתה עוזר לימודי לתלמידי תיכון.
קיבלת את דרישות המטלה הבאות:
"${demandsText}"

פרטי המשימה:
- מקצוע: ${subject || "לא צוין"}
- נושא: ${topic || "לא צוין"}
- מספר עמודים: ${pages || "לא צוין"}
- תאריך הגשה: ${dueDate || "לא צוין"}
- תאריך היום: ${today}
${feedback ? `\nהמשתמש ביקש לשנות את התוצאה הקודמת:\n"${feedback}"\nיש להתחשב בהערה זו בעת בניית המשימות.\n` : ""}
פרק את הדרישות לרשימת משימות ספציפיות וניתנות לביצוע.
החזר JSON בלבד, ללא markdown:
[
  { "id": "task-1", "title": "שם המשימה", "description": "מה בדיוק צריך לעשות" },
  { "id": "task-2", "title": "שם המשימה", "description": "מה בדיוק צריך לעשות" }
]
הנחיות:
- 3 עד 6 משימות
- כל משימה — ספציפית וניתנת לביצוע ב-1 עד 2 שעות
- ממוינות לפי סדר הגיוני לביצוע
`;

  const rawText = await openRouterRequest(prompt);
  // Gemini: const rawText = await geminiRest(prompt);

  const text = rawText.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("התשובה אינה מערך");
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת ANALYZE_DEMANDS:", e, "\nתשובה גולמית:", text);
    return [];
  }
}


// ============================================================
//  History helpers
// ============================================================
function loadAIHistory() {
  const saved = localStorage.getItem(AI_HISTORY_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse history", e);
    return [];
  }
}

function updateContext(intent, userText, aiResponse) {
  const history = loadAIHistory();

  history.push({
    timestamp: new Date().toISOString(),
    intent:    intent,
    user:      userText,
    assistant: aiResponse,
  });

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
  console.log(`📝 היסטוריית AI עודכנה. סה״כ: ${history.length} אינטראקציות`);
}


// ============================================================
//  delay helper
// ============================================================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ============================================================
//  Export
// ============================================================
const aiService = {
  sendQuery,
  updateContext,
};

window.aiService = aiService;
export default aiService;
