import globalConfig from '../../globalConfigs';

export const contentMigrationConfig = {
    channelId: globalConfig.channelId,
    createdBy: globalConfig.createdBy,
    organisation: globalConfig.organisation,
    framework: globalConfig.framework,
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    batchSize: 10, // Process in batches
};