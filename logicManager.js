/**
 * ============================================================
 *  logicManager.js  —  צוות C: אלון ומאיר
 * ============================================================
 */
const STORAGE_KEY = "decompose_app_state";
const MIN_INITIAL_TEXT_LENGTH = 10;
const MAX_INITIAL_TEXT_LENGTH = 4000;
const MIN_PAGE_COUNT = 1;
const MAX_PAGE_COUNT = 1000;

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
    // אופציונלי — אם לא הזין מספר עמודים, זה בסדר
    return null;
  }

  const parsedPageCount = typeof pageCount === "number" ? pageCount : Number(pageCount);

  if (!Number.isFinite(parsedPageCount) || !Number.isInteger(parsedPageCount)) {
    handleError("מספר העמודים חייב להיות מספר שלם תקין.");
    return null;
  }

  if (parsedPageCount < MIN_PAGE_COUNT) {
    handleError(`מספר העמודים חייב להיות לפחות ${MIN_PAGE_COUNT}.`);
    return null;
  }

  if (parsedPageCount > MAX_PAGE_COUNT) {
    handleError(`מספר העמודים גבוה מדי. נסה להזין ${MAX_PAGE_COUNT} או פחות.`);
    return null;
  }

  return parsedPageCount;
}

function validateDueDate(dueDate) {
  if (dueDate === null || dueDate === undefined || dueDate === "") {
    // אופציונלי — אם לא הזין תאריך, זה בסדר
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
  const normalizedText = typeof taskText === "string"
    ? taskText.trim().toLowerCase().replace(/\s+/g, " ")
    : "";

  if (!normalizedText) {
    return false;
  }

  // ======== 🔍 בדיקת חרטוטים - רק מילים ברורות בלבד ========
  // רשימת מילים נפוצות ומוכרות בעברית (3+ אותיות בלבד)
  const commonWords = [
    "על", "את", "של", "עם", "בין", "או", "אבל", "אם", "אז", "כי", "כל", "יש", "אין", "יותר", "פחות", "מאוד", "מעט",
    "כמו", "כן", "לא", "הכל", "משהו", "כמה", "איזה", "הזה", "הזאת", "אחד", "שניים",
    "וגם", "גם", "רק", "עד", "מן", "שלה", "שלו",
    "בתוך", "ליד", "לפני", "אחרי", "מעל", "מתחת", "דרך", "כנגד", "למעט", "בעד"
  ];

  // 🔴 Red words
  const redWords = [
    "הכל", "לסיים", "לעשות", "כולו", "כל העבודה", "לטפל", "להכין", "ללמוד",
    "קרא", "כתוב", "בחן", "חקור", "עשה", "הכן", "טפל", "עסוק"
  ];

  // 🟢 Green words
  const greenWords = [
    "פסקה", "פסקאות", "שורה", "שורות", "משפט", "משפטים",
    "מקור", "מקורות", "ספר", "ספרים", "מאמר", "מאמרים",
    "טבלה", "טבלאות", "גרף", "גרפים", "תרשים", "תרשימים",
    "דוגמה", "דוגמאות", "דוגמא",
    "השווה", "השוואה", "השוואות",
    "סכום", "סיכום", "סכומים", "סיכומים",
    "רשימה", "רשימות", "מנה", "מנות",
    "מבוא", "מבואים", "סיום", "סיומים", "מסקנה", "מסקנות"
  ];

  // 🟢🟢 Strong words
  const strongWords = [
    "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר",
    "150", "200", "250", "300", "100", "50",
    "במילים", "בתווים", "בשורות",
    "בעברית", "בעברית תקנית", "בעברית ברורה",
    "מחדש", "חדש", "מתקדם", "בסיסי",
    "בדיוק", "בעיקר", "בעקביות", "בבהירות"
  ];

  // כל המילים המוכרות
  const allRecognizedWords = [...commonWords, ...redWords, ...greenWords, ...strongWords];

  // ============ בדיקה: האם יש חרטוטים או אותיות לא ברורות ==============
  const words = normalizedText.split(/\s+/);
  let unknownWordCount = 0;

  for (const word of words) {
    // הסר סימנים שאינם אותיות/מספרים עברית
    const cleanWord = word.replace(/[^\u05D0-\u05EA0-9]/g, "");
    
    if (cleanWord.length === 0) continue; // דלג על מילים ריקות

    // אות בודדת היא סימן לחרטוט
    if (cleanWord.length === 1 && !/[0-9]/.test(cleanWord)) {
      unknownWordCount++;
      continue;
    }

    // בדוק אם המילה או חלק ממנה מוכרים
    // רק בדוק עבור מילים של 4+ אותיות כדי למנוע תת-string matches
    const isRecognized = allRecognizedWords.some(recWord => 
      recWord.length >= 4 && cleanWord.includes(recWord)
    );
    
    // אם המילה לא מוכרת מהtextח העברי - עדיין יכול להיות לועז טהור
    if (!isRecognized && cleanWord.length > 1) {
      unknownWordCount++;
    } else if (!isRecognized && cleanWord.length === 0) {
      // אם cleanWord ריק, זה אומר שהמילה לא כוללת אותיות עברית בכלל
      // כלומי היא לועזית טהורה (כמו abc, def, ghi)
      unknownWordCount++;
    }
  }

  // אם יותר מ-70% מהמילים לא מוכרות = חרטוט!
  if (words.length > 0 && unknownWordCount > words.length * 0.7) {
    return false;
  }

  // ============ ניקוד רגיל ==============
  let score = 0;

  if (normalizedText.length < 50) score += 1;
  else if (normalizedText.length < 100) score += 5;
  else if (normalizedText.length <= 200) score += 10;
  else if (normalizedText.length <= 600) score += 5;
  else score -= 3;

  function containsTerm(text, term) {
    return text.includes(term);
  }

  function countMatches(words) {
    return words.filter((word) => containsTerm(normalizedText, word)).length;
  }

  const redMatches = countMatches(redWords);
  const greenMatches = countMatches(greenWords);
  const strongMatches = countMatches(strongWords);

  score -= redMatches * 2;
  score += greenMatches * 2;
  score += strongMatches;

  if (greenMatches > 0 && strongMatches > 0) score += 1;

  if (redMatches >= 2 && greenMatches === 0 && strongMatches === 0) {
    return false;
  }

  if (!normalizedText.includes(" ")) {
    return false;
  }

  return score >= 5;
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
  const normalizedTaskText = typeof taskText === "string" ? taskText.trim() : "";
  const isActionable = analyzeActionability(normalizedTaskText);

  let analysis;
  if (isActionable === true) {
    analysis = {
      score: "green",
      label: "ממוקד ובר ביצוע"
    };
  } else {
    analysis = {
      score: "red",
      label: "רחב מדי"
    };
  }

  let aiSuggestion = null;

  if (analysis.score === "red") {
    try {
      aiSuggestion = await aiService.sendQuery("SUGGEST_IMPROVEMENT", {
        taskText: normalizedTaskText,
        reason: analysis.label
      });
    } catch (error) {
      console.error("שגיאה בקבלת הצעת שיפור מה-AI:", error);
      aiSuggestion = null;
    }
  }

  return {
    taskId: taskId,
    score: analysis.score,
    label: analysis.label,
    aiSuggestion: aiSuggestion || null
  };
}


// ============================================================
//  פונקציה 4: calculateBackwardTimeline
// ============================================================

function calculateBackwardTimeline(dueDate) {
  const finalDate = dueDate instanceof Date ? new Date(dueDate.getTime()) : new Date(dueDate);

  if (Number.isNaN(finalDate.getTime())) {
    handleError("תאריך ההגשה אינו תקין.");
    return [];
  }

  const today = new Date();
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.round((finalDate - today) / millisecondsPerDay);

  if (totalDays < 0) {
    handleError("תאריך ההגשה כבר עבר.");
    return [];
  }

  const milestones = [
    { name: "הבנת המשימה ובחירת מבנה", percentFromStart: 0.10 },
    { name: "בחירת מקורות", percentFromStart: 0.30 },
    { name: "איסוף מקורות", percentFromStart: 0.50 },
    { name: "כתיבת פסקה ראשונה", percentFromStart: 0.70 },
    { name: "עריכה וסיכום", percentFromStart: 0.90 },
    { name: "הגשה סופית", percentFromStart: 1.00 }
  ];

  const timeline = milestones.map((milestone) => {
    const daysFromNow = Math.round(totalDays * milestone.percentFromStart);
    const milestoneDate = new Date(today);
    milestoneDate.setDate(today.getDate() + daysFromNow);

    return {
      milestone: milestone.name,
      date: milestoneDate.toISOString().split("T")[0]
    };
  });

  return timeline;
}

function normalizeTimelineDate(dateValue) {
  const parsedDate = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().split("T")[0];
}

function updateTimelineMilestone(timeline, milestoneIndex, newDate) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  const normalizedDate = normalizeTimelineDate(newDate);
  if (!normalizedDate || milestoneIndex < 0 || milestoneIndex >= timeline.length) {
    return timeline;
  }

  return timeline.map((milestone, index) => {
    if (index !== milestoneIndex) {
      return milestone;
    }

    return {
      ...milestone,
      date: normalizedDate
    };
  });
}

