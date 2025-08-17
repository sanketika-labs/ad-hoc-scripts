// Import necessary modules
const { request } = require('axios'); // Use default axios export for better type inference/features if possible
const { v4: uuidv4 } = require('uuid'); // Destructure v4 directly
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const csvWriter = require('csv-writer').createObjectCsvWriter;

// Configuration Constants
const HOST = "http://localhost:8080"; // Your API endpoint
const RELATIVEVIDEOSRC = './master_video_source'; // Path to the video files directory

//DEV
const CONTENTCREATOR = '<<content_creator_user_id>>'; // Content creator user ID
const CONTENTREVIEWER = '<<content_reviewer_user_id>>'; // Content reviewer user ID
const X_CHANNEL_ID = '<<content_channel_id>>'; // Channel ID (example)
const ORGANISATION_ID = '<<content_channel_id>>'; // Organisation ID (example)
const OUTPUT_CSV_PATH = 'Master Data Output.csv';

const UPLOAD_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours timeout for upload in milliseconds
const CSV_PATH = './csv/master_data.csv';

// --- API Call Functions ---
async function videoCreate(videoName, code, contentCreatorId) {
    console.log(`[API] Creating content entry: Name=${videoName}, Code=${code}`);
    const data = JSON.stringify({
        "request": {
          "content": {
            "name": videoName,
            "code": code,
            "mimeType": "video/mp4",
            "createdBy": contentCreatorId,
            "createdFor": [ORGANISATION_ID], // Use constant
            "contentType": "Resource",
            "resourceType": "Learn",
            "creator": "Content Creator FMPS", // Consider making this dynamic or a constant
            "framework": "FMPS", // Consider making this dynamic or a constant
            "organisation": ["FMPS Org"], // Consider making this dynamic or a constant
            "primaryCategory": "Learning Resource" // Or perhaps 'Course Assessment', 'Learning Resource'? Verify category
          }
        }
      });

      const config = {
        method: 'post',
        url: `${HOST}/content/v3/create`,
        headers: {
          'Content-Type': 'application/json',
          'X-Channel-Id': X_CHANNEL_ID // Use constant
        },
        data : data
      };

      try {
        const response = await request(config);
        const identifier = response.data.result.identifier;
        console.log(`[API] Content created successfully. Identifier: ${identifier}`);
        return identifier;
      } catch (error) {
        console.error(`[API ERROR] Failed to create content for ${videoName}:`, error.message);
        // Log more details for debugging
        if (error.response) {
          console.error("Server Response Data:", error.response.data);
          console.error("Server Response Status:", error.response.status);
        } else if (error.request) {
          console.error("No response received:", error.request);
        }
        throw error; // Re-throw to stop processing this file in main loop
      }
}

async function videoUpload(fileUrl, doId) {
    console.log(`[API] Updating upload for Content ID Metadata: ${doId}, File: ${fileUrl}`);
    const form = new FormData();
    form.append('fileUrl', fileUrl);
    form.append('mimetype', 'video/mp4'); // Use 'mimetype' as per API spec
    // form-data library might not need explicit mimeType here if server detects it,
    // but doesn't hurt to keep if API requires it.
    // form.append('mimeType', 'video/mp4'); // Check if this field is actually needed by the API when sending multipart

    const config = {
        method: 'post',
        url: `${HOST}/content/v3/upload/${doId}`,
        headers: {
            // 'Accept': '*/*', // Usually not needed for upload requests
            // 'Accept-Language': 'en-GB,en;q=0.5', // Optional
            'Connection': 'keep-alive', // Good practice
            ...form.getHeaders() // Essential for multipart boundary
        },
        data : form, // Send the FormData object directly
        maxBodyLength: Infinity, // Allow axios to send large bodies
        maxContentLength: Infinity, // Allow axios to receive potentially large responses (though unlikely here)
        timeout: UPLOAD_TIMEOUT_MS // Set a long timeout for the upload request
    };

    try {
        const response = await request(config);
        // Check if result and expected properties exist
        if (response.data && response.data.result) {
            const { artifactUrl, content_url } = response.data.result;
            console.log(`[API] Upload successful. Artifact URL: ${artifactUrl}, Content URL: ${content_url}`);
            return response.data.result;
        } else {
            console.error("[API WARNING] Upload response did not contain expected result structure:", response.data);
            // Decide how to handle this - throw error or return empty object?
            throw new Error(`Upload for ${doId} completed but response format was unexpected.`);
        }
    } catch (error) {
        console.error(`[API ERROR] Failed to upload video ${videoSrc} for ${doId}:`, error.message);
        // Log specific details for EPIPE or other connection errors
        if (error.code === 'EPIPE') {
            console.error("EPIPE Error: The server likely closed the connection prematurely. Check server logs and configuration (max request size, timeouts).");
        } else if (error.response) {
          console.error("Server Response Data:", error.response.data);
          console.error("Server Response Status:", error.response.status);
        } else if (error.request) {
          console.error("No response received or connection error:", error.code || error.message);
          // Log the cause if available (often contains EPIPE details)
          if(error.cause) {
              console.error("Error Cause:", error.cause);
          }
        }
        throw error; // Re-throw to stop processing this file
    }
}

