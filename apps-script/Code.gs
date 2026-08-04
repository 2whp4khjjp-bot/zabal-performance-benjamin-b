/**
 * API de Google Apps Script para Zabal Performance.
 * Despliegue como aplicación web ejecutada por el propietario.
 */
const SHEETS = {
  PLAYERS: 'Jugadores',
  MEASUREMENTS: 'Mediciones',
  SESSIONS: 'Sesiones',
  CONFIG: 'Configuración',
  CODES: 'Códigos jugadores',
  MATCHES: 'Partidos',
  MATCH_MINUTES: 'Minutos partidos',
};

const HEADERS = {
  Jugadores: ['id', 'nombre', 'dorsal', 'activo', 'orden', 'fecha_alta', 'pin_hash'],
  Mediciones: ['id', 'fecha', 'hora', 'fecha_hora', 'jugador_id', 'jugador_nombre', 'peso', 'fatiga', 'molestias', 'comentarios', 'sesion_id', 'creado_por', 'actualizado_en'],
  Sesiones: ['id', 'fecha', 'tipo_sesion', 'rival', 'jornada', 'activa', 'hora_apertura', 'hora_cierre'],
  Configuración: ['clave', 'valor'],
  'Códigos jugadores': ['jugador_id', 'jugador_nombre', 'pin'],
  Partidos: ['id', 'fecha', 'tipo', 'rival', 'duracion_minutos', 'creado_en', 'actualizado_en', 'creado_por'],
  'Minutos partidos': ['partido_id', 'jugador_id', 'jugador_nombre', 'minutos'],
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Zabal Performance')
    .addItem('Preparar estructura', 'setupProject')
    .addItem('Configurar PIN del cuerpo técnico', 'configurePinFromUi')
    .addItem('Generar PINs de jugadores', 'generatePlayerPinsFromUi')
    .addItem('Aplicar PINs editados', 'applyPlayerPinsFromUi')
    .addToUi();
}

function configurePinFromUi() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('PIN del cuerpo técnico', 'Introduce un PIN de 4 a 12 dígitos. Se guardará únicamente su hash.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  setStaffPin(response.getResponseText());
  ui.alert('PIN configurado correctamente.');
}

function generatePlayerPinsFromUi() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Generar PINs personales', 'Se crearán PINs nuevos para todos los jugadores activos. Los anteriores dejarán de funcionar. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;
  const count = generatePlayerPins_();
  ui.alert('Se han generado ' + count + ' PINs. Puedes verlos en la pestaña "Códigos jugadores".');
}

function applyPlayerPinsFromUi() {
  const ui = SpreadsheetApp.getUi();
  try {
    const count = applyPlayerPins_();
    ui.alert('PINs actualizados', 'Se han aplicado ' + count + ' PINs personales. Los jugadores deberán usar desde ahora los códigos escritos en la pestaña "Códigos jugadores".', ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('No se pudieron aplicar los PINs', error.message || String(error), ui.ButtonSet.OK);
  }
}

// Utilidad de administración para la primera puesta en marcha desde el editor.
function initializePlayerPins() {
  return generatePlayerPins_();
}

function doGet() {
  return json_({ ok: true, data: { service: 'Zabal Performance API', version: 3 } });
}

function doPost(event) {
  try {
    const input = JSON.parse(event.postData.contents || '{}');
    const action = String(input.action || '');
    if (action === 'authenticate') return json_({ ok: true, data: authenticate_(input.pin, input.role) });
    if (action === 'logout') return json_({ ok: true, data: logout_(input.token) });
    const session = requireSession_(input.token);
    if (action === 'getPlayers') return json_({ ok: true, data: getPlayers_(session) });
    if (action === 'getMeasurements') return json_({ ok: true, data: getMeasurements_(session) });
    if (action === 'getCurrentSession') return json_({ ok: true, data: getCurrentSession_() });
    if (action === 'saveMeasurement') return json_({ ok: true, data: saveMeasurement_(input.measurement, session) });
    if (action === 'getMatches') return json_({ ok: true, data: getMatches_(session) });
    if (action === 'saveMatch') return json_({ ok: true, data: saveMatch_(input.match, session) });
    throw apiError_('Acción no permitida.', 'INVALID_ACTION');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: error.message || 'Error interno.', code: error.code || 'SERVER_ERROR' });
  }
}

