import { CsvRow, ContentIdentifier, ObservableElementMapping, UpdateResult } from '../index';
import { updateContentWithObservableElements, reviewContent, publishContent } from './contentUpdateService';
import { logToFile } from './csvService';

export async function processContentSequentially(
    content: ContentIdentifier,
    csvRow: CsvRow,
    observableElementMapping: ObservableElementMapping,
    creatorToken: string,
    reviewerToken: string,
    logFilePath: string
): Promise<UpdateResult> {
    const result: UpdateResult = {
        code: content.code,
        identifier: content.identifier,
        updateStatus: 'FAILED',
        reviewStatus: 'SKIPPED',
        publishStatus: 'SKIPPED',
        errorMessage: undefined
    };

    try {
        logToFile(`Starting sequential processing for content: ${content.code} (${content.identifier})`, logFilePath);

        // Step 1: Update content with observable elements
        const observableElementCodes = csvRow.observable_element_code
            .split(',')
            .map(code => code.trim())
            .filter(code => code.length > 0);

        logToFile(`Updating content ${content.code} with observable elements: ${observableElementCodes.join(', ')}`, logFilePath);

        const updateSuccess = await updateContentWithObservableElements(
            content.identifier,
            observableElementCodes,
            observableElementMapping,
            creatorToken,
            logFilePath
        );

        if (updateSuccess) {
            result.updateStatus = 'SUCCESS';
            logToFile(`✅ Content update successful for ${content.code}`, logFilePath);

            // Step 2: Send for review (only if update was successful)
            logToFile(`Sending content ${content.code} for review`, logFilePath);
            
            const reviewSuccess = await reviewContent(
                content.identifier,
                creatorToken, // Using creator token for review submission
                logFilePath
            );

            if (reviewSuccess) {
                result.reviewStatus = 'SUCCESS';
                logToFile(`✅ Content review successful for ${content.code}`, logFilePath);

                // Step 3: Publish content (only if review was successful)
                logToFile(`Publishing content ${content.code}`, logFilePath);
                
                const publishSuccess = await publishContent(
                    content.identifier,
                    reviewerToken, // Using reviewer token for publishing
                    logFilePath
                );

                if (publishSuccess) {
                    result.publishStatus = 'SUCCESS';
                    logToFile(`✅ Content publish successful for ${content.code}`, logFilePath);
                } else {
                    result.publishStatus = 'FAILED';
                    result.errorMessage = 'Failed to publish content';
                    logToFile(`❌ Content publish failed for ${content.code}`, logFilePath);
                }
            } else {
                result.reviewStatus = 'FAILED';
                result.errorMessage = 'Failed to send content for review';
                logToFile(`❌ Content review failed for ${content.code}`, logFilePath);
            }
        } else {
            result.updateStatus = 'FAILED';
            result.errorMessage = 'Failed to update content with observable elements';
            logToFile(`❌ Content update failed for ${content.code}`, logFilePath);
        }

    } catch (error) {
        const errorMessage = `Unexpected error processing ${content.code}: ${error instanceof Error ? error.message : String(error)}`;
        result.errorMessage = errorMessage;
        logToFile(`❌ ${errorMessage}`, logFilePath);
    }

    return result;
}

export async function processAllContentsSequentially(
    csvRows: CsvRow[],
    contentIdentifiers: ContentIdentifier[],
    observableElementMapping: ObservableElementMapping,
    creatorToken: string,
    reviewerToken: string,
    logFilePath: string
): Promise<UpdateResult[]> {
    const results: UpdateResult[] = [];
    const contentMap = new Map<string, ContentIdentifier>();
    
    // Create a map for quick lookup
    contentIdentifiers.forEach(content => {
        contentMap.set(content.code, content);
    });

    logToFile(`Starting sequential processing of ${csvRows.length} content items`, logFilePath);

    for (let i = 0; i < csvRows.length; i++) {
        const csvRow = csvRows[i];
        const content = contentMap.get(csvRow.code);

        logToFile(`Processing ${i + 1}/${csvRows.length}: ${csvRow.code}`, logFilePath);

        if (!content) {
            const result: UpdateResult = {
                code: csvRow.code,
                identifier: 'NOT_FOUND',
                updateStatus: 'FAILED',
                reviewStatus: 'SKIPPED',
                publishStatus: 'SKIPPED',
                errorMessage: 'Content not found in search results'
            };
            results.push(result);
            logToFile(`❌ Content not found for code: ${csvRow.code}`, logFilePath);
            continue;
        }

        try {
            const result = await processContentSequentially(
                content,
                csvRow,
                observableElementMapping,
                creatorToken,
                reviewerToken,
                logFilePath
            );
            results.push(result);

            // Add a small delay between processing items to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            const errorMessage = `Critical error processing ${csvRow.code}: ${error instanceof Error ? error.message : String(error)}`;
            logToFile(`❌ ${errorMessage}`, logFilePath);
            
            const result: UpdateResult = {
                code: csvRow.code,
                identifier: content.identifier,
                updateStatus: 'FAILED',
                reviewStatus: 'SKIPPED',
                publishStatus: 'SKIPPED',
                errorMessage: errorMessage
            };
            results.push(result);
        }
    }

    logToFile(`Completed processing all ${csvRows.length} content items`, logFilePath);
    return results;
}