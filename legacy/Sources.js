/**
 * ============================================================
 * sources.js — Tavily via server proxy
 * ============================================================
 */

export async function fetchTavilySources(state, profile = null) {
  if (!state || !state.topic) {
    console.warn("⚠️ לא ניתן לחפש מקורות: חסר נושא (topic).");
    return [];
  }

  console.log(`🔍 Searching Tavily for topic: "${state.topic}"`);

  try {
    const response = await fetch("/api/tavily-sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        topic: state.topic,
        subject: state.subject || '',
        assignmentType: state.assignmentType || ''
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Tavily Error:", response.status, errorText);
      return [];
    }

    const data = await response.json();

    console.log("✅ Tavily Response:", data);

    return (Array.isArray(data) ? data : data.results || []).map(result => ({
      title: result.title || "מקור מידע",
      url: result.url || "#",
      content: result.content || ""
    }));

  } catch (error) {
    console.error("❌ Network Error:", error);
    return [];
  }
}

export function generateOptimizedQuery(state, profile) {
  const topic = state.topic || '';
  const subject = state.subject || '';
  const educationLevel = profile?.education_level || 'school';
  const mainLanguage = profile?.main_language || 'he';

  // בניית מחרוזת חיפוש נקייה מהצפת מילים מיותרות
  let queryParts = [`"${topic}"`];
  if (subject) queryParts.push(subject);
  
  const cleanQuery = queryParts.join(' ').trim().replace(/\s+/g, ' ');

  // הגדרת רשימת דומיינים מבוקרים ואיכותיים למניעת מקורות לא רלוונטיים
  let include_domains = [];

  if (mainLanguage === 'he') {
    if (educationLevel === 'college' || educationLevel === 'university') {
      // דומיינים אקדמיים ישראליים מובילים לסטודנטים
      include_domains = [
        "he.wikipedia.org", "wikipedia.org", "tau.ac.il", "huji.ac.il", 
        "technion.ac.il", "bgu.ac.il", "biu.ac.il", "haifa.ac.il", 
        "openu.ac.il", "nli.org.il", "researchgate.net"
      ];
    } else {
      // אתרי תוכן לימודי, מפוקח ומהימן לתלמידי בתי ספר ותיכון בישראל
      include_domains = [
        "he.wikipedia.org", "wikipedia.org", "cet.ac.il", "snunit.k12.il", 
        "edu.gov.il", "nli.org.il", "yadvashem.org"
      ];
    }
  } else {
    // הגדרות ברירת מחדל למשתמשי אנגלית
    if (educationLevel === 'college' || educationLevel === 'university') {
      include_domains = ["wikipedia.org", "britannica.com", "ncbi.nlm.nih.gov", "researchgate.net", "jstor.org"];
    } else {
      include_domains = ["wikipedia.org", "britannica.com", "khanacademy.org", "history.com"];
    }
  }

  // החזרת אובייקט מסודר עם השאילתה המנוקה והדומיינים הרלוונטיים
  return {
    query: cleanQuery,
    include_domains: include_domains
  };
}

export function renderSourcesToUI(sources) {
  const container = document.getElementById('sources-view');

  if (!container) {
    console.error("sources-view element not found");
    return;
  }

  if (!sources || sources.length === 0) {
    container.innerHTML =
      "<p style='color:#ef4444;'>לא נמצאו מקורות רלוונטיים.</p>";
    return;
  }

  container.innerHTML = '';

  sources.forEach(src => {
    const item = document.createElement('div');
    item.className = 'source-item';
    Object.assign(item.style, {
      borderRight: '4px solid #3b82f6',
      padding: '10px',
      margin: '10px 0',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '4px 8px 8px 4px'
    });

    const h4 = document.createElement('h4');
    h4.style.margin = '0 0 5px 0';

    const link = document.createElement('a');
    link.href = src.url || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.color = '#60a5fa';
    link.style.textDecoration = 'none';
    link.style.fontWeight = 'bold';
    link.textContent = src.title || 'מקור מידע';

    h4.appendChild(link);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'הצג תקציר';
    Object.assign(toggleBtn.style, {
      marginLeft: '10px',
      padding: '6px 8px',
      fontSize: '0.85em',
      cursor: 'pointer',
      borderRadius: '6px',
      border: '1px solid rgba(148,163,184,0.12)',
      background: 'rgba(255,255,255,0.02)',
      color: '#cbd5e1'
    });

    h4.appendChild(toggleBtn);

    const abstract = document.createElement('p');
    abstract.style.fontSize = '0.9em';
    abstract.style.color = '#cbd5e1';
    abstract.style.margin = '8px 0 0 0';
    abstract.style.lineHeight = '1.4';
    abstract.style.display = 'none';
    abstract.textContent = src.content ? src.content : '';

    toggleBtn.addEventListener('click', () => {
      const isHidden = abstract.style.display === 'none';
      abstract.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? 'הסתר תקציר' : 'הצג תקציר';
      toggleBtn.setAttribute('aria-expanded', String(isHidden));
    });

    item.appendChild(h4);
    item.appendChild(abstract);

    container.appendChild(item);
  });
}

function escapeHtml(str) {
  if (!str) return '';

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}