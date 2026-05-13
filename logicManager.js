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
const TASK_PG_ERROR_MSG =
  "שגיאה: לא הוזן מספר עמודים. אנא כתוב את המשימה שלך לפני השמירה.";
const TASK_ERROR_MSG =
  "שגיאה: לא הוזן טקסט. אנא כתוב את המשימה שלך לפני השמירה.";

function createNewState() {
  return {
    rawText: null,
    subject: null,
    assignmentType: null,
    topic: null,
    pgNumberScope: null,
    dueDate: null,
    chunkLabel: null,
    chunkSummary: null,
  };
}

async function initProject(rawText) {
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
    handleError(
      `הטקסט ארוך מדי. נסה לקצר ל-${MAX_INITIAL_TEXT_LENGTH} תווים או פחות.`
    );
    return null;
  }

  const newState = createNewState();
  newState.rawText = normalizedText;

  try {
    const currentState = await aiService.sendQuery(
      "DECOMPOSE_INITIAL",
      normalizedText,
      newState
    );

    if (!currentState) {
      handleError("לא התקבלה תגובה מהשרת. נסה שוב.");
      return null;
    }

    const missingFields = [];
    if (!currentState.subject) missingFields.push("מקצוע");
    if (!currentState.topic) missingFields.push("נושא");

    if (missingFields.length > 0) {
      console.warn(
        `שים לב: לא הצלחנו לזהות אוטומטית: ${missingFields.join(", ")}`
      );
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
    return null;
  }

  const parsedPageCount =
    typeof pageCount === "number" ? pageCount : Number(pageCount);

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
    return null;
  }

  const parsedDate =
    dueDate instanceof Date ? new Date(dueDate.getTime()) : new Date(dueDate);

  if (Number.isNaN(parsedDate.getTime())) {
    handleError("תאריך ההגשה אינו תקין.");
    return null;
  }

  return parsedDate;
}

function handleError(msg) {
  alert(msg);
  console.error(msg);
}


// ============================================================
//  פונקציה 2: analyzeActionability
//  ✅ נשארת ללא שינוי — ניתוח מקומי (לפני הבקשה ל-AI)
// ============================================================
function analyzeActionability(taskText) {
  const normalizedText =
    typeof taskText === "string"
      ? taskText.trim().toLowerCase().replace(/\s+/g, " ")
      : "";

  if (!normalizedText) {
    return false;
  }

  const commonWords = [
    "על", "את", "של", "עם", "בין", "או", "אבל", "אם", "אז", "כי", "כל",
    "יש", "אין", "יותר", "פחות", "מאוד", "מעט", "כמו", "כן", "לא", "הכל",
    "משהו", "כמה", "איזה", "הזה", "הזאת", "אחד", "שניים", "וגם", "גם",
    "רק", "עד", "מן", "שלה", "שלו", "בתוך", "ליד", "לפני", "אחרי", "מעל",
    "מתחת", "דרך", "כנגד", "למעט", "בעד",
  ];

  const greenWords = [
    "פסקה", "פסקאות", "שורה", "שורות", "משפט", "משפטים",
    "מקור", "מקורות", "ספר", "ספרים", "מאמר", "מאמרים",
    "טבלה", "טבלאות", "גרף", "גרפים", "תרשים", "תרשימים",
    "דוגמה", "דוגמאות", "דוגמא",
    "השווה", "השוואה", "השוואות",
    "סכום", "סיכום", "סכומים", "סיכומים",
    "רשימה", "רשימות", "מנה", "מנות",
    "מבוא", "מבואים", "סיום", "סיומים", "מסקנה", "מסקנות",
  ];

  const allRecognizedWords = [...commonWords, ...greenWords];

  const words = normalizedText.split(/\s+/);
  let unknownWordCount = 0;

  for (const word of words) {
    const cleanWord = word.replace(/[^\u05D0-\u05EA0-9]/g, "");
    if (cleanWord.length === 0) continue;
    if (cleanWord.length === 1 && !/[0-9]/.test(cleanWord)) {
      unknownWordCount++;
      continue;
    }
    const isRecognized = allRecognizedWords.some(
      (recWord) => recWord.length >= 4 && cleanWord.includes(recWord)
    );
    if (!isRecognized && cleanWord.length > 1) {
      unknownWordCount++;
    }
  }

  if (words.length > 0 && unknownWordCount > words.length * 0.7) {
    return false;
  }

  let score = 0;

  if (normalizedText.length < 50) score += 1;
  else if (normalizedText.length < 100) score += 5;
  else if (normalizedText.length <= 200) score += 10;
  else if (normalizedText.length <= 600) score += 5;

  function containsTerm(text, term) {
    return text.includes(term);
  }

  function countMatches(words) {
    return words.filter((word) => containsTerm(normalizedText, word)).length;
  }

  const greenMatches = countMatches(greenWords);
  score += greenMatches * 2;
  if (greenMatches > 0) score += 1;

  if (!normalizedText.includes(" ")) {
    return false;
  }

  return score;
}


