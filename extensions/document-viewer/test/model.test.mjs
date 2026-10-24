import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const s = createRequire(import.meta.url)("../out/webview/sheets.js");

test("column letters and cell references", () => {
  assert.equal(s.columnIndex("A"), 0);
  assert.equal(s.columnIndex("Z"), 25);
  assert.equal(s.columnIndex("AA"), 26);
  assert.equal(s.columnIndex("xfd"), 16383);
  for (const i of [0, 25, 26, 51, 52, 701, 702, 16383]) assert.equal(s.columnIndex(s.columnName(i)), i);
  assert.equal(s.columnName(27), "AB");
  assert.deepEqual(s.parseRef("C12"), { row: 11, col: 2 });
  assert.deepEqual(s.parseRef("$B$3"), { row: 2, col: 1 });
  assert.equal(s.parseRef("12C"), undefined);
  assert.deepEqual(s.parseRange("C3:A1"), { r1: 0, c1: 0, r2: 2, c2: 2 });
  assert.deepEqual(s.parseRange("B2"), { r1: 1, c1: 1, r2: 1, c2: 1 });
});

test("Excel day numbers, with the 1900 leap-year bug and 1904 workbooks", () => {
  const day = (n, w1904) => s.excelDate(n, w1904).toISOString().slice(0, 10);
  assert.equal(day(1), "1900-01-01");
  assert.equal(day(59), "1900-02-28");
  assert.equal(day(61), "1900-03-01");
  assert.equal(day(46023), "2026-01-01");
  assert.equal(day(0, true), "1904-01-01");
  assert.equal(s.excelDate(46023.75).toISOString(), "2026-01-01T18:00:00.000Z");
});

test("tells date formats from number formats", () => {
  for (const f of ["m/d/yyyy", "d-mmm-yy", "yyyy-mm-dd", "h:mm AM/PM", "[h]:mm:ss", "dd/mm/yyyy;@"]) assert.ok(s.isDateFormat(f), f);
  for (const f of ["0.00", "#,##0", "0%", "0.00E+00", '"$"#,##0.00', '#,##0" days"', "[Red]#,##0", "General", "@"]) assert.ok(!s.isDateFormat(f), f);
});

test("formats numbers the way the cell's format says", () => {
  assert.equal(s.formatNumber(1250.5, '"$"#,##0.00'), "$1,250.50");
  assert.equal(s.formatNumber(-1250.5, '"$"#,##0.00'), "-$1,250.50");
  assert.equal(s.formatNumber(1234567, "#,##0"), "1,234,567");
  assert.equal(s.formatNumber(0.144, "0.00%"), "14.40%");
  assert.equal(s.formatNumber(0.5, "0%"), "50%");
  assert.equal(s.formatNumber(12345, "0.00E+00"), "1.23E+04");
  assert.equal(s.formatNumber(-1200, "#,##0;(#,##0)"), "(1,200)");
  assert.equal(s.formatNumber(-1200, "#,##0;[Red]-#,##0"), "-1,200");
  assert.equal(s.formatNumber(3, '0" days"'), "3 days");
  assert.equal(s.formatNumber(1500, "€ #,##0"), "€ 1,500");
  assert.equal(s.formatNumber(46023, "yyyy-mm-dd"), "2026-01-01");
  assert.equal(s.formatNumber(46023, "d-mmm-yy"), "1-Jan-26");
  assert.equal(s.formatNumber(46023.75, "h:mm AM/PM"), "6:00 PM");
  assert.equal(s.formatNumber(46023.5, "h:mm:ss"), "12:00:00");
  assert.equal(s.formatNumber(42, "General"), "42");
  assert.equal(s.formatNumber(42, ""), "42");
});

test("General shows up to 11 significant characters, then scientific notation", () => {
  assert.equal(s.general(0.1 + 0.2), "0.3");
  assert.equal(s.general(1 / 3), "0.333333333");
  assert.equal(s.general(2 / 3), "0.666666667");
  assert.equal(s.general(123.456789012345), "123.456789");
  assert.equal(s.general(-1.5), "-1.5");
  assert.equal(s.general(0.00001234), "1.23400E-05");
  assert.equal(s.general(12345678901234), "1.23457E+13");
  assert.equal(s.general(-7), "-7");
  assert.equal(s.scientific(0.000123, 2), "1.23E-04");
});

test("finds the delimiter", () => {
  assert.equal(s.detectDelimiter("a,b,c\n1,2,3\n"), ",");
  assert.equal(s.detectDelimiter("a;b;c\n1,5;2;3\n"), ";");
  assert.equal(s.detectDelimiter("a\tb\n1\t2\n"), "\t");
  assert.equal(s.detectDelimiter("a|b|c\n1|2|3\n"), "|");
  assert.equal(s.detectDelimiter("a,b\n", "data.tsv"), "\t");
  assert.equal(s.detectDelimiter('name,note\n"Lopez, Ana","said ""hi"""\n'), ",");
});

test("reads CSV the RFC 4180 way", () => {
  assert.deepEqual(s.parseCsv('id,name\n1,"Lopez, Ana"\n2,"Chen ""CJ"""\n'), [["id", "name"], ["1", "Lopez, Ana"], ["2", 'Chen "CJ"']]);
  assert.deepEqual(s.parseCsv('a,b\r\n"line one\nline two",x\r\n'), [["a", "b"], ["line one\nline two", "x"]]);
  assert.deepEqual(s.parseCsv("﻿a,b\n1,"), [["a", "b"], ["1", ""]]);
  assert.deepEqual(s.parseCsv("a;b\n1;2", ";"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(s.parseCsv(""), []);
});

test("sorts numbers as numbers, text alphabetically, empty cells last", () => {
  const sorted = list => [...list].sort(s.compareCells);
  assert.deepEqual(sorted(["10", "9", "", "100"]), ["9", "10", "100", ""]);
  assert.deepEqual(sorted(["$1,200", "$950", "$12"]), ["$12", "$950", "$1,200"]);
  assert.deepEqual(sorted(["banana", "Apple", "cherry"]), ["Apple", "banana", "cherry"]);
  assert.deepEqual(sorted(["item 10", "item 2"]), ["item 2", "item 10"]);
});
