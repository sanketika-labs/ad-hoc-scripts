import fs from 'fs';
import { logToFile } from './csvService';

export class ContentMigrationError extends Error {
    public readonly code: string;
    public readonly context?: any;

    constructor(message: string, code: string, context?: any) {
        super(message);
        this.name = 'ContentMigrationError';
        this.code = code;
        this.context = context;
    }
}

export interface RetryConfig {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier?: number;
}

export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    operationName: string,
    logFilePath: string
): Promise<T> {
    let lastError: Error | undefined;
    let delay = config.retryDelay;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
            const result = await operation();
            if (attempt > 1) {
                logToFile(`✅ ${operationName} succeeded on attempt ${attempt}`, logFilePath);
            }
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (attempt === config.maxRetries) {
                logToFile(`❌ ${operationName} failed after ${config.maxRetries} attempts: ${lastError.message}`, logFilePath);
                break;
            }

            logToFile(`⚠️ ${operationName} failed on attempt ${attempt}/${config.maxRetries}, retrying in ${delay}ms: ${lastError.message}`, logFilePath);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            
            if (config.backoffMultiplier) {
                delay *= config.backoffMultiplier;
            }
        }
    }

    throw lastError;
}

export function setupErrorHandling(logFilePath: string): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logToFile(`🚨 Uncaught Exception: ${error.message}`, logFilePath);
        logToFile(`Stack trace: ${error.stack}`, logFilePath);
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logToFile(`🚨 Unhandled Rejection at: ${promise}, reason: ${reason}`, logFilePath);
        process.exit(1);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        logToFile('🛑 Process interrupted by user (SIGINT)', logFilePath);
        process.exit(0);
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
        logToFile('🛑 Process terminated (SIGTERM)', logFilePath);
        process.exit(0);
    });
}

export function validateEnvironment(logFilePath: string): void {
    const requiredEnvVars = [
        'BASE_URL',
        'AUTH_KEY',
        'CREATOR_USERNAME',
        'CREATOR_PASSWORD',
        'REVIEWER_USERNAME',
        'REVIEWER_PASSWORD',
        'CLIENT_ID',
        'CLIENT_SECRET',
        'CHANNEL_ID',
        'CREATED_BY'
    ];

    const missingVars: string[] = [];

    requiredEnvVars.forEach(varName => {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    });

    if (missingVars.length > 0) {
        const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
        logToFile(`❌ ${errorMessage}`, logFilePath);
        throw new ContentMigrationError(errorMessage, 'MISSING_ENV_VARS', { missingVars });
    }

    logToFile('✅ All required environment variables are present', logFilePath);
}

export function validateInputFile(filePath: string, logFilePath: string): void {
    if (!fs.existsSync(filePath)) {
        const errorMessage = `Input CSV file not found: ${filePath}`;
        logToFile(`❌ ${errorMessage}`, logFilePath);
        throw new ContentMigrationError(errorMessage, 'INPUT_FILE_NOT_FOUND', { filePath });
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
        const errorMessage = `Input CSV file is empty: ${filePath}`;
        logToFile(`❌ ${errorMessage}`, logFilePath);
        throw new ContentMigrationError(errorMessage, 'INPUT_FILE_EMPTY', { filePath });
    }

    logToFile(`✅ Input file validated: ${filePath} (${stats.size} bytes)`, logFilePath);
}

export function logProgressUpdate(current: number, total: number, operation: string, logFilePath: string): void {
    const percentage = ((current / total) * 100).toFixed(1);
    logToFile(`📊 Progress: ${operation} ${current}/${total} (${percentage}%)`, logFilePath);
}