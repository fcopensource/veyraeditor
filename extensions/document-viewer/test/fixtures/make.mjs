// Builds sample .docx, .pptx and .xlsx files (Office Open XML) for the tests. Usage: node make.mjs <folder>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const JSZip = createRequire(import.meta.url)("jszip");
const out = process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "out");
fs.mkdirSync(out, { recursive: true });
// A 320 x 196 bar chart (the shape of its frame on the slide), drawn pixel by pixel, for the slide's picture.
const PNG = (() => {
  const w = 320, h = 196, raw = Buffer.alloc((w * 3 + 1) * h);
  const bars = [[40, 70], [100, 105], [160, 90], [220, 140]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const bar = bars.find(([left, height]) => x >= left && x < left + 44 && y >= h - 20 - height && y < h - 20);
    const rgb = bar ? (bar === bars[3] ? [217, 98, 43] : [47, 111, 237]) : y === h - 20 ? [154, 161, 171] : [246, 248, 251];
    raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  }
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(t.length + 8); out.writeUInt32BE(data.length); t.copy(out, 4); out.writeUInt32BE(crc(t), t.length + 4); return out; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
})();
const save = async (zip, name) => fs.writeFileSync(path.join(out, name), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
const rels = list => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join("")}</Relationships>`;
const types = (defaults, overrides) => `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${defaults}${overrides.map(([part, ct]) => `<Override PartName="${part}" ContentType="${ct}"/>`).join("")}</Types>`;

// ---------- Word ----------
{
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const p = (text, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const bold = text => `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r><w:r><w:t xml:space="preserve"> revenue grew 18% to $4.2 million.</w:t></w:r></w:p>`;
  const cell = t => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${p(t)}</w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${[["Region", "Q3", "Q4"], ["Europe", "$1.2M", "$1.5M"], ["Americas", "$2.1M", "$2.7M"]].map(r => `<w:tr>${r.map(cell).join("")}</w:tr>`).join("")}</w:tbl>`;
  const body = [
    p("Quarterly Report", "Title"), p("Summary", "Heading1"), bold("Fourth quarter:"),
    p("The new checkout launched in October and cut abandoned carts by a third. Support tickets fell for the second quarter in a row."),
    p("Results by region", "Heading2"), table, p(""),
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    p("Next steps", "Heading1"), p("Open the Singapore office, hire four engineers, and ship the mobile app in March."),
  ].join("");
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="56"/><w:color w:val="1F3864"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="2F5496"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2F5496"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", types("", [["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"], ["/word/styles.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"]]));
  zip.file("_rels/.rels", rels([["rId1", "officeDocument", "word/document.xml"]]));
  zip.file("word/_rels/document.xml.rels", rels([["rId1", "styles", "styles.xml"]]));
  zip.file("word/styles.xml", styles);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  await save(zip, "report.docx");
}

