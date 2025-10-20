import axios from 'axios';
import { ContentIdentifier, ObservableElementMapping } from '../index';
import { getAuthHeaders } from './authService';
import { contentMigrationConfig } from '../config/config';
import { routes } from '../config/routes';
import globalConfig from '../../globalConfigs';
import { logToFile } from './csvService';

export async function searchContentByCode(code: string, token: string, logFilePath: string): Promise<ContentIdentifier | null> {
    try {
        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        const requestBody = {
            request: {
                filters: {
                    code: code,
                    status: ["Draft", "Review", "Live"] // Search across all statuses
                },
                limit: 10
            }
        };

        logToFile(`Searching for content with code: ${code}`, logFilePath);

        const response = await axios.post(
            `${globalConfig.baseUrl}${routes.searchContent}`,
            requestBody,
            { headers }
        );

        if (response.data?.result?.content && response.data.result.content.length > 0) {
            const content = response.data.result.content[0]; // Take first match
            const result: ContentIdentifier = {
                identifier: content.identifier,
                name: content.name || content.code,
                code: content.code
            };
            
            logToFile(`Found content for code ${code}: ${result.identifier}`, logFilePath);
            return result;
        } else {
            logToFile(`No content found for code: ${code}`, logFilePath);
            return null;
        }
    } catch (error) {
        const errorMessage = `Error searching content for code ${code}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        throw new Error(errorMessage);
    }
}

export async function searchObservableElementsByCodes(codes: string[], token: string, logFilePath: string): Promise<{ identifier: string, code: string }[]> {
    try {
        const headers = getAuthHeaders(token, contentMigrationConfig.channelId);
        
        const requestBody = {
            request: {
                filters: {
                    status: ["Live"],
                    category: "observableElement",
                    code: codes
                },
                offset: 0,
                limit: codes.length
            }
        };

        logToFile(`Searching for ${codes.length} observable elements with codes: ${codes.join(', ')}`, logFilePath);

        const response = await axios.post(
            `${globalConfig.baseUrl}${routes.searchContent}`,
            requestBody,
            { headers }
        );

        const results: { identifier: string, code: string }[] = [];
        const foundCodes = new Set<string>();

        if (response.data?.result?.Term && response.data.result.Term.length > 0) {
            response.data.result.Term.forEach((term: any) => {
                const result = {
                    identifier: term.identifier,
                    code: term.code
                };
                results.push(result);
                foundCodes.add(term.code);
                logToFile(`Found observable element for code ${term.code}: ${result.identifier}`, logFilePath);
            });
        }

        // Check for missing codes and log warnings
        const missingCodes = codes.filter(code => !foundCodes.has(code));
        if (missingCodes.length > 0) {
            logToFile(`WARNING: Observable elements not found for codes: ${missingCodes.join(', ')}`, logFilePath);
        }

        logToFile(`Found ${results.length} out of ${codes.length} observable elements`, logFilePath);
        return results;
    } catch (error) {
        const errorMessage = `Error searching observable elements for codes ${codes.join(', ')}: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        throw new Error(errorMessage);
    }
}

export async function searchObservableElementByCode(code: string, token: string, logFilePath: string): Promise<{ identifier: string, code: string } | null> {
    // Use the bulk search method for single code as well
    const results = await searchObservableElementsByCodes([code], token, logFilePath);
    return results.length > 0 ? results[0] : null;
}

export async function getContentIdentifiers(codes: string[], token: string, logFilePath: string): Promise<ContentIdentifier[]> {
    const contentIdentifiers: ContentIdentifier[] = [];
    
    logToFile(`Searching for ${codes.length} unique content codes`, logFilePath);
    
    for (const code of codes) {
        try {
            const content = await searchContentByCode(code, token, logFilePath);
            if (content) {
                contentIdentifiers.push(content);
            } else {
                logToFile(`WARNING: Content not found for code: ${code}`, logFilePath);
            }
        } catch (error) {
            logToFile(`ERROR: Failed to search content for code ${code}: ${error instanceof Error ? error.message : String(error)}`, logFilePath);
        }
        
        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    logToFile(`Successfully found ${contentIdentifiers.length} out of ${codes.length} content items`, logFilePath);
    return contentIdentifiers;
}

export async function getObservableElementMapping(codes: string[], token: string, logFilePath: string): Promise<ObservableElementMapping> {
    const mapping: ObservableElementMapping = {};
    
    logToFile(`Searching for ${codes.length} unique observable element codes in bulk`, logFilePath);
    
    try {
        // Use bulk search for all codes at once
        const observableElements = await searchObservableElementsByCodes(codes, token, logFilePath);
        
        // Create mapping from results
        observableElements.forEach(element => {
            mapping[element.code] = element.identifier;
        });
        
        // Check for missing codes and log errors for specific content
        const foundCodes = new Set(observableElements.map(element => element.code));
        const missingCodes = codes.filter(code => !foundCodes.has(code));
        
        if (missingCodes.length > 0) {
            missingCodes.forEach(code => {
                logToFile(`ERROR: Observable element not found for code: ${code}. This will cause content update failures for any content using this observable element.`, logFilePath);
            });
        }
        
        logToFile(`Successfully mapped ${Object.keys(mapping).length} out of ${codes.length} observable elements`, logFilePath);
        
    } catch (error) {
        logToFile(`ERROR: Failed to search observable elements in bulk: ${error instanceof Error ? error.message : String(error)}`, logFilePath);
        
        // Fallback to individual searches if bulk search fails
        logToFile(`Falling back to individual searches for observable elements`, logFilePath);
        
        for (const code of codes) {
            try {
                const observableElement = await searchObservableElementByCode(code, token, logFilePath);
                if (observableElement) {
                    mapping[code] = observableElement.identifier;
                } else {
                    logToFile(`ERROR: Observable element not found for code: ${code}`, logFilePath);
                }
            } catch (error) {
                logToFile(`ERROR: Failed to search observable element for code ${code}: ${error instanceof Error ? error.message : String(error)}`, logFilePath);
            }
            
            // Add small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return mapping;
}