function setupProject() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Abre este script desde la hoja de cálculo antes de ejecutar la configuración.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheet.getId());
  Object.keys(HEADERS).forEach(function(name) { ensureSheet_(spreadsheet, name, HEADERS[name]); });
  ensureConfig_('nombre_equipo', 'Atlético Zabal Linense');
  ensureConfig_('temporada', '2026-27');
  ensureConfig_('duracion_sesion_minutos', '30');
  ensureConfig_('fatiga_moderada_desde', '4');
  ensureConfig_('fatiga_alerta_desde', '7');
  ensureConfig_('molestias_moderada_desde', '4');
  ensureConfig_('molestias_alerta_desde', '7');
  ensureConfig_('duracion_partido_minutos', '90');
  ensureAuthSecret_();
  return 'Estructura actualizada. Configura el PIN técnico y genera los PINs de jugadores desde el menú Zabal Performance.';
}

function setStaffPin(pin) {
  const clean = String(pin || '').trim();
  if (!/^\d{4,12}$/.test(clean)) throw new Error('El PIN debe contener entre 4 y 12 dígitos.');
  PropertiesService.getScriptProperties().setProperty('STAFF_PIN_SHA256', sha256_(clean));
  return 'PIN guardado como hash SHA-256.';
}

function authenticate_(pin, requestedRole) {
  const role = String(requestedRole || '') === 'player' ? 'player' : 'staff';
  const cleanPin = String(pin || '').trim();
  let player;
  if (role === 'staff') {
    const configured = PropertiesService.getScriptProperties().getProperty('STAFF_PIN_SHA256');
    if (!configured) throw apiError_('El PIN del cuerpo técnico todavía no está configurado.', 'CONFIG');
    if (sha256_(cleanPin) !== configured) throw apiError_('El PIN del cuerpo técnico no es correcto.', 'INVALID_PIN');
  } else {
    const pinHash = sha256_(cleanPin);
    const row = rows_(SHEETS.PLAYERS).find(function(item) { return boolean_(item.activo) && String(item.pin_hash || '') === pinHash; });
    if (!row) throw apiError_('El PIN de jugador no es correcto.', 'INVALID_PIN');
    player = { id: String(row.id), name: String(row.nombre) };
  }
  const duration = 30 * 60 * 1000;
  const payload = { role: role, playerId: player && player.id, playerName: player && player.name, exp: Date.now() + duration };
  return { token: signSession_(payload), expiresAt: payload.exp, role: role, playerId: payload.playerId, playerName: payload.playerName };
}

function logout_() { return true; }

function requireSession_(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || signature_(parts[0]) !== parts[1]) throw new Error('Firma no válida');
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    if (!payload.exp || payload.exp <= Date.now() || ['player', 'staff'].indexOf(payload.role) < 0) throw new Error('Sesión caducada');
    return payload;
  } catch (error) {
    throw apiError_('La sesión ha caducado. Vuelve a introducir el PIN.', 'UNAUTHORIZED');
  }
}

function requireStaff_(session) {
  if (!session || session.role !== 'staff') throw apiError_('Solo el cuerpo técnico puede acceder a los partidos.', 'FORBIDDEN');
}

function getPlayers_(session) {
  return rows_(SHEETS.PLAYERS).filter(function(row) { return boolean_(row.activo) && (!session || session.role === 'staff' || String(row.id) === String(session.playerId)); }).map(function(row) {
    return { id: String(row.id), name: String(row.nombre), number: numberOrNull_(row.dorsal), active: true, order: Number(row.orden || 0), joinedAt: dateKey_(row.fecha_alta) };
  }).sort(function(a, b) { return a.order - b.order; });
}

