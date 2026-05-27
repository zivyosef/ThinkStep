function show() {
  const subject = document.getElementById('subject').value;
  const topic = document.getElementById('topic').value;
  const pages = document.getElementById('pages').value;
  const date = document.getElementById('date').value;

  document.getElementById('out').innerHTML =
    'מקצוע: ' + subject + '   ' +
    'נושא: ' + topic + '    ' +
    'עמודים: ' + pages + ' <br> ' +
    'תאריך: ' + date;
}