function createEditableTimelinePlan(dueDate) {
  return calculateBackwardTimeline(dueDate).map((milestone) => ({
    ...milestone,
    editable: true
  }));
}


async function requestAIAngles(topic) {
  const normalizedTopic = typeof topic === "string" ? topic.trim() : "";

  if (!normalizedTopic) {
    return [];
  }

  try {
    const result = await aiService.sendQuery("GET_ANGLES", normalizedTopic);

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error("צוות D לא החזיר זוויות — בדקו את aiService.js");
      return [];
    }

    return result;
  } catch (error) {
    console.error("שגיאה בקבלת זוויות חשיבה מה-AI:", error);
    return [];
  }
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
  try {
    const stateAsText = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, stateAsText);
    console.log("✅ State נשמר בהצלחה:", state);
  } catch (error) {
    console.error("שגיאה בשמירת state ל-localStorage:", error);
  }
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
  try {
    const savedText = localStorage.getItem(STORAGE_KEY);

    if (!savedText) return null;

    return JSON.parse(savedText);
  } catch (error) {
    console.error("שגיאה בטעינת state מ-localStorage:", error);
    return null;
  }
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
  createEditableTimelinePlan,
  updateTimelineMilestone,
  normalizeTimelineDate,
  requestAIAngles,
  syncStateToStorage,
  loadStateFromStorage,
};