function getMeasurements_(session) {
  return rows_(SHEETS.MEASUREMENTS).filter(function(row) { return !session || session.role === 'staff' || String(row.jugador_id) === String(session.playerId); }).map(function(row) {
    const date = dateKey_(row.fecha);
    const createdAt = iso_(row.fecha_hora);
    return {
      id: String(row.id), date: date, time: String(row.hora), createdAt: createdAt,
      playerId: String(row.jugador_id), playerName: String(row.jugador_nombre),
      weight: numberOrNull_(row.peso), fatigue: numberOrNull_(row.fatiga), soreness: numberOrNull_(row.molestias),
      comments: String(row.comentarios || ''), sessionId: String(row.sesion_id),
      createdBy: String(row.creado_por || ''), updatedAt: iso_(row.actualizado_en),
    };
  });
}

function getMatches_(session) {
  requireStaff_(session);
  const minutesByMatch = {};
  rows_(SHEETS.MATCH_MINUTES).forEach(function(row) {
    const matchId = String(row.partido_id || '');
    if (!minutesByMatch[matchId]) minutesByMatch[matchId] = [];
    minutesByMatch[matchId].push({
      playerId: String(row.jugador_id),
      playerName: String(row.jugador_nombre),
      minutes: Number(row.minutos || 0),
    });
  });
  return rows_(SHEETS.MATCHES).map(function(row) {
    return {
      id: String(row.id),
      date: dateKey_(row.fecha),
      type: String(row.tipo) === 'friendly' ? 'friendly' : 'official',
      opponent: String(row.rival || ''),
      durationMinutes: Number(row.duracion_minutos || 90),
      minutes: minutesByMatch[String(row.id)] || [],
      createdAt: iso_(row.creado_en),
      updatedAt: iso_(row.actualizado_en),
      createdBy: String(row.creado_por || 'cuerpo-tecnico'),
    };
  }).sort(function(a, b) {
    return (b.date + b.createdAt).localeCompare(a.date + a.createdAt);
  });
}

