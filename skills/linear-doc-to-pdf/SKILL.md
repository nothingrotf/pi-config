---
name: linear-doc-to-pdf
description: Exports Linear documents as PDFs in Linear's visual style, with literal Markdown, client-ready, executive, or comparison modes. Use for Linear document PDF exports, client reports, executive reports, visual delivery reports, or explicit 1:1 Markdown copies.
disable-model-invocation: true
---

# Linear document to PDF

Linear exports documents only as Markdown. PDF export exists only for issues via the browser print dialog. This skill produces a PDF that matches Linear's document style.

## Select the report mode

Select one mode before HTML generation:

- **Literal:** Preserve the fetched Markdown content 1:1 without product screenshots.
- **Document:** Preserve the Linear document structure without product screenshots.
- **Executive:** Add grouped final-state screenshots and concise business outcomes.
- **Comparison:** Add before/after screenshots when both states exist.

Use Literal mode when the user says `1:1`, `Markdown direto`, `igual ao Linear`, or `sem reescrever`.

For a visual report without a before state, use Executive mode. Never reconstruct or invent a before state.

## Workflow

1. Fetch the document with `linear_get_document` and the URL slug.
2. Select the report mode from the user request.
3. Preserve the source section order and issue order.
4. For Literal mode, follow the Literal mode rules and skip content rewriting.
5. For other modes, fetch issue details when the report needs client-friendly detail.
6. For other modes, rewrite each issue as one plain-language sentence.
7. Keep concrete values, limits, dates, and counts from each issue.
8. Remove private URLs from every mode.
9. Remove code references, file paths, and internal jargon from nonliteral modes.
10. Build the selected HTML template in `/tmp` or another untracked directory.
11. Render the HTML with Chrome headless.
12. Verify the PDF text, images, page size, and visual layout.

## Literal mode

Use this mode only after an explicit user request for a 1:1 copy.

Copy [example.html](example.html). Replace its sample content with the fetched document Markdown.

Preserve these source elements:

- The title, document icon, and icon color.
- The section and paragraph order.
- The exact wording, dates, values, and counts.
- Lists, emphasis, inline code, and visible link labels.
- Technical terms and code references that appear in the source.

Do not summarize, translate, correct, simplify, or rewrite the source text.

Allow only URL and sensitive-data redactions. Report each sensitive-data redaction to the user.

Remove every private URL target. Keep the visible link label as plain text.

Render Linear custom tags from their visible text. Do not expose tag attributes or URL targets.

Do not fetch issue details unless the document cannot render without them.

Do not add screenshots, captions, issue descriptions, or executive sections.

## Document mode

Copy [example.html](example.html). Replace the title, introduction, sections, and `issues` array.

The template uses these Linear styles:

- Inter or system fonts on a white background.
- A 660px content column and 20mm vertical A4 margins.
- A 24px title, 16px headings, and body text near 11.5px.
- Gray issue chips with blue issue keys and purple completion icons.
- A document icon inside a rounded pale square.
- A muted detail line below each issue.

## Executive mode

Copy [executive-example.html](executive-example.html). Create one summary page and grouped visual pages.

Use this structure:

1. Add the document icon, context label, title, and one outcome paragraph.
2. Add one executive callout with the total result.
3. Add the main delivery groups.
4. List all issues in their original order.
5. Add one visual page for each related issue group.

Each visual page must contain:

- The label `Resultado final`.
- One outcome title.
- One short business description.
- The related issue keys as small chips.
- One screenshot with a thin gray border and rounded corners.
- One factual caption.
- One optional callout for a rule or measurable result.
- A footer that identifies the product area and theme.

Group related issues under one screenshot. Do not force one screenshot per issue.

Describe nonvisual changes on the summary page. Do not create irrelevant screenshots for them.

## Capture final-state screenshots

Use `agent-browser` for final-state evidence without a before state.

Run the preflight check:

```bash
which agent-browser || npm install -g --allow-scripts=agent-browser agent-browser
```

Check for a running application first. For Executive mode, start the project server only when repository instructions define the command.

Record the server process ID. Stop the server after capture.

For Comparison mode, use the supplied URLs. Do not start a server through the `before-and-after` workflow.

Capture desktop screens at 1440 by 900 pixels. Use the light theme for every executive report.

```bash
agent-browser --session executive open "<url>"
agent-browser --session executive set viewport 1440 900
agent-browser --session executive set media light
agent-browser --session executive screenshot --full "/tmp/report/screenshots/result.png"
```

If application storage overrides the media theme, find its theme key. Set that key to `light`, then reload the page.

Use `--full` only when the user requests a complete scroll capture. Otherwise, capture the visible desktop viewport.

Capture dialogs or expanded states when they provide clearer evidence. Use real prototype data and non-sensitive accounts.

Keep the original screenshots. Create separate cropped copies only when the PDF text becomes too small.

Crop navigation chrome or unused whitespace when it blocks legibility. Never crop the feature evidence.

## Capture before/after evidence

If both states exist, load the `before-and-after` skill and follow its workflow.

Do not use the current URL for both states. If the before state is unavailable, use Executive mode.

## Render the PDF

Do not use LibreOffice or `soffice`. They damage the CSS layout.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="out.pdf" "file://$PWD/doc.html"
```

## Verify the PDF

Never deliver an unchecked PDF.

```bash
pdfinfo out.pdf | grep -E 'Pages|Page size|File size'
pdftotext out.pdf - | grep -Eo '[A-Z]+-[0-9]+' | sort -u | wc -l
pdfimages -list out.pdf
pdftoppm -png -r 80 out.pdf preview
```

Verify these requirements:

- The page size is A4.
- Literal mode preserves every source heading, paragraph, list item, value, and visible reference label.
- For issue reports, the issue count matches the source document.
- For visual modes, the expected screenshots appear in the PDF.
- For visual modes, every screenshot uses the light theme.
- Text remains legible at normal PDF zoom.
- No image splits across pages.
- No private Linear URL appears in extracted text.
- Captions match the visible screens.
- Page breaks leave no accidental blank page.

Read every preview image. Delete the preview files after verification.

## Rules

- Keep PDF files and screenshots outside the repository.
- If temporary repository files are necessary, remove them before delivery.
- Preserve the source document structure and issue order.
- Strip private Linear URLs from client-facing output.
- Use client language in every nonliteral title, caption, and issue description.
- In Literal mode, preserve the source language and wording.
- Label final-state evidence as `Resultado final`.
- Never imply a before/after comparison without evidence.
- Never expose credentials or private customer data.
- Remove internal implementation details from nonliteral modes.
