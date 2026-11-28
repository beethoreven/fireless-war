/**
 * 願浮沉2:無火戰爭 —— 場次檔案建立橋樑
 *
 * 部署方式:
 *   1. 左側「專案設定」->「指令碼屬性」,新增下面四個屬性(值只存在這裡,不寫進程式碼):
 *        SECRET            呼叫這支腳本的密語,一串夠長、夠隨機的字串(用密碼產生器),
 *                          跟後端的環境變數 FIRELESS_WAR__APPS_SCRIPT_SECRET 完全一致
 *        FOLDER_ID         新檔案要放進的資料夾 ID
 *        TEMPLATE_ID       Template 檔案的 ID
 *        DEMO_TEMPLATE_ID  FirelessWar_Demo 這份 Sheet 的 ID(demo 專用的範本,不是正式版 Template)
 *   2. 上方選單「部署」->「新增部署作業」
 *   3. 類型選「網頁應用程式」
 *   4. 執行身分:我
 *   5. 誰可以存取:知道連結的任何人
 *      (因為要讓後端從外部用 HTTP 呼叫,無法用 Google 帳號登入驗證,
 *       所以下面用 SECRET 這組密語自己做驗證,請求沒帶對就直接拒絕)
 *   6. 部署後會拿到一個網址,格式類似:
 *      https://script.google.com/macros/s/AKfycb.../exec
 *      這組網址跟 SECRET,都要存進後端的環境變數,不要寫死在程式碼裡。
 *   7. 「觸發條件」新增一個時間驅動的觸發器執行 cleanupOldDemoFiles(例如每小時),
 *      demo 副本才會定期清掉。
 *
 * 用途:
 *   後端打 POST 請求過來,帶 datetime 參數,這支腳本複製 Template
 *   建立新檔案,回傳新檔案的 spreadsheet_id。
 *   Demo 版本(body.mode === "demo")複製的是 FirelessWar_Demo,不是 Template,
 *   檔名是 "FirelessWar_Demo_" + datetime,見 handleDemoCreate() 的說明。
 */

// 讀「指令碼屬性」裡的設定;沒設定就丟錯,不會用空值繼續跑。
function setting(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error("指令碼屬性 " + name + " 還沒設定");
  }
  return value;
}

const FILENAME_PREFIX = "FirelessWar_";

// ---- 以下為 Demo 版本專用 ----
// demo 場次檔名前綴,跟正式版 FILENAME_PREFIX 一樣後面直接接 datetime,
// 例如 FirelessWar_Demo_2026_11_02_10_00。要跟後端 config.py 的
// DEMO_RECORD_FILENAME_PREFIX 完全一致,後端才查得到。
const DEMO_FILENAME_PREFIX = "FirelessWar_Demo_";

// 超過這個時數的 demo 副本會被 cleanupOldDemoFiles() 丟進垃圾桶
const DEMO_CLEANUP_HOURS = 24;


function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // SECRET 沒設定時 setting() 會丟錯,落到下面的 catch,不會放行。
    if (body.secret !== setting("SECRET")) {
      return jsonResponse({ error: "密語不正確" }, 403);
    }

    // Demo 走獨立分支;正式版後端從不送 mode,下面正式版的邏輯完全不受影響。
    if (body.mode === "demo") {
      return handleDemoCreate(body);
    }

    const datetimeStr = body.datetime;
    if (!datetimeStr || !/^\d{4}_\d{2}_\d{2}_\d{2}_\d{2}$/.test(datetimeStr)) {
      return jsonResponse({ error: "datetime 參數格式不正確" }, 400);
    }

    const filename = FILENAME_PREFIX + datetimeStr;
    const folder = DriveApp.getFolderById(setting("FOLDER_ID"));
    const templateFile = DriveApp.getFileById(setting("TEMPLATE_ID"));

    const newFile = templateFile.makeCopy(filename, folder);

    // 加編輯者這步刻意跟「建立檔案」分開包一層 try/catch:
    // 檔案本身已經建立成功了,不該因為 email 格式有誤或其他授權小問題,
    // 就讓整個請求判定失敗、白白浪費一次複製動作。
    // 失敗時只在回應裡帶一個 warning,由後端/前端自行決定要不要提醒使用者。
    let editorWarning = null;
    const editorEmail = body.editor_email;
    if (editorEmail) {
      try {
        newFile.addEditor(editorEmail);
      } catch (editorErr) {
        editorWarning = "檔案已建立,但加入編輯者失敗:" + editorErr.message;
      }
    }

    const result = { spreadsheet_id: newFile.getId() };
    if (editorWarning) {
      result.warning = editorWarning;
    }

    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse({ error: "建立場次檔案時發生錯誤:" + err.message }, 500);
  }
}