function saveMatch_(input, session) {
  requireStaff_(session);
  if (!input) throw apiError_('Faltan los datos del partido.', 'VALIDATION');
  const date = String(input.date || '').trim();
  const type = String(input.type || '') === 'friendly' ? 'friendly' : String(input.type || '') === 'official' ? 'official' : '';
  const opponent = String(input.opponent || '').replace(/[<>]/g, '').trim().slice(0, 100);
  const duration = Number(input.durationMinutes);
  const entries = Array.isArray(input.minutes) ? input.minutes : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw apiError_('La fecha del partido no es válida.', 'VALIDATION');
  if (!type) throw apiError_('El tipo de partido no es válido.', 'VALIDATION');
  if (!opponent) throw apiError_('Introduce el rival.', 'VALIDATION');
  if (!Number.isInteger(duration) || duration < 1 || duration > 180) throw apiError_('La duración del partido no es válida.', 'VALIDATION');
  if (!entries.length) throw apiError_('Introduce los minutos de al menos un jugador.', 'VALIDATION');

  const players = getPlayers_({ role: 'staff' });
  const playersById = {};
  players.forEach(function(player) { playersById[player.id] = player; });
  const seen = {};
  const cleanEntries = entries.map(function(entry) {
    const playerId = String(entry.playerId || '');
    const player = playersById[playerId];
    const minutes = Number(entry.minutes);
    if (!player || player.name !== String(entry.playerName || '') || seen[playerId]) throw apiError_('Hay un jugador no válido o repetido.', 'INVALID_PLAYER');
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > duration) throw apiError_('Los minutos de ' + player.name + ' no son válidos.', 'VALIDATION');
    seen[playerId] = true;
    return { playerId: player.id, playerName: player.name, minutes: minutes };
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw apiError_('Hay muchos guardados a la vez. Inténtalo de nuevo en unos segundos.', 'BUSY');
  try {
    const id = Utilities.getUuid();
    const now = new Date();
    sheet_(SHEETS.MATCHES).appendRow([id, date, type, opponent, duration, now, now, 'cuerpo-tecnico']);
    const minuteRows = cleanEntries.map(function(entry) { return [id, entry.playerId, entry.playerName, entry.minutes]; });
    const minutesSheet = sheet_(SHEETS.MATCH_MINUTES);
    minutesSheet.getRange(minutesSheet.getLastRow() + 1, 1, minuteRows.length, minuteRows[0].length).setValues(minuteRows);
    return {
      id: id, date: date, type: type, opponent: opponent, durationMinutes: duration,
      minutes: cleanEntries, createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: 'cuerpo-tecnico',
    };
  } finally {
    lock.releaseLock();
  }
}

function getCurrentSession_() {
  const today = dateKey_(new Date());
  let row = rows_(SHEETS.SESSIONS).find(function(item) { return dateKey_(item.fecha) === today && boolean_(item.activa); });
  if (!row) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw apiError_('Hay muchas conexiones a la vez. Inténtalo de nuevo en unos segundos.', 'BUSY');
    try {
      row = rows_(SHEETS.SESSIONS).find(function(item) { return dateKey_(item.fecha) === today && boolean_(item.activa); });
      if (!row) {
        const now = new Date();
        row = { id: 'session-' + today, fecha: today, tipo_sesion: 'Entrenamiento', rival: '', jornada: '', activa: true, hora_apertura: now, hora_cierre: '' };
        sheet_(SHEETS.SESSIONS).appendRow([row.id, row.fecha, row.tipo_sesion, row.rival, row.jornada, row.activa, row.hora_apertura, row.hora_cierre]);
      }
    } finally { lock.releaseLock(); }
  }
  return { id: String(row.id), date: today, type: String(row.tipo_sesion), opponent: String(row.rival || ''), matchday: String(row.jornada || ''), active: true, openedAt: iso_(row.hora_apertura), closedAt: row.hora_cierre ? iso_(row.hora_cierre) : undefined };
}

