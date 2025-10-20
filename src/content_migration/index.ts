import fs from 'fs';
import path from 'path';
import parseCsv from '../services/csv';
import { getAuthToken } from '../services/authService';
import globalConfig from '../globalConfigs';

// Import all services
import { 
    parseCsvWithValidation, 
    extractUniqueCodes, 
    extractUniqueObservableElementCodes, 
    logToFile 
} from './services/csvService';
import { initializeAuthTokens } from './services/authService';
import { 
    getContentIdentifiers, 
    getObservableElementMapping 
} from './services/searchService';
import { processAllContentsSequentially } from './services/workflowService';
import { 
    generateOutputCsv, 
    generateProcessingStats, 
    logProcessingStats 
} from './services/outputService';
import { 
    setupErrorHandling, 
    validateEnvironment, 
    validateInputFile, 
    logProgressUpdate,
    ContentMigrationError 
} from './services/errorHandlingService';

// TypeScript interfaces
interface CsvRow {
    code: string;
    observable_element_code: string;
    type: string;
}

interface ContentIdentifier {
    identifier: string;
    name: string;
    code: string;
}

interface ObservableElementMapping {
    [code: string]: string; // code -> identifier mapping
}

interface UpdateResult {
    code: string;
    identifier: string;
    updateStatus: 'SUCCESS' | 'FAILED';
    reviewStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    publishStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    errorMessage?: string;
}

interface ProcessingStats {
    totalRows: number;
    successfulUpdates: number;
    failedUpdates: number;
    successfulReviews: number;
    failedReviews: number;
    successfulPublishes: number;
    failedPublishes: number;
}

// Configuration
const INPUT_CSV_PATH = path.join(__dirname, 'input.csv');
const OUTPUT_CSV_PATH = path.join(__dirname, 'output_results.csv');
const LOG_FILE_PATH = path.join(__dirname, 'content_migration.log');

// Main function
async function main() {
    const startTime = new Date();
    
    try {
        // Initialize log file
        fs.writeFileSync(LOG_FILE_PATH, ''); // Clear previous logs
        
        logToFile('🚀 Content Migration Script Started', LOG_FILE_PATH);
        logToFile(`Start time: ${startTime.toISOString()}`, LOG_FILE_PATH);
        
        // Setup error handling
        setupErrorHandling(LOG_FILE_PATH);
        
        // Validate environment and input file
        validateEnvironment(LOG_FILE_PATH);
        validateInputFile(INPUT_CSV_PATH, LOG_FILE_PATH);
        
        // Step 1: Parse and validate CSV
        logToFile('📋 Step 1: Parsing and validating CSV file', LOG_FILE_PATH);
        const csvRows = await parseCsvWithValidation(INPUT_CSV_PATH);
        logToFile(`✅ Successfully parsed ${csvRows.length} rows from CSV`, LOG_FILE_PATH);
        
        // Step 2: Initialize authentication tokens
        logToFile('🔑 Step 2: Initializing authentication tokens', LOG_FILE_PATH);
        const tokens = await initializeAuthTokens(LOG_FILE_PATH);
        
        // Step 3: Extract unique codes
        logToFile('🔍 Step 3: Extracting unique codes', LOG_FILE_PATH);
        const uniqueCodes = extractUniqueCodes(csvRows);
        const uniqueObservableElementCodes = extractUniqueObservableElementCodes(csvRows);
        
        logToFile(`Found ${uniqueCodes.length} unique content codes`, LOG_FILE_PATH);
        logToFile(`Found ${uniqueObservableElementCodes.length} unique observable element codes`, LOG_FILE_PATH);
        
        // Step 4: Search for content identifiers
        logToFile('🔎 Step 4: Searching for content identifiers', LOG_FILE_PATH);
        const contentIdentifiers = await getContentIdentifiers(
            uniqueCodes, 
            tokens.creatorToken, 
            LOG_FILE_PATH
        );
        
        // Step 5: Search for observable element identifiers
        logToFile('🔍 Step 5: Searching for observable element identifiers', LOG_FILE_PATH);
        const observableElementMapping = await getObservableElementMapping(
            uniqueObservableElementCodes,
            tokens.creatorToken,
            LOG_FILE_PATH
        );
        
        // Step 6: Process all contents sequentially (update → review → publish)
        logToFile('⚙️ Step 6: Processing contents sequentially', LOG_FILE_PATH);
        const results = await processAllContentsSequentially(
            csvRows,
            contentIdentifiers,
            observableElementMapping,
            tokens.creatorToken,
            tokens.reviewerToken,
            LOG_FILE_PATH
        );
        
        // Step 7: Generate output CSV
        logToFile('📊 Step 7: Generating output CSV', LOG_FILE_PATH);
        await generateOutputCsv(results, OUTPUT_CSV_PATH, LOG_FILE_PATH);
        
        // Step 8: Generate and log statistics
        logToFile('📈 Step 8: Generating processing statistics', LOG_FILE_PATH);
        const stats = generateProcessingStats(results);
        logProcessingStats(stats, LOG_FILE_PATH);
        
        // Summary
        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = (durationMs / 60000).toFixed(2);
        
        logToFile('🎉 Content Migration Script Completed Successfully!', LOG_FILE_PATH);
        logToFile(`End time: ${endTime.toISOString()}`, LOG_FILE_PATH);
        logToFile(`Total duration: ${durationMinutes} minutes`, LOG_FILE_PATH);
        logToFile(`Results saved to: ${OUTPUT_CSV_PATH}`, LOG_FILE_PATH);
        logToFile(`Log file: ${LOG_FILE_PATH}`, LOG_FILE_PATH);
        
        console.log('\n🎉 Content Migration Script Completed Successfully!');
        console.log(`📊 Processed ${stats.totalRows} items in ${durationMinutes} minutes`);
        console.log(`✅ Success: ${stats.successfulUpdates} updates, ${stats.successfulReviews} reviews, ${stats.successfulPublishes} publishes`);
        console.log(`❌ Failed: ${stats.failedUpdates} updates, ${stats.failedReviews} reviews, ${stats.failedPublishes} publishes`);
        console.log(`📁 Results: ${OUTPUT_CSV_PATH}`);
        console.log(`📋 Logs: ${LOG_FILE_PATH}`);
        
    } catch (error) {
        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = (durationMs / 60000).toFixed(2);
        
        if (error instanceof ContentMigrationError) {
            logToFile(`❌ Content Migration Error [${error.code}]: ${error.message}`, LOG_FILE_PATH);
            if (error.context) {
                logToFile(`Context: ${JSON.stringify(error.context)}`, LOG_FILE_PATH);
            }
        } else {
            logToFile(`❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`, LOG_FILE_PATH);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`, LOG_FILE_PATH);
            }
        }
        
        logToFile(`Script failed after ${durationMinutes} minutes`, LOG_FILE_PATH);
        
        console.error('\n❌ Content Migration Script Failed!');
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`📋 Check logs for details: ${LOG_FILE_PATH}`);
        
        process.exit(1);
    }
}

// Export for potential testing
export { CsvRow, ContentIdentifier, ObservableElementMapping, UpdateResult, ProcessingStats };

// Run the script if executed directly
if (require.main === module) {
    main().catch(console.error);
}