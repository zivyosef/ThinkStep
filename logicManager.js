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
  };
}

async function initProject(rawText) {
  console.log('🔵 [logicManager] initProject התחיל, rawText:', rawText?.substring(0, 50));
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

  console.log('🔵 [logicManager] שולח ל-aiService.sendQuery...');
  console.log('🔵 [logicManager] aiService זמין?', typeof aiService, typeof aiService?.sendQuery);
  try {
    const currentState = await aiService.sendQuery(
      "DECOMPOSE_INITIAL",
      normalizedText,
      newState
    );
    console.log('🔵 [logicManager] תשובה מ-aiService:', currentState);

    if (!currentState) {
      handleError("לא התקבלה תגובה מהשרת. נסה שוב.");
      return null;
    }

    if (currentState.chunks && currentState.chunks.length > 0 && window.googleUserAccessToken) {
      const firstChunk = currentState.chunks[0];
      await checkAndSendDailyReminder(window.googleUserAccessToken, firstChunk);
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
 * שלב 2: שליחה ל-AI רק אם הציון אינו ברור (לא ירוק ברור)
 * שלב 3: אם "אדום" — מבקשים מה-AI הצעת שיפור (SUGGEST_IMPROVEMENT)
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

  // ── שלב 2: AI רק לציונים לא חד-משמעיים ─────────────────────
  // ציון גבוה (>=15) = ירוק ברור — אין צורך ב-AI
  const needsAI = localScore === false || localScore < 15;

  let finalScore = localAnalysis.score;
  let finalLabel = localAnalysis.label;
  let finalExplanation = "";
  let source = "local";

  if (needsAI) {
    try {
      console.log("🤖 שולח ל-AI לאימות...");
      const aiValidation = await aiService.sendQuery("VALIDATE_TASK", normalizedTaskText);

      if (aiValidation && aiValidation.score) {
        finalScore = aiValidation.score;
        finalLabel = aiValidation.label;
        finalExplanation = aiValidation.explanation || "";
        source = "ai";
        console.log(`✅ AI החליט: ${finalScore} — ${finalLabel}`);
      }
    } catch (error) {
      console.error("⚠️ AI validation נכשל, משתמשים בניתוח מקומי:", error);
    }
  } else {
    console.log("✅ ציון מקומי גבוה — מדלגים על AI validation");
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
    }
  }

  return {
    taskId: taskId,
    score: finalScore,
    label: finalLabel,
    explanation: finalExplanation,
    source: source,
    aiSuggestion: aiSuggestion,
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
//  פונקציה 6: analyzeDemandsAndCreateSubtasks
// ============================================================
async function analyzeDemandsAndCreateSubtasks(demandsText, context) {
  if (typeof demandsText !== "string" || !demandsText.trim()) {
    handleError("אנא הדבק את דרישות העבודה לפני הניתוח.");
    return [];
  }

  try {
    const result = await aiService.sendQuery("ANALYZE_DEMANDS", demandsText.trim(), context);
    if (!result || !Array.isArray(result)) return [];
    return result;
  } catch (error) {
    console.error("שגיאה בניתוח הדרישות:", error);
    return [];
  }
}

// ============================================================
//  פונקציות תוספת: ניהול התראות ויומן גוגל (צוות C)
// ============================================================
const CALENDAR_LAST_SENT_KEY = "decompose_calendar_last_sent";

async function addNotificationToGoogleCalendar(accessToken, taskDetails) {
  console.log('📅 [logicManager] מנסה ליצור תזכורת ביומן גוגל...');

  const today = new Date();
  const startTime = new Date(today.setHours(14, 0, 0, 0)).toISOString();
  const endTime = new Date(today.setHours(15, 0, 0, 0)).toISOString();

  const event = {
    summary: `🚀 משימה מהאפליקציה: ${taskDetails.title}`,
    description: `${taskDetails.description}\n\nאל תשכח להיכנס לאפליקציה ולסמן וי!`,
    start: { dateTime: startTime, timeZone: 'Asia/Jerusalem' },
    end: { dateTime: endTime, timeZone: 'Asia/Jerusalem' },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }]
    }
  };

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Google API Error: ${errorData.error.message}`);
    }

    const data = await response.json();
    console.log('✅ האירוע נוצר בהצלחה ביומן!', data.htmlLink);
    return data;
  } catch (error) {
    console.error('❌ שגיאה בסנכרון ליומן גוגל:', error);
    return null;
  }
}

async function checkAndSendDailyReminder(accessToken, currentChunk) {
  const lastSent = localStorage.getItem(CALENDAR_LAST_SENT_KEY);
  const now = new Date();

  if (lastSent) {
    const lastSentDate = new Date(lastSent);
    const hoursPassed = (now - lastSentDate) / (1000 * 60 * 60);
    
    if (hoursPassed < 24) {
      console.log(`⏳ התראה כבר נשלחה היום. עברו רק ${Math.round(hoursPassed)} שעות.`);
      return; 
    }
  }

  const success = await addNotificationToGoogleCalendar(accessToken, {
    title: currentChunk.title,
    description: currentChunk.description
  });

  if (success) {
    localStorage.setItem(CALENDAR_LAST_SENT_KEY, now.toISOString());
  }
}ס
// ============================================================
//  פונקציה 7: syncStateToStorage
// ============================================================
async function syncStateToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log("✅ State נשמר ב-localStorage:", state);
    if (window.supabaseHelpers) {
      const user = await window.supabaseHelpers.getCurrentUser();
      if (user) {
        await window.supabaseHelpers.saveTaskState(user.id, state);
        console.log("✅ State נשמר ב-Supabase");
      }
    }
  } catch (error) {
    console.error("שגיאה בשמירת state:", error);
  }
}


// ============================================================
//  פונקציה נוספת: loadStateFromStorage
// ============================================================
async function loadStateFromStorage() {
  if (window.supabaseHelpers) {
    try {
      const user = await window.supabaseHelpers.getCurrentUser();
      if (user) {
        const remoteState = await window.supabaseHelpers.loadTaskState(user.id);
        if (remoteState) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
          return remoteState;
        }
      }
    } catch (e) {
      console.warn("Supabase unavailable, falling back to localStorage:", e);
    }
  }
  try {
    const savedText = localStorage.getItem(STORAGE_KEY);
    if (!savedText) return null;
    return JSON.parse(savedText);
  } catch (error) {
    console.error("שגיאה בטעינת state מ-localStorage:", error);
    return null;
  }
}

// החשפת הפונקציות בגרסה המעודכנת
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
  analyzeDemandsAndCreateSubtasks,
  syncStateToStorage,
  loadStateFromStorage,
};

window.logicManager = logicManager;
export default logicManager;