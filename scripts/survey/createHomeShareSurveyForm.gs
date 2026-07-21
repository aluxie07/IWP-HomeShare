/**
 * HomeShare survey → Google Form
 *
 * Easiest (recommended — no CSV import):
 * 1. Open any Google Sheet (or create blank).
 * 2. Extensions → Apps Script → paste this entire file → Save.
 * 3. Run createHomeShareSurveyForm → Authorize.
 * 4. Copy the response URL into your test plan.
 *
 * Optional: if you prefer a Sheet, import HomeShare-Survey-Google-Forms.tsv
 * (File → Import, Separator: Tab), rename tab to Questions, then run
 * createHomeShareSurveyFormFromSheet instead.
 */

var YES_NO = ["Yes", "Partially", "No"];

var SURVEY_ITEMS = [
  { type: "SECTION", title: "A. Unit questions", help: "Answer Yes / Partially / No for each item you tried. Use Partially if you only partly completed it." },
  { type: "MULTIPLE_CHOICE", title: "1. When registering or resetting a password: weak passwords were rejected and a valid password was accepted.", choices: YES_NO, required: true, help: "Assesses Unit case 1" },
  { type: "MULTIPLE_CHOICE", title: "2. I could tell Private / Shared / Local Only apart and Private did not let me create a share link.", choices: YES_NO, required: true, help: "Assesses Unit case 2" },
  { type: "MULTIPLE_CHOICE", title: "3. Cloud/Local badges and the All/Cloud/Local filters matched what I expected for my files.", choices: YES_NO, required: true, help: "Assesses Unit case 3" },
  { type: "MULTIPLE_CHOICE", title: "4. The header badge correctly showed Cloud or Local and Exit local only appeared in Local mode.", choices: YES_NO, required: true, help: "Assesses Unit case 4" },
  { type: "MULTIPLE_CHOICE", title: "5. The Help page explained Cloud vs Local clearly and I could open Local Network setup from Help.", choices: YES_NO, required: true, help: "Assesses Unit case 5" },
  { type: "MULTIPLE_CHOICE", title: "6. I understood that inactivity on HomeShare can log me out (about 15 minutes).", choices: YES_NO, required: true, help: "Assesses Unit case 6" },

  { type: "SECTION", title: "B. Integration questions", help: "Answer Yes / Partially / No for each item you tried." },
  { type: "MULTIPLE_CHOICE", title: "1. I logged in on Cloud without needing a local server or Detect.", choices: YES_NO, required: true, help: "Assesses Integration case 1" },
  { type: "MULTIPLE_CHOICE", title: "2. On the host PC Detect put me into Local mode (header showed Local).", choices: YES_NO, required: true, help: "Assesses Integration case 2" },
  { type: "MULTIPLE_CHOICE", title: "3. Exit local returned me to Cloud mode successfully.", choices: YES_NO, required: true, help: "Assesses Integration case 3" },
  { type: "MULTIPLE_CHOICE", title: "4. While in Local mode my upload appeared in the library as a Local file.", choices: YES_NO, required: true, help: "Assesses Integration case 4" },
  { type: "MULTIPLE_CHOICE", title: "5. While in Cloud mode my upload appeared as Cloud and I could download it.", choices: YES_NO, required: true, help: "Assesses Integration case 5" },
  { type: "MULTIPLE_CHOICE", title: "6. I could copy a LAN address (http://192.168.x.x:8080) for another device.", choices: YES_NO, required: true, help: "Assesses Integration case 6" },
  { type: "MULTIPLE_CHOICE", title: "7. I could register the trusted network on Local Wi-Fi (or saw it already registered).", choices: YES_NO, required: true, help: "Assesses Integration case 7" },
  { type: "MULTIPLE_CHOICE", title: "8. Share links worked for Shared files and were not available for Private files.", choices: YES_NO, required: true, help: "Assesses Integration case 8" },
  { type: "MULTIPLE_CHOICE", title: "9. After deleting a file a deletion log showed who uploaded and who deleted it.", choices: YES_NO, required: true, help: "Assesses Integration case 9" },
  { type: "MULTIPLE_CHOICE", title: "10. From the Dashboard Local Network setup opened the correct setup page.", choices: YES_NO, required: true, help: "Assesses Integration case 10" },

  { type: "SECTION", title: "C. End-to-end questions", help: "Answer Yes / Partially / No for each item you tried." },
  { type: "MULTIPLE_CHOICE", title: "1. I completed cloud register → activate → login → upload → library → download without a local server.", choices: YES_NO, required: true, help: "Assesses End-to-end case 1" },
  { type: "MULTIPLE_CHOICE", title: "2. I completed local setup from Dashboard → Detect → upload → saw Local → downloaded the file.", choices: YES_NO, required: true, help: "Assesses End-to-end case 2" },
  { type: "MULTIPLE_CHOICE", title: "3. A second device connected using the LAN URL (not Detect) and could use the library.", choices: YES_NO, required: true, help: "Assesses End-to-end case 3" },
  { type: "MULTIPLE_CHOICE", title: "4. I switched between Local and Cloud in one session without the site breaking.", choices: YES_NO, required: true, help: "Assesses End-to-end case 4" },
  { type: "MULTIPLE_CHOICE", title: "5. A Local Only file worked on the registered Wi-Fi and was blocked when not on that trusted network (or I could not complete this — answer No).", choices: YES_NO, required: true, help: "Assesses End-to-end case 5" },
  { type: "MULTIPLE_CHOICE", title: "6. Network admin could change settings; a non-admin on the same Wi-Fi could not (or N/A → Partially with comment).", choices: YES_NO, required: true, help: "Assesses End-to-end case 6" },
  { type: "MULTIPLE_CHOICE", title: "7. I created a share link opened it in another browser then revoked it and access stopped.", choices: YES_NO, required: true, help: "Assesses End-to-end case 7" },
  { type: "MULTIPLE_CHOICE", title: "8. After about 15 minutes without using HomeShare I was logged out (or I did not wait — answer Partially and note).", choices: YES_NO, required: true, help: "Assesses End-to-end case 8" },
  { type: "MULTIPLE_CHOICE", title: "9. When I had (or imagined) both Cloud and Local files badges/filters helped me tell them apart.", choices: YES_NO, required: true, help: "Assesses End-to-end case 9" },
  { type: "MULTIPLE_CHOICE", title: "10. Overall I could finish the assigned HomeShare scenarios without getting permanently stuck.", choices: YES_NO, required: true, help: "Assesses End-to-end case 10" },

  { type: "SECTION", title: "D. Evidence and overall", help: "Extra questions for marking evidence. Not every item needs a Pass/Fail." },
  { type: "SCALE", title: "1. Overall HomeShare felt usable for class/home file sharing.", low: 1, high: 5, required: true, help: "1 = not usable. 5 = very usable. Supports End-to-end case 10" },
  { type: "MULTIPLE_CHOICE", title: "2. Which modes did you successfully use?", choices: ["Cloud only", "Local only", "Both", "Blocked / could not use"], required: true },
  { type: "MULTIPLE_CHOICE", title: "3. What was hardest?", choices: ["Login/account", "Local setup/Detect", "Upload/download", "Sharing", "Network registration", "Badges/filters", "Nothing major"], required: true },
  { type: "PARAGRAPH", title: "4. If you answered No to any question above list the section and question number and what went wrong.", required: false },
  { type: "PARAGRAPH", title: "5. Which 1–3 tasks worked best? List section + question number or a short description.", required: false },
  { type: "TEXT", title: "6. Device + browser used (example: Windows 11 + Chrome; phone + Safari).", required: true },
  { type: "MULTIPLE_CHOICE", title: "7. Modes you actually tested:", choices: ["Cloud", "Local", "Both"], required: true },
  { type: "PARAGRAPH", title: "8. One improvement you would make first.", required: false }
];

