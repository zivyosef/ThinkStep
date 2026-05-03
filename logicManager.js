/**
 * ============================================================
 *  logicManager.js  —  צוות C: אלון ומאיר
 * ============================================================
 */
const STORAGE_KEY = "decompose_app_state";
const MIN_INITIAL_TEXT_LENGTH = 10;
const MAX_INITIAL_TEXT_LENGTH = 4000;



// ============================================================
//  פונקציה 1: initProject
// ============================================================
const TASK_PG_ERROR_MSG = "שגיאה: לא הוזן מספר עמודים. אנא כתוב את המשימה שלך לפני השמירה.";
const TASK_ERROR_MSG = "שגיאה: לא הוזן טקסט. אנא כתוב את המשימה שלך לפני השמירה.";

function createNewState() {
    return {
    rawText: null,
    subject: null,
    assignmentType: null,
    topic: null,
    pgNumberScope: null,
    dueDate: null,
    chunkLabel: null,
    chunkSummary: null
    };
}
async function initProject(rawText) {
  // בדיקה ראשונית - האם הטקסט ריק?
  if (typeof rawText !== "string") {
    handleError(TASK_ERROR_MSG);
    return null;
  }

  const normalizedText = rawText.trim().replace(/\s+/g, " ");

  if (!normalizedText) {
    handleError(TASK_ERROR_MSG);
    return null;
  }

  if (normalizedText.length < MIN_INITIAL_TEXT_LENGTH) {
    handleError(`הטקסט קצר מדי. כתוב לפחות ${MIN_INITIAL_TEXT_LENGTH} תווים.`);
    return null;
  }

  if (normalizedText.length > MAX_INITIAL_TEXT_LENGTH) {
    handleError(`הטקסט ארוך מדי. נסה לקצר ל-${MAX_INITIAL_TEXT_LENGTH} תווים או פחות.`);
    return null;
  }

  const newState = createNewState();
  newState.rawText = normalizedText;
  
  try {
    // שליחת השאילתה ל-AI
    const currentState = await aiService.sendQuery("DECOMPOSE_INITIAL", normalizedText, newState);

    if (!currentState) {
      handleError("לא התקבלה תגובה מהשרת. נסה שוב.");
      return null;
    }

    // בדיקת שדות חובה - אם חסרים, אפשר להחזיר את ה-State בכל זאת
    // כדי שהמשתמש ימלא את החסר בטופס הוויזואלי
    const missingFields = [];
    if (!currentState.subject) missingFields.push("מקצוע");
    if (!currentState.topic) missingFields.push("נושא");

    if (missingFields.length > 0) {
      console.warn(`שים לב: לא הצלחנו לזהות אוטומטית: ${missingFields.join(", ")}`);
    }

    return currentState;

  } catch (error) {
    handleError("שגיאה בתקשורת עם ה-AI. בדוק את החיבור לאינטרנט.");
    console.error("AI Service Error:", error);
    return null;
  }
}

function validatePageCount(pageCount) {
  if (pageCount === null || pageCount === undefined || pageCount === "") {
    // need to create an alternative - infinte num of pages
    return null;
  }

  const parsedPageCount = typeof pageCount === "number" ? pageCount : Number(pageCount);

  if (!Number.isFinite(parsedPageCount) || !Number.isInteger(parsedPageCount)) {
    handleError("מספר העמודים חייב להיות מספר שלם תקין.");
    return null;
  }

  return parsedPageCount;
}

function validateDueDate(dueDate) {
  if (dueDate === null || dueDate === undefined || dueDate === "") {
    // need to create an alternative - infinte num of days
    return null;
  }

  const parsedDate = dueDate instanceof Date ? new Date(dueDate.getTime()) : new Date(dueDate);

  if (Number.isNaN(parsedDate.getTime())) {
    handleError("תאריך ההגשה אינו תקין.");
    return null;
  }

  return parsedDate;
}


function handleError(msg) {
  alert(msg); // maybe change to a nicer UI element later
  console.error(msg);
}


