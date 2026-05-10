/**
 * ============================================================
 *  aiService.js  —  צוות D: יהודה ואביתר
 * ============================================================
 */

import { GoogleGenAI } from "@google/genai";
const AI_HISTORY_KEY = 'my_ai_app_history';
const MAX_HISTORY = 10; // שומר רק את 10 האינטראקציות האחרונות
const ai = new GoogleGenAI({});

// ============================================================
//  this is the main function that call gemini - need to understand whre to call it and how to use it in the project
// ============================================================
async function main() {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    history: [ // example of how to set up the initial history of the chat, can be modified as needed
      // here we send the historu that evutar made in load history
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });

  const response1 = await chat.sendMessage({
    message: "I have 2 dogs in my house.",
  });
  console.log("Chat response 1:", response1.text);

  const response2 = await chat.sendMessage({
    message: "How many paws are in my house?",
  });
  console.log("Chat response 2:", response2.text);
}

await main();

async function sendQuery(intent, rawData, userDescription) {

  console.log(`🤖 aiService קיבל בקשה מסוג: ${intent}`);

  // שלב 1: טעינת היסטוריה
  const history = loadAIHistory();
  let result = null;

  try {
    // שלב 2: ניתוב לפי Intent
    if (intent === "DECOMPOSE_INITIAL") {
      // משימה חד פעמית לחילוץ נתונים - לא צריכה היסטוריה
      // userDescription מכיל כאן את ה-newState שצריך למלא
      result = await generateSmartDecomposition(rawData, userDescription);

    } else if (intent === "SUGGEST_IMPROVEMENT") {
      result = await generateRefinedPrompt(rawData, userDסescription);

    } else if (intent === "SOCRATIC_CHAT") {
      // שיחה מונחית - כאן ההיסטוריה קריטית כדי שה-AI יזכור על מה דיברתם
      result = await getSocraticResponse(rawData, userDescription, history);

    } else if (intent === "STUCK_ADVISOR") {
      result = await getThinkingModels(rawData);

    } else {
      console.error("❌ intent לא מוכר:", intent);
      return null;
    }

    // שלב 3: שמירת ההיסטוריה (רק אם יש תוצאה תקינה)
    if (result) {
      updateContext(intent, rawData, result);
    }

    return result;

  } catch (error) {
    console.error(`❌ שגיאה בביצוע ${intent}:`, error);
    return null;
  }
}

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

// שיניתי את הפונקציה לקבל פרמטרים ברורים יותר
function updateContext(intent, userText, aiResponse) {
  const history = loadAIHistory();

  const interaction = {
    timestamp: new Date().toISOString(),
    intent: intent,
    user: userText,
    assistant: aiResponse // נשמור את התשובה כדי שה-AI יוכל לזכור מה הוא אמר
  };

  history.push(interaction);

  // חלון גולש: אם יש יותר מדי הודעות, מוחקים את הישנות ביותר
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(history));
  console.log(`📝 היסטוריית AI עודכנה. סה״כ: ${history.length} אינטראקציות`);
}


// ============================================================
//  פונקציה 3: generateSmartDecomposition
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מקבלת נושא ומחזירה 3-4 "מקבצים" (Chunks) גדולים.
 * מנסה להתאים את הפירוק לסוג הנושא:
 *   - היסטוריה → פירוק כרונולוגי
 *   - מדע → פירוק לפי שלבי מחקר
 *   - ספרות → פירוק לפי אלמנטים ספרותיים
 *
 * קלט:
 *   topic (string) — נושא העבודה
 *
 * פלט צפוי (array):
 *   [
 *     { id: "chunk-1", title: "...", description: "..." },
 *     { id: "chunk-2", title: "...", description: "..." },
 *     { id: "chunk-3", title: "...", description: "..." }
 *   ]
 */
async function generateSmartDecomposition(topic) {

  // TODO שלב 1: זהו לאיזה תחום שייך הנושא
  // טיפ: השתמשו ב-topic.includes("מילה") לבדיקה
  // דוגמה:
  //   let subject = "כללי";
  //   if (topic.includes("מהפכה") || topic.includes("מלחמה") || topic.includes("היסטוריה")) {
  //     subject = "היסטוריה";
  //   } else if (topic.includes("ניסוי") || topic.includes("מדע") || topic.includes("כימיה")) {
  //     subject = "מדע";
  //   }

  // TODO שלב 2: בנו את רשימת המקבצים בהתאם לתחום
  // דוגמה לפירוק היסטורי:
  //   const chunks = [
  //     { id: "chunk-1", title: "רקע ורקע היסטורי",   description: "מה היה המצב לפני האירוע?" },
  //     { id: "chunk-2", title: "האירועים המרכזיים",   description: "מה קרה ובאיזה סדר?" },
  //     { id: "chunk-3", title: "השפעות ומסקנות",      description: "מה השתנה כתוצאה מהאירוע?" },
  //   ];

  // TODO שלב 3: הוסיפו עיכוב קצר (מדמה חשיבה של AI)
  // דוגמה:
  //   await delay(800);  // המתן 0.8 שניות

  // TODO שלב 4: החזירו את המקבצים
  //   return chunks;
}


