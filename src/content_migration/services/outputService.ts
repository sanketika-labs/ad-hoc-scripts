import fs from 'fs';
import { UpdateResult, ProcessingStats } from '../index';
import { logToFile } from './csvService';

export interface OutputCsvRow {
    Code: string;
    Identifier: string;
    'Update Status': string;
    'Review Status': string;
    'Publish Status': string;
    'Error Message': string;
    'Processing Time': string;
}

export async function generateOutputCsv(
    results: UpdateResult[],
    outputPath: string,
    logFilePath: string
): Promise<void> {
    try {
        logToFile(`Generating output CSV with ${results.length} results`, logFilePath);

        const csvData: OutputCsvRow[] = results.map(result => ({
            'Code': result.code,
            'Identifier': result.identifier,
            'Update Status': result.updateStatus,
            'Review Status': result.reviewStatus,
            'Publish Status': result.publishStatus,
            'Error Message': result.errorMessage || '',
            'Processing Time': new Date().toISOString()
        }));

        // Generate CSV content manually
        const headers = ['Code', 'Identifier', 'Update Status', 'Review Status', 'Publish Status', 'Error Message', 'Processing Time'];
        const csvLines = [headers.join(',')];
        
        csvData.forEach(row => {
            const values = [
                `"${row.Code}"`,
                `"${row.Identifier}"`,
                `"${row['Update Status']}"`,
                `"${row['Review Status']}"`,
                `"${row['Publish Status']}"`,
                `"${(row['Error Message'] || '').replace(/"/g, '""')}"`, // Escape quotes
                `"${row['Processing Time']}"`
            ];
            csvLines.push(values.join(','));
        });

        const csvString = csvLines.join('\n');
        fs.writeFileSync(outputPath, csvString);
        logToFile(`✅ Output CSV successfully written to: ${outputPath}`, logFilePath);

    } catch (error) {
        const errorMessage = `Failed to generate output CSV: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(`❌ ${errorMessage}`, logFilePath);
        throw new Error(errorMessage);
    }
}

export function generateProcessingStats(results: UpdateResult[]): ProcessingStats {
    const stats: ProcessingStats = {
        totalRows: results.length,
        successfulUpdates: 0,
        failedUpdates: 0,
        successfulReviews: 0,
        failedReviews: 0,
        successfulPublishes: 0,
        failedPublishes: 0
    };

    results.forEach(result => {
        // Count update statuses
        if (result.updateStatus === 'SUCCESS') {
            stats.successfulUpdates++;
        } else {
            stats.failedUpdates++;
        }

        // Count review statuses
        if (result.reviewStatus === 'SUCCESS') {
            stats.successfulReviews++;
        } else if (result.reviewStatus === 'FAILED') {
            stats.failedReviews++;
        }

        // Count publish statuses
        if (result.publishStatus === 'SUCCESS') {
            stats.successfulPublishes++;
        } else if (result.publishStatus === 'FAILED') {
            stats.failedPublishes++;
        }
    });

    return stats;
}

export function logProcessingStats(stats: ProcessingStats, logFilePath: string): void {
    logToFile('=== PROCESSING STATISTICS ===', logFilePath);
    logToFile(`Total rows processed: ${stats.totalRows}`, logFilePath);
    logToFile(`Successful updates: ${stats.successfulUpdates}`, logFilePath);
    logToFile(`Failed updates: ${stats.failedUpdates}`, logFilePath);
    logToFile(`Successful reviews: ${stats.successfulReviews}`, logFilePath);
    logToFile(`Failed reviews: ${stats.failedReviews}`, logFilePath);
    logToFile(`Successful publishes: ${stats.successfulPublishes}`, logFilePath);
    logToFile(`Failed publishes: ${stats.failedPublishes}`, logFilePath);
    
    const updateSuccessRate = stats.totalRows > 0 ? (stats.successfulUpdates / stats.totalRows * 100).toFixed(2) : '0';
    const reviewSuccessRate = stats.successfulUpdates > 0 ? (stats.successfulReviews / stats.successfulUpdates * 100).toFixed(2) : '0';
    const publishSuccessRate = stats.successfulReviews > 0 ? (stats.successfulPublishes / stats.successfulReviews * 100).toFixed(2) : '0';
    
    logToFile(`Update success rate: ${updateSuccessRate}%`, logFilePath);
    logToFile(`Review success rate: ${reviewSuccessRate}%`, logFilePath);
    logToFile(`Publish success rate: ${publishSuccessRate}%`, logFilePath);
    logToFile('===============================', logFilePath);
}