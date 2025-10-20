import { getAuthToken as getAuthTokenFromService } from '../../services/authService';
import { logToFile } from './csvService';

export interface AuthTokens {
    creatorToken: string;
    reviewerToken: string;
}

export async function initializeAuthTokens(logFilePath: string): Promise<AuthTokens> {
    try {
        logToFile('Initializing authentication tokens...', logFilePath);
        
        const tokens = await getAuthTokenFromService();
        
        logToFile('Successfully obtained authentication tokens', logFilePath);
        
        return {
            creatorToken: tokens.creatorToken,
            reviewerToken: tokens.reviewerToken
        };
    } catch (error) {
        const errorMessage = `Failed to initialize authentication tokens: ${error instanceof Error ? error.message : String(error)}`;
        logToFile(errorMessage, logFilePath);
        throw new Error(errorMessage);
    }
}

export function getAuthHeaders(token: string, channelId: string) {
    return {
        'X-Channel-Id': channelId,
        'Content-Type': 'application/json',
        'Authorization': process.env.AUTH_KEY || '',
        'x-authenticated-user-token': token
    };
}