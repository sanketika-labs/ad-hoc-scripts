import axios from 'axios';
import { ContentIdentifier, ObservableElementMapping, CsvRow } from '../index';
import { getAuthHeaders } from './authService';
import { contentMigrationConfig } from '../config/config';
import { routes } from '../config/routes';
import globalConfig from '../../globalConfigs';
import { logToFile } from './csvService';

interface ContentUpdatePayload {
    request: {
        content: {
            versionKey: string;
            lastUpdatedBy: string;
            observableElements?: string[]; // Array of observable element identifiers
            [key: string]: any;
        }
    }
}

export async function getContentDetails(identifier: string, token: string, logFilePath: string): Promise<{ versionKey: string, name: string } | null> {
    try {
        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        logToFile(`Getting content details for identifier: ${identifier}`, logFilePath);

        const response = await axios.get(
            `${globalConfig.baseUrl}/api/content/v1/read/${identifier}`,
            { headers }
        );

        if (response.data?.result?.content) {
            const content = response.data.result.content;
            return {
                versionKey: content.versionKey,
                name: content.name || content.code || identifier
            };
        } else {
            logToFile(`No content details found for identifier: ${identifier}`, logFilePath);
            return null;
        }
    } catch (error) {
        const errorMessage = `Error getting content details for ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        throw new Error(errorMessage);
    }
}

export async function updateContentWithObservableElements(
    identifier: string,
    observableElementCodes: string[],
    observableElementMapping: ObservableElementMapping,
    token: string,
    logFilePath: string
): Promise<boolean> {
    try {
        // Get current content details to retrieve versionKey
        const contentDetails = await getContentDetails(identifier, token, logFilePath);
        if (!contentDetails) {
            throw new Error(`Could not retrieve content details for ${identifier}`);
        }

        // Map observable element codes to identifiers
        const observableElementIdentifiers: string[] = [];
        const missingElements: string[] = [];

        for (const code of observableElementCodes) {
            if (observableElementMapping[code]) {
                observableElementIdentifiers.push(observableElementMapping[code]);
            } else {
                missingElements.push(code);
            }
        }

        if (missingElements.length > 0) {
            logToFile(`WARNING: Missing observable elements for codes: ${missingElements.join(', ')}`, logFilePath);
        }

        if (observableElementIdentifiers.length === 0) {
            throw new Error('No valid observable element identifiers found for update');
        }

        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        const updatePayload: ContentUpdatePayload = {
            request: {
                content: {
                    versionKey: contentDetails.versionKey,
                    lastUpdatedBy: contentMigrationConfig.createdBy,
                    observableElements: observableElementIdentifiers
                }
            }
        };

        logToFile(`Updating content ${identifier} with ${observableElementIdentifiers.length} observable elements`, logFilePath);

        const response = await axios.patch(
            `${globalConfig.baseUrl}${routes.updateContent}/${identifier}`,
            updatePayload,
            { headers }
        );

        if (response.data?.result) {
            logToFile(`Successfully updated content ${identifier}`, logFilePath);
            return true;
        } else {
            throw new Error(`Update API returned unexpected response: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        const errorMessage = `Error updating content ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        return false;
    }
}

export async function reviewContent(identifier: string, token: string, logFilePath: string): Promise<boolean> {
    try {
        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        const reviewPayload = {
            request: {
                content: {}
            }
        };

        logToFile(`Sending content ${identifier} for review`, logFilePath);

        const response = await axios.post(
            `${globalConfig.baseUrl}${routes.reviewContent}/${identifier}`,
            reviewPayload,
            { headers }
        );

        if (response.data?.result) {
            logToFile(`Successfully sent content ${identifier} for review`, logFilePath);
            return true;
        } else {
            throw new Error(`Review API returned unexpected response: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        const errorMessage = `Error reviewing content ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        return false;
    }
}

export async function publishContent(identifier: string, token: string, logFilePath: string): Promise<boolean> {
    try {
        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        const publishPayload = {
            request: {
                content: {
                    lastPublishedBy: contentMigrationConfig.createdBy
                }
            }
        };

        logToFile(`Publishing content ${identifier}`, logFilePath);

        const response = await axios.post(
            `${globalConfig.baseUrl}${routes.publishContent}/${identifier}`,
            publishPayload,
            { headers }
        );

        if (response.data?.result) {
            logToFile(`Successfully published content ${identifier}`, logFilePath);
            return true;
        } else {
            throw new Error(`Publish API returned unexpected response: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        const errorMessage = `Error publishing content ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        return false;
    }
}