// ============================================================
//  פונקציה 4: generateRefinedPrompt
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מקבלת משימה "אדומה" ומנסחת אותה מחדש בצורה ספציפית יותר.
 *
 * קלט:
 *   originalTask   (string) — המשימה המקורית ("לכתוב את כל העבודה")
 *   analysisLabel  (string) — הסיבה לכישלון ("רחב מדי")
 *
 * פלט צפוי (object):
 *   {
 *     refinedText:  "כתוב פסקה אחת על הסיבות הכלכליות למהפכה",
 *     explanation:  "פסקה אחת היא יעד קטן וברור שאפשר להשלים היום"
 *   }
 */
async function generateRefinedPrompt(originalTask, analysisLabel) {

  // TODO שלב 1: בחרו תבנית מ-IMPROVEMENT_TEMPLATES לפי ה-analysisLabel
  // דוגמה:
  //   const template = IMPROVEMENT_TEMPLATES[analysisLabel]
  //     || IMPROVEMENT_TEMPLATES["רחב מדי"];  // ברירת מחדל

  // TODO שלב 2: מלאו את התבנית עם הנתונים הספציפיים
  // טיפ: השתמשו ב-.replace() להחלפת ה-placeholders
  // דוגמה:
  //   const refined = template.suggestion
  //     .replace("{{original}}", originalTask)
  //     .replace("{{number}}", "3")
  //     .replace("{{topic}}", originalTask);

  // TODO שלב 3: הוסיפו עיכוב קצר (מדמה חשיבה)
  //   await delay(600);

  // TODO שלב 4: החזירו אובייקט מסודר
  //   return {
  //     refinedText:  refined,
  //     explanation:  template.explanation
  //   };
}


// ============================================================
//  פונקציה 5: getSocraticResponse
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מחזירה שאלה מנחה (לא תשובה!) בהתאם להודעת המשתמש.
 * משתמשת בהיסטוריה כדי לתת תגובה רלוונטית לפרויקט הספציפי.
 *
 * קלט:
 *   userMessage (string) — מה המשתמש כתב בצ'אט
 *   history     (array)  — היסטוריית האינטראקציות הקודמות
 *
 * פלט צפוי (string):
 *   "ראיתי שכבר פירקת את הפרק הראשון — מה הדבר שמרגיש הכי לא ברור?"
 *
 * כלל הזהב: לעולם אל תחזירו תשובה ישירה — רק שאלה מנחה!
 */
function getSocraticResponse(userMessage, history) {

  // TODO שלב 1: עברו על מילות המפתח ב-SOCRATIC_RESPONSES
  // טיפ: המירו ל-lowercase לפני הבדיקה
  // דוגמה:
  //   const lowerMsg = userMessage.toLowerCase();
  //   for (let keyword in SOCRATIC_RESPONSES) {
  //     if (lowerMsg.includes(keyword)) {
  //       return SOCRATIC_RESPONSES[keyword];
  //     }
  //   }

  // TODO שלב 2: אם יש היסטוריה — השתמשו בה לתגובה אישית יותר
  // דוגמה:
  //   if (history && history.length > 0) {
  //     const lastAction = history[history.length - 1];
  //     if (lastAction.intent === "DECOMPOSE_INITIAL") {
  //       return "ראיתי שכבר פירקת את המשימה לחלקים — איזה חלק מרגיש הכי קשה?";
  //     }
  //   }

  // TODO שלב 3: תגובת ברירת מחדל אם לא נמצאה התאמה
  //   return "ספר לי יותר — מה בדיוק מרגיש קשה עכשיו?";
}


// ============================================================
//  פונקציה 6: getThinkingModels
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מחזירה זוויות חשיבה בהתאם לנושא/תחום הלימוד.
 * משתמשת במאגר ANGLES_BY_SUBJECT למעלה.
 *
 * קלט:
 *   subject (string) — נושא או תחום הלימוד
 *
 * פלט צפוי (array):
 *   [
 *     { angle: "כרונולוגי", description: "..." },
 *     { angle: "חברתי",    description: "..." },
 *     { angle: "פוליטי",   description: "..." }
 *   ]
 */
function getThinkingModels(subject) {

  // TODO שלב 1: בדקו אם הנושא מופיע ב-ANGLES_BY_SUBJECT
  // דוגמה:
  //   for (let key in ANGLES_BY_SUBJECT) {
  //     if (subject.includes(key)) {
  //       return ANGLES_BY_SUBJECT[key];
  //     }
  //   }

  // TODO שלב 2: ברירת מחדל — החזירו זוויות כלליות
  //   return [
  //     { angle: "מה",  description: "מה קרה? מה הנושא המרכזי?" },
  //     { angle: "למה", description: "מה הסיבות? מה הרקע?" },
  //     { angle: "מה השפעה", description: "מה התוצאות לטווח הארוך?" },
  //   ];
}


// ============================================================
//  פונקציה עזר: delay
//  כדי לדמות "חשיבה" של AI — ממתינים כמה מאות מילישניות
// ============================================================
/**
 * ממתינה ms מילישניות ואז ממשיכה.
 * דוגמה לשימוש: await delay(800);  // המתן 0.8 שניות
 *
 * @param {number} ms — כמה מילישניות לחכות
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
//  חשיפת הפונקציות לשאר הקבצים
//  שימו לב: רק sendQuery נחשף לצוות C!
//  שאר הפונקציות הן "פנימיות" — רק לשימוש בתוך הקובץ הזה.
// ============================================================
const aiService = {
  sendQuery,       // ← זו הפונקציה היחידה שצוות C קורא לה
  updateContext,   // ← נחשף גם כן למקרה שצוות C צריך לעדכן ישירות
};
