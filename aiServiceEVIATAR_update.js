/**
 * ============================================================
 *  aiService.js  —  צוות D: יהודה ואביתר
 * ============================================================
 *
 *  מה האחריות שלכם?
 *  -----------------
 *  אתם ה"מוח" של האתר. כל שאלה שצוות C שולח לכם —
 *  אתם מטפלים בה, מנסחים תשובה חכמה, ומחזירים אותה.
 *
 *  הרעיון המרכזי — ניהול "הקשר" (Context):
 *  בניגוד ל-AI אמיתי, אתם זוכרים מה קרה קודם!
 *  אתם שומרים היסטוריה ב-localStorage ומשתמשים בה
 *  כדי שהתשובות יהיו רלוונטיות למשתמש הספציפי.
 *
 *  דוגמה: אם המשתמש כבר פירק את הפרק הראשון,
 *  ה-AI שלכם יכול לומר "ראיתי שכבר עבדת על חלק א' —
 *  האם הקושי הוא במציאת מקורות או בניסוח?"
 *
 *  הקבצים שקוראים לכם:
 *    - logicManager.js (צוות C) — שולחים לכם sendQuery(...)
 *
 *  איך תריצו את הקוד?
 *    פתחו את index.html עם Live Server ב-VS Code.
 *    פתחו את כלי המפתחים (F12) → Console
 *    כדי לראות תוצאות ובדוק שהפונקציות עובדות.
 *
 * ============================================================
 */

// ============================================================
//  מפתח השמירה של היסטוריית ה-AI
//  שמירה נפרדת מה-State הכללי של צוות C
// ============================================================
const AI_HISTORY_KEY = "decompose_ai_history";
  const MAX_HISTORY = 8;


// ============================================================
//  מאגר הנתונים שלכם (Dictionaries)
//  -------------------------------------------------------
//  במקום לכתוב תשובות קשיחות, השתמשו במאגרים גדולים.
//  ככל שהמאגר גדול יותר — ה-AI יראה יותר "אמיתי".
//  הוסיפו כמה שיותר דוגמאות!
// ============================================================

// זוויות חשיבה לפי תחום לימוד
const ANGLES_BY_SUBJECT = {
  "היסטוריה": [
    { angle: "כרונולוגי",  description: "סדר את האירועים לפי זמן — מה קרה ראשון ומה גרם למה?" },
    { angle: "חברתי",     description: "מי היו האנשים שהושפעו? מה השתנה בחייהם?" },
    { angle: "פוליטי",    description: "אילו כוחות וממשלות היו מעורבים? איך השתנה השלטון?" },
  ],
  "מדע":  [
    { angle: "ניסיוני",   description: "מה השערת הניסוי? מה הוכח ומה לא?" },
    { angle: "יישומי",    description: "איפה אנחנו רואים את זה בחיי היומיום?" },
    { angle: "השוואתי",   description: "השווה בין שתי תיאוריות או תוצאות שונות" },
  ],
  "ספרות": [
    { angle: "דמויות",    description: "מה מניע את הדמות הראשית? כיצד היא מתפתחת?" },
    { angle: "נושאים",    description: "מהם הרעיונות הגדולים שהמחבר מעביר?" },
    { angle: "סגנון",     description: "כיצד שפת הכתיבה תורמת למשמעות?" },
  ],
  // TODO הוסיפו עוד תחומים: מתמטיקה, אזרחות, גיאוגרפיה וכו'
};

// תגובות סוקרטיות לפי מילות מפתח
const SOCRATIC_RESPONSES = {
  "תקוע":      "ראיתי את ההתקדמות שלך עד עכשיו — מה הדבר האחד שמרגיש הכי מבלבל?",
  "לא מבין":   "מה כן ברור לך עד עכשיו? נתחיל ממה שאתה יודע ונתקדם משם.",
  "קשה":       "מה הדבר הקשה ביותר — מציאת המידע, או ניסוח המחשבות?",
  "מקורות":    "כמה מקורות כבר מצאת? האם הם עונים על השאלה המרכזית שלך?",
  "לא יודע":   "אם היית צריך לנחש — מה היית אומר? לפעמים הניחוש הראשון הוא הכי טוב.",
  "עזרה":      "איזה חלק ספציפי הוא הכי קשה? אפשר לפרק את הבעיה לצעדים קטנים יותר?",
  // TODO הוסיפו עוד מצבים ותגובות מתאימות
};

