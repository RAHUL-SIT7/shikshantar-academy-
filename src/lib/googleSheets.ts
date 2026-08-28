export const exportAdmissionsToGoogleSheets = async (accessToken: string, title: string, headers: string[], rows: any[][]): Promise<string> => {
    try {
        // 1. Create a new spreadsheet
        const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    title: title
                }
            })
        });

        if (!createRes.ok) {
            throw new Error(`Failed to create spreadsheet: ${await createRes.text()}`);
        }

        const createData = await createRes.json();
        const spreadsheetId = createData.spreadsheetId;
        const spreadsheetUrl = createData.spreadsheetUrl;

        // 2. Append/Update data
        const values = [headers, ...rows];

        const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                range: "Sheet1!A1",
                majorDimension: "ROWS",
                values: values
            })
        });

        if (!updateRes.ok) {
            throw new Error(`Failed to write to spreadsheet: ${await updateRes.text()}`);
        }

        // 3. Format the spreadsheet to make it attractive 
        // (bold header, blue background, frozen first row, white text)
        const formatRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        updateSheetProperties: {
                            properties: {
                                sheetId: 0,
                                gridProperties: {
                                    frozenRowCount: 1
                                }
                            },
                            fields: 'gridProperties.frozenRowCount'
                        }
                    },
                    {
                        repeatCell: {
                            range: {
                                sheetId: 0,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.117, green: 0.227, blue: 0.541 }, // Deep Blue
                                    textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
                                    horizontalAlignment: "CENTER",
                                    verticalAlignment: "MIDDLE"
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
                        }
                    },
                    {
                        autoResizeDimensions: {
                            dimensions: {
                                sheetId: 0,
                                dimension: "COLUMNS",
                                startIndex: 0,
                                endIndex: headers.length
                            }
                        }
                    }
                ]
            })
        });

        // Ignoring format errors to not block the overall success
        if (!formatRes.ok) {
            console.warn("Failed to apply formatting:", await formatRes.text());
        }

        return spreadsheetUrl;
    } catch (error) {
        console.error("Error exporting to Google Sheets:", error);
        throw error;
    }
};
