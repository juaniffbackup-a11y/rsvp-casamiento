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
 * Arma la pestaña "Resumen": lo que Juani y Mica necesitan ver de un vistazo,
 * sin leer 275 filas y sin depender de que alguien corra un script.
 *
 * Correr UNA VEZ desde el editor (elegirla en el desplegable y dar Ejecutar).
 *
 * OJO con las formulas: setValues() escribe el texto literal, y en una planilla
 * en español el separador de argumentos es ';' y no ','. Por eso todo daba
 * #ERROR la primera vez. setFormula() SI traduce al idioma de la planilla,
 * asi que las formulas van por ahi, una por una.
 */
function armarResumen() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName('Resumen');
  if (h) libro.deleteSheet(h);
  h = libro.insertSheet('Resumen', 0);

  const R = "'" + HOJA + "'";

  // 1) los textos de la columna A
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

  // 2) las aclaraciones de la columna B
  h.getRange('B13').setValue('Si aparece alguien acá, mandó el formulario dos veces y sus cubiertos se están contando doble.');
  h.getRange('B17').setValue('Estas van SEPARADAS al salón. No son preferencias: son riesgo médico.');

  // 3) las formulas, UNA POR UNA con setFormula para que se traduzcan
  const f = {
    'B4':  `=SUMIF(${R}!D2:D,"Sí",${R}!E2:E)`,
    'B6':  `=COUNTA(${R}!B2:B)`,
    'B7':  `=COUNTIF(${R}!D2:D,"Sí")`,
    'B8':  `=COUNTIF(${R}!D2:D,"No")`,
    'B9':  `=IFERROR(INDEX(${R}!A2:A,COUNTA(${R}!A2:A)),"todavía ninguna")`,
    'B12': `=IFERROR(IF(COUNTA(${R}!B2:B)=0,"—",TEXTJOIN(", ",TRUE,FILTER(UNIQUE(${R}!B2:B),COUNTIF(${R}!B2:B,UNIQUE(${R}!B2:B))>1))),"ninguno")`,
    'B15': `=COUNTIF(${R}!H2:H,"Sí*")`,
    'B16': `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(${R}!B2:B&" — "&${R}!G2:G,LEFT(${R}!H2:H,2)="Sí")),"ninguna")`,
    'B20': `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(${R}!B2:B&" — "&${R}!F2:F,${R}!F2:F<>"",${R}!F2:F<>"Como de todo")),"ninguna")`,
    'B23': `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER("con "&${R}!B2:B&": "&${R}!I2:I,${R}!I2:I<>"")),"ninguna")`,
    'B26': `=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(${R}!B2:B&" — "&${R}!K2:K,${R}!K2:K<>"")),"ninguno")`
  };
  for (const celda in f) h.getRange(celda).setFormula(f[celda]);

  // 4) formato
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

  // console.log SIEMPRE funciona; getUi() revienta si no se corre con la
  // planilla abierta, que es lo que paso la primera vez.
  console.log('Resumen armado. Locale de la planilla: ' + libro.getSpreadsheetLocale());
}
