import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import logoImage from '../assets/logo.png';

const addSchoolHeaderToSheet = async (
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  title: string,
  columns: { header: string, key: string, width?: number }[]
) => {
  // Set column keys and widths ONLY, removing the 'header' 
  // property so ExcelJS doesn't auto-write headers to Row 1.
  sheet.columns = columns.map(c => ({ key: c.key, width: c.width }));

  // Manually write the headers to Row 5
  const headerRow = sheet.getRow(5);
  headerRow.values = columns.map(c => c.header);
  
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // Deep Blue
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Determine last column letter for merging
  const colCount = columns.length;
  const getColLetter = (n: number) => {
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(64 + m + 1) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const lastColLetter = getColLetter(colCount);

  // Load logo
  let logoId;
  try {
     const response = await fetch(logoImage);
     const arrayBuffer = await response.arrayBuffer();
     logoId = workbook.addImage({
       buffer: arrayBuffer,
       extension: 'png',
     });
  } catch (e) {
     console.error("Failed to load Excel logo", e);
  }

  // Add School Title and details
  sheet.mergeCells(`A1:${lastColLetter}1`);
  sheet.getCell('A1').value = 'SHIKSHANTAR ACADEMY';
  sheet.getCell('A1').font = { size: 26, bold: true, color: { argb: 'FFDC2626' } }; // Red-600
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells(`A2:${lastColLetter}2`);
  sheet.getCell('A2').value = 'Karjanhana Municipality, Bastipur-5, Siraha, Nepal | academyshikshantar@gmail.com | +977 9709867048, +977 9807790805';
  sheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FF2563EB' } }; // Blue-600
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells(`A3:${lastColLetter}3`);
  sheet.getCell('A3').value = title;
  sheet.getCell('A3').font = { size: 14, bold: true, color: { argb: 'FF000000' } };
  sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.getRow(1).height = 40;
  sheet.getRow(2).height = 20;
  sheet.getRow(3).height = 25;

  if (logoId) {
     sheet.addImage(logoId, {
       tl: { col: 0, row: 0 },
       ext: { width: 90, height: 90 }
     });
  }
};

const populateSheetData = (sheet: ExcelJS.Worksheet, data: any[]) => {
  // Add data
  data.forEach((row, index) => {
    const addedRow = sheet.addRow(row);
    // Alternate row colors for readibility
    if (index % 2 === 0) {
       addedRow.fill = {
         type: 'pattern',
         pattern: 'solid',
         fgColor: { argb: 'FFF9FAFB' }
       };
    }
    addedRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // Basic column width adjustment
  sheet.columns.forEach((column) => {
    if (!column.width) {
       let maxLength = 10;
       column.eachCell?.({ includeEmpty: true }, (cell) => {
         const colLen = cell.value ? cell.value.toString().length : 10;
         if (colLen > maxLength) maxLength = colLen;
       });
       column.width = Math.min(maxLength + 2, 50); // Cap width at 50
    }
  });
};

export const exportToExcel = async (
  filename: string, 
  title: string, 
  columns: { header: string, key: string, width?: number }[], 
  data: any[]
) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');

  await addSchoolHeaderToSheet(workbook, sheet, title, columns);
  populateSheetData(sheet, data);

  // Write and Save
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${filename}.xlsx`);
};

export const exportMultiSheetExcel = async (
  filename: string,
  sheetsConfigs: { sheetName: string; title: string; columns: { header: string, key: string, width?: number }[]; data: any[] }[]
) => {
  const workbook = new ExcelJS.Workbook();
  
  for (const config of sheetsConfigs) {
    // Sanitize sheet name to avoid invalid characters
    const safeSheetName = config.sheetName.replace(/[\\/*?:[\]]/g, '').substring(0, 31);
    // Ensure uniqueness, if there are duplicates ExcelJS will throw
    let actualSheetName = safeSheetName;
    let i = 1;
    while(workbook.getWorksheet(actualSheetName)) {
       actualSheetName = `${safeSheetName.substring(0, 28)}_${i}`;
       i++;
    }

    const sheet = workbook.addWorksheet(actualSheetName);
    await addSchoolHeaderToSheet(workbook, sheet, config.title, config.columns);
    populateSheetData(sheet, config.data);
  }

  // Write and Save
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `${filename}.xlsx`);
};
