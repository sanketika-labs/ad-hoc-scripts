# Sunbird Course Migration Tool

This repository contains scripts for processing and migrating course data to the Sunbird platform.

## Project Overview

This tool provides an end-to-end workflow for:

1. Processing raw CSV data into a structured format
2. Creating a hierarchical representation of courses, modules, and content
3. Migrating the processed data to the Sunbird platform using its API
4. Reviewing and publishing the migrated content

## Folder Structure

```
.
├── 1.app.js                # Creates courses and modules on Sunbird
├── 2.herc.js               # Updates course hierarchy structure
├── 3.revPub.js             # Reviews and publishes courses
├── README.md               # This documentation file
├── courseHierarchyMap.json # Generated mapping of course hierarchy (output of 1.app.js)
├── courses.json            # Main input file for migration scripts
├── final.json              # Processed data ready for migration (copy to courses.json)
├── package.json            # Node.js dependencies
│
├── csv/                    # Raw data in CSV format
│   ├── Content.csv         # Course content information
│   ├── Course.csv          # Course metadata
│   ├── content_with_doid.csv # Content with digital object IDs
│   └── module.csv          # Module information
│
└── jupyter/                # Data processing notebooks
    ├── main.ipynb          # Main notebook for data processing
    ├── out.json            # Intermediate JSON output
    └── final.json          # Processed data ready for migration
```

## NOTE: 
**Dependencies** : Node Modules, venv included for ease of compatability.

## Prerequisites

1. Node.js (v14+)
2. Python with Jupyter Notebook (for data processing)
3. Required NPM packages (install with `npm install`):
   - axios
   - uuid
   - fs
   - dotenv (optional)

## Step-by-Step Workflow

### 1. Data Processing

First, we process the raw CSV data into a structured format:

1. Navigate to the `jupyter` directory
2. Open and run the `main.ipynb` notebook
   - This notebook reads data from the CSV files
   - Processes and transforms it into a hierarchical structure
   - Outputs the processed data to `final.json`

### 2. Prepare Migration Data

1. Copy the processed data from `jupyter/final.json` to `courses.json` in the root directory:
   ```bash
   cp jupyter/final.json courses.json
   ```

### 3. Run Migration Scripts

Execute the migration scripts in the following order:

1. Create courses and modules:
   ```bash
   node 1.app.js
   ```
   This will create the courses and modules on the Sunbird platform and generate `courseHierarchyMap.json`.

2. Update course hierarchies:
   ```bash
   node 2.herc.js
   ```
   This will update the hierarchical structure of the courses.

3. Review and publish courses:
   ```bash
   node 3.revPub.js
   ```
   This will send the courses for review and then publish them.

## Script Details

### `1.app.js`

This script:
- Reads course data from `courses.json`
- Creates courses on the Sunbird platform
- Creates modules for each course
- Generates a mapping of course IDs and module IDs in `courseHierarchyMap.json`

### `2.herc.js`

This script:
- Reads the mapping from `courseHierarchyMap.json`
- Updates the hierarchical structure of each course
- Links modules to their parent courses
- Sets metadata for courses and modules

### `3.revPub.js`

This script:
- Reads the mapping from `courseHierarchyMap.json`
- Sends each course for review
- Publishes courses that pass review

## Data Format

### Input Data (CSV)

The raw data is provided as CSV files:
- `Course.csv`: Contains course metadata
- `module.csv`: Contains module information
- `Content.csv`: Contains content information
- `content_with_doid.csv`: Links content to digital object IDs

### Output Format (`courses.json`)

The processed data follows this structure:
```json
[
  {
    "name": "Course Name",
    "description": "Course Description",
    "createdBy": "user-id",
    "organisation": "Organization Name",
    "createdFor": ["channel-id"],
    "mimeType": "application/vnd.ekstep.content-collection",
    "resourceType": "Course",
    "contentType": "Course",
    "creator": "Creator Name",
    "primaryCategory": "Course",
    "framework": "Framework ID",
    "organisationIds": ["org-id"],
    "languageIds": ["language-id"],
    "audience": ["Student", "Teacher"],
    "targetlanguageIds": ["language-id"],
    "author": "Author Name",
    "copyright": "Copyright Info",
    "copyrightYear": "Year",
    "license": "License Info",
    "additionalCategories": ["Category"],
    "hierarchy": {
      "Module Name 1": ["content-id-1", "content-id-2"],
      "Module Name 2": ["content-id-3", "content-id-4"]
    }
  }
]
```

## NOTE: 
**API Connection Proxy** : Proxy Content Service to localhost:8080

## Troubleshooting

Common issues and solutions:

1. **API Connection Errors**: Ensure the Sunbird server is running at the configured URL (default: http://localhost:8080).

2. **Authentication Issues**: Verify that the CHANNEL_ID and CREATED_BY values in the scripts are correct.

3. **Data Processing Errors**: If encountering errors in the Jupyter notebook:
   - Check that CSV files have the expected structure
   - Verify that there are no missing required fields

4. **Course Creation Failure**: If courses fail to create:
   - Check the API response for specific error messages
   - Ensure all required fields are present in the courses.json file

## Configuration

The scripts have some configurable parameters at the top of each file:

- `API_BASE_URL`: The base URL for the Sunbird API
- `CHANNEL_ID`: The channel ID for content creation
- `CREATED_BY`: The user ID for content creation
- `LAST_PUBLISHED_BY`: The user ID for publishing content

## License

[Specify your license information here]

## Contributors

[List of contributors]