async function videoSendForReview(doId) {
    console.log(`[API] Sending Content ID for review: ${doId}`);
    const config = {
        method: 'post',
        url: `${HOST}/content/v3/review/${doId}`,
        headers: {
          'Accept': 'application/json',
          'X-Channel-Id': X_CHANNEL_ID // Add channel ID if required by API
        },
        // Body might be needed depending on API spec (often empty for review trigger)
        // data: JSON.stringify({ request: {} }) // Example if an empty request body is needed
      };

    try {
        const response = await request(config);
        const success = response.status === 200; // Or check based on actual success status code/body
        console.log(`[API] Sent for review status: ${success} (Status Code: ${response.status})`);
        return success;
    } catch (error) {
        console.error(`[API ERROR] Failed to send ${doId} for review:`, error.message);
        if (error.response) {
          console.error("Server Response Data:", error.response.data);
          console.error("Server Response Status:", error.response.status);
        } else if (error.request) {
          console.error("No response received:", error.request);
        }
        // Decide if you want to throw or just log and continue
        // throw error; // Uncomment to stop processing on review failure
        return false; // Indicate failure
    }
}

async function videoPublish(doId, contentReviewerId) {
    console.log(`[API] Publishing Content ID: ${doId} by Reviewer: ${contentReviewerId}`);
    const data = JSON.stringify({
        "request": {
          "content": {
            "lastPublishedBy": contentReviewerId
          }
        }
      });

      const config = {
        method: 'post',
        url: `${HOST}/content/v3/publish/${doId}`,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Channel-Id': X_CHANNEL_ID // Add channel ID if required by API
        },
        data : data
      };

      try {
        const response = await request(config);
        // Check response.data.result.publishStatus for specific success message if available
        const success = response.status === 200; // Or check based on actual success status code/body
        console.log(`[API] Publish status: ${success} (Status Code: ${response.status})`, response.data.result || '');
        return success;
      } catch (error) {
        console.error(`[API ERROR] Failed to publish ${doId}:`, error.message);
        if (error.response) {
          console.error("Server Response Data:", error.response.data);
          console.error("Server Response Status:", error.response.status);
        } else if (error.request) {
          console.error("No response received:", error.request);
        }
        // Decide if you want to throw or just log and continue
        // throw error; // Uncomment to stop processing on publish failure
        return false; // Indicate failure
    }
}

async function fetchPreSignedUrl(doId) {
    console.log(`[API] Fetching pre-signed URL for Content ID: ${doId}`);
    try {
        const response = await request({
            method: 'post',
            url: `${HOST}/content/v3/upload/url/${doId}`,
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': X_CHANNEL_ID
            },
            data: JSON.stringify({ request: {
                "content": {
                    "fileName": "TestVideo.mp4"
                }
            } }) // some APIs expect an empty request body
        });
        const result = response.data.result;
        console.log(`[API] Received pre-signed URL: ${result.pre_signed_url}`);
        return result.pre_signed_url;
    } catch (error) {
        console.error(`[API ERROR] Failed to fetch pre-signed URL for ${doId}:`, error.message);
        throw error;
    }
}

