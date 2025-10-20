# Content Migration Script

This script updates Sunbird content items with observable elements in a sequential manner: Update → Review → Publish.

## Overview

The script performs the following operations:
1. **Parse CSV** - Reads input CSV with content codes and observable element codes
2. **Validate Data** - Ensures no empty codes after trimming
3. **Authenticate** - Gets tokens for content creator and reviewer users
4. **Search Content** - Finds content identifiers for unique codes
5. **Search Observable Elements** - Finds identifiers for observable element codes
6. **Update Content** - Updates each content with observable elements
7. **Review Content** - Sends updated content for review
8. **Publish Content** - Publishes reviewed content
9. **Generate Report** - Creates output CSV with processing results

## Input CSV Format

The input CSV must have the following columns:
- `Code`: Content code (e.g., FMPS_C001)
- `Observable Element Code`: Comma-separated observable element codes (e.g., "E0001, E003")
- `Type`: Content type (e.g., Course, Module, Resource)

### Example Input CSV:
```csv
Code,Observable Element Code,Type
TEST_C001,"E0001, E003",Course
TEST_C002,"E0001",Course
TEST_M001,"E0002, E004",Module
```

## Environment Variables

Ensure the following environment variables are set:

```bash
BASE_URL=https://dev.sunbirded.org
AUTH_KEY=your_auth_key
CREATOR_USERNAME=content_creator_username
CREATOR_PASSWORD=content_creator_password
REVIEWER_USERNAME=content_reviewer_username
REVIEWER_PASSWORD=content_reviewer_password
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
CHANNEL_ID=your_channel_id
CREATED_BY=creator_user_id
ORGANISATION=your_organisation
FRAMEWORK=your_framework
```

## Usage

1. **Prepare Input CSV**: Create `input.csv` in the `src/content_migration/` directory
2. **Set Environment Variables**: Configure all required environment variables
3. **Run Script**: Execute the migration script

```bash
cd src/content_migration
npx tsx index.ts
```

## Output Files

The script generates the following files:

### 1. `output_results.csv`
Contains processing results for each content item:
- Code
- Identifier
- Update Status (SUCCESS/FAILED)
- Review Status (SUCCESS/FAILED/SKIPPED)
- Publish Status (SUCCESS/FAILED/SKIPPED)
- Error Message (if any)
- Processing Time

### 2. `content_migration.log`
Detailed log file with:
- Timestamped progress updates
- API call results
- Error messages and stack traces
- Processing statistics
- Performance metrics

## Features

### Error Handling
- Comprehensive validation of input data and environment
- Retry mechanism with exponential backoff for API calls
- Graceful handling of missing content or observable elements
- Detailed error logging with context

### Progress Tracking
- Real-time progress updates in logs
- Processing statistics and success rates
- Performance metrics (duration, throughput)

### Sequential Processing
- Each content follows the complete workflow: Update → Review → Publish
- Failed updates skip review and publish steps
- Failed reviews skip publish step
- All results are captured in the output CSV

### Robust Architecture
- Modular service-based design
- TypeScript for type safety
- Reuses existing authentication and API patterns
- Configurable retry policies and timeouts

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Error: `Missing required environment variables`
   - Solution: Set all required environment variables

2. **Input File Not Found**
   - Error: `Input CSV file not found`
   - Solution: Create `input.csv` in the correct directory

3. **Authentication Failures**
   - Error: `Failed to initialize authentication tokens`
   - Solution: Verify username/password and API credentials

4. **Content Not Found**
   - Warning: `Content not found for code: XXXX`
   - Solution: Verify content codes exist in the system

5. **API Rate Limiting**
   - Solution: Script includes automatic delays between API calls

### Log Analysis

Check the log file for detailed information:
- Search for `❌` for errors
- Search for `⚠️` for warnings
- Search for `✅` for successful operations
- Check the final statistics section for success rates

## Performance

- Processes one content item at a time sequentially
- Includes delays between API calls to avoid rate limiting
- Typical processing speed: ~5-10 items per minute (depends on API response times)
- Memory usage: Minimal (processes items one by one)

## API Endpoints Used

- `/api/composite/v1/search` - Search for content and observable elements
- `/api/content/v1/read/{id}` - Get content details
- `/api/content/v1/update/{id}` - Update content with observable elements
- `/api/content/v1/review/{id}` - Send content for review
- `/api/content/v1/publish/{id}` - Publish content
- `/auth/realms/sunbird/protocol/openid-connect/token` - Authentication