function createHomeShareSurveyForm() {
  var form = FormApp.create("HomeShare Test Survey");
  form.setDescription(
    "Answer Yes / Partially / No for scenarios you tried. " +
      "Partially = partly completed or N/A with a note in Section D. " +
      "Yes = Pass. No = Fail for the matching test case."
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setProgressBar(true);
  form.setConfirmationMessage("Thanks — your responses help assess the HomeShare test cases.");

  addSurveyItems_(form, SURVEY_ITEMS);

  var editUrl = form.getEditUrl();
  var publishedUrl = form.getPublishedUrl();
  Logger.log("Form edit URL: " + editUrl);
  Logger.log("Form response URL: " + publishedUrl);
  SpreadsheetApp.getUi().alert(
    "Form created.\n\nEdit:\n" + editUrl + "\n\nShare with testers:\n" + publishedUrl
  );
  return { editUrl: editUrl, publishedUrl: publishedUrl };
}

/** Optional: build from a sheet imported from the .tsv file (tab-separated). */
function createHomeShareSurveyFormFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Questions");
  if (!sheet) {
    throw new Error('Sheet named "Questions" not found. Rename your imported tab to Questions.');
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) throw new Error("No question rows found.");

  var headers = data[0].map(function (h) {
    return String(h || "").trim().toLowerCase();
  });
  var col = function (name) {
    var idx = headers.indexOf(name);
    if (idx < 0) throw new Error("Missing column: " + name);
    return idx;
  };
  var cSection = col("section");
  var cType = col("type");
  var cQuestion = col("question");
  var cOptions = col("options");
  var cRequired = col("required");
  var cHelp = col("helptext");

  var items = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var type = String(row[cType] || "").trim().toUpperCase();
    if (!type) continue;
    var question = String(row[cQuestion] || "").trim();
    var optionsRaw = String(row[cOptions] || "").trim();
    var requiredRaw = String(row[cRequired] || "").trim().toUpperCase();
    var help = String(row[cHelp] || "").trim();
    // Ignore cells that look like shifted Required values
    if (help === "TRUE" || help === "FALSE") help = "";

    var item = {
      type: type,
      title: question || String(row[cSection] || "").trim(),
      required: requiredRaw === "TRUE" || requiredRaw === "YES" || requiredRaw === "1",
      help: help
    };
    if (type === "MULTIPLE_CHOICE" || type === "CHECKBOXES") {
      item.choices = optionsRaw.split("|").map(function (s) {
        return s.trim();
      }).filter(Boolean);
    }
    if (type === "SCALE") {
      var parts = optionsRaw.split("|");
      item.low = parseInt(parts[0], 10) || 1;
      item.high = parseInt(parts[1], 10) || 5;
    }
    items.push(item);
  }

  var form = FormApp.create("HomeShare Test Survey");
  form.setDescription(
    "Answer Yes / Partially / No for scenarios you tried. Yes = Pass. No = Fail."
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  addSurveyItems_(form, items);

  var editUrl = form.getEditUrl();
  var publishedUrl = form.getPublishedUrl();
  SpreadsheetApp.getUi().alert(
    "Form created from sheet.\n\nEdit:\n" + editUrl + "\n\nShare:\n" + publishedUrl
  );
  return { editUrl: editUrl, publishedUrl: publishedUrl };
}