// New function: upload video file to GCS using the presigned URL
async function uploadToGCS(videoSrc, preSignedUrl) {
    console.log(`[UPLOAD] Uploading file ${videoSrc} to GCS via presigned URL`);
    const fileStream = fs.createReadStream(videoSrc);
    try {
        const response = await request({
            method: 'put',
            url: preSignedUrl,
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            data: fileStream,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: UPLOAD_TIMEOUT_MS
        });
        console.log(`[UPLOAD] Upload completed with status: ${response.status}`);
        return true;
    } catch (error) {
        console.error(`[UPLOAD ERROR] Failed to upload ${videoSrc}:`, error.message);
        throw error;
    }
}


// --- Main Execution Logic ---

async function readCsvRows() {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(CSV_PATH, { encoding: 'utf8' })
      .pipe(csvParser({ mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '') }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function writeCsvRows(rows) {
  // Get all headers from the first row, add doID if not present
  const headers = Object.keys(rows[0] || {});
  if (!headers.includes('doID')) headers.push('doID');
  const writer = csvWriter({
    path: OUTPUT_CSV_PATH,
    header: headers.map(h => ({ id: h, title: h }))
  });
  await writer.writeRecords(rows);
}

async function main() {
  let rows;
  const errorLogPath = 'video_error_log.txt';
  // Clear previous error log
  fs.writeFileSync(errorLogPath, '', 'utf8');

  function logErrorToFile(message) {
    fs.appendFileSync(errorLogPath, message + '\n', 'utf8');
  }

  try {
    rows = await readCsvRows();
    if (!rows.length) {
      const msg = 'No rows found in CSV.';
      console.error(msg);
      logErrorToFile(msg);
      return;
    }
  } catch (e) {
    const msg = 'Failed to read CSV: ' + e.message;
    console.error(msg);
    logErrorToFile(msg);
    return;
  }

  for (const row of rows) {
    const videoName = row['video_name'];
    const videoCode = row['video_code'];
    if (!videoName || !videoCode) {
      const msg = `Skipping row with missing video_name or video_code: ${JSON.stringify(row)}`;
      console.warn(msg);
      logErrorToFile(msg);
      continue;
    }
    const fileName = videoName.trim() + '.mp4';
    const fullPath = path.join(RELATIVEVIDEOSRC, fileName);
    if (!fs.existsSync(fullPath)) {
      const msg = `File not found for video_name: ${videoName}`;
      console.warn(msg);
      logErrorToFile(msg);
      continue;
    }
    try {
      // 1. Create Content Entry
      const doId = await videoCreate(videoName, videoCode, CONTENTCREATOR);
      if (!doId) throw new Error('Failed to get Content ID (doId) during creation step.');
      row['doID'] = doId;
      // 2. Upload Video
      // const uploadResult = await videoUpload(fullPath, doId);
      const preSignedUrl = await fetchPreSignedUrl(doId);
      if (!preSignedUrl) throw new Error('Failed to get pre-signed URL.');
      const uploadResult = await uploadToGCS(fullPath, preSignedUrl);
      const msg = await videoUpload(preSignedUrl.split("?")[0], doId);
      console.log(msg);
      // 3. Send for Review
      const sentForReview = await videoSendForReview(doId);
      if (!sentForReview) {
        const msg = `[WARNING] Failed to send ${doId} for review, but continuing to publish attempt.`;
        console.warn(msg);
        logErrorToFile(msg);
      }
      // 4. Publish Video
      await new Promise(resolve => setTimeout(resolve, 5000));
      const videoPublished = await videoPublish(doId, CONTENTREVIEWER);
      if (!videoPublished) throw new Error('Failed to publish video.');
      console.log(`--- Successfully processed: ${fileName} ---`);
    } catch (error) {
      const msg = `--- FAILED to process: ${fileName} ---\nError during processing: ${error.message}`;
      console.error(msg);
      logErrorToFile(msg);
      console.log('Continuing with the next row...');
    }
  }

  // Write updated CSV
  try {
    await writeCsvRows(rows);
    console.log(`Updated CSV written to: ${OUTPUT_CSV_PATH}`);
  } catch (e) {
    const msg = 'Failed to write updated CSV: ' + e.message;
    console.error(msg);
    logErrorToFile(msg);
  }
}

// --- Run the main function ---
main().catch(error => {
  // Catch any unhandled errors from the main async function itself
  console.error("An unexpected error occurred in the main execution:", error);
});