/**
 * Demo 版本專用:流程跟上面 doPost 的正式版分支一模一樣,
 * 只差在複製的是 FirelessWar_Demo,檔名前綴是 DEMO_FILENAME_PREFIX。
 */
function handleDemoCreate(body) {
  try {
    const datetimeStr = body.datetime;
    if (!datetimeStr || !/^\d{4}_\d{2}_\d{2}_\d{2}_\d{2}$/.test(datetimeStr)) {
      return jsonResponse({ error: "datetime 參數格式不正確" }, 400);
    }

    const filename = DEMO_FILENAME_PREFIX + datetimeStr;
    const folder = DriveApp.getFolderById(setting("FOLDER_ID"));
    const templateFile = DriveApp.getFileById(setting("DEMO_TEMPLATE_ID"));

    const newFile = templateFile.makeCopy(filename, folder);

    let editorWarning = null;
    const editorEmail = body.editor_email;
    if (editorEmail) {
      try {
        newFile.addEditor(editorEmail);
      } catch (editorErr) {
        editorWarning = "檔案已建立,但加入編輯者失敗:" + editorErr.message;
      }
    }

    const result = { spreadsheet_id: newFile.getId() };
    if (editorWarning) {
      result.warning = editorWarning;
    }

    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse({ error: "建立 Demo 檔案時發生錯誤:" + err.message }, 500);
  }
}


/**
 * 把建立超過 DEMO_CLEANUP_HOURS 小時、檔名以 DEMO_FILENAME_PREFIX 開頭的
 * demo 副本丟進垃圾桶。正式場次檔名是 "FirelessWar_" + 數字,不含 "Demo_",
 * 不會被誤刪。要自己在「觸發條件」加一個時間驅動的觸發器才會定期執行。
 */
function cleanupOldDemoFiles() {
  const cutoffMs = DEMO_CLEANUP_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const folder = DriveApp.getFolderById(setting("FOLDER_ID"));
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf(DEMO_FILENAME_PREFIX) === 0) {
      if (now - file.getDateCreated().getTime() > cutoffMs) {
        file.setTrashed(true);
      }
    }
  }
}


/**
 * Apps Script 的 Web App 沒辦法自訂 HTTP 狀態碼(ContentService 固定回 200),
 * 這裡用 statusCode 包在回應內容裡,讓後端自己判斷要轉換成什麼狀態碼。
 * (這點跟一般 REST API 不太一樣,是 Apps Script 平台本身的限制)
 */
function jsonResponse(obj, statusCode) {
  obj.statusCode = statusCode;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var sheetName = sheet.getName();
  
  // 排除不需要附註功能的分頁
  var excludedSheets = ['Staff_Book', 'Business_Skills', 'Fight_Skills', 'Global_Param'];
  if (excludedSheets.indexOf(sheetName) !== -1) return;
  
  var range = e.range;
  var excludedCols = ['A']; // A欄是角色欄，不做附註
  
  var values = range.getValues();
  var staffBook = e.source.getSheetByName('Staff_Book');
  var names = staffBook.getRange('B3:B63').getValues();
  
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var cell = range.getCell(r + 1, c + 1);
      var colLetter = cell.getA1Notation().replace(/[0-9]/g, '');
      
      if (excludedCols.indexOf(colLetter) !== -1) continue;
      
      var value = values[r][c];
      
      if (!value) {
        cell.clearNote();
        continue;
      }
      
      var found = false;
      for (var i = 0; i < names.length; i++) {
        if (names[i][0] === value) {
          var rowIndex = i + 3;
          var gender = staffBook.getRange('C' + rowIndex).getValue();
          var incident = staffBook.getRange('E' + rowIndex).getValue();
          var note = '性別：' + gender + (incident ? '\n意外狀況：' + incident : '');
          cell.setNote(note);
          found = true;
          break;
        }
      }
      if (!found) cell.clearNote();
    }
  }
}