// ============================================================
//  פונקציה 2: analyzeActionability
// ============================================================
function analyzeActionability(taskText) {
let score = 0;
if (taskText.length >= 20 && taskText.length > 0 ) {score += 1;}
if (taskText.length >= 50 && taskText.length > 20) {score += 5;}
if (taskText.length >= 100 && taskText.length > 50) {score += 10;}
// מילים שמעידות על משימה רחבה מדי (אדום):
// 🔴 Red words (too broad)
  const redWords = [
    "finish","write body","do project","study everything","work on assignment","write all","complete paper",
    "הכל","לסיים","לעשות","כולו","כל העבודה","לטפל בזה","להכין עבודה","ללמוד הכל"
  ];

  // 🟠 Medium words (not specific enough)
  const mediumWords = [
    "write about","learn about","read about","research","analyze","explore",
    "לכתוב על","ללמוד על","לקרוא על","לחקור","לנתח","להסביר"
  ];

  // 🟢 Green words (actionable)
  const greenWords = [
    "1 paragraph","one paragraph","2 sources","two sources","summarize","outline","find","compare","list 3","3 events","one cause",
    "לכתוב פסקה","לקרוא מקור","לחפש 2","לסכם","למצוא מקור","להשוות בין","לכתוב מבוא","לנסח שאלה","לבנות ראשי פרקים","לכתוב 3 נקודות"
  ];

  // 🟢🟢 Strong words (high value)
  const strongWords = [
    "paragraph","question","source","claim","example","comparison","cause","event","outline",
    "פסקה","שאלה","מקור","טענה","דוגמה","השוואה","סיבה","אירוע","מתווה"
  ];


  // TODO שלב 2: עברו על המילים ובדקו אם הטקסט מכיל אותן
  // טיפ: השתמשו ב-taskText.includes("מילה") לבדיקה
  // לפני שאתה בודק את הטקסט - מומלץ להשתמש בטקסט המנורמל שיצרת ב-current state
  //
  //   for (let word of redWords) {
  //     if (text.includes(word)) {
  //       return { score: "red", label: "רחב מדי", suggestion: "נסה לחלק..." };
  //     }
  //   }

  // TODO שלב 3: אם לא נמצאה מילת "אדום" — בדקו "ירוק"
  //   for (let word of greenWords) {
  //     if (text.includes(word)) {
  //       return { score: "green", label: "מוכן לביצוע", suggestion: "מצוין!" };
  //     }
  //   }

  // TODO שלב 4: אם לא ברור — החזירו "צהוב" כברירת מחדל
  //   return { score: "yellow", label: "בינוני", suggestion: "נסה להיות יותר ספציפי" };
}


// ============================================================
//  פונקציה 3: handleTaskValidation
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * משלבת את הבדיקה היבשה (analyzeActionability) עם ה-AI.
 * אם המשימה אדומה — מבקשת מצוות D הצעה לשיפור.
 *
 * קלט:
 *   taskId   (string) — מזהה ייחודי של המשימה (למשל "task-1")
 *   taskText (string) — הטקסט של המשימה
 *
 * פלט צפוי (object):
 *   {
 *     taskId:      "task-1",
 *     score:       "red",
 *     label:       "רחב מדי",
 *     aiSuggestion: { refinedText: "...", explanation: "..." }
 *   }
 *
 * מי קורא לה?
 *   צוות A קורא לה כשהמשתמש לוחץ "בדוק משימה"
 */
async function handleTaskValidation(taskId, taskText) {

  // TODO שלב 1: קראו ל-analyzeActionability וקבלו את הציון
  //   const analysis = analyzeActionability(taskText);

  // TODO שלב 2: אם הציון הוא "red" — בקשו עזרה מצוות D
  //   if (analysis.score === "red") {
  //     const aiSuggestion = await aiService.sendQuery("SUGGEST_IMPROVEMENT", {
  //       taskText: taskText,
  //       reason:   analysis.label
  //     });
  //   }

  // TODO שלב 3: בנו אובייקט תוצאה מסודר וחזירו אותו
  //   return {
  //     taskId:       taskId,
  //     score:        analysis.score,
  //     label:        analysis.label,
  //     aiSuggestion: aiSuggestion || null   // null אם לא היה צריך AI
  //   };
}


// ============================================================
//  פונקציה 4: calculateBackwardTimeline
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מחשבת לוח זמנים "לאחור" — מתאריך ההגשה לאחור.
 * למשל: "אם ההגשה ב-1 ביוני, עד מתי צריך לסיים את המחקר?"
 * זו פונקציה שלא צריכה AI — רק חישוב תאריכים.
 *
 * קלט:
 *   dueDate (Date) — תאריך ההגשה הסופי
 *
 * פלט צפוי (array):
 *   [
 *     { milestone: "הבנת המשימה",   date: "2025-05-01" },
 *     { milestone: "איסוף מקורות", date: "2025-05-08" },
 *     { milestone: "כתיבת טיוטה",  date: "2025-05-20" },
 *     { milestone: "עריכה סופית",  date: "2025-05-28" }
 *   ]
 *
 * מי קורא לה?
 *   צוות A קורא לה כשהמשתמש לוחץ "בנה לוח זמנים"
 */
