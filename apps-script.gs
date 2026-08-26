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