// ============================================================
//  פונקציה 3: handleTaskValidation
// ============================================================
/**
 * שלב 1: בדיקה מקומית מהירה (analyzeActionability)
 * שלב 2: שליחה ל-AI לניתוח עמוק יותר (VALIDATE_TASK)
 * שלב 3: אם "אדום" — מבקשים מה-AI הצעת שיפור (SUGGEST_IMPROVEMENT)
 *
 * הרשיונות:
 *   - הבדיקה המקומית מהירה ונותנת תשובה מיידית
 *   - ה-AI מדייק את הסיווג ומוסיף הסבר
 *   - אם האדום מאושר ע"י AI — מגיעה גם הצעה לשיפור
 *
 * קלט:  taskId (string), taskText (string)
 * פלט:  {
 *   taskId, score, label, explanation,
 *   source: "local" | "ai",
 *   aiSuggestion: { refinedText, explanation } | null
 * }
 */
async function handleTaskValidation(taskId, taskText) {
  const normalizedTaskText =
    typeof taskText === "string" ? taskText.trim() : "";

  // ── שלב 1: ניתוח מקומי מהיר ──────────────────────────────
  const localScore = analyzeActionability(normalizedTaskText);
  console.log("📊 ניקוד מקומי:", localScore);

  let localAnalysis;
  if (localScore === false || localScore < 5) {
    localAnalysis = { score: "red", label: "המשימה נראית רחבה מדי" };
  } else if (localScore < 10) {
    localAnalysis = { score: "yellow", label: "המשימה נראית רחבה מעט" };
  } else {
    localAnalysis = { score: "green", label: "המשימה נראית ממוקדת" };
  }

  // ── שלב 2: שליחה ל-AI לניתוח מעמיק ───────────────────────
  let aiValidation = null;
  let finalScore = localAnalysis.score;
  let finalLabel = localAnalysis.label;
  let finalExplanation = "";
  let source = "local";

  try {
    console.log("🤖 שולח ל-AI לאימות...");
    aiValidation = await aiService.sendQuery("VALIDATE_TASK", normalizedTaskText);

    if (aiValidation && aiValidation.score) {
      // ה-AI מנצח — הסיווג שלו מדויק יותר
      finalScore = aiValidation.score;
      finalLabel = aiValidation.label;
      finalExplanation = aiValidation.explanation || "";
      source = "ai";
      console.log(`✅ AI החליט: ${finalScore} — ${finalLabel}`);
    }
  } catch (error) {
    // ה-AI נכשל — ממשיכים עם התוצאה המקומית
    console.error("⚠️ AI validation נכשל, משתמשים בניתוח מקומי:", error);
    source = "local";
  }

  // ── שלב 3: אם אדום — מבקשים הצעת שיפור ────────────────────
  let aiSuggestion = null;

  if (finalScore === "red") {
    try {
      console.log("💡 מבקש הצעת שיפור מה-AI...");
      aiSuggestion = await aiService.sendQuery("SUGGEST_IMPROVEMENT", {
        taskText: normalizedTaskText,
        reason: finalLabel,
      });
    } catch (error) {
      console.error("⚠️ שגיאה בקבלת הצעת שיפור:", error);
      aiSuggestion = null;
    }
  }

  return {
    taskId: taskId,
    score: finalScore,
    label: finalLabel,
    explanation: finalExplanation,
    source: source,              // "local" | "ai" — שימושי לדיבאג
    aiSuggestion: aiSuggestion,  // { refinedText, explanation } | null
  };
}


// ============================================================
//  פונקציה 4: calculateBackwardTimeline
// ============================================================
function calculateBackwardTimeline(dueDate) {
  const finalDate =
    dueDate instanceof Date ? new Date(dueDate.getTime()) : new Date(dueDate);

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
    { name: "הבנת המשימה ובחירת מבנה", percentFromStart: 0.1 },
    { name: "בחירת מקורות", percentFromStart: 0.3 },
    { name: "איסוף מקורות", percentFromStart: 0.5 },
    { name: "כתיבת פסקה ראשונה", percentFromStart: 0.7 },
    { name: "עריכה וסיכום", percentFromStart: 0.9 },
    { name: "הגשה סופית", percentFromStart: 1.0 },
  ];

  const timeline = milestones.map((milestone) => {
    const daysFromNow = Math.round(totalDays * milestone.percentFromStart);
    const milestoneDate = new Date(today);
    milestoneDate.setDate(today.getDate() + daysFromNow);

    return {
      milestone: milestone.name,
      date: milestoneDate.toISOString().split("T")[0],
    };
  });

  return timeline;
}

function normalizeTimelineDate(dateValue) {
  const parsedDate =
    dateValue instanceof Date
      ? new Date(dateValue.getTime())
      : new Date(dateValue);

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
  if (
    !normalizedDate ||
    milestoneIndex < 0 ||
    milestoneIndex >= timeline.length
  ) {
    return timeline;
  }

  return timeline.map((milestone, index) => {
    if (index !== milestoneIndex) return milestone;
    return { ...milestone, date: normalizedDate };
  });
}

function createEditableTimelinePlan(dueDate) {
  return calculateBackwardTimeline(dueDate).map((milestone) => ({
    ...milestone,
    editable: true,
  }));
}


// ============================================================
//  פונקציה 5: requestAIAngles
// ============================================================
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
//  חשיפת הפונקציות
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

window.logicManager = logicManager;
export default logicManager;