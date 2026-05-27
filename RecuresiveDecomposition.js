function updateQualityMeter() {
  const topic = document.getElementById('topic').value.trim();
  const background = document.getElementById('background').value.trim();
  let score = 50;

  if (!topic && !background) {
    score = 10;
  } else {
    if (topic) score += 15;
    if (background) score += 15;
    score += Math.min(20, Math.floor((topic.length + background.length) / 20));
  }

  score = Math.max(0, Math.min(100, score));
  const scoreBar = document.getElementById('score_bar');
  scoreBar.style.width = score + '%';
  scoreBar.style.background = score < 33 ? '#e74c3c' : (score <= 66 ? '#f1c40f' : '#2ecc71');
  document.getElementById('score_label').textContent = score + '%';
}

function submitPrompt() {
  const topic = document.getElementById('topic').value.trim();
  const background = document.getElementById('background').value.trim();

  if (!topic && !background) {
    document.getElementById('prompt_output').textContent = 'יש להזין נושא ורקע כדי ליצור פרומפט.';
    return;
  }

  const promptText = 'נושא העבודה: ' + (topic || 'לא הוזן') + '\n' +
                     'רקע על העבודה: ' + (background || 'לא הוזן');
  document.getElementById('prompt_output').textContent = promptText;
}
