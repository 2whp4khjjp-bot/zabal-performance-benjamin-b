import { appConfig } from '../config';
import type { Measurement, Player, ReportKind } from '../types';
import { todayKey, startOfWeekKey } from '../utils/date';
import { getAlertLevel } from '../utils/measurements';

type ReportOptions = { kind: ReportKind; measurements: Measurement[]; players: Player[]; playerId?: string };

const reportTitle: Record<ReportKind, string> = {
  daily: 'Informe de la sesión',
  weekly: 'Informe semanal',
  player: 'Informe individual',
  alerts: 'Informe de alertas',
};

export const generatePdfReport = async ({ kind, measurements, players, playerId }: ReportOptions) => {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  let items = [...measurements];
  if (kind === 'daily') items = items.filter((item) => item.date === todayKey());
  if (kind === 'weekly') items = items.filter((item) => item.date >= startOfWeekKey());
  if (kind === 'player') items = items.filter((item) => item.playerId === playerId).slice(-30);
  if (kind === 'alerts') items = items.filter((item) => getAlertLevel(item) === 'alert');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(22, 54, 95);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setFillColor(246, 202, 59);
  doc.rect(0, 35, 210, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('ZABAL PERFORMANCE', 14, 15);
  doc.setFontSize(10);
  doc.text(`${reportTitle[kind]} · Temporada ${appConfig.season}`, 14, 24);
  doc.setTextColor(35, 49, 66);
  doc.setFontSize(9);
  doc.text(`${appConfig.teamName} · Generado ${new Date().toLocaleString('es-ES')}`, 14, 46);

  const registered = new Set(items.map((item) => item.playerId)).size;
  const alerts = items.filter((item) => getAlertLevel(item) === 'alert').length;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Mediciones: ${items.length}   Jugadores: ${registered}/${players.length}   Alertas: ${alerts}`, 14, 57);

  let tableStartY = 64;
  if (items.length) {
    const fatigueValues = items.map((item) => item.fatigue).filter((value): value is number => value !== undefined);
    const sorenessValues = items.map((item) => item.soreness).filter((value): value is number => value !== undefined);
    const fatigueAverage = fatigueValues.length ? fatigueValues.reduce((sum, value) => sum + value, 0) / fatigueValues.length : 0;
    const sorenessAverage = sorenessValues.length ? sorenessValues.reduce((sum, value) => sum + value, 0) / sorenessValues.length : 0;
    const chartItems = [
      { label: 'Fatiga media', value: fatigueAverage, color: [216, 159, 17] as [number, number, number] },
      { label: 'Molestias media', value: sorenessAverage, color: [200, 66, 79] as [number, number, number] },
    ];
    chartItems.forEach((chart, index) => {
      const x = 14 + index * 94;
      doc.setFontSize(8);
      doc.setTextColor(90, 103, 118);
      doc.text(`${chart.label}: ${chart.value.toFixed(1)}`, x, 67);
      doc.setFillColor(229, 235, 241);
      doc.roundedRect(x, 70, 82, 4, 2, 2, 'F');
      doc.setFillColor(...chart.color);
      doc.roundedRect(x, 70, Math.max(2, 82 * (chart.value / 10)), 4, 2, 2, 'F');
    });
    tableStartY = 82;
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [['Fecha', 'Jugador', 'Peso', 'Fatiga', 'Molestias', 'Comentarios']],
    body: items
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => [item.date, item.playerName, item.weight !== undefined ? `${item.weight} kg` : '—', item.fatigue ?? '—', item.soreness ?? '—', item.comments || '—']),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 54, 95], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 34 }, 2: { cellWidth: 18 }, 3: { cellWidth: 14 }, 4: { cellWidth: 17 } },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Zabal Performance · ${reportTitle[kind]}`, 14, 290);
      doc.text(`Página ${data.pageNumber}`, 190, 290, { align: 'right' });
    },
  });

  if (!items.length) {
    doc.setFont('helvetica', 'normal');
    doc.text('No hay mediciones para los filtros de este informe.', 14, 76);
  }
  doc.save(`zabal-${kind}-${todayKey()}.pdf`);
};