function calculateBackwardTimeline(dueDate) {

  // TODO שלב 1: חשבו כמה ימים נשארו מהיום עד ההגשה
  // דוגמה:
  //   const today     = new Date();
  //   const totalDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

  // TODO שלב 2: הגדירו את אבני הדרך לפי אחוזים מהזמן הכולל
  // דוגמה: מחקר = 20% ראשונים, כתיבה = 50% הבאים, עריכה = 30% הנותרים
  //   const milestones = [
  //     { name: "הבנת המשימה ובחירת מבנה", percentFromStart: 0.10 },
  //     { name: "איסוף מקורות",             percentFromStart: 0.30 },
  //     { name: "כתיבת טיוטה ראשונה",       percentFromStart: 0.70 },
  //     { name: "עריכה וסיכום",             percentFromStart: 0.90 },
  //     { name: "הגשה סופית",              percentFromStart: 1.00 },
  //   ];

  // TODO שלב 3: לכל אבן דרך — חשבו את התאריך המדויק
  // דוגמה:
  //   const timeline = milestones.map(m => {
  //     const daysFromNow    = Math.round(totalDays * m.percentFromStart);
  //     const milestoneDate  = new Date(today);
  //     milestoneDate.setDate(today.getDate() + daysFromNow);
  //
  //     return {
  //       milestone: m.name,
  //       date:      milestoneDate.toISOString().split("T")[0]  // פורמט YYYY-MM-DD
  //     };
  //   });

  // TODO שלב 4: החזירו את המערך
  //   return timeline;
}


// ============================================================
//  פונקציה 5: requestAIAngles
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * מבקשת מצוות D "זוויות מחקר" — דרכים שונות לגשת לנושא.
 * למשל, עבור "המהפכה הצרפתית": זווית כלכלית, חברתית, פוליטית.
 *
 * קלט:
 *   topic (string) — נושא המשימה הגדולה
 *
 * פלט צפוי (array):
 *   [
 *     { angle: "כלכלי",  description: "בדוק את המשבר הכלכלי שקדם..." },
 *     { angle: "חברתי",  description: "בחן את אי-השוויון בחברה..." },
 *     { angle: "פוליטי", description: "ניתח את כישלון המלוכה..." }
 *   ]
 *
 * מי קורא לה?
 *   צוות A קורא לה כשהמשתמש לוחץ "קבל זוויות חשיבה"
 */
async function requestAIAngles(topic) {

  // TODO שלב 1: שלחו בקשה לצוות D עם הנושא
  //   const result = await aiService.sendQuery("GET_ANGLES", topic);

  // TODO שלב 2: וודאו שקיבלתם מערך עם 3 זוויות לפחות
  //   if (!result || !Array.isArray(result) || result.length === 0) {
  //     console.error("צוות D לא החזיר זוויות — בדקו את aiService.js");
  //     return [];
  //   }

  // TODO שלב 3: החזירו את התוצאה
  //   return result;
}


// ============================================================
//  פונקציה 6: syncStateToStorage
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * שומרת את כל המידע של האפליקציה ב-localStorage,
 * כדי שאם המשתמש ירענן את הדף — הכל יישמר.
 *
 * קלט:
 *   state (object) — כל המידע הנוכחי של האפליקציה
 *
 * פלט: אין (void) — רק שמירה
 *
 * מי קורא לה?
 *   כל פונקציה שמשנה את ה-state — כמו initProject
 */
function syncStateToStorage(state) {

  // TODO שלב 1: המירו את האובייקט למחרוזת JSON ושמרו
  // localStorage יכול לשמור רק מחרוזות טקסט, לכן צריך JSON.stringify
  // דוגמה:
  //   const stateAsText = JSON.stringify(state);
  //   localStorage.setItem(STORAGE_KEY, stateAsText);

  // TODO שלב 2: הדפיסו הודעה ל-console כדי לדעת שהשמירה הצליחה
  //   console.log("✅ State נשמר בהצלחה:", state);
}


// ============================================================
//  פונקציה נוספת: loadStateFromStorage
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * טוענת את המידע השמור מ-localStorage כשהדף נפתח.
 * אם אין מידע שמור — מחזירה null.
 *
 * פלט: object | null
 *
 * מי קורא לה?
 *   צוות A קורא לה כשהדף נטען (בתוך main.js)
 */
function loadStateFromStorage() {

  // TODO שלב 1: קראו את המידע מ-localStorage
  //   const savedText = localStorage.getItem(STORAGE_KEY);

  // TODO שלב 2: אם אין כלום — החזירו null
  //   if (!savedText) return null;

  // TODO שלב 3: המירו את המחרוזת חזרה לאובייקט והחזירו
  //   return JSON.parse(savedText);
}


// ============================================================
//  חשיפת הפונקציות לשאר הקבצים
//  כדי שצוות A יוכל לקרוא לפונקציות שלכם מ-main.js,
//  צריך "לחשוף" אותן תחת אובייקט גלובלי אחד.
//  אל תשנו את השמות כאן — צוות A מסתמך עליהם!
// ============================================================
const logicManager = {
  initProject,
  validatePageCount,
  validateDueDate,
  analyzeActionability,
  handleTaskValidation,
  calculateBackwardTimeline,
  requestAIAngles,
  syncStateToStorage,
  loadStateFromStorage,
};
