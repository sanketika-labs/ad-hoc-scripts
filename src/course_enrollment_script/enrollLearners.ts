import fs from 'fs';
import { getUserId } from './services/authService';
import parseCsv from "../services/csv";
import { enrollInCourse } from './services/courseService';
import { courseConfig } from './config/courseConfig';
import path from 'path';
import { getAuthToken } from '../services/authService';

interface CourseMapping {
    [key: string]: { [nodeId: string]: string };
}

interface BatchMapping {
    [key: string]: { [nodeId: string]: string | null };
}

interface ProcessingResult {
    originalRow: string[];
    status: 'Success' | 'Failure';
    errorMessage: string;
}

async function processEnrollments() {
    // Check if required environment variables are set
    if (!process.env.COURSE_MAPPING || !process.env.BATCH_MAPPING) {
        console.error('Error: Required environment variables COURSE_MAPPING and BATCH_MAPPING are not set.');
        console.error('Please run the learner profile creation script first and use the provided command.');
        process.exit(1);
    }

    await getAuthToken()
    const rows = await parseCsv(courseConfig.learnerCoursePath);
    const dataRows = rows.slice(1);
    const headerRow = [...rows[0], 'status', 'errorMessage'];
    const results: ProcessingResult[] = [];

    // Load the mappings from environment variables
    const currentMapping: CourseMapping = JSON.parse(process.env.COURSE_MAPPING);
    const batchMapping: BatchMapping = JSON.parse(process.env.BATCH_MAPPING);

    console.log(currentMapping);
    
    for (const record of dataRows) {
        const learnerProfileCode = record[0];
        console.log(`Processing enrollments for learner profile: ${learnerProfileCode}`);

        try {
            // Get auth token
            const { userId, accessToken } = await getUserId(learnerProfileCode);

            // Convert the stored mapping to Map
            const courseMap = new Map(Object.entries(currentMapping[learnerProfileCode]));

            console.log(courseMap);
            
            // Perform enrollments
            for (const [nodeId, _] of courseMap) {
                const batchId = batchMapping[learnerProfileCode][nodeId];
                if (batchId) {
                    await enrollInCourse(nodeId, batchId, userId, accessToken);
                    console.log(`  Enrolled in course ${nodeId}, batch ${batchId}`);
                }
            }

            // Record successful processing
            results.push({
                originalRow: record,
                status: 'Success',
                errorMessage: 'none'
            });

        } catch (error: any) {
            let errorMessage;
            if (error?.response?.data?.params?.errmsg) {
                errorMessage = error.response.data.params.errmsg;
            } else {
                errorMessage = error?.message || 'Failed to enroll in courses';
            }
            // Record failed processing with error message
            results.push({
                originalRow: record,
                status: 'Failure',
                errorMessage: errorMessage
            });
            console.error(`Error processing enrollments for ${learnerProfileCode}:`, errorMessage);

            // Write intermediate results to CSV after each failure
            writeResultsToCSV(headerRow, results);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    writeResultsToCSV(headerRow, results);

    console.log('Finished processing all enrollments');
    console.log(`Results have been saved to ${path.join(__dirname, '..', 'reports', 'enrollment-status.csv')}`);
}

function writeResultsToCSV(headerRow: string[], results: ProcessingResult[]) {
    const resultsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    const reportPath = path.join(resultsDir, 'enrollment-status.csv');

    // Convert rows to CSV format with proper escaping
    const csvRows = results.map(result => {
        const row = [...result.originalRow, result.status, result.errorMessage];
        return row.map(field => {
            // If field contains comma or quotes, wrap it in quotes and escape existing quotes
            if (field.includes(',') || field.includes('"')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        }).join(',');
    });

    const csvContent = [headerRow.join(','), ...csvRows].join('\n');
    fs.writeFileSync(reportPath, csvContent);
}

// Run the script
processEnrollments().catch(console.error); 