// ניסוחים משופרים לפי סוג הבעיה
const IMPROVEMENT_TEMPLATES = {
  "רחב מדי": {
    prefix:      "נסה לצמצם: במקום '{{original}}', נסח כך:",
    suggestion:  "מצא {{number}} דוגמאות ספציפיות ל-{{topic}}",
    explanation: "משימה ספציפית יותר קל יותר להתחיל ולסיים."
  },
  "לא ברור": {
    prefix:      "נסה לנסח כשאלת מחקר: במקום '{{original}}', שאל:",
    suggestion:  "מה הקשר בין {{topic}} לבין {{context}}?",
    explanation: "שאלת מחקר עוזרת לך לדעת בדיוק מה לחפש."
  },
  // TODO הוסיפו עוד סוגי בעיות
};


// ============================================================
//  פונקציה 1: sendQuery  ← זו הפונקציה הכי חשובה!
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * זו הפונקציה היחידה שצוות C קורא לה.
 * היא מקבלת "כוונה" (intent) ומידע (data),
 * ומחליטה איזו פונקציה פנימית להפעיל.
 *
 * קלט:
 *   intent (string) — סוג הבקשה, אחת מהאפשרויות:
 *     "DECOMPOSE_INITIAL"  — פרק משימה לחלקים
 *     "SUGGEST_IMPROVEMENT"— שפר משימה אדומה
 *     "SOCRATIC_CHAT"      — תגובה לצ'אט
 *     "GET_ANGLES"         — קבל זוויות חשיבה
 *
 *   data (any) — המידע הרלוונטי לבקשה
 *
 * פלט צפוי: Promise<object> — תמיד מחזיר אובייקט JSON מסודר
 *
 * מי קורא לה?
 *   רק צוות C — מתוך logicManager.js
 *
 * ⚠️ חשוב: הפונקציה הזו חייבת להיות async
 *    כי היא קוראת לפונקציות שלוקחות זמן
 */
async function sendQuery(intent, data) {

  // TODO שלב 1: הדפיסו ל-console כדי לדעת שהפונקציה נקראה
  //   console.log("🤖 aiService קיבל בקשה:", intent, data);

  // TODO שלב 2: טענו את היסטוריית השיחה (לשימוש בתגובות)
  //   const history = loadAIHistory();

  // TODO שלב 3: בחרו מה לעשות לפי ה-intent
  // השתמשו ב-if/else כדי לנתב לפונקציה הנכונה:
  //
  //   if (intent === "DECOMPOSE_INITIAL") {
  //     result = await generateSmartDecomposition(data);
  //
  //   } else if (intent === "SUGGEST_IMPROVEMENT") {
  //     result = await generateRefinedPrompt(data.taskText, data.reason);
  //
  //   } else if (intent === "SOCRATIC_CHAT") {
  //     result = getSocraticResponse(data, history);
  //
  //   } else if (intent === "GET_ANGLES") {
  //     result = getThinkingModels(data);
  //
  //   } else {
  //     console.error("❌ intent לא מוכר:", intent);
  //     return null;
  //   }

  // TODO שלב 4: שמרו את השיחה בהיסטוריה
  //   updateContext({ intent, data, result });

  // TODO שלב 5: החזירו את התוצאה
  //   return result;
}


// ============================================================
//  פונקציה 2: updateContext
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * שומרת כל אינטראקציה ב-localStorage כדי שה-AI
 * "יזכור" מה קרה קודם ויתן תגובות רלוונטיות יותר.
 *
 * קלט:
 *   interaction (object):
 *   {
 *     intent:    "DECOMPOSE_INITIAL",
 *     data:      "...",          (מה צוות C שלח)
 *     result:    { ... },        (מה ה-AI החזיר)
 *     timestamp: "2025-01-01"   (מתי זה קרה)
 *   }
 *
 * פלט: אין (void) — רק שמירה
 */
