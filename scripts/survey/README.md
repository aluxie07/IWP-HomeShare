# Import HomeShare survey into Google Forms

## Recommended (no CSV — avoids broken questions)

The old CSV broke because commas inside questions split columns, so pieces of the question became options and `TRUE` landed in the description.

1. Open any Google Sheet (blank is fine).
2. **Extensions → Apps Script**
3. Delete the stub code and paste **all** of `createHomeShareSurveyForm.gs`
4. Save → select `createHomeShareSurveyForm` → **Run** → authorize
5. Use the **response URL** from the popup as your survey link
6. Delete any old broken form you already created

Questions are built in the script itself, so Sheets import cannot scramble them.

## Optional: Sheet + TSV

If you want an editable sheet:

1. Import `HomeShare-Survey-Google-Forms.tsv` with separator **Tab** (not comma)
2. Rename the tab to **Questions**
3. Run `createHomeShareSurveyFormFromSheet`

Prefer the `.tsv` over the `.csv`. A fixed quoted `.csv` is also included, but tabs are safer.

## Scoring

| Answer | Mark linked test case |
|--------|------------------------|
| Yes | Pass |
| Partially | Pass with notes (or Fail if you require full success) |
| No | Fail |

Unit / Integration / End-to-end question **N** → that section’s test case **N**.
