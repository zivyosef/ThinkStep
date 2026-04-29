/**
 * ============================================================
 *  logicManager.js  —  צוות C: אלון ומאיר
 * ============================================================
 *
 *  מה האחריות שלכם?
 *  -----------------
 *  אתם ה"מנהלים" של האתר. אתם לא מצייר כלום על המסך (זה צוות B),
 *  ואתם לא מדברים עם ה-AI ישירות (זה צוות D).
 *  אתם באמצע — מקבלים מידע מהמשתמש, מחליטים מה לעשות איתו,
 *  ושולחים לכל מי שצריך.
 *
 *  תחשבו על עצמכם כמו מנהל משרד:
 *    - הלקוח (המשתמש) אומר לכם מה הוא רוצה
 *    - אתם בודקים אם זה הגיוני
 *    - אם צריך AI — אתם שולחים לצוות D ומחכים לתשובה
 *    - אתם שומרים הכל ב-localStorage כדי שלא יאבד
 *    - אתם מעבירים את התוצאה לצוות B שיציג אותה
 *
 *  הקבצים שאתם משתמשים בהם:
 *    - aiService.js (צוות D) — לכל מה שקשור ל-AI
 *    - main.js (צוות A) — הם קוראים לפונקציות שלכם
 *
 *  איך תריצו את הקוד?
 *    פתחו את index.html עם Live Server ב-VS Code.
 *    פתחו את כלי המפתחים (F12) ולחצו על "Console"
 *    כדי לראות הודעות שגיאה ותוצאות.
 *
 * ============================================================
 */

// ============================================================
//  חיבור לצוות D
//  אנחנו "מייבאים" את הפונקציה הראשית של צוות D.
//  זה אומר: כשנרצה לשאול את ה-AI משהו,
//  נשתמש בפונקציה aiService.sendQuery(...)
// ============================================================

// שימו לב: הקובץ aiService.js חייב להיות נטען לפני הקובץ הזה ב-HTML!
// צוות A ידאג לסדר הנכון ב-index.html

// ============================================================
//  מפתח השמירה ב-localStorage
//  זהו השם תחתיו נשמור את כל המידע של האפליקציה.
//  אסור לשנות את השם הזה — כל הצוותות משתמשים בו!
// ============================================================
const STORAGE_KEY = "decompose_app_state";


// ============================================================
//  פונקציה 1: initProject
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * זו הפונקציה הראשונה שרצה כשהמשתמש מגיש את המשימה שלו.
 * היא מקבלת את המשפט שהמשתמש כתב ויוצרת את ה"מקבץ" (Chunk)
 * הראשי של הפרויקט.
 *
 * קלט:
 *   rawText (string) — המשפט שהמשתמש כתב, למשל:
 *   "יש לי עבודה בהיסטוריה על המהפכה הצרפתית"
 *
 * פלט צפוי (object):
 *   {
 *     mainChunk: { title: "...", description: "..." },
 *     subTasks:  [ { id, title, description }, ... ],
 *     status:    "ready"
 *   }
 *
 * מי קורא לה?
 *   צוות A קורא לפונקציה הזו כשהמשתמש לוחץ על כפתור "שמור משימה"
 */
async function initProject(rawText) {

  // TODO שלב 1: בדקו שהקלט אינו ריק
  // אם rawText ריק, החזירו null והדפיסו שגיאה ל-console
  // דוגמה:
  //   if (!rawText || rawText.trim() === "") {
  //     console.error("שגיאה: לא הוזן טקסט");
  //     return null;
  //   }

  // TODO שלב 2: שלחו בקשה לצוות D לפרק את המשימה
  // השתמשו בפונקציה sendQuery שצוות D כתבו.
  // הכוונה היא: "היי AI, פרק לי את המשימה הזו לחלקים"
  // דוגמה:
  //   const aiResult = await aiService.sendQuery("DECOMPOSE_INITIAL", rawText);

  // TODO שלב 3: בנו את אובייקט ה-State הראשוני
  // State זה "המצב" של האפליקציה — כל המידע שמגדיר מה קורה עכשיו
  // דוגמה לאיך הוא צריך להיראות:
  //   const newState = {
  //     mainChunk: { title: rawText, description: aiResult.summary },
  //     subTasks:  aiResult.chunks,   // מה שצוות D החזיר
  //     createdAt: new Date().toISOString()
  //   };

  // TODO שלב 4: שמרו את ה-State ב-localStorage
  // קראו לפונקציה syncStateToStorage שכתבתם למטה
  // דוגמה:
  //   syncStateToStorage(newState);

  // TODO שלב 5: החזירו את ה-State כדי שצוות B יוכל להציג אותו
  //   return newState;
}


// ============================================================
//  פונקציה 2: analyzeActionability
// ============================================================
/**
 * מה היא עושה?
 * -------------
 * "הרמזור" של האתר — בודקת אם משימה ספציפית ניתנת לביצוע
 * או שהיא רחבה מדי.
 * זו פונקציה שלא צריכה AI — היא עובדת עם כללים פשוטים.
 *
 * קלט:
 *   taskText (string) — טקסט המשימה, למשל "לכתוב את כל העבודה"
 *
 * פלט צפוי (object):
 *   {
 *     score:      "red" | "yellow" | "green",
 *     label:      "רחב מדי" | "בינוני" | "מוכן לביצוע",
 *     suggestion: "נסה לחלק את המשימה ל..."
 *   }
 *
 * מי קורא לה?
 *   הפונקציה handleTaskValidation קוראת לה (ראו למטה)
 */
function analyzeActionability(taskText) {

  // TODO שלב 1: הגדירו רשימות של מילות מפתח
  // מילים שמעידות על משימה רחבה מדי (אדום):
  //   const redWords = ["הכל", "לסיים", "לעשות", "כולו", "כל העבודה"];
  //
  // מילים שמעידות על משימה קטנה וברורה (ירוק):
  //   const greenWords = ["לכתוב פסקה", "לקרוא מקור", "לחפש 2", "לסכם"];

  // TODO שלב 2: עברו על המילים ובדקו אם הטקסט מכיל אותן
  // טיפ: השתמשו ב-taskText.includes("מילה") לבדיקה
  // דוגמה:
  //   const text = taskText.toLowerCase();
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
  analyzeActionability,
  handleTaskValidation,
  calculateBackwardTimeline,
  requestAIAngles,
  syncStateToStorage,
  loadStateFromStorage,
};