function addSurveyItems_(form, items) {
  for (var i = 0; i < items.length; i++) {
    var spec = items[i];
    var type = String(spec.type || "").toUpperCase();

    if (type === "SECTION") {
      var header = form.addSectionHeaderItem();
      header.setTitle(spec.title || "");
      if (spec.help) header.setHelpText(spec.help);
      continue;
    }

    if (!spec.title) continue;

    var item;
    if (type === "MULTIPLE_CHOICE") {
      item = form.addMultipleChoiceItem();
      item.setTitle(spec.title);
      item.setChoiceValues(spec.choices || YES_NO);
    } else if (type === "CHECKBOXES") {
      item = form.addCheckboxItem();
      item.setTitle(spec.title);
      item.setChoiceValues(spec.choices || []);
    } else if (type === "SCALE") {
      item = form.addScaleItem();
      item.setTitle(spec.title);
      item.setBounds(spec.low || 1, spec.high || 5);
      item.setLabels("Not usable", "Very usable");
    } else if (type === "PARAGRAPH") {
      item = form.addParagraphTextItem();
      item.setTitle(spec.title);
    } else if (type === "TEXT" || type === "SHORT_ANSWER") {
      item = form.addTextItem();
      item.setTitle(spec.title);
    } else {
      throw new Error("Unknown type: " + type);
    }

    if (spec.help) item.setHelpText(spec.help);
    item.setRequired(!!spec.required);
  }
}
