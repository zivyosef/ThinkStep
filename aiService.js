/**
 * ============================================================
 *  aiService.js  —  צוות D: יהודה ואביתר
 * ============================================================
 */

import { GoogleGenAI } from "@google/genai";

const AI_HISTORY_KEY = "my_ai_app_history";
const MAX_HISTORY = 10;
const ai = new GoogleGenAI({ apiKey: "AIzaSyDMg2ByJaXvb0RzJDzood8b4KxiNdlqkx0" });
const GEMINI_MODEL = "gemini-2.0-flash"; // ✅ תוקן: gemini-3-flash-preview לא קיים

// ============================================================
//  sendQuery — נקודת הכניסה המרכזית לכל הבקשות
// ============================================================
async function sendQuery(intent, rawData, userDescription) {
  console.log(`🤖 aiService קיבל בקשה מסוג: ${intent}`);

  const history = loadAIHistory();
  let result = null;

  try {
    if (intent === "DECOMPOSE_INITIAL") {
      // rawData = הטקסט הגולמי, userDescription = newState שצריך למלא
      result = await generateSmartDecomposition(rawData, userDescription);

    } else if (intent === "SUGGEST_IMPROVEMENT") {
      // rawData = { taskText, reason }
      result = await generateRefinedPrompt(rawData.taskText, rawData.reason);

    } else if (intent === "VALIDATE_TASK") {
      // rawData = טקסט המשימה
      // מחזיר { score: "red"|"yellow"|"green", label, explanation }
      result = await validateTaskWithAI(rawData);

    } else if (intent === "SOCRATIC_CHAT") {
      result = await getSocraticResponse(rawData, userDescription, history);

    } else if (intent === "STUCK_ADVISOR") {
      result = await getThinkingModels(rawData);

    } else if (intent === "GET_ANGLES") {
      result = await requestAnglesFromAI(rawData);

    } else {
      console.error("❌ intent לא מוכר:", intent);
      return null;
    }

    if (result) {
      updateContext(intent, rawData, result);
    }

    return result;

  } catch (error) {
    const msg = error?.message || String(error);
    console.error(`❌ שגיאה בביצוע ${intent}:`, msg);
    alert(`שגיאת AI (${intent}):\n${msg}`);
    return null;
  }
}


// ============================================================
//  פונקציה חדשה: validateTaskWithAI
//  נקראת מ-handleTaskValidation ב-logicManager
// ============================================================
/**
 * שולחת את טקסט המשימה ל-Gemini ומבקשת החלטה:
 * האם המשימה ממוקדת (ירוק), רחבה מעט (צהוב), או רחבה מדי (אדום)?
 *
 * קלט:  taskText (string)
 * פלט:  { score: "red"|"yellow"|"green", label: string, explanation: string }
 */
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

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    // וידוא שהשדות הנדרשים קיימים
    if (!["red", "yellow", "green"].includes(parsed.score)) {
      throw new Error("score לא תקין");
    }
    return {
      score: parsed.score,
      label: parsed.label || "לא זוהה תיוג",
      explanation: parsed.explanation || "",
    };
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת AI לvalidation:", e, "\nתשובה גולמית:", text);
    // fallback — לפחות להחזיר משהו שמנע קריסה
    return {
      score: "yellow",
      label: "לא הצלחנו לנתח את המשימה אוטומטית",
      explanation: "נסה לנסח את המשימה בצורה ספציפית יותר.",
    };
  }
}


// ============================================================
//  פונקציה 3: generateSmartDecomposition
// ============================================================
/**
 * מקבלת את הטקסט הגולמי של המשימה ומחלצת נתונים מובנים:
 * מקצוע, נושא, סוג מטלה, ומקבצים לפירוק.
 *
 * קלט:  rawText (string), currentState (object)
 * פלט:  object עם שדות: subject, topic, assignmentType, chunks
 */
async function generateSmartDecomposition(rawText, currentState) {
  const prompt = `
אתה עוזר לימודי חכם לתלמידי תיכון.
קרא את תיאור המשימה הבא והחזר מידע מובנה.

תיאור המשימה:
"${rawText}"

החזר JSON בלבד, ללא markdown, בפורמט הזה בדיוק:
{
  "subject": "שם המקצוע (עברית, אנגלית, היסטוריה, מדע, וכו' — אם לא ברור כתוב null)",
  "topic": "נושא הפרויקט במשפט אחד (אם לא ברור כתוב null)",
  "assignmentType": "סוג המטלה: עבודה | בחינה | מצגת | קריאה | אחר",
  "pgNumberScope": null,
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

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);

    // מיזוג עם ה-state הקיים
    return {
      ...currentState,
      subject: parsed.subject || null,
      topic: parsed.topic || null,
      assignmentType: parsed.assignmentType || null,
      pgNumberScope: parsed.pgNumberScope || currentState?.pgNumberScope || null,
      chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [],
    };
  } catch (e) {
    console.error("❌ שגיאה בפירוש תשובת AI לפירוק:", e, "\nתשובה גולמית:", text);
    return currentState || null;
  }
}


// ============================================================
//  פונקציה 4: generateRefinedPrompt
// ============================================================
/**
 * מקבלת משימה "אדומה" ומנסחת אותה מחדש בצורה ספציפית יותר.
 *
 * קלט:  originalTask (string), analysisLabel (string)
 * פלט:  { refinedText: string, explanation: string }
 */
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

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text.trim().replace(/```json|```/g, "").trim();

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
//  פונקציה 5: getSocraticResponse
// ============================================================
/**
 * מחזירה שאלה מנחה סוקרטית (לא תשובה ישירה!)
 * בהתאם לשאלת המשתמש וההיסטוריה.
 *
 * קלט:  userMessage (string), userDescription (any), history (array)
 * פלט:  string — שאלה מנחה
 */
async function getSocraticResponse(userMessage, userDescription, history) {
  // בניית הקשר מההיסטוריה
  const historyContext =
    history && history.length > 0
      ? history
          .slice(-3) // רק 3 האינטראקציות האחרונות
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

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  return response.text.trim();
}


// ============================================================
//  פונקציה 6: getThinkingModels
// ============================================================
/**
 * מחזירה זוויות חשיבה בהתאם לנושא.
 *
 * קלט:  subject (string)
 * פלט:  [{ angle: string, description: string }, ...]
 */
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

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  });

  const text = response.text.trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("התשובה אינה מערך");
  } catch (e) {
    console.error("❌ שגיאה בזוויות חשיבה:", e);
    // fallback כללי
    return [
      { angle: "מה", description: "מה קרה? מה הנושא המרכזי?" },
      { angle: "למה", description: "מה הסיבות? מה הרקע?" },
      { angle: "מה השפעה", description: "מה התוצאות לטווח הארוך?" },
    ];
  }
}


// ============================================================
//  פונקציה: requestAnglesFromAI
//  נקראת ע"י intent: "GET_ANGLES" מ-logicManager
// ============================================================
async function requestAnglesFromAI(topic) {
  return await getThinkingModels(topic);
}


// ============================================================
//  היסטוריה
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

  const interaction = {
    timestamp: new Date().toISOString(),
    intent: intent,
    user: userText,
    assistant: aiResponse,
  };

  history.push(interaction);

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
  console.log(`📝 היסטוריית AI עודכנה. סה״כ: ${history.length} אינטראקציות`);
}


// ============================================================
//  פונקציית עזר: delay
// ============================================================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ============================================================
//  חשיפת פונקציות
// ============================================================
const aiService = {
  sendQuery,
  updateContext,
};

window.aiService = aiService;
export default aiService;