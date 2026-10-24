import type { MatchRecord, Player } from '../types';
import type { MatchSort } from '../utils/matchSort';
import { appConfig } from '../config';

export type MatchMinutesTotal = {
  player: Player;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
};

type Options = { totals: MatchMinutesTotal[]; matches: MatchRecord[]; sortBy: MatchSort };

const sortDescription: Record<MatchSort, string> = {
  number: 'Dorsal (de menor a mayor)',
  name: 'Jugador (alfabético)',
  minutes: 'Minutos (de mayor a menor)',
  goals: 'Goles (de mayor a menor)',
  starts: 'Titularidades (de mayor a menor)',
  appearances: 'Partidos (de mayor a menor)',
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

export async function buildMatchMinutesPdf({ totals, matches, sortBy }: Options) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const dates = matches.map((match) => match.date).sort();
  const period = dates.length ? `${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])}` : 'Sin partidos';
  const generated = new Date().toLocaleDateString('es-ES');
  const totalMinutes = totals.reduce((sum, item) => sum + item.minutes, 0);

  doc.setFillColor(22, 54, 95);
  doc.rect(0, 0, 210, 39, 'F');
  doc.setFillColor(246, 202, 59);
  doc.rect(0, 39, 210, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('ZABAL PERFORMANCE', 14, 15);
  doc.setFontSize(12);
  doc.text('Minutos jugados', 14, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${appConfig.teamName} | Temporada ${appConfig.season}`, 14, 35);

  doc.setTextColor(33, 52, 74);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${matches.length} partidos     ${totals.length} jugadores     ${totalMinutes} minutos`, 14, 53);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Periodo: ${period}     Orden: ${sortDescription[sortBy]}`, 14, 61);
  doc.text(`Generado: ${generated}`, 14, 67);

  autoTable(doc, {
    startY: 74,
    margin: { left: 14, right: 14, top: 50, bottom: 20 },
    head: [['#', 'Dorsal', 'Jugador', 'Partidos', 'Tit.', 'Minutos', 'Goles']],
    body: totals.map((item, index) => [index + 1, item.player.number ?? '-', item.player.name, item.appearances, item.starts, item.minutes, item.goals]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.8, minCellWidth: 0, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [22, 54, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 251] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 67 },
      3: { cellWidth: 21, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 29, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 23, halign: 'center' },
    },
    rowPageBreak: 'avoid',
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) {
        doc.setFillColor(22, 54, 95);
        doc.rect(0, 0, 210, 31, 'F');
        doc.setFillColor(246, 202, 59);
        doc.rect(0, 31, 210, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('ZABAL PERFORMANCE | Minutos jugados', 14, 17);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${appConfig.teamName} | ${appConfig.season} | Orden: ${sortDescription[sortBy]}`, 14, 25);
      }
      doc.setDrawColor(222, 229, 236);
      doc.line(14, 283, 196, 283);
      doc.setTextColor(100, 114, 130);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Fuente: actas de partidos registradas en Zabal Performance', 14, 289);
      doc.text(`Página ${pageNumber}`, 196, 289, { align: 'right' });
    },
  });

  return doc;
}

export async function downloadMatchMinutesPdf(options: Options) {
  const doc = await buildMatchMinutesPdf(options);
  doc.save(`zabal-minutos-jugados-${appConfig.season}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