// ---------- PowerPoint ----------
{
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
  const ph = (id, type, idx, body, pos = "") => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph${type === "body" ? "" : ` type="${type}"`}${idx !== undefined ? ` idx="${idx}"` : ""}/></p:nvPr></p:nvSpPr><p:spPr>${pos}</p:spPr>${body}</p:sp>`;
  const txt = (paras, extra = "") => `<p:txBody><a:bodyPr${extra}/><a:lstStyle/>${paras}</p:txBody>`;
  const para = (text, rPr = "", pPr = "") => `<a:p>${pPr}<a:r><a:rPr lang="en-US"${rPr}/><a:t>${text}</a:t></a:r></a:p>`;
  const theme = `<?xml version="1.0" encoding="UTF-8"?><a:theme ${NS} name="Veyra"><a:themeElements><a:clrScheme name="Veyra"><a:dk1><a:sysClr val="windowText" lastClr="111827"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2A44"/></a:dk2><a:lt2><a:srgbClr val="EEF2F7"/></a:lt2><a:accent1><a:srgbClr val="2F6FED"/></a:accent1><a:accent2><a:srgbClr val="D9622B"/></a:accent2><a:accent3><a:srgbClr val="1F8A4C"/></a:accent3><a:accent4><a:srgbClr val="7C3AED"/></a:accent4><a:accent5><a:srgbClr val="0EA5E9"/></a:accent5><a:accent6><a:srgbClr val="F59E0B"/></a:accent6><a:hlink><a:srgbClr val="2F6FED"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme><a:fontScheme name="Veyra"><a:majorFont><a:latin typeface="Segoe UI"/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/></a:minorFont></a:fontScheme><a:fmtScheme name="Veyra"/></a:themeElements></a:theme>`;
  const master = `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    ${ph(2, "title", undefined, txt(para("Title")), xfrm(838200, 365125, 10515600, 1325563))}
    ${ph(3, "body", 1, txt(para("Text")), xfrm(838200, 1825625, 10515600, 4351338))}
    <p:sp><p:nvSpPr><p:cNvPr id="4" name="Footer bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 6705600, 12192000, 152400)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>
  </p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
  const layout = `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${NS}><p:cSld name="Title and Content"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    ${ph(2, "title", undefined, txt(para("Title")))}${ph(3, "body", 1, txt(para("Text")))}</p:spTree></p:cSld></p:sldLayout>`;
  const slide = (shapes, bg = "") => `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`;
  const slides = [
    slide(ph(2, "ctrTitle", undefined, txt(para("Launch Plan 2027", ' sz="5400" b="1"', '<a:pPr algn="ctr"/>')), xfrm(914400, 2130425, 10363200, 1470025)) + ph(3, "subTitle", 1, txt(para("Veyra Studio · Product team", ' sz="2400"', '<a:pPr algn="ctr"/>')), xfrm(1828800, 3886200, 8534400, 1752600)),
      `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt2"/></a:solidFill></p:bgPr></p:bg>`),
    slide(ph(2, "title", undefined, txt(para("Goals"))) + ph(3, "body", 1, txt(["Ship the mobile app in March", "Grow paying teams to 2,000", "Open the Singapore office"].map(t => para(t)).join(""), ""), xfrm(838200, 1825625, 6400800, 4351338))
      + `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Chart"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(7620000, 1825625, 3733800, 2286000)}<a:prstGeom prst="rect"/></p:spPr></p:pic>`
      + `<p:sp><p:nvSpPr><p:cNvPr id="6" name="Callout"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(7620000, 4419600, 3733800, 914400)}<a:prstGeom prst="roundRect"/><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr>${txt(para("On track", ' sz="2400" b="1"', '<a:pPr algn="ctr"/>').replace("<a:rPr", "<a:rPr").replace('b="1"/>', 'b="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr>'), ' anchor="ctr"')}</p:sp>`),
    slide(ph(2, "title", undefined, txt(para("Budget"))) + `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="1483360"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid><a:gridCol w="5257800"/><a:gridCol w="5257800"/></a:tblGrid>${[["Team", "Budget"], ["Engineering", "$2.4M"], ["Marketing", "$0.9M"]].map((r, i) => `<a:tr h="370840">${r.map(c => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"${i === 0 ? ' b="1"' : ""}/><a:t>${c}</a:t></a:r></a:p></a:txBody><a:tcPr>${i === 0 ? '<a:solidFill><a:schemeClr val="accent1"><a:lumMod val="40000"/><a:lumOff val="60000"/></a:schemeClr></a:solidFill>' : ""}</a:tcPr></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`),
  ];
  const zip = new JSZip();
  const PRE = "application/vnd.openxmlformats-officedocument.presentationml";
  zip.file("[Content_Types].xml", types("", [["/ppt/presentation.xml", `${PRE}.presentation.main+xml`], ["/ppt/slideMasters/slideMaster1.xml", `${PRE}.slideMaster+xml`], ["/ppt/slideLayouts/slideLayout1.xml", `${PRE}.slideLayout+xml`], ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"], ...slides.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, `${PRE}.slide+xml`]), ["/ppt/notesSlides/notesSlide1.xml", `${PRE}.notesSlide+xml`]]));
  zip.file("_rels/.rels", rels([["rId1", "officeDocument", "ppt/presentation.xml"]]));
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "theme", "theme/theme1.xml"], ...slides.map((_, i) => [`rId${i + 10}`, "slide", `slides/slide${i + 1}.xml`])]));
  zip.file("ppt/theme/theme1.xml", theme);
  zip.file("ppt/slideMasters/slideMaster1.xml", master);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]));
  zip.file("ppt/slideLayouts/slideLayout1.xml", layout);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]));
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, s);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ...(i === 1 ? [["rId2", "image", "../media/image1.png"]] : []), ...(i === 0 ? [["rId3", "notesSlide", "../notesSlides/notesSlide1.xml"]] : [])]));
  });
  zip.file("ppt/notesSlides/notesSlide1.xml", `<?xml version="1.0" encoding="UTF-8"?><p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${ph(2, "body", 1, txt(para("Welcome everyone. Keep this under two minutes.")))}</p:spTree></p:cSld></p:notes>`);
  zip.file("ppt/media/image1.png", PNG);
  await save(zip, "plan.pptx");
}

