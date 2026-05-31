import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

function flattenTasks(tasks, depth = 0, result = []) {
  for (const task of tasks) {
    result.push({ task, depth });
    if (task.children?.length) flattenTasks(task.children, depth + 1, result);
  }
  return result;
}

function timeLabel(task) {
  if (!task.timeBlockStart) return '';
  return `   [${task.timeBlockStart}–${task.timeBlockEnd}]`;
}

export async function exportTaskReport(tasks, projectMeta) {
  const flat = flattenTasks(tasks);
  const totalTasks = flat.length;
  const doneTasks = flat.filter(({ task }) => task.completed).length;
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const headingStyles = {
    0: HeadingLevel.HEADING_1,
    1: HeadingLevel.HEADING_2,
    2: undefined,
  };

  const taskParagraphs = flat.map(({ task, depth }) => {
    const checkmark = task.completed ? '✓  ' : '○  ';
    return new Paragraph({
      heading: headingStyles[depth],
      indent: { left: depth * 720 },
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: checkmark,
          color: task.completed ? '16A34A' : '9CA3AF',
          bold: depth === 0,
        }),
        new TextRun({
          text: task.title,
          bold: depth === 0,
          strike: task.completed,
        }),
        new TextRun({
          text: timeLabel(task),
          color: '3B82F6',
          size: 18,
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          text: projectMeta.title || 'דוח משימות',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun(`תאריך יעד: ${projectMeta.dueDate || '—'}   |   תלמיד: ${projectMeta.studentName || '—'}`),
          ],
        }),
        new Paragraph({ text: '' }),
        ...taskParagraphs,
        new Paragraph({ text: '' }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: '── סיכום ──────────────────────────', bold: true }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun(`הושלם: ${doneTasks} / ${totalTasks} משימות (${pct}%)`),
          ],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${(projectMeta.title || 'report').replace(/\s+/g, '-')}-report.docx`;
  saveAs(blob, filename);
}
