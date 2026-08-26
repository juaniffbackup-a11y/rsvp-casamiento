/**
 * Recibe las confirmaciones de la web y las escribe en la planilla.
 * Pegar en Extensiones > Apps Script de un Google Sheet nuevo.
 */

const HOJA = 'Respuestas';

const COLUMNAS = ['fecha','nombre','contacto','asiste','cuantos','dieta',
                  'detalle','severa','dietaAcomp','menores','menoresDetalle',
                  'accesibilidad','cancion','extra','mensaje'];

function doPost(e) {
  // Sin lock, dos invitados que confirman en el mismo segundo se pisan la fila.
  // Con 275 personas recibiendo el link a la vez, eso pasa de verdad.
  //
  // Medido el 26/08/2026 con 30 envios simultaneos: el ultimo de la cola
  // espero 27,8 s. Con 30000 estabamos a dos segundos de que empezara a
  // fallar. 60 s da margen para un pico mayor sin acercarse al limite de
  // 6 minutos por ejecucion que impone Apps Script.
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = libro.getSheetByName(HOJA);
    if (!hoja) hoja = libro.insertSheet(HOJA);
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(COLUMNAS);
      hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    const d = JSON.parse(e.postData.contents);
    hoja.appendRow(COLUMNAS.map(c => d[c] || ''));
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // queda en el log de ejecuciones de Apps Script
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lo usa el latido de vigilancia, y sirve para probar el deploy a mano.
 *
 * No alcanza con responder "estoy vivo": eso lo hace Apps Script aunque el
 * script no pueda tocar la planilla. Aca se intenta LEER la hoja de verdad,
 * que es lo mismo que hace falta para escribirla. Si esto responde ok, el
 * POST tambien va a poder guardar.
 */
function doGet() {
  try {
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      hoja: HOJA,
      existe: !!hoja,
      confirmaciones: hoja ? Math.max(0, hoja.getLastRow() - 1) : 0
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, error: String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * Arma la pestaña "Resumen". Correr UNA VEZ desde el editor.
 *
 * EL PROBLEMA DEL SEPARADOR (26/08/2026, dos intentos fallidos):
 * en una planilla en español el separador de argumentos es ';' y no ','.
 * Ni setValues() ni setFormula() traducen: escriben el texto tal cual, y
 * todo lo que tuviera mas de un argumento daba #ERROR. COUNTA funcionaba
 * de casualidad, porque lleva uno solo.
 * Solucion: se lee el locale de la planilla y se arma el separador correcto.
 */
function armarResumen() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const loc = libro.getSpreadsheetLocale();          // ej: 'es_ES', 'en_US'
  const C = loc.toLowerCase().indexOf('en_') === 0 ? ',' : ';';

  let h = libro.getSheetByName('Resumen');
  if (h) libro.deleteSheet(h);
  h = libro.insertSheet('Resumen', 0);

  const R = "'" + HOJA + "'";
  const B = R + '!B2:B', D = R + '!D2:D', E = R + '!E2:E';
  const F = R + '!F2:F', G = R + '!G2:G', H = R + '!H2:H';
  const I = R + '!I2:I', K = R + '!K2:K', A = R + '!A2:A';

  const textos = [
    ['CONFIRMACIONES'], ['Mica & Juani · 28 de noviembre de 2026'], [''],
    ['CUBIERTOS CONFIRMADOS'], [''],
    ['Respuestas recibidas'], ['Confirmaron que vienen'], ['Dijeron que no'],
    ['Última respuesta'], [''],
    ['REVISAR'], ['Nombres repetidos'], [''], [''],
    ['ALERGIAS SEVERAS'], [''], [''], [''],
    ['OTRAS RESTRICCIONES'], [''], [''],
    ['DE LOS ACOMPAÑANTES'], [''], [''],
    ['VIENEN CON CHICOS'], ['']
  ];
  h.getRange(1, 1, textos.length, 1).setValues(textos);
  h.getRange('B13').setValue('Si aparece alguien acá, mandó el formulario dos veces y sus cubiertos se están contando doble.');
  h.getRange('B17').setValue('Estas van SEPARADAS al salón. No son preferencias: son riesgo médico.');

  const f = {
    'B4':  `=SUMIF(${D}${C}"Sí"${C}${E})`,
    'B6':  `=COUNTA(${B})`,
    'B7':  `=COUNTIF(${D}${C}"Sí")`,
    'B8':  `=COUNTIF(${D}${C}"No")`,
    'B9':  `=IFERROR(INDEX(${A}${C}COUNTA(${A}))${C}"todavía ninguna")`,
    'B12': `=IFERROR(IF(COUNTA(${B})=0${C}"—"${C}TEXTJOIN(", "${C}TRUE${C}FILTER(UNIQUE(${B})${C}COUNTIF(${B}${C}UNIQUE(${B}))>1)))${C}"ninguno")`,
    'B15': `=COUNTIF(${H}${C}"Sí*")`,
    'B16': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&" — "&${G}${C}LEFT(${H}${C}2)="Sí"))${C}"ninguna")`,
    'B20': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&" — "&${F}${C}${F}<>""${C}${F}<>"Como de todo"))${C}"ninguna")`,
    'B23': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER("con "&${B}&": "&${I}${C}${I}<>""))${C}"ninguna")`,
    'B26': `=IFERROR(TEXTJOIN(CHAR(10)${C}TRUE${C}FILTER(${B}&" — "&${K}${C}${K}<>""))${C}"ninguno")`
  };
  for (const celda in f) h.getRange(celda).setFormula(f[celda]);

  h.setColumnWidth(1, 230);
  h.setColumnWidth(2, 560);
  h.getRange('A1').setFontSize(16).setFontWeight('bold');
  h.getRange('A2').setFontStyle('italic').setFontColor('#666666');
  h.getRange('A4:B4').setFontWeight('bold').setFontSize(14).setBackground('#F0E9DB');
  ['A11', 'A15', 'A19', 'A22', 'A25'].forEach(c =>
    h.getRange(c).setFontWeight('bold').setFontColor('#571E21'));
  h.getRange('A15:B15').setBackground('#F8E0E0');
  h.getRange('B13').setFontSize(9).setFontStyle('italic').setFontColor('#888888');
  h.getRange('B17').setFontSize(9).setFontStyle('italic').setFontColor('#888888');
  h.getRange('B1:B30').setWrap(true).setVerticalAlignment('top');
  h.setFrozenRows(2);

  // se deja constancia de con que separador se armo, para no volver a adivinar
  console.log('Resumen armado. Locale: ' + loc + ' | separador usado: "' + C + '"');
  console.log('Ejemplo de formula generada: ' + f['B7']);
}
