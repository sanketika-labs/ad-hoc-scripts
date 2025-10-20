import fs from 'fs';
import { parse } from 'csv-parse';
import { CsvRow } from '../index';

export async function parseCsvWithValidation(filePath: string): Promise<CsvRow[]> {
    return new Promise((resolve, reject) => {
        const rows: CsvRow[] = [];
        let isFirstRow = true;
        
        if (!fs.existsSync(filePath)) {
            reject(new Error(`CSV file not found: ${filePath}`));
            return;
        }

        fs.createReadStream(filePath)
            .pipe(parse({ 
                columns: true, // Use first row as headers
                skip_empty_lines: true,
                trim: true
            }))
            .on('data', (row: any) => {
                // Skip header row processing for validation
                if (isFirstRow) {
                    isFirstRow = false;
                }

                // Convert to our interface and validate
                const csvRow: CsvRow = {
                    code: (row.Code || '').trim(),
                    observable_element_code: (row['Observable Element Code'] || '').trim(),
                    type: (row.Type || '').trim()
                };

                // Validation: Check for empty required fields
                if (!csvRow.code) {
                    reject(new Error(`Empty or missing 'Code' field found in row: ${JSON.stringify(row)}`));
                    return;
                }

                if (!csvRow.observable_element_code) {
                    reject(new Error(`Empty or missing 'Observable Element Code' field found in row: ${JSON.stringify(row)}`));
                    return;
                }

                if (!csvRow.type) {
                    reject(new Error(`Empty or missing 'Type' field found in row: ${JSON.stringify(row)}`));
                    return;
                }

                rows.push(csvRow);
            })
            .on('end', () => {
                console.log(`Successfully parsed ${rows.length} rows from CSV`);
                resolve(rows);
            })
            .on('error', (error) => {
                reject(new Error(`CSV parsing error: ${error.message}`));
            });
    });
}

export function extractUniqueCodes(rows: CsvRow[]): string[] {
    const uniqueCodes = new Set<string>();
    rows.forEach(row => uniqueCodes.add(row.code));
    return Array.from(uniqueCodes);
}

export function extractUniqueObservableElementCodes(rows: CsvRow[]): string[] {
    const uniqueObservableElements = new Set<string>();
    
    rows.forEach(row => {
        // Split observable element codes by comma and clean them
        const observableElements = row.observable_element_code
            .split(',')
            .map(code => code.trim())
            .filter(code => code.length > 0);
        
        observableElements.forEach(code => uniqueObservableElements.add(code));
    });
    
    return Array.from(uniqueObservableElements);
}

export function logToFile(message: string, logFilePath: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    fs.appendFileSync(logFilePath, logMessage);
    console.log(message);
}