// ---------- Excel ----------
{
  const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const strings = ["Sales by month", "Month", "Revenue", "Growth", "Date", "January", "February", "March", "Total", "Notes", "Hidden data"];
  const s = t => strings.indexOf(t);
  const c = (ref, v, opts = {}) => `<c r="${ref}"${opts.t ? ` t="${opts.t}"` : ""}${opts.s !== undefined ? ` s="${opts.s}"` : ""}>${opts.f ? `<f>${opts.f}</f>` : ""}${v !== undefined ? `<v>${v}</v>` : ""}</c>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${S}><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="4" width="13" customWidth="1"/></cols><sheetData>
    <row r="1">${c("A1", s("Sales by month"), { t: "s", s: 1 })}</row>
    <row r="2">${c("A2", s("Month"), { t: "s", s: 2 })}${c("B2", s("Revenue"), { t: "s", s: 2 })}${c("C2", s("Growth"), { t: "s", s: 2 })}${c("D2", s("Date"), { t: "s", s: 2 })}</row>
    <row r="3">${c("A3", s("January"), { t: "s" })}${c("B3", 1250.5, { s: 3 })}${c("C3", 0.05, { s: 4 })}${c("D3", 46023, { s: 5 })}</row>
    <row r="4">${c("A4", s("February"), { t: "s" })}${c("B4", 1430.25, { s: 3 })}${c("C4", 0.144, { s: 4 })}${c("D4", 46054, { s: 5 })}</row>
    <row r="5">${c("A5", s("March"), { t: "s" })}${c("B5", 1610, { s: 3 })}${c("C5", 0.1257, { s: 4 })}${c("D5", 46082, { s: 5 })}</row>
    <row r="6">${c("A6", s("Total"), { t: "s", s: 2 })}${c("B6", 4290.75, { s: 6, f: "SUM(B3:B5)" })}${c("C6", "TRUE", { t: "str", f: "AND(C3:C5&gt;0)" })}</row>
  </sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells></worksheet>`;
  const sheet2 = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${S}><sheetData><row r="1">${c("A1", s("Notes"), { t: "s", s: 2 })}</row><row r="2"><c r="A2" t="inlineStr"><is><t>Numbers come from the billing export.</t></is></c></row><row r="3">${c("A3", 1, { t: "b" })}${c("B3", 12345678901234, {})}</row></sheetData></worksheet>`;
  const sheet3 = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${S}><sheetData><row r="1">${c("A1", s("Hidden data"), { t: "s" })}</row></sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet ${S}><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
    <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
    <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill></fills>
    <borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="2" fillId="2" borderId="0"/></cellXfs></styleSheet>`;
  const zip = new JSZip();
  const SM = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  zip.file("[Content_Types].xml", types("", [["/xl/workbook.xml", `${SM}.sheet.main+xml`], ["/xl/worksheets/sheet1.xml", `${SM}.worksheet+xml`], ["/xl/worksheets/sheet2.xml", `${SM}.worksheet+xml`], ["/xl/worksheets/sheet3.xml", `${SM}.worksheet+xml`], ["/xl/sharedStrings.xml", `${SM}.sharedStrings+xml`], ["/xl/styles.xml", `${SM}.styles+xml`]]));
  zip.file("_rels/.rels", rels([["rId1", "officeDocument", "xl/workbook.xml"]]));
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook ${S}><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/><sheet name="Secret" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", rels([["rId1", "worksheet", "worksheets/sheet1.xml"], ["rId2", "worksheet", "worksheets/sheet2.xml"], ["rId3", "worksheet", "worksheets/sheet3.xml"], ["rId4", "sharedStrings", "sharedStrings.xml"], ["rId5", "styles", "styles.xml"]]));
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?><sst ${S} count="${strings.length}" uniqueCount="${strings.length}">${strings.map(t => `<si><t>${t}</t></si>`).join("")}</sst>`);
  zip.file("xl/styles.xml", styles);
  zip.file("xl/worksheets/sheet1.xml", sheet1);
  zip.file("xl/worksheets/sheet2.xml", sheet2);
  zip.file("xl/worksheets/sheet3.xml", sheet3);
  await save(zip, "sales.xlsx");
}

fs.writeFileSync(path.join(out, "customers.csv"), 'id,name,city,spend\n3,"Ana, Lopez",Madrid,1200\n1,Ben Ode,Lagos,85.5\n2,"Chen ""CJ"" Jun",Shanghai,430\n10,Dara,Dublin,\n');
fs.writeFileSync(path.join(out, "old.doc"), Buffer.from("d0cf11e0a1b11ae1000000000000000000000000", "hex"));
console.log("fixtures written to", out);