function updateContext(interaction) {// מפתח לשמירה ב-localStorage
const AI_HISTORY_KEY = 'my_ai_app_history'; // what is the job of the AI_HISTORY_KEY?

// ============================================================
// פונקציה 1: updateContext
// ============================================================
function updateContext(interaction) {
  interaction.timestamp = Date.now();
  const fullData = loadAIHistory();
  fullData.messages.push(interaction);
  if (fullData.messages.length > MAX_HISTORY) {
    fullData.messages.shift(); // הסרת ההודעה הישנה ביותר
  }
  if (interaction.intent === "DECOMPOSE_INITIAL") {
      fullData.lastTopic = interaction.data; 
  }
  localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(fullData));
  console.log(`📝 הזיכרון עודכן. הודעות בזיכרון: ${fullData.messages.length}`);
}

// ============================================================
// פונקציה 2: loadAIHistory
// ============================================================
function loadAIHistory() {
  const saved = localStorage.getItem(AI_HISTORY_KEY);
  // אם אין כלום - מחזירים אובייקט עם מבנה התחלתי ריק
  if (!saved) {
    return {
      messages: [],
      lastTopic: "טרם נקבע",
      lastSummary: ""
    };
  }

  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error("Error parsing AI history, resetting...");
    return { messages: [], lastTopic: "טרם נקבע" };
  }
}

// ============================================================
// פונקציה 3: generateSmartDecomposition
// ============================================================
function generateSmartDecomposition(topic) {
  // לוגיקה בסיסית לזיהוי סוג הנושא
  const lowerTopic = topic.toLowerCase();
  
  // מקבץ ברירת מחדל
  let chunks = [
    { id: "chunk-1", title: "מבוא והגדרות", description: `סקירה כללית של ${topic}` },
    { id: "chunk-2", title: "גוף העבודה", description: "ניתוח המרכיבים העיקריים" },
    { id: "chunk-3", title: "סיכום ומסקנות", description: "תובנות סופיות והשלכות" }
  ];

  // התאמה לפי סוג הנושא
  if (lowerTopic.includes("היסטוריה") || lowerTopic.includes("מהפכה") || lowerTopic.includes("מלחמה")) {
    chunks = [
      { id: "chunk-1", title: "רקע וסיבות", description: "מה הוביל לאירועים?" },
      { id: "chunk-2", title: "ציר זמן של אירועים מרכזיים", description: "תיאור כרונולוגי של המתרחש" },
      { id: "chunk-3", title: "תוצאות והשפעות לטווח ארוך", description: "איך האירוע שינה את פני ההיסטוריה?" }
    ];
  } 
  else if (lowerTopic.includes("מדע") || lowerTopic.includes("ניסוי") || lowerTopic.includes("ביולוגיה")) {
    chunks = [
      { id: "chunk-1", title: "תיאוריה והיפותזה", description: "הבסיס המדעי ושאלת המחקר" },
      { id: "chunk-2", title: "מתודולוגיה וניסוי", description: "שיטת המחקר ואיסוף הנתונים" },
      { id: "chunk-3", title: "ניתוח תוצאות", description: "מה המסקנות מהנתונים שנאספו?" }
    ];
  }
  else if (lowerTopic.includes("ספרות") || lowerTopic.includes("סיפור") || lowerTopic.includes("שיר")) {
    chunks = [
      { id: "chunk-1", title: "דמויות ואפיון", description: "ניתוח הגיבורים והקונפליקטים" },
      { id: "chunk-2", title: "מוטיבים וסמלים", description: "אלמנטים ספרותיים חוזרים" },
      { id: "chunk-3", title: "מבנה העלילה", description: "אקספוזיציה, שיא והתרה" }
    ];
  }

  return chunks;
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
  // דוגמה:;אטוי1 1 2    2  ק3 צ ה2כג
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