function saveMeasurement_(input, session) {
  if (!input) throw apiError_('Faltan los datos de la medición.', 'VALIDATION');
  if (session.role === 'player' && String(session.playerId) !== String(input.playerId)) throw apiError_('No puedes guardar datos de otro jugador.', 'FORBIDDEN');
  const players = getPlayers_({ role: 'staff' });
  const player = players.find(function(item) { return item.id === String(input.playerId); });
  if (!player || player.name !== String(input.playerName)) throw apiError_('Jugador no válido.', 'INVALID_PLAYER');
  const hasWeight = hasValue_(input.weight);
  const hasFatigue = hasValue_(input.fatigue);
  const hasSoreness = hasValue_(input.soreness);
  const weight = hasWeight ? Number(input.weight) : undefined;
  const fatigue = hasFatigue ? Number(input.fatigue) : undefined;
  const soreness = hasSoreness ? Number(input.soreness) : undefined;
  if (hasWeight && !(weight >= 30 && weight <= 250)) throw apiError_('El peso no es válido.', 'VALIDATION');
  if ([fatigue, soreness].filter(hasValue_).some(function(value) { return !Number.isInteger(value) || value < 1 || value > 10; })) throw apiError_('Los valores deben estar entre 1 y 10.', 'VALIDATION');
  if (!hasWeight && !hasFatigue && !hasSoreness && !String(input.comments || '').trim()) throw apiError_('Rellena al menos un dato antes de guardar.', 'VALIDATION');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw apiError_('Hay muchos guardados a la vez. Tus datos siguen en el formulario; inténtalo de nuevo.', 'BUSY');
  try {
    const sheet = sheet_(SHEETS.MEASUREMENTS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const playerColumn = headers.indexOf('jugador_id');
    const dateColumn = headers.indexOf('fecha');
    const today = dateKey_(new Date());
    let rowIndex = -1;
    for (let index = 1; index < values.length; index += 1) {
      if (String(values[index][playerColumn]) === player.id && dateKey_(values[index][dateColumn]) === today) { rowIndex = index + 1; break; }
    }
    const now = new Date();
    const previous = rowIndex > 0 ? values[rowIndex - 1] : [];
    const previousId = rowIndex > 0 ? String(previous[0]) : '';
    const previousCreated = rowIndex > 0 ? previous[3] : now;
    const id = previousId || Utilities.getUuid();
    const comments = String(input.comments || '').replace(/[<>]/g, '').trim().slice(0, 500);
    const mergedWeight = hasWeight ? weight : numberOrNull_(previous[6]);
    const mergedFatigue = hasFatigue ? fatigue : numberOrNull_(previous[7]);
    const mergedSoreness = hasSoreness ? soreness : numberOrNull_(previous[8]);
    const createdBy = session.role === 'player' ? 'jugador:' + player.id : 'cuerpo-tecnico';
    const row = [id, today, Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'), previousCreated, player.id, player.name, blankIfUndefined_(mergedWeight), blankIfUndefined_(mergedFatigue), blankIfUndefined_(mergedSoreness), comments, String(input.sessionId || ''), createdBy, now];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return { id: id, date: today, time: row[2], createdAt: iso_(previousCreated), playerId: player.id, playerName: player.name, weight: mergedWeight, fatigue: mergedFatigue, soreness: mergedSoreness, comments: comments, sessionId: String(input.sessionId || ''), createdBy: createdBy, updatedAt: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function generatePlayerPins_() {
  const playersSheet = sheet_(SHEETS.PLAYERS);
  const values = playersSheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idColumn = headers.indexOf('id');
  const nameColumn = headers.indexOf('nombre');
  const activeColumn = headers.indexOf('activo');
  const pinColumn = headers.indexOf('pin_hash');
  if (pinColumn < 0) throw apiError_('Primero ejecuta "Preparar pestañas y datos demo" para actualizar la estructura.', 'CONFIG');
  const used = {};
  const codes = [];
  const pinHashes = values.slice(1).map(function(row) {
    if (!boolean_(row[activeColumn])) return [row[pinColumn] || ''];
    let pin;
    do { pin = String(Math.floor(Math.random() * 9000) + 1000); } while (used[pin]);
    used[pin] = true;
    codes.push([String(row[idColumn]), String(row[nameColumn]), pin]);
    return [sha256_(pin)];
  });
  if (pinHashes.length) playersSheet.getRange(2, pinColumn + 1, pinHashes.length, 1).setValues(pinHashes);
  const codesSheet = sheet_(SHEETS.CODES);
  codesSheet.clearContents();
  codesSheet.getRange(1, 1, 1, HEADERS[SHEETS.CODES].length).setValues([HEADERS[SHEETS.CODES]]);
  if (codes.length) codesSheet.getRange(2, 1, codes.length, codes[0].length).setValues(codes);
  if (codes.length) codesSheet.getRange(2, 3, codes.length, 1).setNumberFormat('@');
  codesSheet.setFrozenRows(1);
  codesSheet.getRange(1, 1, 1, 3).setBackground('#16365f').setFontColor('#ffffff').setFontWeight('bold');
  codesSheet.autoResizeColumns(1, 3);
  return codes.length;
}

function applyPlayerPins_() {
  const playersSheet = sheet_(SHEETS.PLAYERS);
  const playerValues = playersSheet.getDataRange().getValues();
  const playerHeaders = playerValues[0].map(String);
  const playerIdColumn = playerHeaders.indexOf('id');
  const playerNameColumn = playerHeaders.indexOf('nombre');
  const playerActiveColumn = playerHeaders.indexOf('activo');
  const playerPinColumn = playerHeaders.indexOf('pin_hash');
  if (playerPinColumn < 0) throw new Error('Primero ejecuta "Preparar pestañas y datos demo" para actualizar la estructura.');

  const activePlayers = {};
  playerValues.slice(1).forEach(function(row, index) {
    if (boolean_(row[playerActiveColumn])) activePlayers[String(row[playerIdColumn])] = { rowIndex: index + 2, name: String(row[playerNameColumn]) };
  });

  const codesSheet = sheet_(SHEETS.CODES);
  const codeValues = codesSheet.getDataRange().getValues();
  if (codeValues.length < 2) throw new Error('No hay códigos para aplicar. Genera los PINs primero.');
  const codeHeaders = codeValues[0].map(String);
  const codeIdColumn = codeHeaders.indexOf('jugador_id');
  const codePinColumn = codeHeaders.indexOf('pin');
  const seenPins = {};
  const pinsByPlayer = {};

  codeValues.slice(1).forEach(function(row, index) {
    const playerId = String(row[codeIdColumn] || '').trim();
    const pin = String(row[codePinColumn] || '').trim();
    if (!playerId && !pin) return;
    const rowNumber = index + 2;
    if (!activePlayers[playerId]) throw new Error('La fila ' + rowNumber + ' no corresponde a un jugador activo.');
    if (!/^\d{4,12}$/.test(pin)) throw new Error('El PIN de ' + activePlayers[playerId].name + ' debe tener entre 4 y 12 dígitos.');
    if (seenPins[pin]) throw new Error('El PIN ' + pin + ' está repetido en ' + seenPins[pin] + ' y ' + activePlayers[playerId].name + '.');
    if (pinsByPlayer[playerId]) throw new Error('El jugador ' + activePlayers[playerId].name + ' aparece más de una vez.');
    seenPins[pin] = activePlayers[playerId].name;
    pinsByPlayer[playerId] = pin;
  });

  Object.keys(activePlayers).forEach(function(playerId) {
    if (!pinsByPlayer[playerId]) throw new Error('Falta un PIN para ' + activePlayers[playerId].name + '.');
  });
  Object.keys(activePlayers).forEach(function(playerId) {
    playersSheet.getRange(activePlayers[playerId].rowIndex, playerPinColumn + 1).setValue(sha256_(pinsByPlayer[playerId]));
  });
  codesSheet.getRange(2, 3, Math.max(1, codesSheet.getLastRow() - 1), 1).setNumberFormat('@');
  return Object.keys(activePlayers).length;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
    headers.forEach(function(header) {
      if (existing.indexOf(header) < 0) {
        existing.push(header);
        sheet.getRange(1, existing.length).setValue(header);
      }
    });
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#16365f').setFontColor('#ffffff').setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
}

function ensureAuthSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('AUTH_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('AUTH_SECRET', secret);
  }
  return secret;
}

function signSession_(payload) {
  const encoded = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  return encoded + '.' + signature_(encoded);
}

function signature_(encoded) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(encoded, ensureAuthSecret_(), Utilities.Charset.UTF_8));
}

function ensureConfig_(key, value) {
  const sheet = sheet_(SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === key) return;
  }
  sheet.appendRow([key, value]);
}

function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw apiError_('La hoja de cálculo no está configurada.', 'CONFIG');
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw apiError_('Falta la pestaña ' + name + '.', 'CONFIG');
  return sheet;
}

function rows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row) {
    return headers.reduce(function(object, key, index) { object[key] = row[index]; return object; }, {});
  });
}

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(byte) { const unsigned = byte < 0 ? byte + 256 : byte; return unsigned.toString(16).padStart(2, '0'); }).join('');
}
function dateKey_(value) { return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function iso_(value) { return new Date(value).toISOString(); }
function boolean_(value) { return value === true || String(value).toLowerCase() === 'true' || value === 1; }
function numberOrNull_(value) { if (value === '' || value === null || value === undefined) return undefined; const number = Number(value); return Number.isFinite(number) ? number : undefined; }
function hasValue_(value) { return value !== '' && value !== null && value !== undefined; }
function blankIfUndefined_(value) { return value === undefined ? '' : value; }
function apiError_(message, code) { const error = new Error(message); error.code = code; return error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
